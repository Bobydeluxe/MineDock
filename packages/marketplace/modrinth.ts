import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../database/database';
import { DownloadManager, fetchJson } from '../minecraft/downloads';
import { containedPath, validateRelative } from '../security/paths';
import type { Project, InstalledContent, Server } from '../domain/types';
const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
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
export interface MarketplaceProvider {
  search(server: Server, query: string): Promise<Project[]>;
}
export class ModrinthProvider implements MarketplaceProvider {
  constructor(
    private readonly repo: Repository,
    private readonly downloads: DownloadManager,
  ) {}
  async search(server: Server, query: string): Promise<Project[]> {
    if (server.engine !== 'paper') return [];
    const facets = JSON.stringify([
      [`versions:${server.version}`],
      ['categories:paper'],
      ['server_side:required', 'server_side:optional'],
    ]);
    const schema = z.object({
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
    });
    const data = schema.parse(
      await fetchJson<unknown>(
        `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query.slice(0, 120))}&facets=${encodeURIComponent(facets)}&limit=20`,
      ),
    );
    return data.hits.map((h) => ({
      id: h.project_id,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      iconUrl: h.icon_url ?? undefined,
      categories: h.categories,
    }));
  }
  async install(server: Server, projectId: string): Promise<InstalledContent[]> {
    if (server.engine !== 'paper')
      throw new Error('Le marketplace V1 installe uniquement des plugins compatibles Paper.');
    const plugins = path.join(server.path, 'plugins');
    await mkdir(plugins, { recursive: true });
    const stage = path.join(server.path, `.content-${randomUUID()}`);
    await mkdir(stage);
    const items: InstalledContent[] = [];
    const visited = new Set<string>();
    const installed = this.repo.content(server.id);
    const moved: string[] = [];
    const resolve = async (id: string, pinned?: string): Promise<void> => {
      if (visited.has(id)) return;
      visited.add(id);
      if (visited.size > 25) throw new Error('Trop de dépendances. Installation annulée.');
      const existing = installed.find((i) => i.projectId === id);
      if (existing) {
        if (!existing.enabled || (pinned && existing.versionId !== pinned))
          throw new Error('Une dépendance déjà installée est désactivée ou incompatible.');
        return;
      }
      const project = z
        .object({ id: z.string(), title: z.string(), server_side: z.string() })
        .parse(
          await fetchJson<unknown>(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}`),
        );
      if (project.server_side === 'unsupported')
        throw new Error('Ce contenu est réservé au client Minecraft.');
      const version = pinned
        ? versionSchema.parse(
            await fetchJson<unknown>(
              `https://api.modrinth.com/v2/version/${encodeURIComponent(pinned)}`,
            ),
          )
        : z
            .array(versionSchema)
            .parse(
              await fetchJson<unknown>(
                `https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version?game_versions=${encodeURIComponent(JSON.stringify([server.version]))}&loaders=${encodeURIComponent(JSON.stringify(['paper']))}`,
              ),
            )[0];
      if (
        !version ||
        version.project_id !== project.id ||
        !version.game_versions.includes(server.version) ||
        !version.loaders.some((l) => ['paper', 'spigot', 'bukkit'].includes(l))
      )
        throw new Error('Aucune version serveur compatible.');
      for (const dep of version.dependencies.filter((d) => d.dependency_type === 'required')) {
        let depId = dep.project_id;
        if (!depId && dep.version_id)
          depId = versionSchema.parse(
            await fetchJson<unknown>(
              `https://api.modrinth.com/v2/version/${encodeURIComponent(dep.version_id)}`,
            ),
          ).project_id;
        if (!depId) throw new Error('Dépendance impossible à résoudre.');
        await resolve(depId, dep.version_id ?? undefined);
      }
      const file = version.files.find((f) => f.primary) ?? version.files[0];
      if (
        !file ||
        !file.filename.endsWith('.jar') ||
        path.basename(file.filename) !== file.filename
      )
        throw new Error('Ce projet ne fournit pas de plugin JAR.');
      validateRelative(file.filename);
      if (
        items.some((i) => i.filename === file.filename) ||
        installed.some((i) => i.filename === file.filename)
      )
        throw new Error('Conflit de nom de fichier.');
      await this.downloads.download(
        file.url,
        path.join(stage, file.filename),
        project.title,
        { algorithm: 'sha512', value: file.hashes.sha512 },
        256 * 1024 ** 2,
      );
      items.push({
        id: randomUUID(),
        serverId: server.id,
        projectId: project.id,
        title: project.title,
        versionId: version.id,
        filename: file.filename,
        enabled: true,
      });
    };
    try {
      await resolve(projectId);
      for (const item of items) {
        const target = await containedPath(plugins, item.filename);
        // Never replace an untracked plugin.
        const { access } = await import('node:fs/promises');
        try {
          await access(target);
          throw new Error('Un plugin du même nom existe déjà.');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        await rename(path.join(stage, item.filename), target);
        moved.push(target);
      }
      this.repo.db.exec('BEGIN');
      try {
        items.forEach((item) => this.repo.saveContent(item));
        this.repo.db.exec('COMMIT');
      } catch (e) {
        this.repo.db.exec('ROLLBACK');
        throw e;
      }
      this.repo.audit('content.installed', items.map((i) => i.title).join(', '), server.id);
      return items;
    } catch (e) {
      for (const file of moved) await rm(file, { force: true });
      throw e;
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
  async toggle(server: Server, id: string): Promise<void> {
    const item = this.repo.content(server.id).find((i) => i.id === id);
    if (!item) throw new Error('Plugin introuvable.');
    const root = path.join(server.path, 'plugins');
    const source = await containedPath(root, item.filename + (item.enabled ? '' : '.disabled'));
    const target = await containedPath(root, item.filename + (item.enabled ? '.disabled' : ''));
    await rename(source, target);
    item.enabled = !item.enabled;
    this.repo.saveContent(item);
    this.repo.audit('content.toggled', `${item.title}: ${item.enabled}`, server.id);
  }
}
