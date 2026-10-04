import { z } from 'zod';
import { Repository } from '../database/database';
import { DownloadManager, fetchJson } from '../minecraft/downloads';
import type { Project, InstalledContent, Server } from '../domain/types';
import type { ContentProject, ContentVersion } from '../domain/content';
import { engineDefinition } from '../domain/engines';
import { ManagedContentService, type ContentCatalog } from './content';
import type { OperationService } from '../core/operations';
const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  version_type: z.enum(['release', 'beta', 'alpha']).optional(),
  version_number: z.string().optional(),
  date_published: z.string().optional(),
  changelog: z.string().nullable().optional(),
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
    gameVersions: item.game_versions,
    loaders: item.loaders,
    files: item.files.map((file) => ({
      ...file,
      hash: { algorithm: 'sha512', value: file.hashes.sha512 },
    })),
    dependencies: item.dependencies.map((dependency) => ({
      projectId: dependency.project_id ?? undefined,
      versionId: dependency.version_id ?? undefined,
      required: dependency.dependency_type === 'required',
    })),
  };
}
export interface MarketplaceProvider {
  search(server: Server, query: string): Promise<Project[]>;
}
export class ModrinthCatalog implements ContentCatalog {
  readonly id = 'modrinth' as const;
  async search(server: Server, query: string, signal?: AbortSignal): Promise<Project[]> {
    const engine = engineDefinition(server.engine);
    if (!engine.capabilities.marketplace) return [];
    const facets = JSON.stringify([
      [`versions:${server.version}`],
      engine.contentLoaders.map((loader) => `categories:${loader}`),
      ['server_side:required', 'server_side:optional'],
    ]);
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
          }),
        ),
      })
      .parse(
        await fetchJson(
          `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query.slice(0, 120))}&facets=${encodeURIComponent(facets)}&limit=20`,
          undefined,
          signal,
        ),
      );
    return data.hits.map((hit) => ({
      id: hit.project_id,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      downloads: hit.downloads,
      iconUrl: hit.icon_url ?? undefined,
      categories: hit.categories,
      provider: this.id,
      kind: engine.capabilities.mods ? 'mod' : 'plugin',
    }));
  }
  async project(id: string, signal?: AbortSignal): Promise<ContentProject> {
    const item = z
      .object({
        id: z.string(),
        title: z.string(),
        server_side: z.string(),
        project_type: z.string().optional(),
      })
      .parse(
        await fetchJson(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(id)}`,
          undefined,
          signal,
        ),
      );
    return {
      id: item.id,
      title: item.title,
      serverSide: item.server_side !== 'unsupported',
      kind: item.project_type === 'plugin' ? 'plugin' : 'mod',
    };
  }
  async versions(
    server: Server,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ContentVersion[]> {
    const data = z
      .array(versionSchema)
      .parse(
        await fetchJson(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?game_versions=${encodeURIComponent(JSON.stringify([server.version]))}&loaders=${encodeURIComponent(JSON.stringify(engineDefinition(server.engine).contentLoaders))}`,
          undefined,
          signal,
        ),
      );
    return data.map(version);
  }
  async version(id: string, signal?: AbortSignal): Promise<ContentVersion> {
    return version(
      await fetchJson(
        `https://api.modrinth.com/v2/version/${encodeURIComponent(id)}`,
        undefined,
        signal,
      ),
    );
  }
  async allVersions(
    projectId: string,
    loaders: readonly string[],
    signal?: AbortSignal,
  ): Promise<ContentVersion[]> {
    return z
      .array(versionSchema)
      .parse(
        await fetchJson(
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
        await fetchJson(
          `https://api.modrinth.com/v2/version_file/${hash}?algorithm=sha512`,
          undefined,
          signal,
        ),
      );
    } catch (error) {
      if (error instanceof Error && /(?:HTTP|returned) 404/.test(error.message)) return null;
      throw error;
    }
  }
}
/** Compatibility facade for existing callers; transaction logic is shared by all catalogs. */
export class ModrinthProvider implements MarketplaceProvider {
  readonly catalog = new ModrinthCatalog();
  readonly manager: ManagedContentService;
  constructor(repo: Repository, downloads: DownloadManager, jobs?: OperationService) {
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
