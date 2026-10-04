import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile, rename, readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fixture } from '../helpers';
import { AppCore } from '../../packages/core/app';
import type { Operation } from '../../packages/domain/operations';
test('real Electron recovery and retention: preserve uncertain copies, preview actual archive bytes and protect manual backups', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets);
  const saved = [];
  for (let index = 0; index < 4; index++) {
    const backup = await core.backups.create(f.server.id, index === 3 ? 'manual' : 'scheduled');
    backup.createdAt = new Date(Date.UTC(2026, 9, 4 - index, 12)).toISOString();
    core.repo.db
      .prepare('UPDATE backups SET metadata=? WHERE id=?')
      .run(JSON.stringify(backup), backup.id);
    saved.push(backup);
  }
  core.repo.saveSettings({ ...core.repo.settings(), onboarded: true });
  const operation: Operation = {
    id: randomUUID(),
    serverId: f.server.id,
    kind: 'backup.restore',
    label: 'Interrupted restore',
    status: 'applying',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recoverable: true,
  };
  const destination = f.server.path,
    staging = destination + '.stage',
    previous = destination + '.previous';
  core.repo.saveOperation(operation, {
    destination,
    staging,
    previous,
    hadDestination: true,
    beforeProfile: f.server,
    beforeContent: [],
  });
  await rename(destination, previous);
  await mkdir(destination);
  await mkdir(staging);
  await writeFile(path.join(destination, 'uncertain-current.txt'), 'keep current');
  await writeFile(path.join(staging, 'uncertain-prepared.txt'), 'keep prepared');
  await core.close();
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        typeof pair[1] === 'string' && pair[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const executablePath = process.env.MINEDOCK_TEST_BINARY;
  const desktop = await electron.launch({
    executablePath,
    args: executablePath ? [] : ['.'],
    env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
  });
  try {
    const page = await desktop.firstWindow();
    await page.getByRole('button', { name: 'Operations', exact: true }).click();
    await page.getByRole('button', { name: 'Review recovery', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Interrupted restore', { exact: true }).first()).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Restore previous original', exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel('Operation label', { exact: true }).fill('Interrupted restore');
    await dialog.getByRole('button', { name: 'Restore previous original', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const resolved = f.repo.operations().find((item) => item.id === operation.id)!;
    expect(resolved.preservedCopies).toHaveLength(2);
    expect(
      await readFile(path.join(resolved.preservedCopies![0]!, 'uncertain-prepared.txt'), 'utf8'),
    ).toBe('keep prepared');
    await page.getByRole('button', { name: 'Backups', exact: true }).click();
    const retention = page.locator('.retention-controls');
    await retention.locator('summary').first().click();
    await retention.getByLabel('Retention policy', { exact: true }).selectOption('count');
    await retention.getByLabel('Keep the latest backups', { exact: true }).fill('1');
    await retention.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      retention.getByRole('button', { name: 'Preview purge', exact: true }),
    ).toBeEnabled();
    await retention.getByRole('button', { name: 'Preview purge', exact: true }).click();
    await expect(retention.locator('h3')).toContainText('2 archives to remove');
    await expect(
      retention.getByRole('button', { name: 'Purge this preview', exact: true }),
    ).toBeDisabled();
    await retention.getByLabel('Server name', { exact: true }).fill(f.server.name);
    await retention.getByRole('button', { name: 'Purge this preview', exact: true }).click();
    await expect.poll(() => f.repo.backups().length).toBe(2);
    expect(
      f.repo
        .backups()
        .map((item) => item.id)
        .sort(),
    ).toEqual([saved[0]!.id, saved[3]!.id].sort());
    expect(await stat(f.repo.backup(saved[3]!.id).path)).toBeDefined();
    await page.screenshot({ path: 'test-results/recovery-retention-real-desktop.png' });
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
