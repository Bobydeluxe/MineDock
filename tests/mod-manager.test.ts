import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers';
import { modFixtures, fixtureFetch, modJar } from './mod-fixtures';
import { ModManager } from '../packages/marketplace/mod-manager';
import { ModrinthCatalog } from '../packages/marketplace/modrinth';
import { ManagedContentService, compatibleContent } from '../packages/marketplace/content';
import { DownloadManager, approvedUrl } from '../packages/minecraft/downloads';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { migrations } from '../packages/database/migrations';
import { Repository } from '../packages/database/database';
import { EventBus } from '../packages/core/events';
import { AppCore } from '../packages/core/app';
import { createHash } from 'node:crypto';
import { inspectMod } from '../packages/marketplace/local-mods';
import type { InstalledContent } from '../packages/domain/types';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup() {
  const f = await fixture();
  f.server.engine = 'fabric';
  f.repo.saveServer(f.server);
  await mkdir(path.join(f.server.path, 'mods'));
  const data = await modFixtures(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger),
    downloads = new DownloadManager(f.bus, f.repo),
    catalog = new ModrinthCatalog(f.repo),
    content = new ManagedContentService(f.repo, downloads, jobs),
    manager = new ModManager(f.repo, catalog, content, downloads);
  vi.stubGlobal('fetch', vi.fn(fixtureFetch(data)));
  const install = async (projectId = 'main', versionId = projectId + 'V1') =>
    manager.apply(
      f.server,
      (await manager.plan(f.server, { selections: [{ projectId, versionId }] })).token,
    );
  return {
    ...f,
    data,
    jobs,
    catalog,
    content,
    manager,
    install,
    cleanup: async () => {
      await logger.flush();
      await f.cleanup();
    },
  };
}
it.each(['fabric', 'forge', 'neoforge'] as const)(
  'matches Minecraft and the exact %s loader',
  async (engine) => {
    const f = await setup();
    try {
      const version = await f.catalog.version('mainV1');
      expect(compatibleContent({ ...f.server, engine }, { ...version, loaders: [engine] })).toBe(
        true,
      );
      expect(compatibleContent({ ...f.server, engine }, { ...version, loaders: ['paper'] })).toBe(
        false,
      );
      expect(
        compatibleContent(
          { ...f.server, engine },
          { ...version, loaders: [engine], gameVersions: ['1.20.1'] },
        ),
      ).toBe(false);
      expect(
        compatibleContent(
          { ...f.server, engine },
          { ...version, loaders: [engine], minimumJava: 25 },
        ),
      ).toBe(false);
    } finally {
      await f.cleanup();
    }
  },
);
it('previews names and types, installs required dependencies only and persists verified metadata', async () => {
  const f = await setup();
  try {
    const plan = await f.manager.plan(f.server, {
      selections: [{ projectId: 'main', versionId: 'mainV1' }],
    });
    expect(plan.dependencies.map((d) => [d.title, d.type])).toContainEqual([
      'Test optional',
      'optional',
    ]);
    expect(plan.entries.map((e) => e.project.id)).toEqual(['dependency', 'main']);
    expect(f.repo.content(f.server.id)).toHaveLength(0);
    await f.manager.apply(f.server, plan.token);
    const items = f.repo.content(f.server.id);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.projectId === 'dependency')?.automatic).toBe(true);
    expect(items.find((i) => i.projectId === 'main')?.automatic).toBe(false);
    expect(items[0]?.fileHash?.value).toHaveLength(128);
    await expect(stat(path.join(f.server.path, 'mods/optional.jar'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await f.manager.inventory(f.server)).problems).toEqual([]);
    expect(f.manager.history(f.server).map((e) => e.action)).toEqual(['installed', 'installed']);
  } finally {
    await f.cleanup();
  }
});
it('updates, preserves pin, rolls back bytes and records operation history', async () => {
  const f = await setup();
  try {
    await f.install();
    const main = f.repo.content(f.server.id).find((i) => i.projectId === 'main')!;
    f.manager.pin(f.server, main.id, true);
    const updates = await f.manager.updates(f.server);
    expect(updates.updates.find((u) => u.contentId === main.id)?.status).toBe('updateAvailable');
    const original = await readFile(path.join(f.server.path, 'mods/main.jar'));
    await f.install('main', 'mainV2');
    expect(f.repo.content(f.server.id).find((i) => i.id === main.id)?.pinned).toBe(true);
    const previous = f.content.history(f.server, main.id)[0]!;
    await f.content.rollback(f.server, main.id, previous.id, main.title);
    f.manager.recordRollback(f.server, main, '1');
    expect(await readFile(path.join(f.server.path, 'mods/main.jar'))).toEqual(original);
    expect(f.manager.history(f.server).some((e) => e.action === 'rollback')).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('keeps shared dependencies and only offers true automatic orphans for removal', async () => {
  const f = await setup();
  try {
    await f.install();
    await f.install('other');
    const items = f.repo.content(f.server.id),
      main = items.find((i) => i.projectId === 'main')!,
      other = items.find((i) => i.projectId === 'other')!,
      dep = items.find((i) => i.projectId === 'dependency')!;
    expect(f.manager.removal(f.server, [main.id]).shared).toEqual([{ item: dep, users: 1 }]);
    expect(f.manager.removal(f.server, [main.id]).unused).toEqual([]);
    await f.manager.bulk(f.server, {
      ids: [main.id],
      action: 'uninstall',
      removeOrphans: true,
      confirmation: f.server.name,
    });
    expect(f.repo.content(f.server.id).map((i) => i.projectId)).toEqual(['dependency', 'other']);
    expect(f.manager.removal(f.server, [other.id]).unused.map((i) => i.id)).toEqual([dep.id]);
    await f.manager.bulk(f.server, {
      ids: [other.id],
      action: 'uninstall',
      removeOrphans: true,
      confirmation: f.server.name,
    });
    expect(f.repo.content(f.server.id)).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('blocks deleting or disabling a dependency used by an active mod', async () => {
  const f = await setup();
  try {
    await f.install();
    const dep = f.repo.content(f.server.id).find((i) => i.projectId === 'dependency')!;
    await expect(
      f.manager.bulk(f.server, { ids: [dep.id], action: 'uninstall', confirmation: f.server.name }),
    ).rejects.toThrow('still require');
    await expect(
      f.manager.bulk(f.server, { ids: [dep.id], action: 'disable', confirmation: f.server.name }),
    ).rejects.toThrow('active mod');
    expect((await f.manager.inventory(f.server)).problems).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('toggles selected mods and dependencies atomically without losing original filenames', async () => {
  const f = await setup();
  try {
    await f.install();
    const items = f.repo.content(f.server.id),
      ids = items.map((i) => i.id),
      before = await readFile(path.join(f.server.path, 'mods/main.jar'));
    await f.manager.bulk(f.server, { ids, action: 'disable', confirmation: f.server.name });
    expect(f.repo.content(f.server.id).every((i) => !i.enabled)).toBe(true);
    expect(await readFile(path.join(f.server.path, 'mods/main.jar.disabled'))).toEqual(before);
    await f.manager.bulk(f.server, { ids, action: 'enable', confirmation: f.server.name });
    expect(await readFile(path.join(f.server.path, 'mods/main.jar'))).toEqual(before);
  } finally {
    await f.cleanup();
  }
});
it('restores all original files when the second mod in a batch has an invalid hash', async () => {
  const f = await setup();
  try {
    await f.install();
    const before = f.repo.content(f.server.id),
      bytes = await readFile(path.join(f.server.path, 'mods/main.jar'));
    f.data.versions.otherV1!.files = [
      {
        filename: 'other.jar',
        url: 'https://cdn.modrinth.com/otherV1.jar',
        primary: true,
        hashes: { sha512: 'a'.repeat(128) },
      },
    ];
    const plan = await f.manager.plan(f.server, {
      selections: [
        { projectId: 'main', versionId: 'mainV2' },
        { projectId: 'other', versionId: 'otherV1' },
      ],
    });
    await expect(f.manager.apply(f.server, plan.token)).rejects.toThrow(/corrupted/i);
    expect(f.repo.content(f.server.id)).toEqual(before);
    expect(await readFile(path.join(f.server.path, 'mods/main.jar'))).toEqual(bytes);
    expect(f.repo.operations().some((o) => o.status === 'failed')).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('cancels a real staged download without creating installed content', async () => {
  const f = await setup();
  try {
    const plan = await f.manager.plan(f.server, {
      selections: [{ projectId: 'main', versionId: 'mainV1' }],
    });
    const original = fixtureFetch(f.data);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        if (new URL(url).hostname === 'cdn.modrinth.com') {
          const operation = f.repo.operations().find((o) => o.kind === 'content.apply')!;
          f.jobs.cancel(operation.id);
          options.signal?.throwIfAborted();
        }
        return original(url, options);
      }),
    );
    await expect(f.manager.apply(f.server, plan.token)).rejects.toThrow();
    expect(f.repo.content(f.server.id)).toEqual([]);
    expect(f.repo.operations().some((o) => o.status === 'cancelled')).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('never overwrites manual JARs and identifies exact Modrinth hashes only on request', async () => {
  const f = await setup();
  try {
    await writeFile(
      path.join(f.server.path, 'mods/main.jar'),
      Buffer.from(f.data.files['/mainV1.jar']!, 'base64'),
    );
    const scan = await f.manager.inventory(f.server);
    expect(scan.manual[0]?.title).toBe('Test main');
    await expect(f.install()).rejects.toThrow('manually added');
    expect(f.repo.content(f.server.id)).toEqual([]);
    f.data.versions.mainV1!.dependencies = [
      { project_id: null, version_id: 'dependencyV1', dependency_type: 'required' },
    ];
    f.repo.db.exec('DELETE FROM mod_cache');
    expect(await f.manager.identify(f.server, 'main.jar')).toBe(true);
    expect(f.repo.content(f.server.id)[0]?.source).toBe('local');
    expect(f.repo.content(f.server.id)[0]?.dependencyVersions).toEqual([
      { projectId: 'dependency', versionId: 'dependencyV1' },
    ]);
    expect(
      (await f.manager.inventory(f.server)).problems.some(
        (problem) => problem.code === 'dependency' && problem.severity === 'critical',
      ),
    ).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('works offline for inventory, pins, disable, history, rollback and uninstall', async () => {
  const f = await setup();
  try {
    await f.install();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const before = await f.manager.inventory(f.server);
    f.manager.pin(f.server, before.installed[1]!.id, true);
    await f.manager.bulk(f.server, {
      ids: before.installed.map((i) => i.id),
      action: 'disable',
      confirmation: f.server.name,
    });
    expect((await f.manager.inventory(f.server)).installed.every((i) => !i.enabled)).toBe(true);
    await f.manager.bulk(f.server, {
      ids: before.installed.map((i) => i.id),
      action: 'uninstall',
      confirmation: f.server.name,
    });
    expect(f.repo.content(f.server.id)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});
it('uses persistent caches and reports stale metadata when Modrinth is unavailable', async () => {
  const f = await setup();
  try {
    await f.manager.search(f.server, { query: 'main' });
    await f.manager.search(f.server, { query: 'main' });
    expect(fetch).toHaveBeenCalledTimes(2);
    f.repo.db.prepare('UPDATE mod_cache SET expires=0').run();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const cached = await f.manager.search(f.server, { query: 'main' });
    expect(cached.items[0]?.title).toBe('Test main');
    expect(cached.offline).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('rejects reused plans after pin changes and keeps beta versions opt-in', async () => {
  const f = await setup();
  try {
    await f.install();
    const main = f.repo.content(f.server.id)[1]!,
      plan = await f.manager.plan(f.server, {
        selections: [{ projectId: 'main', versionId: 'mainV2' }],
      });
    f.manager.pin(f.server, main.id, true);
    await expect(f.manager.apply(f.server, plan.token)).rejects.toThrow('selection changed');
    f.data.versions.otherV2!.version_type = 'beta';
    await expect(
      f.manager.plan(f.server, { selections: [{ projectId: 'other', versionId: 'otherV2' }] }),
    ).rejects.toThrow('beta or alpha');
    const beta = await f.manager.plan(f.server, {
      selections: [{ projectId: 'other', versionId: 'otherV2' }],
      allowPrerelease: true,
    });
    expect(beta.entries.at(-1)?.version.releaseType).toBe('beta');
  } finally {
    await f.cleanup();
  }
});
it('resolves collections with compatible fallback and stores favorites locally', async () => {
  const f = await setup();
  try {
    f.data.versions.otherV1!.game_versions = ['1.20.1'];
    const collection = f.manager.collection({
      name: 'Performance',
      projects: [{ projectId: 'other', versionId: 'otherV1' }],
    });
    await f.manager.favorite(f.server, 'main', true);
    expect(f.manager.library().favorites[0]?.title).toBe('Test main');
    const plan = await f.manager.plan(f.server, {
      selections: collection.projects,
      collection: true,
    });
    expect(plan.warnings).toEqual(['Test other']);
    expect(plan.entries.at(-1)?.version.id).toBe('otherV2');
    await f.manager.apply(f.server, plan.token);
    f.manager.deleteCollection(collection.id);
    await f.manager.favorite(f.server, 'main', false);
    expect(f.manager.library()).toEqual({ favorites: [], collections: [] });
  } finally {
    await f.cleanup();
  }
});
it.each(['corrupt', 'changed', 'missing', 'loader', 'minecraft', 'duplicate'] as const)(
  'detects %s critical problems before start',
  async (reason) => {
    const f = await setup();
    try {
      await f.install();
      const main = f.repo.content(f.server.id).find((i) => i.projectId === 'main')!;
      if (reason === 'corrupt' || reason === 'changed')
        await writeFile(
          path.join(f.server.path, 'mods/main.jar'),
          reason === 'corrupt' ? Buffer.from('bad jar') : await modJar('main', '9'),
        );
      if (reason === 'missing')
        await import('node:fs/promises').then((fs) =>
          fs.unlink(path.join(f.server.path, 'mods/main.jar')),
        );
      if (reason === 'loader') f.server.engine = 'forge';
      if (reason === 'minecraft') f.server.version = '1.20.1';
      if (reason === 'duplicate')
        await writeFile(
          path.join(f.server.path, 'mods/duplicate.jar'),
          await readFile(path.join(f.server.path, 'mods/main.jar')),
        );
      const scan = await f.manager.inventory(f.server, true);
      expect(scan.problems.some((p) => p.code === reason && p.severity === 'critical')).toBe(true);
      await expect(f.manager.preflight(f.server)).rejects.toThrow('Critical mod');
      expect(main.title).toBe('Test main');
    } finally {
      await f.cleanup();
    }
  },
);
it('blocks incompatible dependencies and mismatched required version pins before downloading', async () => {
  const f = await setup();
  try {
    await f.install('conflict');
    f.data.versions.mainV1!.dependencies = [
      { project_id: 'conflict', version_id: null, dependency_type: 'incompatible' },
    ];
    await expect(
      f.manager.plan(f.server, { selections: [{ projectId: 'main', versionId: 'mainV1' }] }),
    ).rejects.toThrow('incompatible dependencies');
    f.data.versions.mainV1!.dependencies = [
      { project_id: 'dependency', version_id: 'dependencyV1', dependency_type: 'required' },
      { project_id: 'dependency', version_id: 'dependencyV2', dependency_type: 'required' },
    ];
    f.repo.db.prepare('DELETE FROM mod_cache').run();
    await expect(
      f.manager.plan(f.server, { selections: [{ projectId: 'main', versionId: 'mainV1' }] }),
    ).rejects.toThrow('conflicting versions');
  } finally {
    await f.cleanup();
  }
});
it('analyzes game and loader changes without changing profiles or files', async () => {
  const f = await setup();
  try {
    await f.install();
    const before = f.repo.server(f.server.id),
      bytes = await readFile(path.join(f.server.path, 'mods/main.jar'));
    const review = await f.manager.migration(f.server, { engine: 'neoforge', version: '1.21.11' });
    expect(review.incompatible).toHaveLength(2);
    expect(f.repo.server(f.server.id)).toEqual(before);
    expect(await readFile(path.join(f.server.path, 'mods/main.jar'))).toEqual(bytes);
  } finally {
    await f.cleanup();
  }
});
it('batches update lookup for 300 mods and keeps inventory independent from network requests', async () => {
  const f = await setup();
  try {
    const template: InstalledContent = {
      id: randomUUID(),
      serverId: f.server.id,
      projectId: 'main',
      title: 'Test',
      versionId: 'mainV1',
      filename: 'main.jar',
      enabled: false,
      provider: 'modrinth',
      fileHash: {
        algorithm: 'sha512',
        value: (f.data.versions.mainV1!.files as { hashes: { sha512: string } }[])[0]!.hashes
          .sha512,
      },
    };
    for (let i = 0; i < 300; i++)
      f.repo.saveContent({
        ...template,
        id: randomUUID(),
        projectId: 'main' + i,
        filename: i + '.jar',
      });
    await f.manager.inventory(f.server);
    expect(fetch).not.toHaveBeenCalled();
    await f.manager.updates(f.server);
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally {
    await f.cleanup();
  }
});
it('migrates published schema 5, removes the legacy credential and preserves installed files and history', async () => {
  const f = await fixture();
  let upgraded: Repository | undefined;
  try {
    const root = path.join(f.root, 'legacy');
    await mkdir(root);
    const db = new DatabaseSync(path.join(root, 'app.db'));
    for (const migration of migrations.slice(0, 5)) db.exec(migration.sql);
    db.exec('PRAGMA user_version=5');
    db.prepare('INSERT INTO servers VALUES(?,?,?)').run(
      f.server.id,
      JSON.stringify(f.server),
      'encrypted-rcon',
    );
    const item = {
      id: randomUUID(),
      serverId: f.server.id,
      projectId: '42',
      versionId: '99',
      title: 'Legacy mod',
      filename: 'legacy.jar',
      enabled: true,
      provider: 'curseforge',
    };
    db.prepare('INSERT INTO installed_content VALUES(?,?,?)').run(
      item.id,
      f.server.id,
      JSON.stringify(item),
    );
    db.prepare('INSERT INTO content_history VALUES(?,?,?,?)').run(
      randomUUID(),
      f.server.id,
      item.id,
      JSON.stringify({ item }),
    );
    db.prepare('INSERT INTO marketplace_settings VALUES(?,?)').run(
      'curseforge-key',
      'encrypted-legacy-key',
    );
    db.close();
    upgraded = new Repository(root, new EventBus());
    expect(upgraded.content(f.server.id)[0]).toEqual({
      ...item,
      provider: 'local',
      source: 'local',
    });
    expect(upgraded.secret(f.server.id)).toBe('encrypted-rcon');
    expect(
      upgraded.db
        .prepare("SELECT value FROM marketplace_settings WHERE key='curseforge-key'")
        .get(),
    ).toBeUndefined();
    expect(
      JSON.parse(
        String(upgraded.db.prepare('SELECT metadata FROM content_history').get()?.metadata),
      ).item.provider,
    ).toBe('local');
    expect(await stat(path.join(root, 'app.db.before-v6.bak'))).toBeDefined();
  } finally {
    upgraded?.close();
    await f.cleanup();
  }
});
it('removes legacy download hosts while keeping only official Modrinth HTTPS JAR sources', () => {
  expect(() => approvedUrl('https://cdn.modrinth.com/test.jar')).not.toThrow();
  expect(() => approvedUrl('https://edge.forgecdn.net/test.jar')).toThrow('not allowed');
  expect(() => approvedUrl('https://api.curseforge.com/test')).toThrow('not allowed');
});
it('keeps locked versions unchanged in a backend bulk update plan', async () => {
  const f = await setup();
  try {
    await f.install();
    const item = f.repo.content(f.server.id).find((item) => item.projectId === 'main')!;
    f.manager.pin(f.server, item.id, true);
    const plan = await f.manager.plan(f.server, {
      selections: [{ projectId: 'main', versionId: 'mainV2' }],
      bulkUpdate: true,
    });
    expect(plan.entries[0]?.action).toBe('keep');
    await f.manager.apply(f.server, plan.token);
    expect(f.repo.content(f.server.id).find((value) => value.id === item.id)?.versionId).toBe(
      'mainV1',
    );
  } finally {
    await f.cleanup();
  }
});
it('accepts the current official project/version environment arrays and rejects client-only versions', async () => {
  const f = await setup();
  try {
    f.data.projects.main!.environment = ['client_or_server_prefers_both'];
    f.data.versions.mainV1!.environment = ['client_and_server'];
    expect((await f.catalog.project('main')).serverSide).toBe(true);
    expect((await f.catalog.version('mainV1')).serverSide).toBe(true);
    f.data.versions.mainV2!.environment = ['client_only'];
    expect(compatibleContent(f.server, await f.catalog.version('mainV2'))).toBe(false);
    await f.install();
  } finally {
    await f.cleanup();
  }
});
it('uses known project support when Modrinth reports unknown version environment, retaining client-only refusal', async () => {
  const f = await setup();
  try {
    f.data.projects.main!.environment = 'unknown';
    f.data.versions.mainV1!.environment = 'unknown';
    f.data.versions.mainV2!.environment = ['unknown', 'client_only'];
    expect((await f.catalog.project('main')).serverSide).toBe(true);
    expect((await f.catalog.version('mainV1')).serverSide).toBeUndefined();
    expect(compatibleContent(f.server, await f.catalog.version('mainV2'))).toBe(false);
    await f.install();
    expect(f.repo.content(f.server.id).find((item) => item.projectId === 'main')?.versionId).toBe(
      'mainV1',
    );
  } finally {
    await f.cleanup();
  }
});
it('resolves dependencies pinned only by version ID before installing', async () => {
  const f = await setup();
  try {
    f.data.versions.mainV1!.dependencies = [
      { project_id: null, version_id: 'dependencyV1', dependency_type: 'required' },
    ];
    await f.install();
    expect(
      f.repo.content(f.server.id).find((item) => item.projectId === 'main')?.dependencyVersions,
    ).toEqual([{ projectId: 'dependency', versionId: 'dependencyV1' }]);
  } finally {
    await f.cleanup();
  }
});
it('does not label a project compatible unless one actual version matches both Minecraft and loader', async () => {
  const f = await setup();
  try {
    f.data.versions.mainV1!.loaders = ['forge'];
    f.data.versions.mainV2!.game_versions = ['1.20.1'];
    const defaults = await f.manager.search(f.server, { query: 'main' });
    expect(defaults.items).toEqual([]);
    const advanced = await f.manager.search(f.server, { query: 'main', compatibleOnly: false });
    expect(advanced.items[0]?.compatible).toBe(false);
  } finally {
    await f.cleanup();
  }
});
it('reports uncertain embedded/manual dependency identifiers as warnings without falsely blocking start', async () => {
  const f = await setup();
  try {
    await writeFile(path.join(f.server.path, 'mods/manual.jar'), await modJar('manual'));
    const inspect = await import('../packages/marketplace/local-mods');
    const spy = vi.spyOn(inspect, 'inspectMod');
    spy.mockResolvedValue({
      filename: 'manual.jar',
      enabled: true,
      size: 100,
      title: 'Manual',
      modIds: ['manual'],
      loaders: ['fabric'],
      corrupted: false,
      required: { 'fabric-embedded-module': '*' },
    });
    const scan = await f.manager.inventory(f.server);
    expect(scan.problems.find((p) => p.detail === 'fabric-embedded-module')?.severity).toBe(
      'warning',
    );
    await expect(f.manager.preflight(f.server)).resolves.toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
it.each(['forge', 'neoforge'] as const)(
  'installs verified %s JARs through the same actual file transaction',
  async (engine) => {
    const f = await setup();
    try {
      f.server.engine = engine;
      f.repo.saveServer(f.server);
      const bytes = await modJar('conflict', '1', engine),
        hash = createHash('sha512').update(bytes).digest('hex');
      f.data.files['/conflictV1.jar'] = bytes.toString('base64');
      f.data.versions.conflictV1!.loaders = [engine];
      f.data.versions.conflictV1!.files = [
        {
          filename: 'conflict.jar',
          url: 'https://cdn.modrinth.com/conflictV1.jar',
          primary: true,
          hashes: { sha512: hash },
        },
      ];
      await f.install('conflict');
      expect((await f.manager.inventory(f.server)).problems).toEqual([]);
      expect(await readFile(path.join(f.server.path, 'mods/conflict.jar'))).toEqual(bytes);
    } finally {
      await f.cleanup();
    }
  },
);
it('does not treat Forge dependency identifiers as duplicate mod identifiers', async () => {
  const f = await setup();
  try {
    const yazl = await import('yazl'),
      zip = new yazl.default.ZipFile();
    zip.addBuffer(
      Buffer.from(
        'modLoader="javafml"\n[[mods]]\nmodId="main"\nversion="1"\n[[dependencies.main]]\nmodId="dependency"\nmandatory=true\n',
      ),
      'META-INF/mods.toml',
    );
    const chunks: Buffer[] = [];
    const bytes = new Promise<Buffer>((resolve) => {
      zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
      zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
    zip.end();
    const filename = path.join(f.server.path, 'mods/manual.jar');
    await writeFile(filename, await bytes);
    expect((await inspectMod(filename, true)).modIds).toEqual(['main']);
  } finally {
    await f.cleanup();
  }
});
it('blocks the actual supervisor before launching a server with corrupt mods', async () => {
  const f = await setup();
  let core: AppCore | undefined;
  try {
    await f.install();
    await writeFile(path.join(f.server.path, 'mods/main.jar'), 'broken');
    core = await AppCore.open(f.root, f.secrets);
    await expect(core.supervisor.start(f.server.id)).rejects.toThrow('Critical mod');
    expect(core.supervisor.isRunning(f.server.id)).toBe(false);
  } finally {
    await core?.close();
    await f.cleanup();
  }
});
it.each([false, true])(
  'migrates a whole server with world/config preservation or rolls back after a failed mod download (failure=%s)',
  async (failure) => {
    const f = await setup();
    let core: AppCore | undefined;
    try {
      await f.install();
      await writeFile(
        path.join(f.server.path, 'server.properties'),
        '# Owner configuration: preserve comments, ordering and CRLF\r\ncustom\\:key=value\r\n' +
          (await readFile(path.join(f.server.path, 'server.properties'), 'utf8')),
      );
      const properties = await readFile(path.join(f.server.path, 'server.properties')),
        world = await readFile(path.join(f.server.path, 'world/level.dat')),
        before = f.repo.content(f.server.id),
        original = await readFile(path.join(f.server.path, 'mods/main.jar'));
      await mkdir(path.join(f.server.path, 'config'));
      await writeFile(path.join(f.server.path, 'config/custom.toml'), 'keep=true');
      for (const id of ['main', 'dependency']) {
        const bytes = await modJar(id, '2', 'neoforge');
        f.data.files['/' + id + 'V2.jar'] = bytes.toString('base64');
        f.data.versions[id + 'V2']!.loaders = ['neoforge'];
        f.data.versions[id + 'V2']!.dependencies =
          id === 'main'
            ? [
                {
                  project_id: 'dependency',
                  version_id: 'dependencyV2',
                  dependency_type: 'required',
                },
              ]
            : [];
        f.data.versions[id + 'V2']!.files = [
          {
            filename: id + '.jar',
            url: 'https://cdn.modrinth.com/' + id + 'V2.jar',
            primary: true,
            hashes: {
              sha512:
                failure && id === 'main'
                  ? 'a'.repeat(128)
                  : createHash('sha512').update(bytes).digest('hex'),
            },
          },
        ];
      }
      f.data.files['/engine.jar'] = Buffer.from('isolated engine artifact').toString('base64');
      core = await AppCore.open(f.root, f.secrets);
      vi.spyOn(core.versions, 'artifact').mockResolvedValue({
        filename: 'neoforge.jar',
        url: 'https://cdn.modrinth.com/engine.jar',
        java: 21,
        build: '21.11.0',
        loaderVersion: '21.11.0',
        kind: 'jar',
      });
      vi.spyOn(core.runtime, 'ensure').mockResolvedValue({
        major: 21,
        path: process.execPath,
        source: 'system',
      });
      const action = core.migrateMods(
        f.server.id,
        { engine: 'neoforge', version: '1.21.11' },
        f.server.name,
      );
      if (failure) {
        await expect(action).rejects.toThrow('corrupted');
        expect(core.repo.server(f.server.id).engine).toBe('fabric');
        expect(core.repo.content(f.server.id)).toEqual(before);
        expect(await readFile(path.join(f.server.path, 'mods/main.jar'))).toEqual(original);
      } else {
        await action;
        expect(core.repo.server(f.server.id).engine).toBe('neoforge');
        expect(core.repo.content(f.server.id).every((item) => item.loader === 'neoforge')).toBe(
          true,
        );
        expect(
          core.repo.content(f.server.id).find((item) => item.projectId === 'main')?.versionId,
        ).toBe('mainV2');
      }
      expect(await readFile(path.join(f.server.path, 'server.properties'))).toEqual(properties);
      expect(await readFile(path.join(f.server.path, 'world/level.dat'))).toEqual(world);
      expect(await readFile(path.join(f.server.path, 'config/custom.toml'), 'utf8')).toBe(
        'keep=true',
      );
      expect(core.repo.backups()).toHaveLength(1);
    } finally {
      await core?.close();
      await f.cleanup();
    }
  },
);
