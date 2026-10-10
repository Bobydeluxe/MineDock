import { it, expect, vi } from 'vitest';
import { mkdtemp, realpath, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { ZipFile } from 'yazl';
import { ItemAssets } from '../packages/items/assets';
import { itemAssetFixture } from './fixtures/item-assets';
import { assetBytes, assetUrl } from '../packages/items/remote';
import { animationFrame } from '../packages/items/animation';
import { headTexture } from '../packages/items/profile';
import { renderItem, type AssetReader } from '../packages/items/models';
import { encode, type Raster } from '../packages/items/raster';
import { ModResourceDownloads } from '../packages/items/modrinth';

const root = () =>
  realpath(os.tmpdir()).then((p) => mkdtemp(path.join(p, 'minedock-remote-items-')));
it('cancels network work on server change and leaves no hanging image/download queue', async () => {
  const dir = await root();
  let started = false;
  const service = new ItemAssets(path.join(dir, 'private'), async (_url, signal) => {
    started = true;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  try {
    service.scope('server-a');
    const pending = service.downloadOfficial('26.3');
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(started).toBe(true));
    service.scope('server-b');
    await rejected;
    expect(service.stats().pending).toBe(0);
  } finally {
    service.close();
    await rm(dir, { recursive: true, force: true });
  }
});
const art = (rgb = 0xffffff, width = 64, height = 64): Raster => ({
  width,
  height,
  data: Buffer.from(
    Array.from({ length: width * height }, () => [
      (rgb >> 16) & 255,
      (rgb >> 8) & 255,
      rgb & 255,
      255,
    ]).flat(),
  ),
});
async function archive(filename: string, files: Record<string, Buffer | unknown>) {
  const z = new ZipFile(),
    chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    z.outputStream.on('data', (b) => chunks.push(b));
    z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    z.outputStream.on('error', reject);
  });
  for (const [k, v] of Object.entries(files))
    z.addBuffer(Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v)), k);
  z.end();
  await writeFile(filename, await done);
}
it.each([
  ['1.20.1', false],
  ['1.21.1', false],
  ['1.21.4', true],
  ['26.3', true],
] as const)(
  'downloads only authorized exact %s into private cache without a game installation, then survives offline',
  async (version, modern) => {
    const dir = await root();
    const f = await itemAssetFixture(path.join(dir, 'synthetic-source'), version, modern);
    f.assets.close();
    const bytes = await readFile(f.filename),
      sha1 = createHash('sha1').update(bytes).digest('hex');
    let count = 0;
    const server = createServer((_req, res) => {
      count++;
      res.end(bytes);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const meta = async (url: string) =>
      url.includes('version_manifest')
        ? { versions: [{ id: version, url: 'https://piston-meta.mojang.com/qa' }] }
        : url.includes('piston-meta')
          ? {
              id: version,
              downloads: {
                client: {
                  url: `https://piston-data.mojang.com/v1/objects/${sha1}/client.jar`,
                  size: bytes.length,
                  sha1,
                },
              },
            }
          : url.endsWith('version.json')
            ? { id: version }
            : f.registry;
    // Dependency injection belongs to this test; production never accepts a localhost asset URL.
    const service = new ItemAssets(
      path.join(dir, 'private'),
      meta,
      async (url, kind, max, signal) => {
        expect(assetUrl(url, kind)).toBe(true);
        const r = await fetch('http://127.0.0.1:' + port, { signal });
        const b = Buffer.from(await r.arrayBuffer());
        expect(b.length).toBeLessThanOrEqual(max);
        return b;
      },
    );
    try {
      await Promise.all(Array.from({ length: 8 }, () => service.downloadOfficial(version)));
      expect(count).toBe(1);
      expect(await service.context(version)).toMatchObject({
        available: true,
        source: 'official-private',
      });
      const first = await service.visual(
        version,
        { id: 'minecraft:diamond_sword', components: {} },
        'en',
      );
      expect(first.status).toBe('ready');
      service.close();
      const offline = new ItemAssets(
        path.join(dir, 'private'),
        async () => {
          throw new Error('offline');
        },
        async () => {
          throw new Error('offline');
        },
      );
      try {
        expect(
          (await offline.visual(version, { id: 'minecraft:diamond_sword', components: {} }, 'en'))
            .url,
        ).toBe(first.url);
        await offline.purge();
        expect((await offline.context(version)).available).toBe(false);
        expect(await readFile(f.filename)).toEqual(bytes);
      } finally {
        offline.close();
      }
    } finally {
      service.close();
      server.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
it('blocks arbitrary URLs, downgrade redirects, oversized responses and corrupted integrity', async () => {
  for (const url of [
    'http://textures.minecraft.net/texture/' + 'a'.repeat(64),
    'https://textures.minecraft.net.evil.test/texture/' + 'a'.repeat(64),
    'https://user@textures.minecraft.net/texture/' + 'a'.repeat(64),
    'https://textures.minecraft.net/texture/' + 'a'.repeat(64) + '?x=1',
    'file:///C:/private',
  ])
    expect(assetUrl(url, 'skin')).toBe(false);
  const fetcher = vi.spyOn(globalThis, 'fetch');
  try {
    fetcher.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://textures.minecraft.net/texture/' + 'a'.repeat(64) },
      }),
    );
    await expect(
      assetBytes(
        'https://textures.minecraft.net/texture/' + 'a'.repeat(64),
        'skin',
        100,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    fetcher.mockResolvedValueOnce(new Response(Buffer.alloc(101)));
    await expect(
      assetBytes(
        'https://textures.minecraft.net/texture/' + 'a'.repeat(64),
        'skin',
        100,
        new AbortController().signal,
      ),
    ).rejects.toThrow('limits');
  } finally {
    fetcher.mockRestore();
  }
});
it('uses actual custom head profiles only and never a viewer skin or arbitrary NBT URL', () => {
  const profile = (url: string) => ({
    'minecraft:profile': {
      properties: [
        {
          name: 'textures',
          value: Buffer.from(JSON.stringify({ textures: { SKIN: { url } } })).toString('base64'),
        },
      ],
    },
  });
  const url = 'https://textures.minecraft.net/texture/' + 'a'.repeat(64);
  expect(headTexture(profile(url.replace('https:', 'http:')))).toBe(url);
  expect(headTexture(profile('https://localhost/private'))).toBeUndefined();
  expect(headTexture({})).toBeUndefined();
  expect(headTexture({ 'minecraft:profile': { name: 'Somebody' } })).toBeUndefined();
});
function reader(definition: unknown, texture = art()): AssetReader {
  return {
    json: async (p) =>
      p.includes('/items/')
        ? { model: definition }
        : p.endsWith('/base.json')
          ? { display: { gui: { rotation: [30, 45, 0], scale: [0.6, 0.6, 0.6] } } }
          : {
              parent: 'builtin/generated',
              textures: { layer0: 'item/' + path.basename(p, '.json') },
            },
    texture: async () => texture,
  };
}
it.each(['skeleton', 'wither_skeleton', 'creeper', 'zombie', 'player'])(
  'renders actual %s head UVs in 3D',
  async (kind) => {
    const r = reader({
      type: 'minecraft:special',
      base: 'minecraft:item/base',
      model: { type: 'minecraft:head', kind },
    });
    expect((await renderItem(r, 'minecraft:player_head', true, {})).kind).toBe('model');
  },
);
it('keeps a missing profile head unavailable', async () => {
  const r = reader({
    type: 'minecraft:special',
    base: 'minecraft:item/base',
    model: { type: 'minecraft:player_head' },
  });
  r.texture = async () => {
    throw new Error('Missing saved head profile');
  };
  await expect(renderItem(r, 'minecraft:player_head', true, {})).rejects.toThrow('profile');
});
it('normalizes legacy RGB player skins so an empty opaque hat does not cover the real face', async () => {
  const skin = art(0xcc8844, 64, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 32; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      skin.data[i] = skin.data[i + 1] = skin.data[i + 2] = 0;
    }
  const r = reader(
    {
      type: 'minecraft:special',
      base: 'minecraft:item/base',
      model: { type: 'minecraft:player_head' },
    },
    skin,
  );
  const result = await renderItem(r, 'minecraft:player_head', true, {});
  expect(result.image.data.some((n, i) => i % 4 !== 3 && n > 0)).toBe(true);
});
it('presents the actual front of entity heads rather than the back of the skin', async () => {
  const skin = art(0xff0000, 64, 32);
  for (let y = 8; y < 16; y++)
    for (let x = 8; x < 16; x++) {
      const i = (y * 64 + x) * 4;
      skin.data[i] = 0;
      skin.data[i + 1] = 255;
    }
  const r = reader(
    {
      type: 'minecraft:special',
      base: 'minecraft:item/base',
      model: { type: 'minecraft:player_head' },
    },
    skin,
  );
  const result = await renderItem(r, 'minecraft:player_head', true, {});
  let front = 0;
  for (let i = 0; i < result.image.data.length; i += 4)
    if (result.image.data[i + 1]! > result.image.data[i]!) front++;
  expect(front).toBeGreaterThan(100);
});
it.each(['banner', 'shield'])(
  'applies actual ordered %s colors and motifs and distinguishes decoration',
  async (type) => {
    const r = reader({
      type: 'minecraft:special',
      base: 'minecraft:item/base',
      model: { type: 'minecraft:' + type, color: 'white' },
    });
    const state = {
      'minecraft:base_color': 'white',
      'minecraft:banner_patterns': [
        { pattern: 'minecraft:stripe_top', color: 'red' },
        { pattern: 'minecraft:border', color: 'blue' },
      ],
    };
    const a = encode((await renderItem(r, 'minecraft:white_banner', true, state)).image);
    const b = encode(
      (
        await renderItem(r, 'minecraft:white_banner', true, {
          ...state,
          'minecraft:banner_patterns': [...state['minecraft:banner_patterns']].reverse(),
        })
      ).image,
    );
    expect(a.equals(b)).toBe(false);
    await expect(
      renderItem(r, 'minecraft:white_banner', true, {
        'minecraft:banner_patterns': Array.from({ length: 17 }, () => ({})),
      }),
    ).rejects.toThrow('limit');
  },
);
it('chooses neutral bow/bundle in a static inventory and crossbow from actual projectiles', async () => {
  const selected: string[] = [];
  const model = (name: string) => ({ type: 'minecraft:model', model: 'minecraft:item/' + name });
  const r = reader({
    type: 'minecraft:select',
    property: 'minecraft:charge_type',
    cases: [
      { when: 'arrow', model: model('arrow') },
      { when: 'rocket', model: model('rocket') },
    ],
    fallback: {
      type: 'minecraft:condition',
      property: 'minecraft:using_item',
      on_true: model('pulling'),
      on_false: model('neutral'),
    },
  });
  r.texture = async (id) => {
    selected.push(id);
    return art(0xffffff, 16, 16);
  };
  for (const components of [
    {},
    { 'minecraft:charged_projectiles': [{ id: 'minecraft:arrow' }] },
    { 'minecraft:charged_projectiles': [{ id: 'minecraft:firework_rocket' }] },
  ])
    await renderItem(r, 'minecraft:crossbow', true, components);
  expect(selected).toEqual([
    'minecraft:item/neutral',
    'minecraft:item/arrow',
    'minecraft:item/rocket',
  ]);
  for (const id of ['minecraft:compass', 'minecraft:clock'])
    await expect(renderItem(r, id, true, {})).rejects.toThrow('not available');
});
it('supports declared animation frames without inventing world time and rejects malformed frames', () => {
  const image = art(0xff0000, 16, 32);
  for (let i = 16 * 16 * 4; i < image.data.length; i += 4) {
    image.data[i] = 0;
    image.data[i + 1] = 255;
  }
  expect(animationFrame(image, { animation: { frames: [1, 0] } }).data.subarray(0, 4)).toEqual(
    Buffer.from([0, 255, 0, 255]),
  );
  expect(() => animationFrame(image, { animation: { frames: [2] } })).toThrow('index');
  expect(() => animationFrame(image, { animation: { frames: [{ index: 0, time: -1 }] } })).toThrow(
    'duration',
  );
  expect(() => animationFrame(image)).toThrow('missing');
});
it('reads licensed installed mod assets without execution, applies explicit pack override, isolates server/version', async () => {
  const dir = await root(),
    f = await itemAssetFixture(dir);
  const server = { id: 'qa-one', path: path.join(dir, 'server'), engine: 'fabric' };
  await mkdir(path.join(server.path, 'mods'), { recursive: true });
  const mod = path.join(server.path, 'mods', 'original-qa-mod.jar');
  await archive(mod, {
    'fabric.mod.json': { id: 'qa', license: 'MIT', depends: { minecraft: '1.20.1' } },
    'assets/qa/models/item/apple.json': {
      parent: 'item/generated',
      textures: { layer0: 'qa:item/apple' },
    },
    'assets/qa/textures/item/apple.png': encode(art(0x00ff00, 16, 16)),
    'assets/qa/lang/en_us.json': { 'item.qa.apple': 'Original QA apple' },
    'DO-NOT-EXECUTE.class': Buffer.from('No Java code executed'),
  });
  try {
    const v = await f.assets.visual('1.20.1', { id: 'qa:apple', components: {} }, 'en', server);
    expect(v).toMatchObject({
      status: 'ready',
      source: 'mod-resources',
      name: 'Original QA apple',
    });
    const other = await f.assets.visual('1.20.1', { id: 'qa:apple', components: {} }, 'en', {
      ...server,
      id: 'qa-two',
      path: dir,
    });
    expect(other.status).toBe('custom');
    const pack = path.join(dir, 'original-qa-pack.zip');
    await archive(pack, {
      'pack.mcmeta': { pack: { pack_format: 15, description: 'Original QA override' } },
      'assets/qa/textures/item/apple.png': encode(art(0xff0000, 16, 16)),
    });
    await f.assets.importPack(server, '1.20.1', pack);
    const changed = await f.assets.visual(
      '1.20.1',
      { id: 'qa:apple', components: {} },
      'en',
      server,
    );
    expect(changed.url).not.toBe(v.url);
    expect(changed.source).toBe('resource-pack');
    await expect(f.assets.importPack(server, '1.21.4', pack)).rejects.toThrow('format');
    expect(await readFile(mod)).toBeDefined();
  } finally {
    f.assets.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it('filters exact Modrinth game/loader/project versions and verifies archive digest, never executes or installs', async () => {
  const bytes = Buffer.from('original archive fixture'),
    sha512 = createHash('sha512').update(bytes).digest('hex');
  const project = { id: 'AbCd1234', project_type: 'mod', title: 'QA mod', license: { id: 'MIT' } };
  const version = {
    id: 'EfGh5678',
    project_id: project.id,
    version_number: 'qa-1',
    game_versions: ['1.20.1'],
    loaders: ['fabric'],
    files: [
      {
        primary: true,
        size: bytes.length,
        hashes: { sha512 },
        url: 'https://cdn.modrinth.com/data/AbCd1234/versions/EfGh5678/qa.jar',
      },
    ],
  };
  const transport = vi.fn(async () => bytes),
    meta = async (url: string) =>
      url.includes('/version?')
        ? [
            version,
            { ...version, id: 'wrong-version', game_versions: ['26.3'] },
            { ...version, id: 'wrong-loader', loaders: ['forge'] },
          ]
        : project;
  const service = new ModResourceDownloads(meta, transport);
  const signal = new AbortController().signal;
  expect(await service.choices('qa', '1.20.1', 'fabric', signal)).toHaveLength(1);
  expect((await service.download('qa', version.id, '1.20.1', 'fabric', signal)).sha512).toBe(
    sha512,
  );
  expect(transport).toHaveBeenCalledTimes(1);
  await expect(service.download('qa', 'wrong-version', '1.20.1', 'fabric', signal)).rejects.toThrow(
    'unavailable',
  );
  const denied = new ModResourceDownloads(
    async () => ({ ...project, license: { id: 'LicenseRef-All-Rights-Reserved' } }),
    transport,
  );
  await expect(denied.choices('qa', '1.20.1', 'fabric', signal)).rejects.toThrow('license');
  const corrupt = new ModResourceDownloads(meta, async () => Buffer.from('wrong archive'));
  await expect(corrupt.download('qa', version.id, '1.20.1', 'fabric', signal)).rejects.toThrow(
    'integrity',
  );
});
