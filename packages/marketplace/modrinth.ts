import { z } from 'zod';
import { Repository } from '../database/database';
import { DownloadManager, fetchJson, fetchApproved } from '../minecraft/downloads';
import type { Project, InstalledContent, Server } from '../domain/types';
import type { ContentProject, ContentVersion } from '../domain/content';
import { engineDefinition } from '../domain/engines';
import { ManagedContentService, type ContentCatalog } from './content';
import { DomainError } from '../domain/errors';
import { modSearchSchema, type ModSearch, type ModSearchResult } from '../domain/mods';
import type { PackKind } from '../domain/packs';
import type { OperationService } from '../core/operations';
const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  version_type: z.enum(['release', 'beta', 'alpha']).optional(),
  version_number: z.string().optional(),
  date_published: z.string().optional(),
  changelog: z.string().nullable().optional(),
  environment: z.union([z.string(), z.array(z.string())]).optional(),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
  files: z.array(
    z.object({
      url: z.string().url(),
      filename: z.string(),
      primary: z.boolean(),
      hashes: z.object({ sha512: z.string() }),
    }),
  ),
  dependencies: z.array(
    z.object({
      dependency_type: z.string(),
      project_id: z.string().nullable(),
      version_id: z.string().nullable(),
    }),
  ),
});
function version(value: unknown): ContentVersion {
  const item = versionSchema.parse(value);
  return {
    id: item.id,
    projectId: item.project_id,
    name: item.version_number ?? item.id,
    publishedAt: item.date_published ?? '',
    changelog: item.changelog ?? '',
    releaseType: item.version_type,
    serverSide: item.environment ? supportsServer(item.environment) : undefined,
    gameVersions: item.game_versions,
    loaders: item.loaders,
    files: item.files.map((file) => ({
      ...file,
      hash: { algorithm: 'sha512', value: file.hashes.sha512 },
    })),
    dependencies: item.dependencies.map((dependency) => ({
      projectId: dependency.project_id ?? undefined,
      versionId: dependency.version_id ?? undefined,
      type: z
        .enum(['required', 'optional', 'incompatible', 'embedded'])
        .parse(dependency.dependency_type),
      required: dependency.dependency_type === 'required',
    })),
  };
}
function supportsServer(environment: string | string[]): boolean {
  return (Array.isArray(environment) ? environment : [environment]).some((value) =>
    [
      'client_and_server',
      'client_only_server_optional',
      'server_only',
      'server_only_client_optional',
      'dedicated_server_only',
      'client_or_server',
      'client_or_server_prefers_both',
    ].includes(value),
  );
}
export interface MarketplaceProvider {
  search(server: Server, query: string): Promise<Project[]>;
}
export class ModrinthCatalog implements ContentCatalog {
  readonly id = 'modrinth' as const;
  constructor(private readonly repo?: Repository) {}
  offline = false;
  private readonly pending = new Map<string, Promise<unknown>>();
  private async request(
    url: string,
    _extra?: unknown,
    signal?: AbortSignal,
    body?: unknown,
    fresh = false,
  ): Promise<unknown> {
    const key = url + (body ? JSON.stringify(body) : '');
    const row = this.repo?.db
      .prepare('SELECT metadata,expires FROM mod_cache WHERE key=?')
      .get(key);
    if (!fresh && row && Number(row.expires) > Date.now()) return JSON.parse(String(row.metadata));
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      try {
        let data: unknown;
        if (body) {
          const response = await fetchApproved(
            url,
            signal
              ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
              : AbortSignal.timeout(20000),
            { 'Content-Type': 'application/json' },
            [],
            (url) => url.hostname === 'api.modrinth.com',
            { method: 'POST', body: JSON.stringify(body) },
          );
          const reader = response.body?.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          if (!reader) throw new Error('Empty response.');
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.length;
            if (size > 8 * 1024 ** 2) {
              await reader.cancel();
              throw new Error('Response is too large.');
            }
            chunks.push(next.value);
          }
          data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } else data = await fetchJson(url, undefined, signal);
        this.offline = false;
        this.repo?.db
          .prepare(
            'INSERT INTO mod_cache VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET metadata=excluded.metadata,expires=excluded.expires',
          )
          .run(key, JSON.stringify(data), Date.now() + 5 * 60 * 1000);
        this.repo?.db
          .prepare(
            'DELETE FROM mod_cache WHERE key IN (SELECT key FROM mod_cache ORDER BY expires DESC LIMIT -1 OFFSET 2000)',
          )
          .run();
        return data;
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && /(?:returned|HTTP) 404/.test(error.message))
          throw new DomainError(
            'MOD_NOT_FOUND',
            'This Modrinth project or version is no longer available.',
          );
        this.offline = true;
        if (row && !fresh) return JSON.parse(String(row.metadata));
        if (error instanceof DomainError && error.code === 'DOWNLOAD_URL') throw error;
        throw new DomainError(
          'MODRINTH_OFFLINE',
          'Modrinth is unavailable. Local mods remain available.',
        );
      }
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  async search(server: Server, query: string, signal?: AbortSignal): Promise<Project[]> {
    return (
      await this.browse(
        server,
        { query },
        signal,
        !engineDefinition(server.engine).capabilities.mods,
      )
    ).items;
  }
  async browse(
    server: Server,
    raw: ModSearch,
    signal?: AbortSignal,
    plugins: boolean | PackKind = false,
  ): Promise<ModSearchResult> {
    const input = modSearchSchema.parse(raw),
      facets: string[][] = [];
    const pack = typeof plugins === 'string';
    facets.push(
      pack
        ? ['project_type:' + plugins]
        : plugins
          ? ['project_type:plugin', 'project_type:mod']
          : ['project_type:mod'],
    );
    if (input.compatibleOnly)
      facets.push(
        ['versions:' + server.version],
        (pack
          ? [plugins === 'datapack' ? 'datapack' : 'minecraft']
          : engineDefinition(server.engine).contentLoaders
        ).map((loader) => 'categories:' + loader),
      );
    else {
      if (input.gameVersion) facets.push(['versions:' + input.gameVersion]);
      if (input.loader) facets.push(['categories:' + input.loader]);
    }
    if (input.category) facets.push(['categories:' + input.category]);
    if (!pack && (input.side === 'server' || input.compatibleOnly))
      facets.push(['server_side:required', 'server_side:optional']);
    if (input.side === 'client') facets.push(['client_side:required', 'client_side:optional']);
    if (input.recent)
      facets.push(['date_modified>' + new Date(Date.now() - 30 * 86400000).toISOString()]);
    const params = new URLSearchParams({
      query: input.query,
      facets: JSON.stringify(facets),
      limit: '24',
      offset: String(input.offset),
      index: input.sort,
    });
    const data = z
      .object({
        hits: z.array(
          z.object({
            project_id: z.string(),
            title: z.string(),
            description: z.string(),
            author: z.string(),
            downloads: z.number(),
            icon_url: z.string().nullable(),
            categories: z.array(z.string()),
            versions: z.array(z.string()).optional(),
            date_modified: z.string().optional(),
          }),
        ),
        total_hits: z.number().optional(),
      })
      .parse(await this.request('https://api.modrinth.com/v2/search?' + params, undefined, signal));
    return {
      items: data.hits.map((hit) => ({
        id: hit.project_id,
        title: hit.title,
        description: hit.description,
        author: hit.author,
        downloads: hit.downloads,
        iconUrl: hit.icon_url ?? undefined,
        categories: hit.categories,
        provider: this.id,
        kind: pack ? (plugins as PackKind) : plugins ? 'plugin' : 'mod',
        compatible:
          input.compatibleOnly ||
          !!(hit.versions?.includes(server.version) && hit.categories.includes(server.engine)),
        updatedAt: hit.date_modified,
      })),
      total: data.total_hits ?? data.hits.length,
      offset: input.offset,
      offline: this.offline,
    };
  }
  async latest(
    server: Server,
    hashes: string[],
    signal?: AbortSignal,
  ): Promise<Record<string, ContentVersion>> {
    const values = z.record(z.string(), versionSchema).parse(
      await this.request(
        'https://api.modrinth.com/v2/version_files/update',
        undefined,
        signal,
        {
          hashes,
          algorithm: 'sha512',
          loaders: engineDefinition(server.engine).contentLoaders,
          game_versions: [server.version],
          version_types: ['release'],
        },
        true,
      ),
    );
    return Object.fromEntries(
      Object.entries(values).map(([hash, value]) => [hash, version(value)]),
    );
  }
  async versionBatch(ids: string[], signal?: AbortSignal): Promise<ContentVersion[]> {
    return z
      .array(versionSchema)
      .parse(
        await this.request(
          'https://api.modrinth.com/v2/versions?ids=' + encodeURIComponent(JSON.stringify(ids)),
          undefined,
          signal,
        ),
      )
      .map(version);
  }
  async project(id: string, signal?: AbortSignal): Promise<ContentProject> {
    const item = z
      .object({
        id: z.string(),
        title: z.string(),
        server_side: z.string().optional(),
        environment: z.union([z.string(), z.array(z.string())]).optional(),
        description: z.string().optional(),
        body: z.string().optional(),
        icon_url: z.string().nullable().optional(),
        categories: z.array(z.string()).optional(),
        downloads: z.number().optional(),
        updated: z.string().optional(),
        game_versions: z.array(z.string()).optional(),
        loaders: z.array(z.string()).optional(),
        client_side: z.string().optional(),
        slug: z.string().optional(),
        team: z.string().optional(),
        project_type: z.string().optional(),
      })
      .parse(
        await this.request(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(id)}`,
          undefined,
          signal,
        ),
      );
    return {
      id: item.id,
      title: item.title,
      serverSide: item.environment
        ? supportsServer(item.environment)
        : ['required', 'optional'].includes(item.server_side ?? ''),
      description: item.description,
      body: item.body,
      iconUrl: item.icon_url ?? undefined,
      categories: item.categories,
      downloads: item.downloads,
      updatedAt: item.updated,
      gameVersions: item.game_versions,
      loaders: item.loaders,
      clientSide: item.client_side,
      environment: Array.isArray(item.environment) ? item.environment.join(', ') : item.environment,
      slug: item.slug,
      author: item.team ? await this.teamAuthor(item.team, signal) : undefined,
      kind:
        item.project_type === 'resourcepack'
          ? 'resourcepack'
          : item.project_type === 'datapack' || item.loaders?.includes('datapack')
            ? 'datapack'
            : item.project_type === 'plugin' ||
                item.loaders?.some((loader) =>
                  ['paper', 'purpur', 'spigot', 'bukkit'].includes(loader),
                )
              ? 'plugin'
              : 'mod',
    };
  }
  private async teamAuthor(id: string, signal?: AbortSignal): Promise<string> {
    const data = z
      .array(z.object({ user: z.object({ username: z.string() }), role: z.string().optional() }))
      .parse(
        await this.request(
          'https://api.modrinth.com/v2/team/' + encodeURIComponent(id) + '/members',
          undefined,
          signal,
        ),
      );
    return (data.find((item) => item.role === 'Owner') ?? data[0])?.user.username ?? '';
  }
  async versions(
    server: Server,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ContentVersion[]> {
    const data = z
      .array(versionSchema)
      .parse(
        await this.request(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?game_versions=${encodeURIComponent(JSON.stringify([server.version]))}&loaders=${encodeURIComponent(JSON.stringify(engineDefinition(server.engine).contentLoaders))}`,
          undefined,
          signal,
        ),
      );
    return data.map(version);
  }
  async version(id: string, signal?: AbortSignal): Promise<ContentVersion> {
    return version(
      await this.request(
        `https://api.modrinth.com/v2/version/${encodeURIComponent(id)}`,
        undefined,
        signal,
      ),
    );
  }
  async packVersions(server: Server, kind: PackKind, id: string): Promise<ContentVersion[]> {
    const params = new URLSearchParams({
      game_versions: JSON.stringify([server.version]),
      loaders: JSON.stringify([kind === 'datapack' ? 'datapack' : 'minecraft']),
    });
    return z
      .array(versionSchema)
      .parse(
        await this.request(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version?${params}`,
        ),
      )
      .map(version);
  }
  async allVersions(
    projectId: string,
    loaders: readonly string[],
    signal?: AbortSignal,
  ): Promise<ContentVersion[]> {
    return z
      .array(versionSchema)
      .parse(
        await this.request(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?loaders=${encodeURIComponent(JSON.stringify(loaders))}`,
          undefined,
          signal,
        ),
      )
      .map(version);
  }
  async byHash(hash: string, signal?: AbortSignal): Promise<ContentVersion | null> {
    z.string()
      .regex(/^[a-f0-9]{128}$/i)
      .parse(hash);
    try {
      return version(
        await this.request(
          `https://api.modrinth.com/v2/version_file/${hash}?algorithm=sha512`,
          undefined,
          signal,
        ),
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === 'MOD_NOT_FOUND') return null;
      if (error instanceof Error && /(?:HTTP|returned) 404/.test(error.message)) return null;
      throw error;
    }
  }
}
/** Compatibility facade for existing callers; transaction logic is shared by all catalogs. */
export class ModrinthProvider implements MarketplaceProvider {
  readonly catalog: ModrinthCatalog;
  readonly manager: ManagedContentService;
  constructor(repo: Repository, downloads: DownloadManager, jobs?: OperationService) {
    this.catalog = new ModrinthCatalog(repo);
    this.manager = new ManagedContentService(repo, downloads, jobs);
  }
  search(server: Server, query: string): Promise<Project[]> {
    return this.catalog.search(server, query);
  }
  install(server: Server, projectId: string, versionId?: string): Promise<InstalledContent[]> {
    return this.manager.install(server, this.catalog, projectId, versionId);
  }
  toggle(server: Server, id: string): Promise<void> {
    return this.manager.toggle(server, id);
  }
}
