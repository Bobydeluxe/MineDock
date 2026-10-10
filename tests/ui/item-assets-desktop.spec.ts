import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
import { playerUuid } from '../fixtures/player-data';
import { itemPlayerData } from '../fixtures/item-player-data';
import { ItemAssets } from '../../packages/items/assets';
import type { Api } from '../../packages/domain/types';

test('owned exact-version client: native inventory images, hotbar, details, picker, fallback, keyboard and high DPI', async () => {
  const client = process.env.MINEDOCK_ITEM_ASSET_QA_CLIENT;
  test.skip(
    !client,
    'Real game image validation requires an owned local Java client; no copyrighted client is bundled into CI.',
  );
  const f = await fixture();
  f.repo.saveServer({ ...f.server, version: '26.3', minecraftVersion: '26.3' });
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  const assets = new ItemAssets(path.join(f.root, 'cache/item-assets'));
  await assets.importClient(
    '26.3',
    client!,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'ModrinthApp/meta/assets') : undefined,
  );
  await assets.registry('26.3');
  assets.close();
  await writeFile(
    path.join(f.server.path, 'usercache.json'),
    JSON.stringify([{ name: 'Friend', uuid: playerUuid }]),
  );
  const playerFile = path.join(f.server.path, 'world/players/data', playerUuid + '.dat');
  await mkdir(path.dirname(playerFile), { recursive: true });
  const original = itemPlayerData();
  await writeFile(playerFile, original);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] => typeof p[1] === 'string' && p[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const executablePath = process.env.MINEDOCK_TEST_BINARY;
  const desktop = await electron.launch({
    executablePath,
    args: executablePath
      ? ['--force-device-scale-factor=2']
      : ['.', '--force-device-scale-factor=2'],
    env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
  });
  try {
    const page = await desktop.firstWindow();
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button', { name: /Integration/ })
      .click();
    await page
      .getByRole('navigation', { name: 'Server details' })
      .getByRole('button', { name: 'Players', exact: true })
      .click();
    await page.getByRole('button', { name: 'Player details', exact: true }).click();
    const profile = page.locator('.player-profile-dialog'),
      main = profile.locator('.inventory-grid.inventory').first(),
      hotbar = profile.locator('.inventory-grid.inventory').nth(1);
    await expect(main.locator('button')).toHaveCount(27);
    await expect(hotbar.locator('button')).toHaveCount(9);
    await expect(main.locator('button').first()).toHaveAttribute(
      'aria-label',
      'Inventory 10 · minecraft:apple × 64',
    );
    await main.scrollIntoViewIfNeeded();
    const apple = main.locator('img').first();
    await expect(apple).toBeVisible();
    await expect(apple).toHaveJSProperty('naturalWidth', 64);
    await expect(apple).toHaveCSS('image-rendering', 'pixelated');
    await expect(main.locator('button').nth(2).locator('img')).toHaveJSProperty('naturalWidth', 64);
    await hotbar.scrollIntoViewIfNeeded();
    await expect(hotbar.locator('button').first().locator('img')).toHaveJSProperty(
      'naturalWidth',
      64,
    );
    await expect(hotbar.locator('[role=meter]')).toHaveAttribute('aria-valuenow', '1511');
    await expect(hotbar.locator('.item-enchanted')).toHaveCount(1);
    await expect(profile.locator('.inventory-grid.armor button').last()).toHaveAttribute(
      'aria-label',
      'Armor 1 · minecraft:iron_boots × 1',
    );
    await profile
      .getByRole('button', { name: 'Inventory 16 · example:custom_apple × 64', exact: true })
      .focus();
    await expect(profile.locator('button:focus .item-tooltip')).toContainText(
      'example:custom_apple',
    );
    await expect(
      profile
        .getByRole('button', { name: 'Inventory 16 · example:custom_apple × 64', exact: true })
        .locator('img'),
    ).toHaveCount(0);
    await hotbar.locator('button').first().click();
    const detail = page.getByRole('dialog', { name: 'Slot details · Inventory 1', exact: true });
    await expect(detail.locator('.item-visual.large img')).toHaveJSProperty('naturalWidth', 64);
    await expect(detail).toContainText('minecraft:damage');
    await detail.getByRole('button', { name: 'Close', exact: true }).click();
    await profile
      .getByRole('navigation', { name: 'Player profile tabs' })
      .getByRole('button', { name: 'Actions', exact: true })
      .click();
    await profile
      .locator('.player-action-composer')
      .getByLabel('Action', { exact: true })
      .selectOption('give');
    await profile.getByText('Browse items', { exact: true }).click();
    const list = profile.locator('.item-catalog-list');
    await expect(list.locator('button')).toHaveCount(24);
    await profile.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(profile.locator('.item-pagination')).toContainText('2 /');
    await profile.getByLabel('Search items', { exact: true }).fill('diamond sword');
    await expect(list.locator('button')).toHaveCount(1);
    await expect(list).toContainText('minecraft:diamond_sword');
    await profile.getByLabel('Search items', { exact: true }).press('Tab');
    await list.locator('button').first().focus();
    await page.keyboard.press('Enter');
    await expect(profile.getByLabel('Item ID', { exact: true })).toHaveValue(
      'minecraft:diamond_sword',
    );
    const response = await page.evaluate(async (id) => {
      const api = (window as unknown as { minedock: Api }).minedock;
      return api.itemVisual(id, { id: 'minecraft:diamond_sword', components: {} });
    }, f.server.id);
    expect(response.version).toBe('26.3');
    expect(response.url).toMatch(/^minedock-item:/);
    expect(await readFile(playerFile)).toEqual(original);
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
