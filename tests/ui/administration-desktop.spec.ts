import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
test('real Electron administration: persisted player lists, real game statistics and on-demand storage analysis', async () => {
  const f = await fixture(),
    uuid = '123e4567-e89b-12d3-a456-426614174000';
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  f.repo.seenPlayer(f.server.id, 'LocalPlayer');
  await writeFile(
    path.join(f.server.path, 'usercache.json'),
    JSON.stringify([{ name: 'LocalPlayer', uuid }]),
  );
  await writeFile(
    path.join(f.server.path, 'ops.json'),
    JSON.stringify([{ name: 'LocalPlayer', uuid, level: 4 }]),
  );
  await writeFile(
    path.join(f.server.path, 'banned-players.json'),
    JSON.stringify([{ name: 'BannedPlayer', expires: 'forever', reason: 'Known test moderation' }]),
  );
  await writeFile(
    path.join(f.server.path, 'banned-ips.json'),
    JSON.stringify([{ ip: '203.0.113.45' }]),
  );
  await mkdir(path.join(f.server.path, 'world/stats'));
  await mkdir(path.join(f.server.path, 'world/region'));
  await writeFile(
    path.join(f.server.path, 'world/stats', uuid + '.json'),
    JSON.stringify({ stats: { 'minecraft:custom': { 'minecraft:play_time': 84000 } } }),
  );
  await writeFile(path.join(f.server.path, 'world/region/r.0.0.mca'), Buffer.alloc(8192));
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
    const navigation = page.getByRole('navigation', { name: 'Server details' });
    await navigation.getByRole('button', { name: 'Players', exact: true }).click();
    const local = page
      .locator('.known-player')
      .filter({ has: page.getByRole('heading', { name: 'LocalPlayer', exact: true }) });
    await expect(local).toContainText(uuid);
    await expect(local).toContainText('1h 10m 0s');
    await expect(
      local
        .locator('.player-details > div')
        .filter({ has: page.locator('dt').filter({ hasText: /^Ping$/ }) }),
    ).toContainText('Unavailable');
    await expect(page.locator('body')).not.toContainText('203.0.113.45');
    await page.getByLabel('Player list', { exact: true }).selectOption('operators');
    await expect(page.locator('.known-player')).toHaveCount(1);
    await expect(local).toBeVisible();
    await page.getByLabel('Player list', { exact: true }).selectOption('banned');
    await expect(page.locator('.known-player')).toHaveCount(1);
    await expect(page.locator('.known-player')).toContainText('BannedPlayer');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await navigation.getByRole('button', { name: 'Metrics', exact: true }).click();
    await expect(page.getByText('No storage scan yet', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Analyze storage', exact: true }).click();
    const largest = page.locator('.storage-file').filter({ hasText: 'world/region/r.0.0.mca' });
    await expect(largest).toContainText('8.0 KB');
    expect(f.repo.server(f.server.id).diskBytes).toBeGreaterThan(8192);
    expect(
      f.repo.db
        .prepare('SELECT COUNT(*) AS count FROM storage_snapshots WHERE server_id=?')
        .get(f.server.id)?.count,
    ).toBe(1);
    await desktop.evaluate(({ shell }) => {
      shell.showItemInFolder = (file) => {
        process.env.MINEDOCK_LAST_REVEALED = file;
      };
    });
    await largest.getByRole('button', { name: 'Show in folder', exact: true }).click();
    await expect
      .poll(() => desktop.evaluate(() => process.env.MINEDOCK_LAST_REVEALED))
      .toBe(path.join(f.server.path, 'world/region/r.0.0.mca'));
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
