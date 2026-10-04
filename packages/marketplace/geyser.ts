import { z } from 'zod';
import { fetchJson } from '../minecraft/downloads';
import { DomainError } from '../domain/errors';
import type { Server } from '../domain/types';
import type { ContentProject, ContentVersion } from '../domain/content';
import type { ContentCatalog } from './content';
const base = 'https://download.geysermc.org/v2/projects/floodgate';
const buildSchema = z.object({
  version: z.string(),
  build: z.number().int(),
  time: z.string(),
  downloads: z.record(
    z.string(),
    z.object({ name: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/i) }),
  ),
});
/** Official Floodgate plugin endpoint; Fabric/NeoForge use the official Modrinth mod project. */
export class GeyserCatalog implements ContentCatalog {
  readonly id = 'geyser' as const;
  async search() {
    return [];
  }
  async project(id: string): Promise<ContentProject> {
    if (id !== 'floodgate') throw new DomainError('CONTENT', 'Unknown official Geyser project.');
    return { id, title: 'Floodgate', serverSide: true, kind: 'plugin' };
  }
  private normalize(value: unknown, mc: string): ContentVersion {
    const b = buildSchema.parse(value),
      file = b.downloads.spigot;
    if (!file)
      throw new DomainError('COMPATIBILITY', 'No compatible Floodgate plugin is available.');
    return {
      id: `floodgate:${b.version}:${b.build}:${mc}`,
      projectId: 'floodgate',
      name: `${b.version} build ${b.build}`,
      publishedAt: b.time,
      changelog: '',
      releaseType: 'release',
      minimumJava: 17,
      gameVersions: [mc],
      loaders: ['spigot'],
      files: [
        {
          filename: file.name,
          url: `${base}/versions/${encodeURIComponent(b.version)}/builds/${b.build}/downloads/spigot`,
          primary: true,
          hash: { algorithm: 'sha256', value: file.sha256 },
        },
      ],
      dependencies: [],
    };
  }
  async versions(
    server: Server,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ContentVersion[]> {
    await this.project(projectId);
    if (!['paper', 'purpur'].includes(server.engine) || server.javaMajor < 17) return [];
    return [
      this.normalize(
        await fetchJson(`${base}/versions/latest/builds/latest`, undefined, signal),
        server.version,
      ),
    ];
  }
  async version(id: string, signal?: AbortSignal): Promise<ContentVersion> {
    const match = /^floodgate:([\d.]+):(\d+):([\d.]+)$/.exec(id);
    if (!match) throw new DomainError('CATALOG_ID', 'Invalid marketplace identifier.');
    return this.normalize(
      await fetchJson(`${base}/versions/${match[1]}/builds/${match[2]}`, undefined, signal),
      match[3]!,
    );
  }
}
