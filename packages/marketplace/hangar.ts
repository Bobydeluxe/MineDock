import { z } from 'zod';
import { fetchJson } from '../minecraft/downloads';
import { DomainError } from '../domain/errors';
import type { Project, Server } from '../domain/types';
import type { ContentProject, ContentVersion } from '../domain/content';
import type { ContentCatalog } from './content';
const base = 'https://hangar.papermc.io/api/v1';
const projectSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string(),
  namespace: z.object({ owner: z.string(), slug: z.string() }),
  stats: z.object({ downloads: z.number() }),
  category: z.string(),
  avatarUrl: z.string().url().nullable().optional(),
  supportedPlatforms: z.record(z.string(), z.array(z.string())),
});
const versionSchema = z.object({
  projectId: z.number().int(),
  name: z.string(),
  createdAt: z.string(),
  description: z.string(),
  channel: z.object({ name: z.string() }),
  downloads: z.record(
    z.string(),
    z.object({
      fileInfo: z.object({ name: z.string(), sha256Hash: z.string() }),
      downloadUrl: z.string().url().nullable(),
      externalUrl: z.string().nullable().optional(),
    }),
  ),
  platformDependencies: z.record(z.string(), z.array(z.string())),
  pluginDependencies: z.record(
    z.string(),
    z.array(z.object({ projectId: z.number().int().nullable(), required: z.boolean() })),
  ),
});
function normalize(value: unknown): ContentVersion {
  const v = versionSchema.parse(value),
    file = v.downloads.PAPER;
  return {
    id: `${v.projectId}:${v.name}`,
    projectId: String(v.projectId),
    name: v.name,
    publishedAt: v.createdAt,
    changelog: v.description,
    releaseType: /snapshot/i.test(v.channel.name)
      ? 'snapshot'
      : /alpha/i.test(v.channel.name)
        ? 'alpha'
        : /beta/i.test(v.channel.name)
          ? 'beta'
          : 'release',
    gameVersions: v.platformDependencies.PAPER ?? [],
    loaders: ['paper'],
    files: file?.downloadUrl
      ? [
          {
            filename: file.fileInfo.name,
            url: file.downloadUrl,
            primary: true,
            hash: { algorithm: 'sha256', value: file.fileInfo.sha256Hash },
          },
        ]
      : [],
    dependencies: (v.pluginDependencies.PAPER ?? []).map((d) => ({
      projectId: d.projectId === null ? undefined : String(d.projectId),
      required: d.required,
    })),
  };
}
function numeric(id: string): string {
  if (!/^\d{1,12}$/.test(id))
    throw new DomainError('CATALOG_ID', 'Invalid marketplace identifier.');
  return id;
}
export class HangarCatalog implements ContentCatalog {
  readonly id = 'hangar' as const;
  async search(server: Server, query: string, signal?: AbortSignal): Promise<Project[]> {
    if (!['paper', 'purpur'].includes(server.engine)) return [];
    const data = z
      .object({ result: z.array(projectSchema) })
      .parse(
        await fetchJson(
          `${base}/projects?limit=20&query=${encodeURIComponent(query)}&platform=PAPER&version=${encodeURIComponent(server.version)}`,
          undefined,
          signal,
        ),
      );
    return data.result
      .filter((p) => p.supportedPlatforms.PAPER?.includes(server.version))
      .map((p) => ({
        id: String(p.id),
        title: p.name,
        description: p.description,
        author: p.namespace.owner,
        downloads: p.stats.downloads,
        iconUrl: p.avatarUrl ?? undefined,
        categories: [p.category],
        provider: this.id,
        kind: 'plugin',
      }));
  }
  async project(id: string, signal?: AbortSignal): Promise<ContentProject> {
    const p = projectSchema.parse(
      await fetchJson(`${base}/projects/${numeric(id)}`, undefined, signal),
    );
    return { id: String(p.id), title: p.name, serverSide: true, kind: 'plugin' };
  }
  async versions(
    server: Server,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ContentVersion[]> {
    if (!['paper', 'purpur'].includes(server.engine)) return [];
    const collected: z.infer<typeof versionSchema>[] = [];
    for (let offset = 0; offset < 200; offset += 25) {
      const data = z
        .object({ result: z.array(versionSchema) })
        .parse(
          await fetchJson(
            `${base}/projects/${numeric(projectId)}/versions?limit=25&offset=${offset}&platform=PAPER&platformVersion=${encodeURIComponent(server.version)}`,
            undefined,
            signal,
          ),
        );
      collected.push(...data.result);
      if (data.result.length < 25) break;
    }
    return collected
      .map(normalize)
      .filter((v) => v.gameVersions.includes(server.version))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  async version(id: string, signal?: AbortSignal): Promise<ContentVersion> {
    const split = id.indexOf(':');
    if (split < 1) throw new DomainError('CATALOG_ID', 'Invalid marketplace identifier.');
    const project = numeric(id.slice(0, split)),
      name = id.slice(split + 1);
    if (!name || name.length > 120)
      throw new DomainError('CATALOG_ID', 'Invalid marketplace identifier.');
    return normalize(
      await fetchJson(
        `${base}/projects/${project}/versions/${encodeURIComponent(name)}`,
        undefined,
        signal,
      ),
    );
  }
}
