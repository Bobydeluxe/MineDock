import { _electron as electron, expect, type Page } from '@playwright/test';
import { mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fixture } from '../tests/helpers';
import { playerUuid } from '../tests/fixtures/player-data';
import { itemPlayerData } from '../tests/fixtures/item-player-data';
import { ItemAssets } from '../packages/items/assets';
import { AppCore } from '../packages/core/app';
import { PRODUCT, type Api } from '../packages/domain/types';

const outputIndex = process.argv.indexOf('--output');
const output = path.resolve(
  outputIndex < 0 ? 'docs/screenshots/player-world-050' : process.argv[outputIndex + 1]!,
);
if (
  output !== path.resolve('docs/screenshots/player-world-050') &&
  !output.startsWith(path.resolve('data') + path.sep)
)
  throw new Error('Capture output must be the native gallery or ignored workspace data.');
await mkdir(output, { recursive: true });
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (p): p is [string, string] => typeof p[1] === 'string' && p[0] !== 'ELECTRON_RUN_AS_NODE',
  ),
);
const captures: {
  file: string;
  sha256: string;
  provenance: string;
  viewport: { width: number; height: number };
}[] = [];
async function capture(page: Page, file: string, provenance: string) {
  await page.mouse.move(16, 16);
  await page.screenshot({ path: path.join(output, file + '.png'), animations: 'disabled' });
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  captures.push({
    file: file + '.png',
    sha256: createHash('sha256')
      .update(await readFile(path.join(output, file + '.png')))
      .digest('hex'),
    provenance,
    viewport: size,
  });
  console.log('Captured', file);
}
const f = await fixture();
f.repo.saveServer({
  ...f.server,
  name: 'Player administration QA',
  version: '26.3',
  minecraftVersion: '26.3',
});
f.repo.saveSettings({ ...f.repo.settings(), onboarded: true, theme: 'dark' });
await writeFile(
  path.join(f.server.path, 'usercache.json'),
  JSON.stringify([{ name: 'Friend', uuid: playerUuid }]),
);
const dataFile = path.join(f.server.path, 'world/players/data', playerUuid + '.dat');
await mkdir(path.dirname(dataFile), { recursive: true });
await writeFile(dataFile, itemPlayerData());
const ownedClient = process.env.MINEDOCK_ITEM_ASSET_QA_CLIENT;
if (!ownedClient)
  throw new Error('An owned exact 26.3 client is required for current icon screenshots.');
const itemAssets = new ItemAssets(path.join(f.root, 'cache/item-assets'));
await itemAssets.importClient(
  '26.3',
  ownedClient,
  process.env.APPDATA ? path.join(process.env.APPDATA, 'ModrinthApp/meta/assets') : undefined,
);
await itemAssets.registry('26.3');
itemAssets.close();
const qa =
  'Actual Electron, preload, SQLite and bounded Java NBT reader; synthetic saved player-data fixture (DataVersion 5023), not gameplay. Exact Java 26.3 client from the owner’s Modrinth installation, verified against official Mojang SHA-1, supplies local images. Future NBT stays read-only. Server stopped; no command success or live inventory is fabricated.';
const desktop = await electron.launch({
  args: ['.', '--force-device-scale-factor=1'],
  env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
});
try {
  const page = await desktop.firstWindow();
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 960),
  );
  await page
    .getByRole('navigation', { name: 'Servers', exact: true })
    .getByRole('button', { name: /Player administration QA/ })
    .click();
  await page
    .getByRole('navigation', { name: 'Server details' })
    .getByRole('button', { name: 'Players', exact: true })
    .click();
  await expect(page.locator('.known-player')).toContainText('Friend');
  await capture(page, 'players', qa);
  await page.getByRole('button', { name: 'Player details', exact: true }).click();
  const profile = page.locator('.player-profile-dialog');
  await expect(profile.locator('.inventory-grid.inventory button')).toHaveCount(36);
  await expect(profile.locator('.inventory-source')).toContainText('Last saved inventory');
  await expect(
    profile.locator('.inventory-grid.inventory').first().locator('img').first(),
  ).toHaveJSProperty('naturalWidth', 64);
  await expect(
    profile.locator('.inventory-grid.inventory').first().locator('button').nth(2).locator('img'),
  ).toHaveJSProperty('naturalWidth', 64);
  await capture(page, 'player-profile', qa);
  await profile
    .getByRole('button', { name: 'Inventory 1 · minecraft:diamond_sword × 1', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Slot details · Inventory 1', exact: true }),
  ).toContainText('minecraft:diamond_sword');
  await expect(page.locator('.item-visual.large img')).toHaveJSProperty('naturalWidth', 64);
  await capture(page, 'inventory-slot', qa);
  await page
    .getByRole('dialog', { name: 'Slot details · Inventory 1', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await profile.locator('.inventory-grid.ender').scrollIntoViewIfNeeded();
  await expect(profile.locator('.inventory-grid.ender img').first()).toHaveJSProperty(
    'naturalWidth',
    64,
  );
  await capture(page, 'ender-chest', qa);
  await profile.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select player Friend', exact: true }).check();
  await page.getByRole('button', { name: 'Selected player actions', exact: true }).click();
  const group = page.getByRole('dialog');
  await group.getByLabel('Action', { exact: true }).selectOption('give');
  await group.getByText('Browse items', { exact: true }).click();
  await group.getByLabel('Search items', { exact: true }).fill('diamond');
  await group
    .locator('.item-catalog-list button')
    .filter({ hasText: 'minecraft:diamond_sword' })
    .click();
  await group.locator('.selected-item-preview').scrollIntoViewIfNeeded();
  await expect(group.locator('.selected-item-preview img')).toHaveJSProperty('naturalWidth', 64);
  await group.locator('.item-catalog-list').evaluate((e) => {
    e.scrollTop = 0;
  });
  await group.locator('.dialog-body').evaluate(e=>{e.scrollTop=0;});
  await capture(page,'item-picker',qa);
  await group.getByLabel('Search items',{exact:true}).fill('diamond_sword');
  await expect(group.getByRole('button', { name: 'Review action', exact: true })).toBeDisabled();
  await capture(page, 'group-actions', qa);
  await group.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(async () => {
    const api = (window as unknown as { minedock: Api }).minedock;
    const settings = (await api.snapshot()).settings;
    await api.settings({ ...settings, theme: 'light' });
  });
  await page.getByRole('button', { name: 'Player details', exact: true }).click();
  await expect(page.locator('.inventory-grid.ender button')).toHaveCount(27);
  await expect(
    page.locator('.inventory-grid.inventory').first().locator('img').first(),
  ).toHaveJSProperty('naturalWidth', 64);
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations))
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await expect(page.locator('.inventory-slot').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await capture(page, 'player-profile-light', qa);
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(900, 760),
  );
  await capture(page, 'player-profile-compact', qa);
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    overflowing: Array.from(document.querySelectorAll('.inventory-grid button')).filter(
      (e) => e.getBoundingClientRect().right > innerWidth || e.getBoundingClientRect().left < 0,
    ).length,
  }));
  if (bounds.overflowing) throw new Error('Inventory grid overflows the compact native viewport.');
} finally {
  await desktop.close();
  await f.cleanup();
}

const index = process.argv.indexOf('--world-profile');
if (index < 0 || !process.argv.includes('--eula-accepted'))
  throw new Error(
    'Supply an owned isolated Paper QA profile and personal EULA acceptance to capture actual live world controls.',
  );
const worldRoot = path.resolve(process.argv[index + 1]!);
if (!worldRoot.startsWith(path.resolve('data/player-world-validation') + path.sep))
  throw new Error('Use only this validation script’s isolated profile.');
const setup = await AppCore.open(worldRoot);
setup.repo.saveSettings({
  ...setup.repo.settings(),
  onboarded: true,
  language: 'en',
  theme: 'dark',
});
const server = setup.repo.servers()[0]!;
if (server.engine !== 'paper' || server.version !== '1.21.11' || setup.repo.servers().length !== 1)
  throw new Error('Unexpected world QA profile.');
await setup.close();
const worldDesktop = await electron.launch({
  args: ['.', '--force-device-scale-factor=1'],
  env: { ...env, MINEDOCK_DATA_DIR: worldRoot, MINEDOCK_TEST: '1' },
});
try {
  const page = await worldDesktop.firstWindow();
  await worldDesktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 960),
  );
  await page.evaluate(async (id) => {
    await (window as unknown as { minedock: Api }).minedock.start(id);
  }, server.id);
  await page.waitForFunction(
    async (id) =>
      (await (window as unknown as { minedock: Api }).minedock.snapshot()).servers.find(
        (s) => s.id === id,
      )?.status === 'running',
    server.id,
    { timeout: 180000 },
  );
  await page
    .getByRole('navigation', { name: 'Servers', exact: true })
    .getByRole('button', { name: /Native world QA/ })
    .click();
  await page
    .getByRole('navigation', { name: 'Server details' })
    .getByRole('button', { name: 'Worlds', exact: true })
    .click();
  await page.getByRole('button', { name: 'Read current values', exact: true }).click();
  await expect(page.locator('.world-controls')).toContainText('Hard', { timeout: 30000 });
  await page.getByRole('button', { name: 'Noon', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(
    page,
    'world-controls',
    'Actual Electron and real isolated Paper 1.21.11 build 132, Java 21, personally accepted EULA; native RCON reads, no connected players, no added plugins. Weather cannot be read natively and remains unavailable.',
  );
  await page.locator('.gamerule-controls > summary').click();
  await page.locator('.gamerule-controls').scrollIntoViewIfNeeded();
  await expect(
    page.locator('.gamerule-row').filter({ hasText: 'minecraft:keep_inventory' }),
  ).toContainText('true');
  await capture(
    page,
    'gamerules',
    'Actual native Minecraft 1.21.11 gamerule responses from the isolated Paper server; current values read through RCON, not fixtures.',
  );
  await page.evaluate(async (id) => {
    await (window as unknown as { minedock: Api }).minedock.stop(id);
  }, server.id);
} finally {
  await worldDesktop.close();
}
await writeFile(
  path.join(output, 'provenance.json'),
  JSON.stringify(
    { at: new Date().toISOString(), version: PRODUCT.version, publicRelease: false, captures },
    null,
    2,
  ) + '\n',
);
for (const [source, target] of [
  ['players', 'players'],
  ['player-profile', 'player-details'],
  ['world-controls', 'worlds'],
] as const)
  if (outputIndex < 0)
    await cp(path.join(output, source + '.png'), path.resolve('docs/screenshots', target + '.png'));
