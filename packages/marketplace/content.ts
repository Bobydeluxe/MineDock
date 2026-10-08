import { mkdir, readdir, stat, rename, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from '../database/database';
import { DownloadManager } from '../minecraft/downloads';
import { OperationService } from '../core/operations';
import { containedPath, validateRelative } from '../security/paths';
import { copyDirectory } from '../security/copy';
import { sha256 } from '../backups/archive';
import { DomainError } from '../domain/errors';
import { engineDefinition } from '../domain/engines';
import type { Server, InstalledContent, Project } from '../domain/types';
import type {
  ContentVersion,
  ContentProject,
  ContentHistory,
  ContentUpdate,
  MarketplaceId,
  ManualContent,
} from '../domain/content';
import type { OperationContext } from '../domain/operations';
export interface ContentCatalog {
  id: MarketplaceId;
  search(server: Server, query: string, signal?: AbortSignal): Promise<Project[]>;
  project(id: string, signal?: AbortSignal): Promise<ContentProject>;
  versions(server: Server, projectId: string, signal?: AbortSignal): Promise<ContentVersion[]>;
  version(id: string, signal?: AbortSignal): Promise<ContentVersion>;
}
export function compatibleContent(server: Server, version: ContentVersion): boolean {
  return (
    version.serverSide !== false &&
    (!version.minimumJava || server.javaMajor >= version.minimumJava) &&
    version.gameVersions.includes(server.version) &&
    engineDefinition(server.engine).contentLoaders.some((loader) =>
      version.loaders.includes(loader),
    )
  );
}
export class ManagedContentService {
  constructor(
    private readonly repo: Repository,
    private readonly downloads: DownloadManager,
    private readonly jobs?: OperationService,
  ) {}
  private folder(server: Server): 'mods' | 'plugins' {
    const folder = engineDefinition(server.engine).contentFolder;
    if (!folder)
      throw new DomainError('CONTENT', 'This engine does not support managed mods or plugins.');
    return folder;
  }
  async transaction<T>(
    server: Server,
    action: (
      stage: string,
      context?: OperationContext,
    ) => Promise<{ value: T; items: InstalledContent[]; profile?: Server }>,
    label: string,
    wholeServer = false,
  ): Promise<T> {
    const folder = this.folder(server),
      destination = wholeServer ? server.path : path.join(server.path, folder),
      stage = destination + '.content-staging',
      previous = destination + '.content-previous';
    const run = async (context?: OperationContext): Promise<T> => {
      await mkdir(destination, { recursive: true });
      try {
        await stat(previous);
        throw new DomainError(
          'RECOVERY',
          'A previous copy already exists. Resolve recovery first.',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (context)
        context.checkpoint({
          destination,
          staging: stage,
          previous,
          hadDestination: true,
          beforeProfile: server,
          beforeContent: this.repo.content(server.id),
        });
      try {
        await rm(stage, { force: true, recursive: true });
        await copyDirectory(destination, stage, {
          signal: context?.signal,
          progress: (received) => context?.phase('extracting', received),
        });
        const result = await action(stage, context);
        context?.signal.throwIfAborted();
        const commit = () => {
          this.repo.db.prepare('DELETE FROM installed_content WHERE server_id=?').run(server.id);
          for (const item of result.items) this.repo.saveContent(item);
          if (result.profile) this.repo.saveServer(result.profile);
        };
        if (context && this.jobs)
          await this.jobs.swap(
            context,
            {
              destination,
              staging: stage,
              previous,
              beforeProfile: server,
              beforeContent: this.repo.content(server.id),
            },
            commit,
          );
        else {
          await rename(destination, previous);
          try {
            await rename(stage, destination);
            this.repo.db.exec('BEGIN');
            commit();
            this.repo.db.exec('COMMIT');
          } catch (error) {
            if (this.repo.db.isTransaction) this.repo.db.exec('ROLLBACK');
            await rm(destination, { force: true, recursive: true });
            await rename(previous, destination);
            throw error;
          }
          await rm(previous, { force: true, recursive: true });
        }
        try {
          await this.pruneHistory(server);
        } catch (error) {
          this.repo.audit(
            'content.history_cleanup_failed',
            error instanceof Error ? error.message : 'Unable to clean content history.',
            server.id,
            false,
          );
        }
        return result.value;
      } finally {
        await rm(stage, { force: true, recursive: true });
      }
    };
    return this.jobs ? this.jobs.run('content.apply', label, server.id, run) : run();
  }
  private item(server: Server, id: string): InstalledContent {
    const item = this.repo.content(server.id).find((item) => item.id === id);
    if (!item) throw new DomainError('CONTENT', 'Managed content not found.');
    return item;
  }
  async verifyFile(root: string, item: InstalledContent): Promise<string> {
    const filename = await containedPath(root, item.filename + (item.enabled ? '' : '.disabled'));
    if (item.sha256 && (await sha256(filename)) !== item.sha256)
      throw new DomainError(
        'CONTENT_CHANGED',
        'The managed file was changed outside MineDock. Review it before modifying it.',
      );
    return filename;
  }
  async install(
    server: Server,
    catalog: ContentCatalog,
    projectId: string,
    selectedVersion?: string,
    updatingId?: string,
  ): Promise<InstalledContent[]> {
    const installed = this.repo.content(server.id);
    return this.transaction(
      server,
      async (stage, context) => {
        const created = await this.prepareInstall(
          server,
          catalog,
          projectId,
          stage,
          installed,
          context,
          selectedVersion,
          updatingId,
        );
        return {
          value: created,
          items: [
            ...installed.filter(
              (item) => !created.some((replacement) => replacement.id === item.id),
            ),
            ...created,
          ],
        };
      },
      'Install content',
    );
  }
  async bundle(
    server: Server,
    selections: { catalog: ContentCatalog; projectId: string; versionId: string }[],
    configure: (stage: string, context?: OperationContext) => Promise<Partial<Server> | void>,
  ): Promise<InstalledContent[]> {
    return this.transaction(
      server,
      async (stage, context) => {
        const folder = path.join(stage, this.folder(server));
        await mkdir(folder, { recursive: true });
        let pending = this.repo.content(server.id);
        for (const selection of selections) {
          const existing = pending.find(
            (item) =>
              item.projectId === selection.projectId &&
              (item.provider ?? 'modrinth') === selection.catalog.id,
          );
          if (existing?.enabled && existing.versionId === selection.versionId) {
            await this.verifyFile(folder, existing);
            continue;
          }
          const created = await this.prepareInstall(
            server,
            selection.catalog,
            selection.projectId,
            folder,
            pending,
            context,
            selection.versionId,
            existing?.id,
          );
          for (const item of created) {
            if (item.projectId === selection.projectId && !item.enabled) {
              await rename(
                await containedPath(folder, item.filename + '.disabled'),
                await containedPath(folder, item.filename),
              );
              item.enabled = true;
            }
          }
          pending = [
            ...pending.filter((item) => !created.some((replacement) => replacement.id === item.id)),
            ...created,
          ];
        }
        const profile = await configure(stage, context);
        return {
          value: pending,
          items: pending,
          profile: profile ? { ...server, ...profile } : undefined,
        };
      },
      'Configure crossplay',
      true,
    );
  }
  private async prepareInstall(
    server: Server,
    catalog: ContentCatalog,
    projectId: string,
    stage: string,
    installed: InstalledContent[],
    context?: OperationContext,
    selectedVersion?: string,
    updatingId?: string,
  ): Promise<InstalledContent[]> {
    const folder = this.folder(server),
      visited = new Map<string, string | undefined>(),
      created: InstalledContent[] = [];
    const resolve = async (id: string, pinned?: string, top = false): Promise<void> => {
      if (visited.has(id)) {
        const selected = visited.get(id);
        if (pinned && selected && pinned !== selected)
          throw new DomainError(
            'DEPENDENCIES',
            'Dependencies require conflicting versions of the same project.',
          );
        return;
      }
      visited.set(id, pinned);
      if (visited.size > 25)
        throw new DomainError('DEPENDENCIES', 'Too many dependencies. Installation cancelled.');
      const existing = installed.find(
        (item) => item.projectId === id && (item.provider ?? 'modrinth') === catalog.id,
      );
      if (existing && !(top && existing.id === updatingId)) {
        if (!existing.enabled || (pinned && existing.versionId !== pinned))
          throw new DomainError(
            'DEPENDENCIES',
            'An installed dependency is disabled or incompatible.',
          );
        return;
      }
      context?.signal.throwIfAborted();
      const project = await catalog.project(id, context?.signal);
      if (!project.serverSide)
        throw new DomainError('CONTENT', 'This content is only for the Minecraft client.');
      const version = pinned
        ? await catalog.version(pinned, context?.signal)
        : (await catalog.versions(server, id, context?.signal)).find(
            (version) =>
              compatibleContent(server, version) &&
              (!version.releaseType || version.releaseType === 'release') &&
              version.files.length > 0,
          );
      if (!version || version.projectId !== project.id || !compatibleContent(server, version))
        throw new DomainError('COMPATIBILITY', 'No compatible server version.');
      visited.set(id, version.id);
      const dependencies: string[] = [];
      for (const dependency of version.dependencies.filter((dep) => dep.required)) {
        const dependencyId =
          dependency.projectId ??
          (dependency.versionId
            ? (await catalog.version(dependency.versionId, context?.signal)).projectId
            : undefined);
        if (!dependencyId) throw new DomainError('DEPENDENCIES', 'Unable to resolve a dependency.');
        dependencies.push(dependencyId);
        await resolve(dependencyId, dependency.versionId);
      }
      const file = version.files.find((file) => file.primary) ?? version.files[0];
      if (
        !file ||
        !file.filename.endsWith('.jar') ||
        path.basename(file.filename) !== file.filename
      )
        throw new DomainError('CONTENT', 'This project does not provide a compatible JAR.');
      validateRelative(file.filename);
      if (
        created.some((item) => item.filename === file.filename) ||
        installed.some((item) => item.id !== existing?.id && item.filename === file.filename)
      )
        throw new DomainError('COLLISION', 'Filename conflict.');
      if (existing) {
        const old = await this.verifyFile(stage, existing);
        await this.preserve(server, existing, old);
        await rm(old);
      }
      const target = await containedPath(stage, file.filename);
      for (const candidate of [target, target + '.disabled']) {
        try {
          await stat(candidate);
          throw new DomainError(
            'UNMANAGED',
            'A file with the same name already exists. MineDock will not overwrite it.',
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      context?.phase('downloading');
      await this.downloads.download(
        file.url,
        target,
        project.title,
        file.hash,
        256 * 1024 ** 2,
        context?.signal,
      );
      const item: InstalledContent = {
        id: existing?.id ?? randomUUID(),
        serverId: server.id,
        projectId: project.id,
        title: project.title,
        versionId: version.id,
        versionName: version.name,
        filename: file.filename,
        enabled: existing?.enabled ?? true,
        provider: catalog.id,
        kind: folder === 'mods' ? 'mod' : 'plugin',
        folder,
        sha256: await sha256(target, context?.signal),
        gameVersion: server.version,
        loader: server.engine,
        dependencies,
        installedAt: new Date().toISOString(),
      };
      if (!item.enabled) await rename(target, target + '.disabled');
      created.push(item);
    };

    await resolve(projectId, selectedVersion, true);
    return created;
  }
  async preserve(server: Server, item: InstalledContent, source: string): Promise<void> {
    // Every replaced binary remains available for rollback, even after upgrading old settings.
    const id = randomUUID(),
      root = path.join(this.repo.root, 'content-history', server.id, item.id);
    await mkdir(root, { recursive: true });
    const filename = path.join(root, id + '.jar');
    await copyFile(source, filename, 1);
    const history: ContentHistory = {
      id,
      contentId: item.id,
      serverId: server.id,
      at: new Date().toISOString(),
      item: { ...item },
      sha256: await sha256(filename),
      path: filename,
    };
    this.repo.db
      .prepare('INSERT INTO content_history VALUES(?,?,?,?)')
      .run(id, server.id, item.id, JSON.stringify(history));
  }
  private async pruneHistory(server: Server): Promise<void> {
    const setting = this.repo.db
        .prepare("SELECT value FROM marketplace_settings WHERE key='content-history-limit'")
        .get(),
      limit = setting ? Math.max(1, Number(setting.value)) : 5;
    const rows = this.repo.db
        .prepare('SELECT metadata FROM content_history WHERE server_id=? ORDER BY rowid DESC')
        .all(server.id),
      counts = new Map<string, number>();
    for (const row of rows) {
      const item = JSON.parse(String(row.metadata)) as ContentHistory;
      const count = (counts.get(item.contentId) ?? 0) + 1;
      counts.set(item.contentId, count);
      if (count <= limit) continue;
      const filename = await containedPath(
        path.join(this.repo.root, 'content-history', server.id, item.contentId),
        item.id + '.jar',
      );
      await rm(filename, { force: true });
      this.repo.db.prepare('DELETE FROM content_history WHERE id=?').run(item.id);
    }
  }
  history(server: Server, contentId: string): ContentHistory[] {
    return this.repo.db
      .prepare(
        'SELECT metadata FROM content_history WHERE server_id=? AND content_id=? ORDER BY rowid DESC LIMIT 20',
      )
      .all(server.id, contentId)
      .map((row) => JSON.parse(String(row.metadata)) as ContentHistory);
  }
  async toggle(server: Server, id: string): Promise<void> {
    const item = this.item(server, id);
    await this.transaction(
      server,
      async (stage) => {
        const source = await this.verifyFile(stage, item),
          target = await containedPath(stage, item.filename + (item.enabled ? '.disabled' : ''));
        try {
          await stat(target);
          throw new DomainError('COLLISION', 'Filename conflict.');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await rename(source, target);
        return {
          value: undefined,
          items: this.repo
            .content(server.id)
            .map((value) => (value.id === id ? { ...item, enabled: !item.enabled } : value)),
        };
      },
      'Toggle content',
    );
    this.repo.audit('content.toggled', item.title, server.id);
  }
  async uninstall(server: Server, id: string, confirmation: string): Promise<void> {
    const item = this.item(server, id);
    if (confirmation !== item.title) throw new DomainError('CONFIRM', 'Incorrect confirmation.');
    const installed = this.repo.content(server.id);
    if (installed.some((other) => other.id !== id && other.dependencies?.includes(item.projectId)))
      throw new DomainError(
        'DEPENDENCIES',
        'Other managed content requires this dependency. Remove it first.',
      );
    await this.transaction(
      server,
      async (stage) => {
        const filename = await this.verifyFile(stage, item);
        await this.preserve(server, item, filename);
        await rm(filename);
        return { value: undefined, items: installed.filter((other) => other.id !== id) };
      },
      'Uninstall content',
    );
    this.repo.audit('content.uninstalled', item.title, server.id);
  }
  async rollback(
    server: Server,
    id: string,
    historyId: string,
    confirmation: string,
  ): Promise<void> {
    const item = this.item(server, id);
    if (confirmation !== item.title) throw new DomainError('CONFIRM', 'Incorrect confirmation.');
    const history = this.history(server, id).find((history) => history.id === historyId);
    if (!history) throw new DomainError('CONTENT', 'Content history not found.');
    if (history.item.gameVersion !== server.version || history.item.loader !== server.engine)
      throw new DomainError(
        'COMPATIBILITY',
        'The previous content version does not match this server.',
      );
    if (
      history.item.dependencies?.some(
        (dependency) =>
          !this.repo
            .content(server.id)
            .some(
              (value) =>
                value.projectId === dependency &&
                (value.provider ?? 'modrinth') === (item.provider ?? 'modrinth') &&
                value.enabled,
            ),
      )
    )
      throw new DomainError(
        'DEPENDENCIES',
        'A required dependency of the previous version is missing or disabled.',
      );
    if (
      history.item.dependencyVersions?.some(
        (dependency) =>
          dependency.versionId &&
          !this.repo
            .content(server.id)
            .some(
              (value) =>
                value.projectId === dependency.projectId &&
                value.versionId === dependency.versionId &&
                value.enabled,
            ),
      )
    )
      throw new DomainError(
        'DEPENDENCIES',
        'A required dependency of the previous version is missing or disabled.',
      );
    if (
      history.item.conflicts?.some((dependency) =>
        this.repo
          .content(server.id)
          .some((value) => value.projectId === dependency && value.enabled),
      )
    )
      throw new DomainError('DEPENDENCIES', 'The selected mods include incompatible dependencies.');
    const source = await containedPath(
      path.join(this.repo.root, 'content-history', server.id, item.id),
      history.id + '.jar',
    );
    if ((await sha256(source)) !== history.sha256)
      throw new DomainError('CHECKSUM', 'The previous content file is corrupted.');
    await this.transaction(
      server,
      async (stage) => {
        const current = await this.verifyFile(stage, item);
        await this.preserve(server, item, current);
        await rm(current);
        const restored = {
          ...history.item,
          pinned: item.pinned,
          automatic: item.automatic,
          enabled: item.enabled,
        };
        const target = await containedPath(
          stage,
          restored.filename + (restored.enabled ? '' : '.disabled'),
        );
        await copyFile(source, target, 1);
        return {
          value: undefined,
          items: this.repo
            .content(server.id)
            .map((value) => (value.id === id ? { ...restored, sha256: history.sha256 } : value)),
        };
      },
      'Rollback content',
    );
    this.repo.audit('content.rollback', item.title, server.id);
  }
  async manual(server: Server): Promise<ManualContent[]> {
    const root = path.join(server.path, this.folder(server));
    await mkdir(root, { recursive: true });
    const managed = this.repo.content(server.id);
    const result: ManualContent[] = [];
    for (const name of await readdir(root)) {
      if (
        !/\.jar(?:\.disabled)?$/.test(name) ||
        managed.some((item) => item.filename + (item.enabled ? '' : '.disabled') === name)
      )
        continue;
      const filename = await containedPath(root, name),
        info = await stat(filename);
      if (info.isFile())
        result.push({
          filename: name,
          enabled: !name.endsWith('.disabled'),
          size: info.size,
          modified: info.mtime.toISOString(),
        });
    }
    return result;
  }
  async updates(
    server: Server,
    catalogFor: (provider: MarketplaceId) => ContentCatalog,
    signal?: AbortSignal,
  ): Promise<ContentUpdate[]> {
    const result: ContentUpdate[] = [];
    for (const item of this.repo.content(server.id)) {
      signal?.throwIfAborted();
      if (item.provider === 'local') {
        result.push({ contentId: item.id, installedVersion: item.versionId, status: 'manual' });
        continue;
      }
      try {
        const catalog = catalogFor(item.provider ?? 'modrinth'),
          versions = await catalog.versions(server, item.projectId, signal),
          current = versions.find((version) => version.id === item.versionId),
          available = versions.find(
            (version) =>
              compatibleContent(server, version) &&
              (!version.releaseType ||
                version.releaseType === 'release' ||
                (current?.releaseType === 'beta' && version.releaseType === 'beta')) &&
              version.files.length > 0,
          );
        const status = !available
          ? 'incompatible'
          : available.id === item.versionId
            ? 'upToDate'
            : current && current.publishedAt && available.publishedAt > current.publishedAt
              ? 'updateAvailable'
              : current
                ? 'upToDate'
                : 'unknown';
        result.push({ contentId: item.id, installedVersion: item.versionId, status, available });
      } catch (error) {
        signal?.throwIfAborted();
        result.push({
          contentId: item.id,
          installedVersion: item.versionId,
          status: 'unknown',
          error: error instanceof Error ? error.message : 'Unable to check updates.',
        });
      }
    }
    return result;
  }
}
