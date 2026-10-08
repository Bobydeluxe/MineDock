import path from 'node:path';
import semver from 'semver';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, readdir, rename, rm } from 'node:fs/promises';
import { z } from 'zod';
import type { Repository } from '../database/database';
import type { Server, InstalledContent, Project } from '../domain/types';
import type { OperationContext } from '../domain/operations';
import type { ContentVersion, ContentUpdate } from '../domain/content';
import {
  modPlanInputSchema,
  modCollectionSchema,
  modSearchSchema,
  modTargetSchema,
  modBulkSchema,
  type ModPlanInput,
  type ModPlan,
  type ModInventory,
  type ModRemoval,
  type ModLibrary,
  type ModCollection,
  type ModSearch,
  type ModEvent,
  type ModTarget,
  type ModMigration,
} from '../domain/mods';
import { DomainError } from '../domain/errors';
import { containedPath, validateRelative } from '../security/paths';
import { sha256 } from '../backups/archive';
import type { DownloadManager } from '../minecraft/downloads';
import { ModrinthCatalog } from './modrinth';
import { ManagedContentService, compatibleContent } from './content';
import { inspectMod } from './local-mods';

function fail(code: string, message: string): never {
  throw new DomainError(code, message);
}
const serverKey = (server: Server, items: InstalledContent[]) =>
  JSON.stringify([server.engine, server.version, server.loaderVersion, server.javaMajor, items]);
export class ModManager {
  private readonly plans = new Map<
    string,
    { plan: ModPlan; key: string; serverId: string; expires: number }
  >();
  private readonly scans = new Map<
    string,
    { key: string; value: Awaited<ReturnType<typeof inspectMod>>; hash?: string }
  >();
  constructor(
    private readonly repo: Repository,
    readonly catalog: ModrinthCatalog,
    readonly content: ManagedContentService,
    private readonly downloads: DownloadManager,
  ) {}
  private assertServer(server: Server) {
    if (!['fabric', 'forge', 'neoforge'].includes(server.engine))
      fail('MOD_ENGINE', 'This server does not support the mod manager.');
  }
  async search(server: Server, input: ModSearch, signal?: AbortSignal) {
    this.assertServer(server);
    const query = modSearchSchema.parse(input),
      result = await this.catalog.browse(server, query, signal);
    // Search facets describe projects across all their releases. Verify that one
    // actual version supports this exact Minecraft/loader pair before labeling it.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, result.items.length) }, async () => {
        while (next < result.items.length) {
          const item = result.items[next++]!;
          signal?.throwIfAborted();
          const versions = await this.catalog.versions(server, item.id, signal);
          item.compatible = versions.some(
            (version) =>
              compatibleContent(server, version) &&
              version.files.some((file) => file.filename.endsWith('.jar')),
          );
        }
      }),
    );
    result.offline = this.catalog.offline;
    if (query.compatibleOnly) result.items = result.items.filter((item) => item.compatible);
    return result;
  }
  async detail(server: Server, projectId: string, signal?: AbortSignal) {
    this.assertServer(server);
    const project = await this.catalog.project(projectId, signal),
      versions = await this.catalog.versions(server, project.id, signal);
    return { project, versions, offline: this.catalog.offline };
  }
  async plan(server: Server, raw: ModPlanInput, signal?: AbortSignal): Promise<ModPlan> {
    this.assertServer(server);
    const input = modPlanInputSchema.parse(raw),
      installed = this.repo.content(server.id);
    const plan: ModPlan = {
      token: randomUUID(),
      entries: [],
      dependencies: [],
      warnings: [],
      roots: [],
    };
    const resolved = new Map<string, ContentVersion>(),
      visiting = new Set<string>(),
      roots = new Set(input.selections.map((value) => value.projectId));
    const selections = new Map(input.selections.map((value) => [value.projectId, value.versionId]));
    const resolve = async (
      projectId: string,
      pinned?: string,
      parentId?: string,
    ): Promise<void> => {
      signal?.throwIfAborted();
      const project = await this.catalog.project(projectId, signal),
        id = project.id;
      if (!project.serverSide || project.kind !== 'mod')
        fail('MOD_SIDE', 'This mod does not support dedicated servers.');
      const previous = installed.find(
        (item) => (item.provider ?? 'modrinth') === 'modrinth' && item.projectId === id,
      );
      const root = roots.has(projectId) || roots.has(id),
        wanted = pinned ?? selections.get(id) ?? selections.get(projectId);
      if (visiting.has(id))
        fail(
          'MOD_DEPENDENCIES',
          'The mods contain a circular dependency. Review the selected versions.',
        );
      if (input.bulkUpdate && previous?.pinned) {
        plan.entries.push({
          project,
          version: await this.catalog.version(previous.versionId, signal),
          action: 'keep',
          automatic: previous.automatic ?? false,
          parents: [],
        });
        resolved.set(id, plan.entries.at(-1)!.version);
        return;
      }
      const already = resolved.get(id);
      if (already) {
        if (wanted && already.id !== wanted)
          fail('MOD_DEPENDENCIES', 'The mods require conflicting versions of the same dependency.');
        const entry = plan.entries.find((e) => e.project.id === id)!;
        if (parentId && !entry.parents.includes(parentId)) entry.parents.push(parentId);
        return;
      }
      if (resolved.size + visiting.size >= 300)
        fail('MOD_DEPENDENCIES', 'The mod selection contains too many dependencies.');
      let version: ContentVersion | undefined;
      if (previous && !root && !wanted) {
        if (!previous.enabled)
          fail(
            'MOD_DEPENDENCIES',
            'A required mod is disabled. Enable it before installing dependent mods.',
          );
        version = await this.catalog.version(previous.versionId, signal);
      } else if (wanted) version = await this.catalog.version(wanted, signal);
      if (version && !compatibleContent(server, version) && input.collection) {
        version = undefined;
        plan.warnings.push(project.title);
      }
      version ??= (await this.catalog.versions(server, id, signal))
        .filter(
          (value) =>
            compatibleContent(server, value) &&
            value.files.some((file) => file.filename.endsWith('.jar')) &&
            (input.allowPrerelease || !value.releaseType || value.releaseType === 'release'),
        )
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
      if (!version || version.projectId !== id || !compatibleContent(server, version))
        fail(
          'MOD_COMPATIBILITY',
          'No compatible version exists for this Minecraft version and loader.',
        );
      if (version.releaseType && version.releaseType !== 'release' && !input.allowPrerelease)
        fail(
          'MOD_PRERELEASE',
          'Enable beta or alpha versions explicitly before installing this version.',
        );
      if (previous && !root && wanted && previous.versionId !== wanted && previous.pinned)
        fail(
          'MOD_PINNED',
          'A locked dependency requires a different version. Review it before continuing.',
        );
      visiting.add(id);
      for (const dep of version.dependencies) {
        if (plan.dependencies.length >= 1000)
          fail('MOD_DEPENDENCIES', 'The mod selection contains too many dependencies.');
        const depId =
          dep.projectId ??
          (dep.versionId
            ? (await this.catalog.version(dep.versionId, signal)).projectId
            : undefined);
        if (!depId) {
          if (dep.required) fail('MOD_DEPENDENCIES', 'A required dependency cannot be identified.');
          continue;
        }
        const depProject = await this.catalog.project(depId, signal),
          type = dep.type ?? (dep.required ? 'required' : 'optional');
        plan.dependencies.push({
          projectId: depProject.id,
          title: depProject.title,
          parentId: id,
          type,
          installed: installed.some((item) => item.projectId === depProject.id && item.enabled),
          versionId: dep.versionId,
        });
        if (type === 'required') await resolve(depProject.id, dep.versionId, id);
      }
      visiting.delete(id);
      resolved.set(id, version);
      plan.entries.push({
        project,
        version,
        action: previous?.versionId === version.id ? 'keep' : previous ? 'update' : 'install',
        automatic: previous?.automatic ?? !root,
        parents: parentId ? [parentId] : [],
      });
      if (root && !plan.roots.includes(id)) plan.roots.push(id);
    };
    for (const selection of input.selections)
      await resolve(selection.projectId, selection.versionId);
    const future = [
      ...installed.filter(
        (item) => !plan.entries.some((entry) => entry.project.id === item.projectId),
      ),
      ...plan.entries.map((entry) => ({
        projectId: entry.project.id,
        versionId: entry.version.id,
        enabled: true,
        dependencyVersions: plan.dependencies
          .filter((d) => d.parentId === entry.project.id && d.type === 'required')
          .map((d) => ({ projectId: d.projectId, versionId: d.versionId })),
        conflicts: plan.dependencies
          .filter((d) => d.parentId === entry.project.id && d.type === 'incompatible')
          .map((d) => d.projectId),
      })),
    ];
    for (const item of future.filter((item) => item.enabled)) {
      if (
        item.conflicts?.some((id) =>
          future.some((other) => other.projectId === id && other.enabled),
        )
      )
        fail('MOD_CONFLICT', 'The selected mods include incompatible dependencies.');
      for (const dependency of item.dependencyVersions ?? [])
        if (
          dependency.versionId &&
          !future.some(
            (other) =>
              other.projectId === dependency.projectId &&
              other.versionId === dependency.versionId &&
              other.enabled,
          )
        )
          fail('MOD_DEPENDENCIES', 'An installed mod requires another version of this dependency.');
    }
    // Offline metadata can be read, but must never authorize a new installation.
    if (this.catalog.offline)
      fail('MODRINTH_OFFLINE', 'Modrinth is unavailable. Local mods remain available.');
    for (const [token, value] of this.plans)
      if (value.expires < Date.now()) this.plans.delete(token);
    if (this.plans.size >= 100) this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(plan.token, {
      plan,
      key: serverKey(server, installed),
      serverId: server.id,
      expires: Date.now() + 10 * 60 * 1000,
    });
    return plan;
  }
  async apply(server: Server, token: string): Promise<InstalledContent[]> {
    const saved = this.plans.get(token);
    if (
      !saved ||
      saved.serverId !== server.id ||
      saved.expires < Date.now() ||
      saved.key !== serverKey(server, this.repo.content(server.id))
    )
      fail('MOD_PLAN', 'The mod selection changed. Review the installation again.');
    this.plans.delete(token);
    const plan = saved.plan,
      original = this.repo.content(server.id);
    const items = await this.content.transaction(
      server,
      async (stage, context) => {
        const items = await this.stage(server, plan, stage, context);
        return { value: items, items };
      },
      'Install selected mods',
    );
    for (const entry of plan.entries.filter((entry) => entry.action !== 'keep'))
      this.event(
        server,
        entry.action === 'install' ? 'installed' : 'updated',
        entry.project.title,
        entry.version.name,
        original.find((item) => item.projectId === entry.project.id)?.versionName,
      );
    return items;
  }
  async stage(
    server: Server,
    plan: ModPlan,
    stage: string,
    context?: OperationContext,
  ): Promise<InstalledContent[]> {
    const original = this.repo.content(server.id);

    let pending = [...original];
    for (const entry of plan.entries) {
      context?.signal.throwIfAborted();
      const old = pending.find(
        (item) =>
          item.projectId === entry.project.id && (item.provider ?? 'modrinth') === 'modrinth',
      );
      if (entry.action === 'keep' && old) {
        await this.content.verifyFile(stage, old);
        if (plan.roots.includes(old.projectId)) old.automatic = false;
        continue;
      }
      const file = entry.version.files.find((file) => file.primary) ?? entry.version.files[0];
      if (
        !file ||
        !file.hash ||
        !['sha512', 'sha1'].includes(file.hash.algorithm) ||
        !file.filename.endsWith('.jar') ||
        path.basename(file.filename) !== file.filename
      )
        fail('MOD_FILE', 'This mod does not provide a verified server JAR.');
      validateRelative(file.filename);
      const target = await containedPath(stage, file.filename);
      if (pending.some((item) => item.id !== old?.id && item.filename === file.filename))
        fail('MOD_COLLISION', 'Another mod already uses this filename.');
      if (old) {
        const source = await this.content.verifyFile(stage, old);
        await this.content.preserve(server, old, source);
        await rm(source);
      }
      for (const filename of [target, target + '.disabled']) {
        try {
          await stat(filename);
          fail(
            'MOD_MANUAL',
            'A manually added file already uses this name. It will not be overwritten.',
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      context?.phase('downloading');
      await this.downloads.download(
        file.url,
        target,
        entry.project.title,
        file.hash,
        256 * 1024 ** 2,
        context?.signal,
        (url) => url.hostname === 'cdn.modrinth.com',
      );
      const local = await inspectMod(target, true);
      if (local.corrupted) fail('MOD_CORRUPT', 'This mod file is not a readable JAR.');
      if (
        local.serverOnly === false ||
        (local.loaders.length && !local.loaders.includes(server.engine))
      )
        fail('MOD_COMPATIBILITY', 'The mod file metadata does not match this server.');
      const item: InstalledContent = {
        ...old,
        id: old?.id ?? randomUUID(),
        serverId: server.id,
        projectId: entry.project.id,
        title: entry.project.title,
        versionId: entry.version.id,
        versionName: entry.version.name,
        filename: file.filename,
        enabled: old?.enabled ?? true,
        provider: 'modrinth',
        source: 'modrinth',
        folder: 'mods',
        kind: 'mod',
        sha256: await sha256(target, context?.signal),
        fileHash: { algorithm: file.hash.algorithm as 'sha512' | 'sha1', value: file.hash.value },
        gameVersion: server.version,
        loader: server.engine,
        dependencies: plan.dependencies
          .filter((d) => d.parentId === entry.project.id && d.type === 'required')
          .map((d) => d.projectId),
        dependencyVersions: plan.dependencies
          .filter((d) => d.parentId === entry.project.id && d.type === 'required')
          .map((d) => ({ projectId: d.projectId, versionId: d.versionId })),
        conflicts: plan.dependencies
          .filter((d) => d.parentId === entry.project.id && d.type === 'incompatible')
          .map((d) => d.projectId),
        automatic: entry.automatic,
        pinned: old?.pinned ?? false,
        iconUrl: entry.project.iconUrl,
        author: entry.project.author,
        categories: entry.project.categories,
        publishedAt: entry.version.publishedAt,
        releaseType: entry.version.releaseType,
        installedAt: new Date().toISOString(),
      };
      if (!item.enabled) await rename(target, target + '.disabled');
      pending = [...pending.filter((other) => other.id !== item.id), item];
    }
    return pending;
  }
  async prepareMigration(
    server: Server,
    stage: string,
    context?: OperationContext,
  ): Promise<InstalledContent[]> {
    const selections = this.repo
      .content(server.id)
      .filter((item) => item.provider !== 'local')
      .map((item) => ({ projectId: item.projectId, versionId: item.versionId }));
    if (!selections.length) return this.repo.content(server.id);
    const plan = await this.plan(server, { selections, collection: true }, context?.signal);
    this.plans.delete(plan.token);
    const items = await this.stage(server, plan, path.join(stage, 'mods'), context);
    // Versions which already support the destination retain their binaries and metadata provenance.
    for (const item of items)
      if (item.provider !== 'local') {
        item.gameVersion = server.version;
        item.loader = server.engine;
      }
    return items;
  }
  private event(
    server: Server,
    action: ModEvent['action'],
    title: string,
    version?: string,
    previousVersion?: string,
  ) {
    const event: ModEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      action,
      title,
      version,
      previousVersion,
    };
    this.repo.db
      .prepare('INSERT INTO mod_events VALUES(?,?,?,?)')
      .run(event.id, server.id, event.at, JSON.stringify(event));
    this.repo.db
      .prepare(
        'DELETE FROM mod_events WHERE server_id=? AND id IN (SELECT id FROM mod_events WHERE server_id=? ORDER BY at DESC LIMIT -1 OFFSET 1000)',
      )
      .run(server.id, server.id);
    this.repo.audit('mod.' + action, title, server.id);
  }
  history(server: Server): ModEvent[] {
    return this.repo.db
      .prepare('SELECT metadata FROM mod_events WHERE server_id=? ORDER BY at DESC LIMIT 100')
      .all(server.id)
      .map((row) => JSON.parse(String(row.metadata)) as ModEvent);
  }
  pin(server: Server, id: string, pinned: boolean) {
    const item = this.repo.content(server.id).find((item) => item.id === id);
    if (!item || item.provider === 'local') fail('MOD_LOCAL', 'This mod is managed locally.');
    this.repo.saveContent({ ...item, pinned });
    this.event(server, pinned ? 'pinned' : 'unpinned', item.title, item.versionName);
  }
  removal(server: Server, ids: string[]): ModRemoval {
    const installed = this.repo.content(server.id),
      selected = installed.filter((item) => ids.includes(item.id));
    if (selected.length !== new Set(ids).size) fail('CONTENT', 'Managed content not found.');
    const removed = new Set(selected.map((item) => item.projectId)),
      unused: InstalledContent[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of installed)
        if (
          item.automatic &&
          !removed.has(item.projectId) &&
          installed.some(
            (parent) =>
              removed.has(parent.projectId) && parent.dependencies?.includes(item.projectId),
          ) &&
          !installed.some(
            (parent) =>
              !removed.has(parent.projectId) && parent.dependencies?.includes(item.projectId),
          )
        ) {
          unused.push(item);
          removed.add(item.projectId);
          changed = true;
        }
    }
    const shared = installed
      .filter(
        (item) =>
          !removed.has(item.projectId) &&
          installed.some(
            (parent) =>
              removed.has(parent.projectId) && parent.dependencies?.includes(item.projectId),
          ),
      )
      .map((item) => ({
        item,
        users: installed.filter(
          (parent) =>
            !removed.has(parent.projectId) && parent.dependencies?.includes(item.projectId),
        ).length,
      }));
    return {
      selected,
      unused,
      shared,
      blocked: installed
        .filter(
          (item) =>
            !removed.has(item.projectId) &&
            item.dependencies?.some((id) =>
              selected.some((selection) => selection.projectId === id),
            ),
        )
        .map((item) => item.title),
    };
  }
  async bulk(server: Server, raw: z.input<typeof modBulkSchema>) {
    const input = modBulkSchema.parse(raw);
    if (input.confirmation !== server.name) fail('CONFIRM', 'Incorrect confirmation.');
    const installed = this.repo.content(server.id),
      removal = this.removal(server, input.ids);
    if (input.action === 'uninstall' && removal.blocked.length)
      fail(
        'MOD_DEPENDENCIES',
        'Other mods still require this dependency. Remove the dependent mods first.',
      );
    const targets =
        input.action === 'uninstall'
          ? [...removal.selected, ...(input.removeOrphans ? removal.unused : [])]
          : removal.selected,
      ids = new Set(targets.map((item) => item.id));
    const next = installed
      .filter((item) => input.action !== 'uninstall' || !ids.has(item.id))
      .map((item) => (ids.has(item.id) ? { ...item, enabled: input.action === 'enable' } : item));
    if (
      input.action === 'disable' &&
      next.some(
        (item) =>
          item.enabled &&
          item.dependencies?.some((id) => !next.some((dep) => dep.projectId === id && dep.enabled)),
      )
    )
      fail(
        'MOD_DEPENDENCIES',
        'An active mod still requires this dependency. Disable the dependent mods together.',
      );
    if (
      input.action === 'enable' &&
      targets.some((item) =>
        item.dependencies?.some((id) => !next.some((dep) => dep.projectId === id && dep.enabled)),
      )
    )
      fail(
        'MOD_DEPENDENCIES',
        'A required mod is missing or disabled. Enable its dependencies together.',
      );
    await this.content.transaction(
      server,
      async (stage) => {
        for (const item of targets) {
          if (input.action !== 'uninstall' && item.enabled === (input.action === 'enable'))
            continue;
          const source = await this.content.verifyFile(stage, item);
          if (input.action === 'uninstall') {
            await this.content.preserve(server, item, source);
            await rm(source);
          } else {
            const target = await containedPath(
              stage,
              item.filename + (input.action === 'disable' ? '.disabled' : ''),
            );
            try {
              await stat(target);
              fail('MOD_COLLISION', 'Another mod already uses this filename.');
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            await rename(source, target);
          }
        }
        return { value: undefined, items: next };
      },
      'Apply mod actions',
    );
    for (const item of targets)
      this.event(
        server,
        input.action === 'uninstall'
          ? 'uninstalled'
          : input.action === 'enable'
            ? 'enabled'
            : 'disabled',
        item.title,
        item.versionName,
      );
  }
  async inventory(server: Server, force = false): Promise<ModInventory> {
    this.assertServer(server);
    const root = path.join(server.path, 'mods');
    await mkdir(root, { recursive: true });
    const installed = this.repo.content(server.id),
      result: ModInventory = {
        installed,
        manual: [],
        problems: [],
        scannedAt: new Date().toISOString(),
      };
    const names = (await readdir(root)).filter((name) => /\.jar(?:\.disabled)?$/i.test(name)),
      seen = new Map<string, string>();
    for (const name of names) {
      const filename = await containedPath(root, name),
        info = await stat(filename);
      if (!info.isFile()) continue;
      const key = info.size + ':' + info.mtimeMs + ':' + info.ctimeMs,
        cached = this.scans.get(filename),
        entry = installed.find(
          (item) => item.filename + (item.enabled ? '' : '.disabled') === name,
        );
      const local =
        !force && cached?.key === key
          ? cached.value
          : await inspectMod(filename, !name.endsWith('.disabled'));
      local.filename = name;
      local.title ||= entry?.title ?? name;
      const hash = entry?.sha256
        ? !force && cached?.key === key && cached.hash
          ? cached.hash
          : await sha256(filename)
        : undefined;
      this.scans.set(filename, { key, value: local, hash });
      if (this.scans.size > 2000) this.scans.delete(this.scans.keys().next().value!);
      if (!entry) result.manual.push(local);
      const add = (
        code: ModInventory['problems'][number]['code'],
        severity: 'critical' | 'warning',
        detail?: string,
      ) => result.problems.push({ code, severity, title: local.title, filename: name, detail });
      if (local.enabled) {
        if (local.corrupted) add('corrupt', 'critical');
        if (local.loaders.length && !local.loaders.includes(server.engine))
          add('loader', 'critical');
        if (local.serverOnly === false) add('conflict', 'critical');
        if (
          local.minecraft &&
          semver.valid(server.version) &&
          semver.validRange(local.minecraft) &&
          !semver.satisfies(server.version, local.minecraft)
        )
          add('minecraft', 'critical');
        for (const id of local.modIds) {
          if (seen.has(id)) add('duplicate', 'critical', seen.get(id));
          else seen.set(id, name);
        }
        if (entry) {
          if (entry.gameVersion && entry.gameVersion !== server.version)
            add('minecraft', 'critical');
          if (entry.loader && entry.loader !== server.engine) add('loader', 'critical');
          if (entry.sha256 && hash !== entry.sha256) add('changed', 'critical');
          for (const dep of entry.dependencies ?? [])
            if (
              !installed.some(
                (item) => item.projectId === dep && item.enabled && names.includes(item.filename),
              )
            )
              add('dependency', 'critical', dep);
          for (const dep of entry.dependencyVersions ?? [])
            if (
              dep.versionId &&
              !installed.some(
                (item) =>
                  item.projectId === dep.projectId &&
                  item.versionId === dep.versionId &&
                  item.enabled,
              )
            )
              add('dependency', 'critical', dep.projectId);
          for (const dep of entry.conflicts ?? [])
            if (installed.some((item) => item.projectId === dep && item.enabled))
              add('conflict', 'critical', dep);
        } else if (!local.corrupted) add('manual', 'warning');
      }
    }
    const enabledMetadata = [...this.scans.entries()]
      .filter(
        ([filename, value]) =>
          path.dirname(filename) === root &&
          value.value.enabled &&
          names.includes(path.basename(filename)),
      )
      .map(([, value]) => value.value);
    for (const local of enabledMetadata)
      for (const [id, range] of Object.entries(local.required ?? {})) {
        if (['minecraft', 'java'].includes(id)) continue;
        if (['fabricloader', 'forge', 'neoforge'].includes(id)) {
          if (
            server.loaderVersion &&
            semver.valid(server.loaderVersion) &&
            semver.validRange(range) &&
            !semver.satisfies(server.loaderVersion, range)
          )
            result.problems.push({
              code: 'loader',
              severity: 'critical',
              title: local.title,
              filename: local.filename,
              detail: id,
            });
          continue;
        }
        const dependency = enabledMetadata.find((item) => item.modIds.includes(id));
        if (
          !dependency ||
          (dependency.version &&
            semver.valid(dependency.version) &&
            semver.validRange(range) &&
            !semver.satisfies(dependency.version, range))
        )
          result.problems.push({
            code: 'dependency',
            // A nested JAR can provide an identifier we did not inspect. Only
            // proven version mismatches and managed project references block start.
            severity: dependency ? 'critical' : 'warning',
            title: local.title,
            filename: local.filename,
            detail: id,
          });
      }
    for (const item of installed)
      if (!names.includes(item.filename + (item.enabled ? '' : '.disabled')))
        result.problems.push({
          code: 'missing',
          severity: item.enabled ? 'critical' : 'warning',
          title: item.title,
          filename: item.filename,
        });
    return result;
  }
  async preflight(server: Server) {
    if (!['fabric', 'forge', 'neoforge'].includes(server.engine)) return;
    const scan = await this.inventory(server);
    const critical = scan.problems.filter((problem) => problem.severity === 'critical');
    if (critical.length)
      fail(
        'MOD_HEALTH',
        'Critical mod problems were detected. Open Mods and resolve them before starting the server.',
      );
    if (scan.problems.length)
      this.repo.audit(
        'mod.warning',
        scan.problems.map((p) => p.code + ': ' + p.title).join('; '),
        server.id,
      );
  }
  async updates(server: Server, signal?: AbortSignal) {
    const installed = this.repo.content(server.id),
      result: ContentUpdate[] = [];
    let offline = false;
    const managed = installed.filter((item) => !item.provider || item.provider === 'modrinth');
    // Older installations acquire canonical file hashes in batches, not one request per card.
    for (let i = 0; i < managed.length; i += 100) {
      const chunk = managed.slice(i, i + 100);
      try {
        const missing = chunk.filter((item) => item.fileHash?.algorithm !== 'sha512');
        if (missing.length) {
          const versions = await this.catalog.versionBatch(
            missing.map((item) => item.versionId),
            signal,
          );
          for (const item of missing) {
            const version = versions.find((v) => v.id === item.versionId),
              file = version?.files.find((file) => file.filename === item.filename);
            if (file?.hash?.algorithm === 'sha512') {
              item.fileHash = { algorithm: 'sha512', value: file.hash.value };
              item.publishedAt = version?.publishedAt;
              this.repo.saveContent(item);
            }
          }
        }
        const hashes = chunk.flatMap((item) =>
            item.fileHash?.algorithm === 'sha512' ? [item.fileHash.value] : [],
          ),
          latest = hashes.length ? await this.catalog.latest(server, hashes, signal) : {};
        for (const item of chunk) {
          const available = item.fileHash ? latest[item.fileHash.value] : undefined;
          result.push({
            contentId: item.id,
            installedVersion: item.versionId,
            available,
            status: !available
              ? 'incompatible'
              : available.projectId !== item.projectId || !compatibleContent(server, available)
                ? 'incompatible'
                : available.id === item.versionId
                  ? 'upToDate'
                  : !item.publishedAt || available.publishedAt > item.publishedAt
                    ? 'updateAvailable'
                    : 'upToDate',
          });
        }
      } catch {
        signal?.throwIfAborted();
        offline = true;
        for (const item of chunk)
          result.push({ contentId: item.id, installedVersion: item.versionId, status: 'unknown' });
      }
    }
    for (const item of installed.filter((item) => item.provider && item.provider !== 'modrinth'))
      result.push({ contentId: item.id, installedVersion: item.versionId, status: 'manual' });
    const value = { updates: result, offline, checkedAt: new Date().toISOString() };
    this.repo.db
      .prepare(
        'INSERT INTO mod_cache VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET metadata=excluded.metadata,expires=excluded.expires',
      )
      .run('updates:' + server.id, JSON.stringify(value), Date.now() + 300000);
    return value;
  }
  library(): ModLibrary {
    return {
      favorites: this.repo.db
        .prepare('SELECT metadata FROM mod_favorites')
        .all()
        .map((row) => JSON.parse(String(row.metadata)) as Project),
      collections: this.repo.db
        .prepare('SELECT metadata FROM mod_collections ORDER BY rowid DESC')
        .all()
        .map((row) => JSON.parse(String(row.metadata)) as ModCollection),
    };
  }
  async favorite(server: Server, id: string, enabled: boolean) {
    this.assertServer(server);
    if (!enabled) {
      this.repo.db.prepare('DELETE FROM mod_favorites WHERE project_id=?').run(id);
      return;
    }
    const project = await this.catalog.project(id);
    const value: Project = {
      id: project.id,
      title: project.title,
      description: project.description ?? '',
      author: project.author ?? '',
      downloads: project.downloads ?? 0,
      iconUrl: project.iconUrl,
      categories: project.categories ?? [],
      provider: 'modrinth',
      kind: 'mod',
    };
    this.repo.db
      .prepare(
        'INSERT INTO mod_favorites VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(project.id, JSON.stringify(value));
  }
  collection(raw: z.input<typeof modCollectionSchema>): ModCollection {
    const input = modCollectionSchema.parse(raw),
      item: ModCollection = {
        ...input,
        id: input.id ?? randomUUID(),
        createdAt: new Date().toISOString(),
      };
    this.repo.db
      .prepare(
        'INSERT INTO mod_collections VALUES(?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(item.id, JSON.stringify(item));
    return item;
  }
  deleteCollection(id: string) {
    this.repo.db.prepare('DELETE FROM mod_collections WHERE id=?').run(id);
  }
  async manualToggle(server: Server, name: string) {
    validateRelative(name);
    if (path.basename(name) !== name || !/\.jar(?:\.disabled)?$/i.test(name))
      fail('MOD_FILE', 'Choose a JAR in the mods folder.');
    if (
      this.repo
        .content(server.id)
        .some((item) => item.filename + (item.enabled ? '' : '.disabled') === name)
    )
      fail('MOD_LOCAL', 'Use the managed mod action for this file.');
    await this.content.transaction(
      server,
      async (stage) => {
        const source = await containedPath(stage, name),
          target = await containedPath(
            stage,
            name.endsWith('.disabled') ? name.slice(0, -9) : name + '.disabled',
          );
        await stat(source);
        try {
          await stat(target);
          fail('MOD_COLLISION', 'Another mod already uses this filename.');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await rename(source, target);
        return { value: undefined, items: this.repo.content(server.id) };
      },
      'Toggle local mod',
    );
    this.event(server, name.endsWith('.disabled') ? 'enabled' : 'disabled', name);
  }
  async identify(server: Server, name: string): Promise<boolean> {
    validateRelative(name);
    if (path.basename(name) !== name || !/\.jar(?:\.disabled)?$/i.test(name))
      fail('MOD_FILE', 'Choose a JAR in the mods folder.');
    const filename = await containedPath(path.join(server.path, 'mods'), name),
      info = await stat(filename);
    if (info.size > 256 * 1024 ** 2) fail('MOD_FILE', 'This mod file is too large.');
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(filename)) hash.update(chunk as Buffer);
    const value = hash.digest('hex'),
      version = await this.catalog.byHash(value);
    if (!version || !compatibleContent(server, version)) return false;
    const project = await this.catalog.project(version.projectId);
    if (!project.serverSide || project.kind !== 'mod') return false;
    const installed = this.repo.content(server.id);
    if (
      installed.some(
        (item) =>
          item.projectId === project.id ||
          item.filename + (item.enabled ? '' : '.disabled') === name,
      )
    )
      fail('MOD_DUPLICATE', 'This mod is already managed.');
    if (version.dependencies.length > 1000)
      fail('MOD_DEPENDENCIES', 'The mod selection contains too many dependencies.');
    const dependencyVersions: NonNullable<InstalledContent['dependencyVersions']> = [],
      conflicts: string[] = [];
    for (const dependency of version.dependencies) {
      const type = dependency.type ?? (dependency.required ? 'required' : 'optional');
      if (type !== 'required' && type !== 'incompatible') continue;
      const projectId =
        dependency.projectId ??
        (dependency.versionId
          ? (await this.catalog.version(dependency.versionId)).projectId
          : undefined);
      if (!projectId) {
        if (type === 'required')
          fail('MOD_DEPENDENCIES', 'A required dependency cannot be identified.');
        continue;
      }
      if (type === 'required')
        dependencyVersions.push({ projectId, versionId: dependency.versionId });
      else conflicts.push(projectId);
    }
    this.repo.saveContent({
      id: randomUUID(),
      serverId: server.id,
      projectId: project.id,
      title: project.title,
      versionId: version.id,
      versionName: version.name,
      filename: name.replace(/\.disabled$/, ''),
      enabled: !name.endsWith('.disabled'),
      provider: 'modrinth',
      source: 'local',
      automatic: false,
      folder: 'mods',
      kind: 'mod',
      sha256: await sha256(filename),
      fileHash: { algorithm: 'sha512', value },
      gameVersion: server.version,
      loader: server.engine,
      dependencies: dependencyVersions.map((dependency) => dependency.projectId),
      dependencyVersions,
      conflicts,
      iconUrl: project.iconUrl,
      author: project.author,
      categories: project.categories,
      releaseType: version.releaseType,
      publishedAt: version.publishedAt,
    });
    return true;
  }
  async migration(server: Server, raw: ModTarget, signal?: AbortSignal): Promise<ModMigration> {
    const target = modTargetSchema.parse(raw),
      future = { ...server, ...target },
      result: ModMigration = { target, compatible: [], replace: [], incompatible: [], manual: [] };
    const scan = await this.inventory(server);
    result.manual = scan.manual.map((item) => item.filename);
    for (const item of scan.installed) {
      signal?.throwIfAborted();
      if (item.provider && item.provider !== 'modrinth') {
        result.manual.push(item.filename);
        continue;
      }
      const current = await this.catalog.version(item.versionId, signal);
      if (compatibleContent(future, current)) {
        result.compatible.push(item.title);
        continue;
      }
      const next = (await this.catalog.versions(future, item.projectId, signal))
        .filter(
          (v) => compatibleContent(future, v) && (!v.releaseType || v.releaseType === 'release'),
        )
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
      if (next) result.replace.push({ projectId: item.projectId, versionId: next.id });
      else result.incompatible.push(item.title);
    }
    return result;
  }
  recordRollback(server: Server, item: InstalledContent, version?: string) {
    this.event(server, 'rollback', item.title, version, item.versionName);
  }
}
