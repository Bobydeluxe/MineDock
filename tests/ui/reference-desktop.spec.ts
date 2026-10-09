import { test, expect, _electron as electron } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';

test('native reference design: reviewed properties, unsaved navigation, inherited settings and safe persisted profile image', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  const file = path.join(f.server.path, 'server.properties');
  await writeFile(
    file,
    '# owner comment\r\n' +
      (await readFile(file, 'utf8')).replaceAll('\n', '\r\n') +
      'custom-key : retain\r\n',
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        typeof pair[1] === 'string' && pair[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const executablePath = process.env.MINEDOCK_TEST_BINARY;
  const launch = () =>
    electron.launch({
      executablePath,
      args: executablePath ? [] : ['.'],
      env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button', { name: /Integration/ })
      .click();
    const tabs = page.getByRole('navigation', { name: 'Server details' });
    await tabs.getByRole('button', { name: 'Settings', exact: true }).click();
    const editor = page.locator('.properties-editor');
    await expect(editor.getByLabel('Hardcore', { exact: true })).toHaveValue('');
    await editor.getByLabel('Server message', { exact: true }).fill('Friends welcome');
    const closeWarning = await app.evaluate(async ({ dialog, BrowserWindow }) => {
      let message = '';
      const original = dialog.showMessageBox;
      dialog.showMessageBox = async (...args: unknown[]) => {
        const options = args.at(-1) as { message: string };
        message = options.message;
        return { response: 0, checkboxChecked: false };
      };
      BrowserWindow.getAllWindows()[0]!.close();
      await new Promise((resolve) => setImmediate(resolve));
      dialog.showMessageBox = original;
      return message;
    });
    expect(closeWarning).toContain('discard your unsaved changes');
    await tabs.getByRole('button', { name: 'Console', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('unsaved');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor.getByLabel('Server message', { exact: true })).toHaveValue(
      'Friends welcome',
    );
    await editor.getByRole('button', { name: 'Review and save', exact: true }).click();
    await expect(page.getByRole('dialog').locator('.property-diff')).toContainText('motd');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      editor.getByRole('button', { name: 'Review and save', exact: true }),
    ).toBeDisabled();
    const saved = await readFile(file, 'utf8');
    expect(saved).toContain('# owner comment\r\n');
    expect(saved).toContain('custom-key : retain\r\n');
    expect(saved).toContain('motd=Friends welcome');
    expect(saved).not.toContain('hardcore=');
    const profile = page.locator('.profile-controls');
    await app.evaluate(({ dialog }, icon) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [icon] });
    }, path.resolve('assets/brand/MineDock_App_Icon.png'));
    await profile.getByRole('button', { name: 'Choose local icon', exact: true }).click();
    await expect(profile.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await profile.getByLabel('Server name', { exact: true }).fill('Friends profile');
    await profile.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Friends profile', exact: true })).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe(saved);
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button', { name: /Friends profile/ })
      .click();
    await expect(page.locator('.title-with-status img')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
    );
  } finally {
    await app.close();
    await f.cleanup();
  }
});

test('native catalog IPC exposes every cached Fabric loader and installer with independent explicit selections', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  const { mkdir } = await import('node:fs/promises');
  const cache = path.join(f.root, 'cache', 'engines');
  await mkdir(cache, { recursive: true });
  const data = {
    engine: 'fabric',
    minecraftVersion: '1.21.1',
    versions: [{ version: '1.21.1', stable: true, recommended: true }],
    builds: [
      { version: '0.19.5', stable: true, recommended: true },
      { version: '0.16.9', stable: false },
    ],
    installers: [
      { version: '1.1.2', stable: true, recommended: true },
      { version: '1.0.1', stable: false },
    ],
    fetchedAt: new Date().toISOString(),
    cached: false,
    offline: false,
  };
  await writeFile(
    path.join(cache, 'fabric-games-release.json'),
    JSON.stringify({ ...data, minecraftVersion: undefined, builds: [] }),
  );
  await writeFile(path.join(cache, 'fabric-1.21.1-release.json'), JSON.stringify(data));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        typeof pair[1] === 'string' && pair[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const executablePath = process.env.MINEDOCK_TEST_BINARY;
  const app = await electron.launch({
    executablePath,
    args: executablePath ? [] : ['.'],
    env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Create server', exact: true }).first().click();
    await page.getByRole('button', { name: 'Fabric', exact: true }).click();
    await page.getByLabel('Show all available builds / loader versions', { exact: true }).check();
    const loaders = page.getByRole('region', { name: 'Loader version', exact: true }),
      installers = page.getByRole('region', { name: 'Installer version', exact: true });
    await expect(loaders.getByRole('button')).toHaveCount(2);
    await expect(installers.getByRole('button')).toHaveCount(2);
    await loaders.getByRole('button', { name: /0.16.9/ }).click();
    await installers.getByRole('button', { name: /1.0.1/ }).click();
    await expect(loaders.getByRole('button', { name: /0.16.9/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(installers.getByRole('button', { name: /1.0.1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('Server name', { exact: true }).fill('Pinned choices');
    for (let i = 0; i < 3; i++)
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.installation-summary')).toContainText('0.16.9');
    await expect(page.locator('.installation-summary')).toContainText('1.0.1');
    // Isolated metadata fixture validates IPC and UI. Live complete catalogs are probed separately.
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  } finally {
    await app.close();
    await f.cleanup();
  }
});
