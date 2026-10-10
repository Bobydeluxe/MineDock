import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fixture } from '../helpers';
import { playerUuid } from '../fixtures/player-data';
import { itemPlayerData } from '../fixtures/item-player-data';
import { itemAssetFixture } from '../fixtures/item-assets';
import type { Api, Settings } from '../../packages/domain/types';
import { readPlayerNbt, writePlayerNbt, type NbtTag } from '../../packages/security/player-nbt';

test('Electron: no installed game, explicit official download through QA transport, offline cache, six languages, light/dark and 200% DPI', async () => {
  const f = await fixture();
  f.repo.saveServer({ ...f.server, engine: 'fabric', version: '26.3', minecraftVersion: '26.3' });
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  const source = await itemAssetFixture(path.join(f.root, 'original-qa-source'), '26.3', true);
  source.assets.close();
  const bytes = await readFile(source.filename),
    sha1 = createHash('sha1').update(bytes).digest('hex');
  let requests = 0,
    offline = false;
  const http = createServer((req, res) => {
    requests++;
    if (offline) {
      res.statusCode = 503;
      res.end('offline');
      return;
    }
    const url = new URL(req.url!, 'http://127.0.0.1').searchParams.get('resource') ?? '';
    const json = (v: unknown) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(v));
    };
    if (url.includes('version_manifest'))
      json({ versions: [{ id: '26.3', url: 'https://piston-meta.mojang.com/qa' }] });
    else if (url.includes('piston-meta'))
      json({
        id: '26.3',
        downloads: {
          client: {
            url: `https://piston-data.mojang.com/v1/objects/${sha1}/client.jar`,
            sha1,
            size: bytes.length,
          },
        },
      });
    else if (url.includes('piston-data')) res.end(bytes);
    else if (url.endsWith('version.json')) json({ id: '26.3' });
    else if (url.endsWith('item/data.json')) json(source.registry);
    else {
      res.statusCode = 404;
      res.end('Missing QA resource');
    }
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + (http.address() as { port: number }).port;
  await writeFile(
    path.join(f.server.path, 'usercache.json'),
    JSON.stringify([{ name: 'Friend', uuid: playerUuid }]),
  );
  const file = path.join(f.server.path, 'world/players/data', playerUuid + '.dat');
  await mkdir(path.dirname(file), { recursive: true });
  const nbt = readPlayerNbt(itemPlayerData());
  const inventory = (nbt.value as NbtTag[]).find((t) => t.name === 'Inventory')!.value as NbtTag[];
  inventory.push({
    type: 10,
    value: [
      { type: 8, name: 'id', value: 'qa:apple' },
      { type: 3, name: 'count', value: 2 },
      { type: 1, name: 'Slot', value: 22 },
      { type: 10, name: 'components', value: [] },
    ],
  });
  const mod = await itemAssetFixture(path.join(f.root, 'original-qa-mod'), '26.3', true, {
    files: {
      'fabric.mod.json': { id: 'qa', license: 'MIT' },
      'assets/qa/items/apple.json': { model: { type: 'minecraft:model', model: 'qa:item/apple' } },
      'assets/qa/models/item/apple.json': {
        parent: 'minecraft:item/generated',
        textures: { layer0: 'minecraft:item/qa' },
      },
      'assets/qa/lang/en_us.json': { 'item.qa.apple': 'Original QA mod item' },
    },
  });
  mod.assets.close();
  await mkdir(path.join(f.server.path, 'mods'), { recursive: true });
  await cp(mod.filename, path.join(f.server.path, 'mods/qa.jar'));
  const original = writePlayerNbt(nbt);
  await writeFile(file, original);
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
    // This injection exists only inside the test process. Production policies remain HTTPS/host pinned.
    await desktop.evaluate((_electron, base) => {
      const native = globalThis.fetch;
      globalThis.fetch = async (input, init) =>
        native(base + '/?resource=' + encodeURIComponent(String(input)), init);
    }, base);
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
    const profile = page.locator('.player-profile-dialog');
    await expect(
      profile.locator('.inventory-grid.inventory').first().locator('button'),
    ).toHaveCount(27);
    const setup = profile.locator('.item-assets-setup').first();
    await setup.getByText('Download official images', { exact: true }).first().click();
    const download = setup.getByRole('button', { name: 'Download official images', exact: true });
    await expect(download).toBeDisabled();
    await setup.getByRole('checkbox', { name: /I own Minecraft Java/ }).check();
    await download.click();
    await expect(setup).toContainText('Private resources from Mojang');
    const grid = profile.locator('.inventory-grid.inventory').first();
    await grid.scrollIntoViewIfNeeded();
    await expect(grid.locator('button').first().locator('img')).toHaveJSProperty(
      'naturalWidth',
      64,
    );
    await grid.locator('button').first().click();
    const detail = page.getByRole('dialog', { name: 'Slot details · Inventory 10', exact: true });
    await expect(detail.locator('.item-visual.large img')).toHaveJSProperty('naturalWidth', 64);
    await detail.getByRole('button', { name: 'Close', exact: true }).click();
    const modSlot = grid.getByRole('button', { name: 'Inventory 23 · qa:apple × 2', exact: true });
    await expect(modSlot.locator('img')).toHaveJSProperty('naturalWidth', 64);
    await modSlot.click();
    const modDetail = page.getByRole('dialog', {
      name: 'Slot details · Inventory 23',
      exact: true,
    });
    await expect(modDetail).toContainText('Original QA mod item');
    await expect(modDetail.locator('.item-visual.large img')).toHaveJSProperty('naturalWidth', 64);
    await modDetail.getByRole('button', { name: 'Close', exact: true }).click();
    const registrations = JSON.parse(
      await readFile(path.join(f.root, 'cache/item-assets/sources.json'), 'utf8'),
    );
    expect(registrations).toHaveLength(1);
    expect(registrations[0].origin).toBe('official-private');
    expect(registrations[0].filename).toContain('cache');
    offline = true;
    const before = requests;
    const status = await page.evaluate(async (id) => {
      const api = (window as unknown as { minedock: Api }).minedock;
      return api.itemVisual(id, { id: 'minecraft:apple', components: {} });
    }, f.server.id);
    expect(status.status).toBe('ready');
    expect(requests).toBe(before);
    for (const language of ['fr', 'de', 'es', 'pt', 'it', 'en'] as const) {
      await page.evaluate(
        async ({ language, theme }) => {
          const api = (window as unknown as { minedock: Api }).minedock;
          const s = await api.snapshot();
          await api.settings({ ...s.settings, language, theme } as Settings);
        },
        { language, theme: language === 'it' ? 'light' : 'dark' },
      );
      await expect(profile).toBeVisible();
      await expect(grid.locator('button').first().locator('img')).toHaveJSProperty(
        'naturalWidth',
        64,
      );
    }
    expect(await readFile(file)).toEqual(original);
  } finally {
    await desktop.close();
    http.close();
    await f.cleanup();
  }
});
