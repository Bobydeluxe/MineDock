import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import yazl from 'yazl';
import { fixture } from '../helpers';
import type { Api } from '../../packages/domain/types';
import { HealthService } from '../../packages/core/health';

test('native survival journey: configuration history, local packs, partial restore, player notes, notices and package preview', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  const health = new HealthService(f.repo, f.bus);
  health.push(f.server.id, 'crash');
  health.close();
  await mkdir(path.join(f.server.path, 'config'));
  await writeFile(
    path.join(f.server.path, 'config/paper-global.yml'),
    '# retained comment\nchunk-system:\n  io-threads: 2\n',
  );
  await writeFile(
    path.join(f.server.path, 'usercache.json'),
    JSON.stringify([{ name: 'Friend', uuid: '12345678-1234-4234-8234-123456789abc' }]),
  );
  const zip = new yazl.ZipFile(),
    chunks: Buffer[] = [];
  const packed = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  zip.addBuffer(
    Buffer.from('{"pack":{"pack_format":61,"description":"Native QA pack"}}'),
    'pack.mcmeta',
  );
  zip.end();
  const localPack = path.join(f.root, 'local-pack.zip'),
    archive = path.join(f.root, 'survival.minedock');
  await writeFile(localPack, await packed);
  const env = Object.fromEntries(
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
    await desktop.evaluate(
      ({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input.pack] });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: input.archive });
      },
      { pack: localPack, archive },
    );
    const page = await desktop.firstWindow();
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button', { name: /Integration/ })
      .click();
    const tabs = page.getByRole('navigation', { name: 'Server details' });
    await tabs.getByRole('button', { name: 'Settings', exact: true }).click();
    const config = page
      .locator('details.panel')
      .filter({ has: page.locator('summary').filter({ hasText: /^Advanced configuration$/ }) });
    await config.locator(':scope > summary').click();
    const document = config
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: /^config\/paper-global.yml$/ }) })
      .first();
    await document.locator(':scope > summary').click();
    await document
      .locator('summary')
      .filter({ hasText: /^Resources$/ })
      .click();
    await document.getByLabel('chunk-system › io-threads', { exact: true }).fill('4');
    await document
      .getByRole('button', { name: 'Save', exact: true })
      .filter({ visible: true })
      .click();
    await expect
      .poll(() => readFile(path.join(f.server.path, 'config/paper-global.yml'), 'utf8'))
      .toContain('io-threads: 4');
    const history = config
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: /^Previous file versions$/ }) })
      .first();
    await history.locator(':scope > summary').click();
    await history.getByRole('button', { name: 'Restore', exact: true }).first().click();
    await page.getByRole('dialog').getByLabel('Server name', { exact: true }).fill('Integration');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await readFile(path.join(f.server.path, 'config/paper-global.yml'), 'utf8')).toContain(
      '# retained comment',
    );
    expect(await readFile(path.join(f.server.path, 'config/paper-global.yml'), 'utf8')).toContain(
      'io-threads: 2',
    );

    await tabs.getByRole('button', { name: 'Datapacks', exact: true }).click();
    await page.getByRole('button', { name: 'Import file', exact: true }).click();
    await page.getByRole('button', { name: 'Installed', exact: true }).click();
    await expect(
      page.locator('.installed-row').filter({ hasText: 'local-pack.zip' }),
    ).toContainText('world');
    expect(await stat(path.join(f.server.path, 'world/datapacks/local-pack.zip'))).toBeTruthy();

    await tabs.getByRole('button', { name: 'Players', exact: true }).click();
    await page.getByRole('button', { name: 'Player details', exact: true }).click();
    await page.getByLabel('Private notes', { exact: true }).fill('Building the village');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Player details', exact: true }).click();
    await expect(page.getByLabel('Private notes', { exact: true })).toHaveValue(
      'Building the village',
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

    await tabs.getByRole('button', { name: 'Backups', exact: true }).click();
    await page.getByRole('button', { name: 'Create snapshot', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review restoration', exact: true })).toHaveCount(
      1,
    );
    await writeFile(path.join(f.server.path, 'world/level.dat'), 'changed world');
    await writeFile(path.join(f.server.path, 'config/paper-global.yml'), 'keep: current\n');
    await page.getByRole('button', { name: 'Review restoration', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('world');
    await page
      .getByRole('dialog')
      .getByLabel('Type the exact name below to confirm.', { exact: true })
      .fill('Integration');
    await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(await readFile(path.join(f.server.path, 'config/paper-global.yml'), 'utf8')).toBe(
      'keep: current\n',
    );
    expect(f.repo.backups().some((b) => b.reason === 'before_partial_restore')).toBe(true);

    const packages = page
      .locator('details.panel')
      .filter({ has: page.locator('summary').filter({ hasText: /^Move to another PC$/ }) });
    await packages.locator(':scope > summary').click();
    await packages.getByRole('button', { name: 'Export MineDock package', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Server name', { exact: true }).fill('Integration');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await stat(archive)).size).toBeGreaterThan(0);
    await desktop.evaluate(({ dialog }, archive) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [archive] });
    }, archive);
    await packages.getByRole('button', { name: 'Import MineDock package', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('paper 1.21.11');
    await expect(page.getByRole('dialog')).toContainText(process.platform);
    await page.keyboard.press('Escape');

    await page
      .locator('.sidebar-bottom')
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await page.locator('.notification-history > summary').click();
    await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
    const notices = await page.evaluate(() =>
      (window as unknown as { minedock: Api }).minedock.notices(),
    );
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((n) => n.read)).toBe(true);
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
