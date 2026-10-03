import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('real Electron shell: setup, folders, localization, empty dashboard, runtime diagnostics', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'minedock-ui-'));
  if (!root.startsWith(path.join(os.tmpdir(), 'minedock-ui-')))
    throw new Error('Unsafe fixture path');
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
    env: { ...env, MINEDOCK_DATA_DIR: root, MINEDOCK_TEST: '1' },
  });
  try {
    const page = await desktop.firstWindow();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    await expect(page.getByText('RAM disponible', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    await page.getByLabel('Apparence').selectOption('dark');
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    await page.getByRole('button', { name: 'Ouvrir MineDock', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Votre premier monde commence ici.')).toBeVisible();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await expect(page.locator('.button.nav.active')).toHaveCSS(
      'background-color',
      'rgb(32, 36, 43)',
    );
    await expect(page.locator('.page-heading .button.primary')).toHaveCSS(
      'background-color',
      'rgb(163, 211, 152)',
    );
    await page.screenshot({ path: 'test-results/desktop-empty.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
    await expect(page.getByText('Runtimes Java', { exact: true })).toBeVisible();
    await page.getByLabel('Langue', { exact: true }).selectOption('en');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => typeof (globalThis as unknown as { require?: unknown }).require),
    ).toBe('undefined');
    expect(
      await page.evaluate(() => typeof (globalThis as unknown as { process?: unknown }).process),
    ).toBe('undefined');
  } finally {
    await desktop.close();
    await rm(root, { recursive: true, force: true });
  }
});
