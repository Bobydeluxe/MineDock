import { it, expect, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir, utimes, open, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ClientAssets, ItemAssets, itemMetadata } from '../packages/items/assets';
import { assetId, assetPath, renderItem } from '../packages/items/models';
import { decodeTexture, encode } from '../packages/items/raster';
import { itemAssetFixture } from './fixtures/item-assets';
import {
  itemText,
  itemTextDetails,
  actualEnchantments,
} from '../packages/domain/item-presentation';

async function fixture(version = '1.20.1', modern = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'minedock-items-'));
  const f = await itemAssetFixture(root, version, modern);
  return {
    ...f,
    root,
    cleanup: async () => {
      f.assets.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
it.each([
  ['1.20.1', false],
  ['1.21.1', false],
  ['1.21.4', true],
  ['26.3', true],
] as const)('uses exact %s schema with original synthetic test art', async (version, modern) => {
  const f = await fixture(version, modern);
  try {
    const client = await ClientAssets.open(f.filename);
    try {
      expect(!!(await client.json('assets/minecraft/items/diamond_sword.json'))).toBe(modern);
    } finally {
      client.close();
    }
    const sword = await f.assets.visual(
      version,
      { id: 'minecraft:diamond_sword', components: {} },
      'en',
    );
    expect(sword).toMatchObject({ version, status: 'ready', render: 'flat', name: 'QA sword' });
    expect(sword.url).toMatch(/^minedock-item:\/\/cache\/[a-f0-9]{64}\.png$/);
    const apple = await f.assets.visual(version, { id: 'minecraft:apple', components: {} }, 'en');
    expect(apple.render).toBe('layered');
    const block = await f.assets.visual(version, { id: 'minecraft:stone', components: {} }, 'en');
    expect(block.render).toBe('model');
    const b = decodeTexture((await f.assets.image(block.url!.split('/').pop()!))!);
    const colors = new Set(
      Array.from({ length: 4096 }, (_, i) =>
        b.data[i * 4 + 3] ? b.data.subarray(i * 4, i * 4 + 3).toString('hex') : '',
      ),
    );
    expect(colors.size).toBeGreaterThanOrEqual(4); // transparent background, top and two shaded faces
  } finally {
    await f.cleanup();
  }
});
it('keeps unknown/modded IDs and metadata, refuses a newer-only vanilla registry entry', async () => {
  const f = await fixture();
  try {
    const item = {
      id: 'example:custom_apple',
      count: 64,
      damage: 7,
      enchantments: ['actual'],
      components: { 'custom:data': { precise: '9223372036854775806' } },
    };
    const original = JSON.stringify(item);
    expect(
      (await f.assets.visual('1.20.1', { id: item.id, components: item.components }, 'en')).status,
    ).toBe('custom');
    expect(JSON.stringify(item)).toBe(original);
    const catalog = await f.assets.catalog('1.20.1', 'en', new Set([item.id, 'minecraft:mace']));
    expect(catalog.complete).toBe(true);
    expect(catalog.entries.find((i) => i.id === 'minecraft:mace')).toMatchObject({
      compatible: false,
      registered: false,
      observed: true,
    });
    expect(catalog.entries.find((i) => i.id === item.id)).toMatchObject({
      observed: true,
      registered: false,
      namespace: 'example',
    });
    expect(
      (await f.assets.visual('1.20.1', { id: 'minecraft:mace', components: {} }, 'en')).status,
    ).toBe('unavailable');
  } finally {
    await f.cleanup();
  }
});
it('deduplicates concurrent work, uses bounded concurrency, and separates exact versions/states', async () => {
  const f = await fixture();
  try {
    const values = await Promise.all(
      Array.from({ length: 40 }, () =>
        f.assets.visual('1.20.1', { id: 'minecraft:diamond_sword', components: {} }, 'en'),
      ),
    );
    expect(new Set(values.map((v) => v.url)).size).toBe(1);
    expect(f.assets.metrics.renders).toBe(1);
    expect(
      (await f.assets.visual('1.21.1', { id: 'minecraft:diamond_sword', components: {} }, 'en'))
        .status,
    ).toBe('no-client');
    expect(
      (
        await f.assets.visual(
          '1.20.1',
          { id: 'minecraft:diamond_sword', components: { 'minecraft:custom_model_data': 5 } },
          'en',
        )
      ).status,
    ).toBe('unavailable');
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        f.assets.visual('1.20.1', { id: 'custom:object_' + i, components: {} }, 'en'),
      ),
    );
    expect(f.assets.metrics.peakConcurrent).toBeLessThanOrEqual(4);
  } finally {
    await f.cleanup();
  }
});
it('serves validated disk images and exact registry offline after restart; repairs corrupt PNG cache', async () => {
  const f = await fixture();
  let offline: ItemAssets | undefined;
  try {
    const first = await f.assets.visual(
      '1.20.1',
      { id: 'minecraft:diamond_sword', components: {} },
      'en',
    );
    f.assets.close();
    const network = vi.fn(async () => {
      throw new Error('offline');
    });
    offline = new ItemAssets(f.assets.root, network);
    expect(
      await offline.visual('1.20.1', { id: 'minecraft:diamond_sword', components: {} }, 'en'),
    ).toEqual(first);
    expect(offline.metrics.diskHits).toBe(1);
    expect(network).not.toHaveBeenCalled();
    offline.close();
    await writeFile(path.join(f.assets.root, first.url!.split('/').pop()!), 'corrupt');
    offline = new ItemAssets(f.assets.root, network);
    const repaired = await offline.visual(
      '1.20.1',
      { id: 'minecraft:diamond_sword', components: {} },
      'en',
    );
    expect(repaired.status).toBe('ready');
    expect(offline.metrics.renders).toBe(1);
  } finally {
    offline?.close();
    await f.cleanup();
  }
});
it('rejects traversal, untrusted namespaces, oversized images, corrupt CRCs and non-images', async () => {
  for (const id of [
    'minecraft:../secret',
    'minecraft:a/../../b',
    'minecraft:/item',
    'minecraft:a\\b',
    'https://evil.test/a',
    'minecraft:a%2fb',
  ])
    expect(() => assetId(id)).toThrow();
  expect(assetId('diamond_sword')).toBe('minecraft:diamond_sword');
  expect(assetPath('models', 'minecraft:item/diamond_sword')).toBe(
    'assets/minecraft/models/item/diamond_sword.json',
  );
  const f = await fixture();
  try {
    const client = await ClientAssets.open(f.filename);
    try {
      await expect(client.bytes('../sources.json')).rejects.toThrow();
    } finally {
      client.close();
    }
    const original = await f.assets.visual(
      '1.20.1',
      { id: 'minecraft:diamond_sword', components: {} },
      'en',
    );
    const bytes = (await f.assets.image(original.url!.split('/').pop()!))!;
    const large = Buffer.from(bytes);
    large.writeUInt32BE(90000, 16);
    expect(() => decodeTexture(large)).toThrow();
    const corrupt = Buffer.from(bytes);
    corrupt[corrupt.length - 6] = corrupt[corrupt.length - 6]! ^ 255;
    expect(() => decodeTexture(corrupt)).toThrow();
    expect(() => decodeTexture(Buffer.from('<svg>'))).toThrow();
    expect(await f.assets.image('../../sources.json')).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
it('does not accept a different client version or an altered official hash', async () => {
  const f = await fixture();
  try {
    await expect(f.assets.importClient('1.21.1', f.filename)).rejects.toThrow('version');
    const bad = new ItemAssets(path.join(f.root, 'bad'), async (url) =>
      url.includes('version_manifest')
        ? { versions: [{ id: '1.20.1', url: 'https://piston-meta.mojang.com/qa' }] }
        : { id: '1.20.1', downloads: { client: { sha1: '0'.repeat(40) } } },
    );
    try {
      await expect(bad.importClient('1.20.1', f.filename)).rejects.toThrow('SHA-1');
    } finally {
      bad.close();
    }
  } finally {
    await f.cleanup();
  }
});
it('handles 404/oversize/hostile redirects and transient network errors without broadening HTTP hosts', async () => {
  const original = globalThis.fetch;
  try {
    const fake = vi.fn(async () => new Response(null, { status: 404 }));
    globalThis.fetch = fake;
    expect(
      await itemMetadata(
        'https://raw.githubusercontent.com/misode/mcmeta/1.20.1-registries/item/data.json',
        new AbortController().signal,
      ),
    ).toBeUndefined();
    expect(fake).toHaveBeenCalledTimes(1);
    globalThis.fetch = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { Location: 'https://example.com/stolen' } }),
    );
    await expect(
      itemMetadata('https://piston-meta.mojang.com/qa', new AbortController().signal),
    ).rejects.toThrow('allowed');
    globalThis.fetch = vi.fn(
      async () => new Response('{}', { headers: { 'Content-Length': String(3 * 1024 ** 2) } }),
    );
    await expect(
      itemMetadata('https://piston-meta.mojang.com/qa', new AbortController().signal),
    ).rejects.toThrow('large');
    const timeout = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    globalThis.fetch = timeout;
    await expect(
      itemMetadata('https://piston-meta.mojang.com/qa', new AbortController().signal),
    ).rejects.toThrow('timed out');
    expect(timeout).toHaveBeenCalledTimes(2);
    await expect(
      itemMetadata(
        'https://raw.githubusercontent.com/evil/assets/main/item.json',
        new AbortController().signal,
      ),
    ).rejects.toThrow('allowed');
  } finally {
    globalThis.fetch = original;
  }
});
it('negative-caches absent registries, retains observed partial entries and cancels queued requests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'minedock-negative-')),
    fetcher = vi.fn(async () => undefined),
    a = new ItemAssets(root, fetcher);
  try {
    await a.registry('1.20.1');
    await a.registry('1.20.1');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await a.catalog('1.20.1', 'en', new Set(['mod:unknown']))).toMatchObject({
      complete: false,
      source: 'saved-items',
      entries: [{ id: 'mod:unknown' }],
    });
    a.close();
    await expect(
      a.visual('1.20.1', { id: 'minecraft:apple', components: {} }, 'en'),
    ).rejects.toThrow();
  } finally {
    a.close();
    await rm(root, { recursive: true, force: true });
  }
});
it('evicts expired files and data beyond the 128 MiB disk budget without touching source registration', async () => {
  const f = await fixture();
  try {
    const oversized = path.join(f.assets.root, 'f'.repeat(64) + '.png'),
      expired = path.join(f.assets.root, 'e'.repeat(64) + '.png');
    const file = await open(oversized, 'w');
    await file.truncate(129 * 1024 ** 2);
    await file.close();
    await writeFile(expired, 'old');
    await utimes(expired, new Date(0), new Date(0));
    await f.assets.clean();
    expect(await stat(oversized).catch(() => null)).toBeNull();
    expect(await stat(expired).catch(() => null)).toBeNull();
    expect(
      JSON.parse(await readFile(path.join(f.assets.root, 'sources.json'), 'utf8')),
    ).toHaveLength(1);
    expect((await readdir(f.assets.root)).length).toBeLessThan(5000);
  } finally {
    await f.cleanup();
  }
});
it('resolves constant/dye layers and refuses unsupported component-dependent presentation', async () => {
  const texture = { width: 1, height: 1, data: Buffer.from([255, 255, 255, 255]) };
  const reader = {
    json: async (p: string) =>
      p.includes('/items/')
        ? {
            model: {
              type: 'minecraft:model',
              model: 'minecraft:item/qa',
              tints: [{ type: 'minecraft:dye', default: 0xff0000 }],
            },
          }
        : p.endsWith('/qa.json')
          ? { parent: 'builtin/generated', textures: { layer0: 'item/qa' } }
          : undefined,
    texture: async () => texture,
  };
  const rendered = await renderItem(reader, 'minecraft:qa', true, {
    'minecraft:dyed_color': 0x00ff00,
  });
  expect(decodeTexture(encode(rendered.image)).data.subarray(0, 4)).toEqual(
    Buffer.from([0, 255, 0, 255]),
  );
  const special = { ...reader, json: async () => ({ model: { type: 'minecraft:special' } }) };
  await expect(renderItem(special, 'minecraft:shield', true, {})).rejects.toThrow('unsupported');
});
it('shows only actual safely parsed names/lore/enchantments, including absent and empty metadata', () => {
  expect(
    itemText(
      '{"text":"Actual name","extra":[{"text":"!"}],"clickEvent":{"action":"run_command","value":"ignored"}}',
    ),
  ).toBe('Actual name!');
  expect(itemText({ selector: '@a' })).toBeUndefined();
  expect(itemText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  expect(
    itemTextDetails({
      'minecraft:custom_name': '{"text":"Kept name"}',
      'minecraft:lore': ['{"text":"Actual lore"}'],
    }),
  ).toEqual({ name: 'Kept name', lore: ['Actual lore'] });
  expect(actualEnchantments({ components: {} })).toEqual([]);
  expect(actualEnchantments({ components: { 'minecraft:enchantments': {} } })).toEqual([]);
  expect(
    actualEnchantments({
      components: {
        'minecraft:enchantments': {
          levels: { 'minecraft:unbreaking': 3, 'minecraft:sharpness': 0 },
        },
      },
    }),
  ).toEqual(['minecraft:unbreaking 3']);
  expect(
    actualEnchantments({ components: { Enchantments: [{ id: 'minecraft:unbreaking', lvl: 2 }] } }),
  ).toEqual(['minecraft:unbreaking 2']);
});
it('rejects a version-contaminated registry envelope instead of offering newer items offline', async () => {
  const f = await fixture();
  let offline: ItemAssets | undefined;
  try {
    await f.assets.registry('1.20.1');
    f.assets.close();
    const file = path.join(f.assets.root, 'registry-1.20.1.json');
    const stored = JSON.parse(await readFile(file, 'utf8'));
    stored.version = '26.3';
    stored.ids.push('mace');
    await writeFile(file, JSON.stringify(stored));
    offline = new ItemAssets(f.assets.root, async () => {
      throw new Error('offline');
    });
    expect(await offline.registry('1.20.1')).toBeUndefined();
    expect((await offline.catalog('1.20.1', 'en', new Set())).complete).toBe(false);
  } finally {
    offline?.close();
    await f.cleanup();
  }
});
it('negative-caches missing assets and bounds retained visual state under many distinct saved IDs', async () => {
  const f = await fixture();
  try {
    const missing = await Promise.all(
      Array.from({ length: 60 }, () =>
        f.assets.visual('1.20.1', { id: 'minecraft:qa_1', components: {} }, 'en'),
      ),
    );
    expect(missing.every((v) => v.status === 'unavailable')).toBe(true);
    expect(f.assets.metrics.fallbacks).toBe(1);
    await f.assets.visual('1.20.1', { id: 'minecraft:qa_1', components: {} }, 'en');
    expect(f.assets.metrics.fallbacks).toBe(1);
    for (let i = 0; i < 540; i++)
      await f.assets.visual('1.20.1', { id: 'mod:saved_' + i, components: {} }, 'en');
    expect(f.assets.stats().visualEntries).toBeLessThanOrEqual(512);
    expect(f.assets.stats().negativeEntries).toBeLessThanOrEqual(512);
    expect(f.assets.stats().pending).toBe(0);
  } finally {
    await f.cleanup();
  }
});
