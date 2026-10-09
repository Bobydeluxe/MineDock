import { expect, it, vi, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { FabricCatalog } from '../packages/minecraft/catalogs';
import { MinecraftVersionService } from '../packages/minecraft/versions';
import { patchProperties, parseProperties } from '../packages/domain/properties';
import { propertyFields, validatePropertyChanges } from '../packages/domain/property-fields';
import { AppCore } from '../packages/core/app';
import { fixture } from './helpers';
import { profileImageSize } from '../packages/security/profile-image';
import { supportsJavaProperty } from '../packages/domain/property-fields';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('recommends a real stable Paper build while preserving the exact advanced build and snapshot metadata', async () => {
  const entry = (id: number, channel: string) => ({
    id,
    channel,
    downloads: {
      'server:default': {
        name: 'paper.jar',
        url: 'https://fill-data.papermc.io/paper-' + id + '.jar',
        checksums: { sha256: 'a'.repeat(64) },
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('version_manifest')
              ? {
                  versions: [
                    { id: '26.3', type: 'release', url: 'https://piston-meta.mojang.com/new.json' },
                    {
                      id: '1.21.11',
                      type: 'release',
                      url: 'https://piston-meta.mojang.com/old.json',
                    },
                    {
                      id: '26w01a',
                      type: 'snapshot',
                      url: 'https://piston-meta.mojang.com/snapshot.json',
                    },
                  ],
                }
              : url.endsWith('/projects/paper')
                ? { versions: { latest: ['26.3', '1.21.11'] } }
                : url.includes('/26.3/builds')
                  ? [entry(3, 'EXPERIMENTAL')]
                  : url.includes('/builds')
                    ? [entry(133, 'EXPERIMENTAL'), entry(132, 'STABLE')]
                    : {
                        downloads: {
                          server: {
                            url: 'https://piston-data.mojang.com/server.jar',
                            sha1: 'b'.repeat(40),
                          },
                        },
                        javaVersion: { majorVersion: url.includes('snapshot') ? 25 : 21 },
                      },
          ),
        ),
    ),
  );
  const service = new MinecraftVersionService(),
    games = await service.catalog('paper');
  expect(games.versions.find((v) => v.recommended)?.version).toBe('1.21.11');
  const builds = await service.catalog('paper', '1.21.11');
  expect(builds.builds).toHaveLength(2);
  expect(builds.builds.find((v) => v.recommended)?.version).toBe('132');
  expect(await service.artifact('paper', '1.21.11', '133')).toMatchObject({ build: '133' });
  await expect(service.artifact('paper', '1.21.11', '404')).rejects.toThrow('Paper build');
  expect(await service.artifact('vanilla', '26w01a')).toMatchObject({
    build: '26w01a',
    java: 25,
    hash: { algorithm: 'sha1' },
  });
});
it('rejects oversized image containers before native decoding and handles escaped property names without corrupting values', async () => {
  const png = await readFile(path.resolve('assets/brand/icon-128.png'));
  expect(profileImageSize(png)).toEqual({ width: 128, height: 128 });
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(1000000, 16);
  expect(() => profileImageSize(bomb)).toThrow('4096');
  expect(() => profileImageSize(Buffer.from('<svg/>'))).toThrow('PNG');
  const patched = patchProperties('custom\\=key : keep\r\n', { 'custom=key': 'new=value' });
  expect(parseProperties(patched)['custom=key']).toBe('new=value');
  expect(supportsJavaProperty('26w01a', 'server-port')).toBe(true);
  expect(supportsJavaProperty('26w01a', 'pvp')).toBe(false);
  expect(supportsJavaProperty('1.21.2', 'spawn-animals')).toBe(false);
});
const official = async (url: string) =>
  new Response(
    url.endsWith('.sha256')
      ? 'a'.repeat(64)
      : JSON.stringify(
          url.includes('/game')
            ? [{ version: '1.21.1', stable: true }]
            : url.includes('/installer')
              ? [
                  { version: '1.1.2', stable: true, url: 'https://maven.fabricmc.net/current.jar' },
                  { version: '1.0.1', stable: false, url: 'https://maven.fabricmc.net/old.jar' },
                ]
              : [
                  { loader: { version: '0.19.5', stable: true } },
                  { loader: { version: '0.16.9', stable: false } },
                ],
        ),
  );
it('exposes independent complete Fabric lists, upstream stable badges and exact older installer/loader choices', async () => {
  vi.stubGlobal('fetch', vi.fn(official));
  const service = new MinecraftVersionService();
  const data = await service.catalog('fabric', '1.21.1');
  expect(data.builds).toHaveLength(2);
  expect(data.installers).toHaveLength(2);
  expect(data.installers[1]).toMatchObject({ stable: false, recommended: false });
  const artifact = await new FabricCatalog().artifact('1.21.1', undefined, {
    loaderVersion: '0.16.9',
    installerVersion: '1.0.1',
  });
  expect(artifact).toMatchObject({
    build: '0.16.9@1.0.1',
    loaderVersion: '0.16.9',
    installerVersion: '1.0.1',
    url: 'https://maven.fabricmc.net/old.jar',
    hash: { algorithm: 'sha256' },
  });
  await expect(
    new FabricCatalog().artifact('1.21.1', undefined, {
      loaderVersion: 'missing',
      installerVersion: '1.0.1',
    }),
  ).rejects.toThrow('compatible');
});
it('persists catalogs across process instances, marks offline fallback and refreshes rather than silently discarding selections', async () => {
  const f = await fixture();
  try {
    vi.stubGlobal('fetch', vi.fn(official));
    const root = path.join(f.root, 'cache');
    await mkdir(root);
    const first = new MinecraftVersionService();
    first.configureCache(root);
    await first.catalog('fabric', '1.21.1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Error('Offline');
      }),
    );
    const second = new MinecraftVersionService();
    second.configureCache(root);
    const data = await second.catalog('fabric', '1.21.1', true);
    expect(data.offline).toBe(true);
    expect(data.cached).toBe(true);
    expect(data.installers).toHaveLength(2);
  } finally {
    await f.cleanup();
  }
});
it('patches only changed effective values and preserves comments, unknown keys, escapes, CRLF and duplicate semantics', () => {
  const original =
    '# keep\r\nmotd : first\r\nunknown\\ key=custom\r\nmotd : hello\\\r\n  world\r\n# tail\r\n';
  const changed = patchProperties(original, { motd: 'New café', 'max-players': '12' });
  expect(changed).toContain('# keep\r\nmotd : first\r\nunknown\\ key=custom\r\n');
  expect(changed).toContain('# tail\r\n');
  expect(changed).toContain('motd : New caf\\u00e9\r\n');
  expect(parseProperties(changed)).toMatchObject({
    motd: 'New café',
    'unknown key': 'custom',
    'max-players': '12',
  });
  expect(patchProperties(original, {})).toBe(original);
});
it('uses engine/version-specific properties and rejects invented keys, removed Java keys, secret edits and invalid ranges', () => {
  const legacy = { engine: 'fabric' as const, version: '1.21.1' },
    modern = { engine: 'paper' as const, version: '26.3' };
  expect(propertyFields(legacy, {}).some((f) => f.key === 'pvp')).toBe(true);
  expect(propertyFields(modern, { pvp: 'true' }).some((f) => f.key === 'pvp')).toBe(false);
  expect(
    propertyFields(
      { engine: 'bedrock', version: '1.26.30' },
      { 'server-name': 'Friends', 'tick-distance': '4' },
    ).map((f) => f.key),
  ).toEqual(['server-name', 'tick-distance']);
  expect(() => validatePropertyChanges(modern, { pvp: 'true' }, { pvp: 'false' })).toThrow(
    'not supported',
  );
  expect(() => validatePropertyChanges(legacy, {}, { 'server-name': 'Fake Java name' })).toThrow(
    'not supported',
  );
  expect(() => validatePropertyChanges(legacy, {}, { 'rcon.password': 'leak' })).toThrow('Secrets');
  expect(() => validatePropertyChanges(legacy, {}, { 'op-permission-level': '5' })).toThrow(
    'range',
  );
});
it('saves reviewed properties atomically with stale guards, encrypted history, a full backup and unchanged profile/world identity', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    const file = path.join(f.server.path, 'server.properties');
    const original = await readFile(file, 'utf8');
    await writeFile(
      file,
      '# custom comment\r\n' +
        original.replaceAll('\n', '\r\n') +
        'custom-engine-key = preserve\r\n',
    );
    const document = await core.propertiesDocument(f.server.id);
    expect(document.values).not.toHaveProperty('rcon.password');
    await core.saveProperties(
      f.server.id,
      { motd: 'New welcome', 'max-players': '12' },
      document.sha256,
    );
    const text = await readFile(file, 'utf8');
    expect(text).toContain('# custom comment\r\n');
    expect(text).toContain('custom-engine-key = preserve\r\n');
    expect(core.repo.server(f.server.id).name).toBe(f.server.name);
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(core.repo.backups()).toHaveLength(1);
    expect(core.configuration.history(f.server.id)).toHaveLength(1);
    await expect(
      core.saveProperties(f.server.id, { 'max-players': '15' }, document.sha256),
    ).rejects.toThrow('Refresh');
    expect(core.repo.server(f.server.id).maxPlayers).toBe(12);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('renames an app profile without writing a Java server-name or changing its world and survives reopening SQLite', async () => {
  const f = await fixture();
  f.repo.close();
  let core = await AppCore.open(f.root, f.secrets);
  try {
    const file = path.join(f.server.path, 'server.properties'),
      before = await readFile(file, 'utf8');
    await core.updateProfile(f.server.id, { name: 'Friends survival' });
    expect(await readFile(file, 'utf8')).toBe(before);
    expect((await core.properties(f.server.id))['server-name']).toBeUndefined();
    await expect(
      core.updateProfile(f.server.id, { name: 'Friends', thumbnail: 'data:image/png;base64,YWJj' }),
    ).rejects.toThrow('thumbnail');
    await core.close();
    core = await AppCore.open(f.root, f.secrets);
    expect(core.repo.server(f.server.id).name).toBe('Friends survival');
  } finally {
    await core.close();
    await f.cleanup();
  }
});
