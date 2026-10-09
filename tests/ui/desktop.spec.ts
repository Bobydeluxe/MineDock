import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { translator } from '../../apps/desktop/renderer/src/i18n';
import { languages, type Language } from '../../packages/domain/languages';
import { fixture } from '../helpers';

test('real Electron dialogs center on first paint and native window resize', async () => {
  const f = await fixture();
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
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const [width, height] of [
      [760, 520],
      [1360, 920],
      [1920, 1080],
    ]) {
      await desktop.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]!.setSize(size[0]!, size[1]!);
        },
        [width!, height!],
      );
      await expect
        .poll(async () =>
          page.locator('dialog').evaluate((el) => {
            const bounds = el.getBoundingClientRect();
            return Math.max(
              Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2),
              Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2),
            );
          }),
        )
        .toBeLessThan(2);
      await expect(page.locator('.dialog-footer').getByRole('button').last()).toBeInViewport();
      if (width === 760 && !executablePath)
        await page.screenshot({
          path: 'test-results/native-dialog-760x520.png',
          animations: 'disabled',
        });
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});

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
  const launch = () =>
    electron.launch({
      executablePath,
      args: executablePath ? [] : ['.'],
      env: { ...env, MINEDOCK_DATA_DIR: root, MINEDOCK_TEST: '1' },
    });
  let desktop = await launch();
  try {
    const page = await desktop.firstWindow();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const { code, name } of languages) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: translator(code)('setupLanguage'), exact: true }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
    }
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Available RAM', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Appearance').selectOption('dark');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Open MineDock', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByText(translator('en')('noServers'), { exact: true }).last(),
    ).toBeVisible();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await expect(page.locator('.button.nav.active')).toHaveCSS('color', 'rgb(67, 210, 203)');
    await expect(page.locator('.page-heading .button.primary')).toHaveCSS(
      'background-color',
      'rgb(67, 210, 203)',
    );
    if (!executablePath)
      await page.screenshot({ path: 'test-results/desktop-empty.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Java runtimes', { exact: true })).toBeVisible();
    let previous: Language = 'en';
    const labels = {
      en: 'Settings',
      fr: 'Paramètres',
      de: 'Einstellungen',
      es: 'Ajustes',
      pt: 'Definições',
      it: 'Impostazioni',
    };
    for (const { code } of languages) {
      await page.getByLabel(translator(previous)('language'), { exact: true }).selectOption(code);
      await page.getByRole('button', { name: translator(previous)('save'), exact: true }).click();
      await expect(
        page.getByRole('heading', { name: labels[code], exact: true }).first(),
      ).toBeVisible();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.getByText(translator(code)('noServers'), { exact: true })).toBeVisible();
      await page.getByRole('button', { name: labels[code], exact: true }).click();
      await expect(page.getByLabel(translator(code)('language'), { exact: true })).toHaveValue(
        code,
      );
      if (!executablePath)
        await page.screenshot({
          path: `test-results/language-${code}.png`,
          animations: 'disabled',
        });
      previous = code;
    }
    expect(
      await page.evaluate(() => typeof (globalThis as unknown as { require?: unknown }).require),
    ).toBe('undefined');
    await desktop.close();
    desktop = await launch();
    const restored = await desktop.firstWindow();
    await expect(restored.getByRole('dialog')).toHaveCount(0);
    await expect(restored.locator('html')).toHaveAttribute('lang', 'it');
    await expect(restored.getByRole('button', { name: 'Impostazioni', exact: true })).toBeVisible();
    expect(
      await restored.evaluate(
        () => typeof (globalThis as unknown as { process?: unknown }).process,
      ),
    ).toBe('undefined');
  } finally {
    await desktop.close();
    await rm(root, { recursive: true, force: true });
  }
});
