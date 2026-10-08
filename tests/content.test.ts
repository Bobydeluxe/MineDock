import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fixture } from './helpers';
import { ManagedContentService, type ContentCatalog } from '../packages/marketplace/content';
import { HangarCatalog } from '../packages/marketplace/hangar';
import { MarketplaceRegistry } from '../packages/marketplace/registry';
import { IconCache } from '../packages/marketplace/icons';
import { DownloadManager, fetchApproved } from '../packages/minecraft/downloads';
import { Logger } from '../packages/core/logger';
import { OperationService } from '../packages/core/operations';
import type { ContentVersion } from '../packages/domain/content';
import type { Operation } from '../packages/domain/operations';
afterEach(() => vi.unstubAllGlobals());
it('caches only bounded raster icons from approved CDN hosts and refuses SVG, redirects and oversized images', async () => {
  const f = await fixture();
  try {
    const cache = new IconCache(path.join(f.root, 'cache', 'icons'));
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZf8AAAAASUVORK5CYII=',
      'base64',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(image)),
    );
    expect(await cache.get('https://cdn.modrinth.com/icon.png')).toMatch(
      /^data:image\/png;base64,/,
    );
    await cache.get('https://cdn.modrinth.com/icon.png');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await cache.get('https://example.com/icon.png')).toBeNull();
    expect(await cache.get('file:///private/file.png')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    );
    expect(await cache.get('https://cdn.modrinth.com/icon.svg')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://api.github.com/repository' },
          }),
      ),
    );
    expect(await cache.get('https://cdn.modrinth.com/redirect.png')).toBeNull();
    const oversized = Buffer.from(image);
    oversized.writeUInt32BE(10000, 16);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(oversized)),
    );
    expect(await cache.get('https://cdn.modrinth.com/large.png')).toBeNull();
    await cache.clean(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(image)),
    );
    await cache.get('https://cdn.modrinth.com/icon.png');
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    await f.cleanup();
  }
});
function catalog(versions: ContentVersion[]): ContentCatalog {
  return {
    id: 'modrinth',
    search: async () => [],
    project: async (id) => ({ id, title: id, serverSide: true, kind: 'plugin' }),
    versions: async (_server, id) =>
      versions
        .filter((v) => v.projectId === id)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    version: async (id) => {
      const value = versions.find((v) => v.id === id);
      if (!value) throw Error('Version not found');
      return value;
    },
  };
}
function version(id: string, project = 'main', date = '2026-01-01'): ContentVersion {
  const bytes = Buffer.from(id);
  return {
    id,
    projectId: project,
    name: id,
    publishedAt: date,
    changelog: `Changes in ${id}`,
    releaseType: 'release',
    gameVersions: ['1.21.11'],
    loaders: ['paper'],
    files: [
      {
        filename: project + '.jar',
        url: `https://cdn.modrinth.com/${id}.jar`,
        primary: true,
        hash: { algorithm: 'sha256', value: createHash('sha256').update(bytes).digest('hex') },
      },
    ],
    dependencies: [],
  };
}
function downloadsFixture() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(Buffer.from(new URL(url).pathname.slice(1, -4)))),
  );
}
it('updates, rolls back and uninstalls only tracked binaries while retaining configuration and manual files', async () => {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger),
    manager = new ManagedContentService(f.repo, new DownloadManager(f.bus, f.repo), jobs);
  try {
    const root = path.join(f.server.path, 'plugins');
    await mkdir(path.join(root, 'main'), { recursive: true });
    await writeFile(path.join(root, 'main', 'config.yml'), 'keep: true');
    await writeFile(path.join(root, 'manual.jar'), 'manual');
    downloadsFixture();
    const provider = catalog([version('v1'), version('v2', 'main', '2026-02-01')]);
    const [item] = await manager.install(f.server, provider, 'main', 'v1');
    expect(item?.sha256).toHaveLength(64);
    await manager.install(f.server, provider, 'main', 'v2', item!.id);
    expect(await readFile(path.join(root, 'main.jar'), 'utf8')).toBe('v2');
    const [history] = manager.history(f.server, item!.id);
    expect(history?.item.versionId).toBe('v1');
    await manager.rollback(f.server, item!.id, history!.id, 'main');
    expect(await readFile(path.join(root, 'main.jar'), 'utf8')).toBe('v1');
    await manager.uninstall(f.server, item!.id, 'main');
    await expect(stat(path.join(root, 'main.jar'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(f.repo.content(f.server.id)).toHaveLength(0);
    expect(await readFile(path.join(root, 'main', 'config.yml'), 'utf8')).toBe('keep: true');
    expect(await readFile(path.join(root, 'manual.jar'), 'utf8')).toBe('manual');
    expect((await manager.manual(f.server)).map((item) => item.filename)).toEqual(['manual.jar']);
    expect(f.repo.operations().every((op) => op.status === 'completed')).toBe(true);
  } finally {
    await logger.flush();
    await f.cleanup();
  }
});
it('refuses manual filename collisions, changed binaries and corrupted rollback files without losing the current content', async () => {
  const f = await fixture(),
    manager = new ManagedContentService(f.repo, new DownloadManager(f.bus));
  try {
    downloadsFixture();
    const root = path.join(f.server.path, 'plugins');
    await mkdir(root);
    await writeFile(path.join(root, 'main.jar.disabled'), 'manual');
    const provider = catalog([version('v1'), version('v2')]);
    await expect(manager.install(f.server, provider, 'main', 'v1')).rejects.toThrow(
      'already exists',
    );
    expect(await readFile(path.join(root, 'main.jar.disabled'), 'utf8')).toBe('manual');
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(root, 'main.jar.disabled'));
    const [item] = await manager.install(f.server, provider, 'main', 'v1');
    await manager.install(f.server, provider, 'main', 'v2', item!.id);
    const [history] = manager.history(f.server, item!.id);
    await writeFile(history!.path, 'corrupt');
    await expect(manager.rollback(f.server, item!.id, history!.id, 'main')).rejects.toThrow(
      'corrupted',
    );
    expect(await readFile(path.join(root, 'main.jar'), 'utf8')).toBe('v2');
    await writeFile(path.join(root, 'main.jar'), 'external edit');
    await expect(manager.uninstall(f.server, item!.id, 'main')).rejects.toThrow('changed outside');
    expect(f.repo.content(f.server.id)).toHaveLength(1);
    expect(await readFile(path.join(root, 'main.jar'), 'utf8')).toBe('external edit');
  } finally {
    await f.cleanup();
  }
});
it('resolves version-only required dependencies, blocks their removal and rejects conflicting pins atomically', async () => {
  const f = await fixture(),
    manager = new ManagedContentService(f.repo, new DownloadManager(f.bus));
  try {
    downloadsFixture();
    const main = version('m1'),
      dep = version('d1', 'dependency');
    main.dependencies = [{ versionId: 'd1', required: true }];
    const provider = catalog([main, dep]);
    const items = await manager.install(f.server, provider, 'main', 'm1');
    expect(items[1]?.dependencies).toEqual(['dependency']);
    await expect(manager.uninstall(f.server, items[0]!.id, 'dependency')).rejects.toThrow(
      'requires this dependency',
    );
    const alternate = version('d2', 'dependency');
    const other = version('x1', 'other');
    other.dependencies = [{ projectId: 'dependency', versionId: 'd2', required: true }];
    await expect(
      manager.install(f.server, catalog([other, alternate]), 'other', 'x1'),
    ).rejects.toThrow('dependency');
    expect(f.repo.content(f.server.id)).toHaveLength(2);
    await expect(stat(path.join(f.server.path, 'plugins', 'other.jar'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } finally {
    await f.cleanup();
  }
});
it('cancels staged copying and recovers pending operations older than the visible history limit', async () => {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger),
    manager = new ManagedContentService(f.repo, new DownloadManager(f.bus), jobs);
  try {
    downloadsFixture();
    await mkdir(path.join(f.server.path, 'plugins'));
    await writeFile(path.join(f.server.path, 'plugins', 'manual.jar'), Buffer.alloc(8192));
    const off = f.bus.subscribe((event) => {
      if (event.type === 'progress' && event.progress.phase === 'extracting')
        jobs.cancel(event.progress.id);
    });
    await expect(
      manager.install(f.server, catalog([version('v1')]), 'main', 'v1'),
    ).rejects.toThrow();
    off();
    expect(f.repo.operations()[0]?.status).toBe('cancelled');
    expect((await stat(path.join(f.server.path, 'plugins', 'manual.jar'))).size).toBe(8192);
    expect(f.repo.content(f.server.id)).toHaveLength(0);
    const at = new Date().toISOString();
    const old: Operation = {
      id: randomUUID(),
      kind: 'download',
      label: 'Interrupted download',
      createdAt: at,
      updatedAt: at,
      status: 'downloading',
      recoverable: false,
      serverId: f.server.id,
    };
    f.repo.saveOperation(old);
    for (let i = 0; i < 205; i++)
      f.repo.saveOperation({ ...old, id: randomUUID(), status: 'completed' });
    await jobs.recover();
    const recovered = f.repo.operations().find((op) => op.id === old.id);
    expect(recovered?.status).toBe('attention');
    expect(recovered?.recoverable).toBe(false);
    jobs.dismiss(old.id);
    expect(
      JSON.parse(
        String(
          f.repo.db.prepare('SELECT metadata FROM operations WHERE id=?').get(old.id)?.metadata,
        ),
      ).status,
    ).toBe('cancelled');
  } finally {
    await logger.flush();
    await f.cleanup();
  }
});
it('bounds saved binary history and never offers an older stable version as an update', async () => {
  const f = await fixture(),
    manager = new ManagedContentService(f.repo, new DownloadManager(f.bus)),
    registry = new MarketplaceRegistry(f.repo);
  try {
    downloadsFixture();
    registry.configure({ historyLimit: 1 });
    const versions = [
        version('v1'),
        version('v2', 'main', '2026-02-01'),
        version('v3', 'main', '2026-03-01'),
      ],
      provider = catalog(versions);
    const [item] = await manager.install(f.server, provider, 'main', 'v1');
    await manager.install(f.server, provider, 'main', 'v2', item!.id);
    await manager.install(f.server, provider, 'main', 'v3', item!.id);
    expect(manager.history(f.server, item!.id)).toHaveLength(1);
    expect(manager.history(f.server, item!.id)[0]?.item.versionId).toBe('v2');
    expect((await manager.updates(f.server, () => provider))[0]?.status).toBe('upToDate');
    versions[2]!.releaseType = 'beta';
    expect((await manager.updates(f.server, () => provider))[0]?.status).toBe('upToDate');
    versions.splice(2, 1);
    expect((await manager.updates(f.server, () => provider))[0]?.status).toBe('unknown');
  } finally {
    await f.cleanup();
  }
});
it('uses Hangar PAPER metadata and verified downloads with explicit snapshot IDs', async () => {
  const f = await fixture();
  try {
    const value = {
      projectId: 31,
      name: '5.1+1',
      createdAt: '2026-01-01',
      description: 'changes',
      channel: { name: 'Snapshot' },
      downloads: {
        PAPER: {
          fileInfo: { name: 'plugin.jar', sha256Hash: 'a'.repeat(64) },
          downloadUrl: 'https://hangarcdn.papermc.io/plugin.jar',
        },
      },
      platformDependencies: { PAPER: ['1.21.11'] },
      pluginDependencies: { PAPER: [{ projectId: 12, required: true }] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(JSON.stringify(url.includes('/versions?') ? { result: [value] } : value)),
      ),
    );
    const provider = new HangarCatalog();
    const versions = await provider.versions(f.server, '31');
    expect(versions[0]).toMatchObject({
      id: '31:5.1+1',
      loaders: ['paper'],
      releaseType: 'snapshot',
      dependencies: [{ projectId: '12', required: true }],
    });
    expect((await provider.version('31:5.1+1')).files[0]?.hash?.algorithm).toBe('sha256');
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toContain('5.1%2B1');
  } finally {
    await f.cleanup();
  }
});
it('strips credentials across approved redirect hosts', async () => {
  const calls: Record<string, string>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: RequestInit) => {
      calls.push(options.headers as Record<string, string>);
      return calls.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.modrinth.com/asset.jar' },
          })
        : new Response('file');
    }),
  );
  await fetchApproved('https://api.modrinth.com/v2/project/fixture', AbortSignal.timeout(1000), {
    'x-api-key': 'secret-fixture',
  });
  expect(calls[0]?.['x-api-key']).toBe('secret-fixture');
  expect(calls[1]?.['x-api-key']).toBeUndefined();
});
