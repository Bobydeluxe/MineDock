import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
import { playerData, playerUuid } from '../fixtures/player-data';
import type { Api } from '../../packages/domain/types';

test('native player profile: real saved NBT, exact slots, verified safety copies, restore, notes and group selection', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  await writeFile(
    path.join(f.server.path, 'usercache.json'),
    JSON.stringify([{ name: 'Friend', uuid: playerUuid }]),
  );
  const playerFile = path.join(f.server.path, 'world/playerdata', playerUuid + '.dat');
  await mkdir(path.dirname(playerFile), { recursive: true });
  await writeFile(playerFile, playerData());
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] => typeof p[1] === 'string' && p[0] !== 'ELECTRON_RUN_AS_NODE',
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
      .getByRole('button', { name: /Integration/ })
      .click();
    const tabs = page.getByRole('navigation', { name: 'Server details' });
    await tabs.getByRole('button', { name: 'Players', exact: true }).click();
    await page.getByRole('button', { name: 'Player details', exact: true }).click();
    const profile = page.locator('.player-profile-dialog');
    await expect(profile.locator('.inventory-source')).toContainText('Last saved inventory');
    await expect(profile.locator('.inventory-grid.inventory button')).toHaveCount(36);
    await expect(profile.locator('.inventory-grid.armor button')).toHaveCount(4);
    await expect(profile.locator('.inventory-grid.offhand button')).toHaveCount(1);
    await expect(profile.locator('.inventory-grid.ender button')).toHaveCount(27);
    await expect(
      profile.getByRole('button', {
        name: 'Inventory 16 · example:custom_apple × 64',
        exact: true,
      }),
    ).toBeVisible();
    await profile
      .getByRole('button', { name: 'Inventory 16 · example:custom_apple × 64', exact: true })
      .click();
    const slot = page.getByRole('dialog', { name: 'Slot details · Inventory 16', exact: true });
    await slot.getByLabel('Quantity', { exact: true }).fill('4');
    await slot.getByLabel('Type the exact name(s), separated by comma and space').fill('Friend');
    await slot.getByRole('button', { name: 'Apply change', exact: true }).click();
    await expect(slot).toHaveCount(0);
    await expect(
      profile.getByRole('button', {
        name: 'Inventory 16 · example:custom_apple × 60',
        exact: true,
      }),
    ).toBeVisible();
    expect(f.repo.backups()).toHaveLength(1);
    await profile.locator('.inventory-history > summary').click();
    await profile
      .getByRole('button', { name: 'Preview inventory restoration', exact: true })
      .click();
    const restore = page.getByRole('dialog', {
      name: 'Preview inventory restoration',
      exact: true,
    });
    await expect(restore).toContainText('example:custom_apple × 60 → example:custom_apple × 64');
    await restore.getByLabel('Type the exact name(s), separated by comma and space').fill('Friend');
    await restore.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(restore).toHaveCount(0);
    await expect(
      profile.getByRole('button', {
        name: 'Inventory 16 · example:custom_apple × 64',
        exact: true,
      }),
    ).toBeVisible();
    await profile
      .getByRole('navigation', { name: 'Player profile tabs' })
      .getByRole('button', { name: 'Notes', exact: true })
      .click();
    await profile.getByLabel('Private notes', { exact: true }).fill('QA local note');
    await profile.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(profile.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await profile
      .getByRole('navigation', { name: 'Player profile tabs' })
      .getByRole('button', { name: 'Actions', exact: true })
      .click();
    await expect(
      profile.getByRole('button', { name: 'Review action', exact: true }),
    ).toBeDisabled();
    await profile.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select player Friend', exact: true }).check();
    await page.getByRole('button', { name: 'Selected player actions', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('1 selected players · Friend');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Review action', exact: true }),
    ).toBeDisabled();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await tabs.getByRole('button', { name: 'Worlds', exact: true }).click();
    await expect(page.locator('.world-controls')).toContainText('World controls');
    await expect(
      page.locator('.world-controls').getByRole('button', { name: 'Noon', exact: true }),
    ).toBeDisabled();
    await page.locator('.gamerule-controls > summary').click();
    await expect(
      page.locator('.gamerule-row').filter({ hasText: 'minecraft:keep_inventory' }),
    ).toContainText('Current value: Unavailable');
    expect(await readFile(playerFile)).toBeTruthy();
    const actual = await page.evaluate(
      async ({ id, uuid }) => {
        const api = (window as unknown as { minedock: Api }).minedock;
        return {
          inventory: await api.playerInventory(id, 'Friend', false),
          snapshots: await api.playerInventorySnapshots(id, uuid),
        };
      },
      { id: f.server.id, uuid: playerUuid },
    );
    expect(actual.inventory.source).toBe('saved');
    expect(actual.snapshots).toHaveLength(2);
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
