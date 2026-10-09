import { test, expect, _electron as electron } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
import { HealthService } from '../../packages/core/health';
import type { Api } from '../../packages/domain/types';

test('clean desktop navigation retains notification preferences/history and server data across restart', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true, theme: 'dark' });
  const health = new HealthService(f.repo, f.bus);
  health.push(f.server.id, 'crash');
  health.close();
  const properties = await readFile(path.join(f.server.path, 'server.properties'), 'utf8');
  const world = await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8');
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
    const sidebar = page.locator('.sidebar');
    await expect(sidebar.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
    for (const name of ['Operations', 'Activity', 'Notifications'])
      await expect(sidebar.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(
      page.locator(
        '.topbar, .breadcrumb, .workspace, .eyebrow, .local-panel, .local-badge, .brand-version',
      ),
    ).toHaveCount(0);
    await expect(page.getByText('Minecraft Server Manager', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Your computer. Your worlds.', { exact: true })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.locator('main').evaluate((main) => main.getBoundingClientRect().top)).toBe(0);
    const surfaces = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.append(probe);
      const colors = [
        '--background',
        '--surface-sidebar',
        '--surface-panel',
        '--surface-card',
        '--surface-modal',
        '--surface-hover',
        '--surface-selected',
        '--surface-input',
        '--surface-console',
      ].map((token) => {
        probe.style.backgroundColor = `var(${token})`;
        return {
          token,
          rgb: getComputedStyle(probe).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number),
        };
      });
      probe.remove();
      return colors;
    });
    for (const { token, rgb } of surfaces) {
      expect(Math.max(...rgb) - Math.min(...rgb), token).toBe(0);
      expect(Math.max(...rgb), token).toBeLessThanOrEqual(48);
    }
    await sidebar.getByRole('button', { name: 'Settings', exact: true }).click();
    const notifications = page.locator('.notification-settings');
    await expect(
      notifications.getByRole('heading', { name: 'Notifications', exact: true }),
    ).toBeVisible();
    await notifications
      .getByRole('checkbox', { name: 'Desktop notifications', exact: true })
      .check();
    await notifications.getByRole('checkbox', { name: 'Player connected', exact: true }).check();
    await page.locator('.notification-history > summary').click();
    await expect(
      page.locator('.notification-history').getByText('Server crashed', { exact: true }),
    ).toBeVisible();
    await notifications.getByRole('button', { name: 'Mark all read', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { minedock: Api }).minedock.healthSettings()),
      )
      .toMatchObject({ nativeNotifications: true, playerJoin: true });
    const notices = await page.evaluate(() =>
      (window as unknown as { minedock: Api }).minedock.notices(),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.read).toBe(true);
    await page.locator('.recovery-controls > summary').click();
    await expect(
      page.getByText('No background task needs attention.', { exact: true }),
    ).toBeVisible();
    await sidebar.getByRole('button', { name: 'Backups', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Server backups', exact: true })).toBeVisible();
    await sidebar.getByRole('button', { name: /Integration/ }).click();
    await expect(page.getByRole('heading', { name: 'Integration', exact: true })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Server details' });
    for (const name of ['Console', 'Plugins', 'Datapacks', 'Metrics', 'Overview']) {
      await tabs.getByRole('button', { name, exact: true }).click();
      await expect(tabs.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('.topbar, .eyebrow')).toHaveCount(0);
    }
    await sidebar.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page
      .locator('.page-heading')
      .getByRole('button', { name: 'Create server', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Create server', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Desktop notifications', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Player connected', exact: true }),
    ).toBeChecked();
    await page.locator('.notification-history > summary').click();
    await expect(
      page.locator('.notification-settings').getByRole('button', { name: 'Read', exact: true }),
    ).toBeDisabled();
    expect(await readFile(path.join(f.server.path, 'server.properties'), 'utf8')).toBe(properties);
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe(world);
    expect(f.repo.servers().map((server) => server.id)).toEqual([f.server.id]);
  } finally {
    await app.close();
    await f.cleanup();
  }
});
