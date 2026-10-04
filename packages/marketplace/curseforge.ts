import { z } from 'zod';
import { fetchJson } from '../minecraft/downloads';
import { DomainError } from '../domain/errors';
import type { Project, Server } from '../domain/types';
import type { ContentProject, ContentVersion } from '../domain/content';
import type { ContentCatalog } from './content';
const base = 'https://api.curseforge.com/v1';
const modSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  summary: z.string(),
  authors: z.array(z.object({ name: z.string() })),
  downloadCount: z.number(),
  logo: z.object({ url: z.string().url() }).nullable(),
  categories: z.array(z.object({ name: z.string() })),
  allowModDistribution: z.boolean().nullable().optional(),
});
const fileSchema = z.object({
  id: z.number().int(),
  modId: z.number().int(),
  isAvailable: z.boolean(),
  displayName: z.string(),
  fileName: z.string(),
  releaseType: z.number(),
  fileDate: z.string(),
  downloadUrl: z.string().url().nullable(),
  gameVersions: z.array(z.string()),
  hashes: z.array(z.object({ value: z.string(), algo: z.number() })),
  dependencies: z.array(z.object({ modId: z.number().int(), relationType: z.number() })),
});
const numeric = z.string().regex(/^\d{1,12}$/);
const loaders: Record<string, number> = { forge: 1, fabric: 4, neoforge: 6 };
export class CurseForgeCatalog implements ContentCatalog {
  readonly id = 'curseforge' as const;
  constructor(private readonly key: () => string | undefined) {}
  private async get(endpoint: string, signal?: AbortSignal): Promise<unknown> {
    const key = this.key();
    if (!key)
      throw new DomainError(
        'CURSEFORGE_KEY',
        'Configure a CurseForge API key in Settings to use this provider.',
      );
    return fetchJson(base + endpoint, { 'x-api-key': key }, signal);
  }
  private async mod(id: string, signal?: AbortSignal) {
    return modSchema.parse(
      z.object({ data: z.unknown() }).parse(await this.get(`/mods/${numeric.parse(id)}`, signal))
        .data,
    );
  }
  async search(server: Server, query: string, signal?: AbortSignal): Promise<Project[]> {
    if (!loaders[server.engine]) return [];
    const data = z
      .object({ data: z.array(modSchema) })
      .parse(
        await this.get(
          `/mods/search?gameId=432&classId=6&gameVersion=${encodeURIComponent(server.version)}&modLoaderType=${loaders[server.engine]}&searchFilter=${encodeURIComponent(query)}&pageSize=20`,
          signal,
        ),
      );
    return data.data.map((p) => ({
      id: String(p.id),
      title: p.name,
      description: p.summary,
      author: p.authors.map((a) => a.name).join(', '),
      downloads: p.downloadCount,
      iconUrl: p.logo?.url,
      categories: p.categories.map((c) => c.name),
      provider: this.id,
      kind: 'mod',
    }));
  }
  async project(id: string, signal?: AbortSignal): Promise<ContentProject> {
    const p = await this.mod(id, signal);
    if (p.allowModDistribution === false)
      throw new DomainError(
        'DISTRIBUTION',
        'The author does not allow third-party distribution of this content.',
      );
    return { id: String(p.id), title: p.name, serverSide: true, kind: 'mod', sideUnknown: true };
  }
  private normalize(value: unknown): ContentVersion {
    const f = fileSchema.parse(value),
      hash = f.hashes.find((h) => h.algo === 1) ?? f.hashes.find((h) => h.algo === 2);
    return {
      id: `${f.modId}:${f.id}`,
      projectId: String(f.modId),
      name: f.displayName,
      publishedAt: f.fileDate,
      changelog: '',
      releaseType: f.releaseType === 1 ? 'release' : f.releaseType === 2 ? 'beta' : 'alpha',
      gameVersions: f.gameVersions,
      loaders: f.gameVersions.map((v) => v.toLowerCase()).filter((v) => v in loaders),
      files:
        f.isAvailable && f.downloadUrl && hash
          ? [
              {
                filename: f.fileName,
                url: f.downloadUrl,
                primary: true,
                hash: { algorithm: hash.algo === 1 ? 'sha1' : 'md5', value: hash.value },
              },
            ]
          : [],
      dependencies: f.dependencies.map((d) => ({
        projectId: String(d.modId),
        required: d.relationType === 3,
      })),
    };
  }
  async versions(
    server: Server,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ContentVersion[]> {
    if (!loaders[server.engine]) return [];
    await this.project(projectId, signal);
    const data = z
      .object({ data: z.array(fileSchema) })
      .parse(
        await this.get(
          `/mods/${numeric.parse(projectId)}/files?gameVersion=${encodeURIComponent(server.version)}&modLoaderType=${loaders[server.engine]}&pageSize=50`,
          signal,
        ),
      );
    return data.data
      .map((v) => this.normalize(v))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  async version(id: string, signal?: AbortSignal): Promise<ContentVersion> {
    const [mod, file, ...extra] = id.split(':');
    if (extra.length || !mod || !file)
      throw new DomainError('CATALOG_ID', 'Invalid marketplace identifier.');
    await this.project(mod, signal);
    const endpoint = `/mods/${numeric.parse(mod)}/files/${numeric.parse(file)}`;
    const result = this.normalize(
      z.object({ data: z.unknown() }).parse(await this.get(endpoint, signal)).data,
    );
    if (!result.files.length)
      throw new DomainError(
        'DISTRIBUTION',
        'The official API does not provide an authorized download for this file.',
      );
    const changelog = z
      .object({ data: z.string() })
      .parse(await this.get(endpoint + '/changelog', signal)).data;
    result.changelog = changelog.replace(/<[^>]*>/g, '').slice(0, 100000);
    return result;
  }
}
