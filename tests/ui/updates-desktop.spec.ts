import { test, expect, _electron as electron } from '@playwright/test';
import { fixture } from '../helpers';
test('real Electron updates: persist optional checks and reject an unsigned release without enabling installation', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
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
    await desktop.evaluate(() => {
      // Only the external update feed is stubbed; persistence and signature policy are real.
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ tag_name: 'v99.0.0', draft: false, prerelease: false, assets: [] }),
        );
    });
    const page = await desktop.firstWindow();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const panel = page.locator('.update-controls');
    await expect(
      panel.getByRole('heading', { name: 'MineDock updates', exact: true }),
    ).toBeVisible();
    const toggle = panel.getByRole('checkbox', {
      name: 'Automatically check for application updates',
      exact: true,
    });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect
      .poll(
        () =>
          JSON.parse(
            String(
              f.repo.db.prepare("SELECT value FROM settings WHERE key='updates'").get()?.value,
            ),
          ).automaticChecks,
      )
      .toBe(true);
    await panel.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect(panel).toContainText(
      'The latest release has no verified update metadata for this platform.',
    );
    await expect(
      panel.getByRole('button', { name: 'Download verified update', exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Restart and install', exact: true }),
    ).toHaveCount(0);
    expect(f.repo.server(f.server.id).version).toBe(f.server.version);
    await toggle.uncheck();
    await page.screenshot({ path: 'test-results/updates-real-desktop.png' });
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
