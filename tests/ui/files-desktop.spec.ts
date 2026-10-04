import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
test('real Electron files: highlighted YAML validation, confirmed rename, ZIP export and extraction', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  await mkdir(path.join(f.server.path, 'config'));
  await writeFile(path.join(f.server.path, 'config/settings.yml'), '# original\nmessage: hello\n');
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
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button', { name: 'Integration', exact: false })
      .click();
    await page
      .getByRole('navigation', { name: 'Server details' })
      .getByRole('button', { name: 'Files', exact: true })
      .click();
    await page.getByRole('button', { name: 'config', exact: true }).click();
    await page.getByRole('button', { name: 'settings.yml', exact: true }).click();
    const content = page.getByRole('textbox', { name: 'Contents', exact: true });
    await expect(content).toHaveClass(/cm-content/);
    await content.fill('message: [unterminated');
    await content.press('ControlOrMeta+z');
    await expect(content).toContainText('# original');
    await content.press(
      process.platform === 'darwin' ? 'ControlOrMeta+Shift+z' : 'ControlOrMeta+y',
    );
    await expect(content).toContainText('unterminated');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert').first()).toContainText(/Invalid YAML at line 1, column/);
    expect(await readFile(path.join(f.server.path, 'config/settings.yml'), 'utf8')).toContain(
      '# original',
    );
    await content.fill('# edited safely\nmessage: saved\n');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await readFile(path.join(f.server.path, 'config/settings.yml'), 'utf8')).toContain(
      '# edited safely',
    );
    await page
      .locator('.file-row')
      .filter({ hasText: 'settings.yml' })
      .getByRole('button', { name: 'Manage', exact: true })
      .click();
    await page.getByLabel('Action', { exact: true }).selectOption('rename');
    await page.getByLabel('Destination path', { exact: true }).fill('config/renamed.yml');
    await page
      .getByLabel('Type the exact name below to confirm. settings.yml', { exact: true })
      .fill('settings.yml');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'renamed.yml', exact: true })).toBeVisible();
    expect(f.repo.backups()).toHaveLength(1);
    const output = path.join(f.root, 'exported-config.zip');
    await desktop.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [output] });
    }, output);
    await page.getByRole('button', { name: 'Export folder as ZIP', exact: true }).click();
    await expect
      .poll(() =>
        stat(output).then(
          (info) => info.size,
          () => 0,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        () => f.repo.operations().find((operation) => operation.kind === 'archive.export')?.status,
      )
      .toBe('completed');
    await page.getByRole('button', { name: 'Extract ZIP', exact: true }).click();
    await page
      .getByLabel('Type the exact name below to confirm. imported', { exact: true })
      .fill('imported');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Select archive', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await readFile(path.join(f.server.path, 'config/imported/config/renamed.yml'), 'utf8'),
    ).toContain('message: saved');
    expect(f.repo.backups()).toHaveLength(2);
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
