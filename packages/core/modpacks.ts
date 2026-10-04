import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, lstat, realpath, readFile, readdir, copyFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../database/database';
import { OperationService } from './operations';
import { DownloadManager, approvedUrl } from '../minecraft/downloads';
import {
  ServerInstaller,
  type EnginePreparation,
  type InstallationOptions,
} from '../minecraft/installer';
import { javaForVersion } from '../minecraft/versions';
import { ModrinthCatalog } from '../marketplace/modrinth';
import { compatibleContent } from '../marketplace/content';
import { extractZip, sha256 } from '../backups/archive';
import { containedPath, validateRelative, resolveSystemPath } from '../security/paths';
import { DomainError, readableError } from '../domain/errors';
import {
  createServerSchema,
  type CreateServerInput,
  type InstalledContent,
  type Server,
} from '../domain/types';
import {
  modpackIndexSchema,
  modpackSelectionSchema,
  type ModpackIndex,
  type ModpackPreview,
  type ModpackProfile,
  type ModpackSelection,
} from '../domain/modpacks';

interface Plan {
  preview: ModpackPreview;
  index: ModpackIndex;
  sha256: string;
  expires: number;
  approved?: boolean;
  optionalFiles?: string[];
}
type CreatePrepared = (
  input: CreateServerInput,
  options: InstallationOptions & { profile?: Partial<Server> },
) => Promise<Server>;
const roots = new Set([
  'mods',
  'config',
  'defaultconfigs',
  'kubejs',
  'scripts',
  'resourcepacks',
  'datapacks',
]);
const safeContentPath = (name: string): string => {
  const value = validateRelative(name).split(path.sep).join('/');
  if (!roots.has(value.split('/')[0]!) || value.split('/').length < 2)
    throw new DomainError(
      'MODPACK_PATH',
      'The modpack contains an unsupported server content path.',
    );
  return value;
};
const permittedDownload = (url: string): boolean => {
  try {
    return ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com'].includes(
      approvedUrl(url).hostname,
    );
  } catch {
    return false;
  }
};
export class ModpackService {
  private readonly catalog = new ModrinthCatalog();
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
    private readonly downloads: DownloadManager,
    private readonly installer: ServerInstaller,
    private readonly createPrepared: CreatePrepared,
  ) {}
  private root(token: string): string {
    modpackSelectionSchema.shape.token.parse(token);
    return path.join(this.repo.root, 'modpack-imports', token);
  }
  private plan(token: string): Plan {
    const row = this.repo.db
      .prepare('SELECT metadata FROM modpack_imports WHERE token=?')
      .get(modpackSelectionSchema.shape.token.parse(token));
    if (!row)
      throw new DomainError(
        'IMPORT_PREVIEW',
        'The modpack preview expired. Select the archive again.',
      );
    const plan = JSON.parse(String(row.metadata)) as Plan;
    plan.index = modpackIndexSchema.parse(plan.index);
    return plan;
  }
  private save(token: string, plan: Plan, serverId?: string): void {
    this.repo.db
      .prepare(
        'INSERT INTO modpack_imports VALUES(?,?,?) ON CONFLICT(token) DO UPDATE SET metadata=excluded.metadata,server_id=COALESCE(excluded.server_id,modpack_imports.server_id)',
      )
      .run(token, serverId ?? null, JSON.stringify(plan));
  }
  async cleanup(startup = false): Promise<void> {
    const retained = new Set(
      this.repo
        .servers()
        .map((server) => server.modpack?.token)
        .filter(Boolean),
    );
    for (const row of this.repo.db
      .prepare('SELECT token,metadata FROM modpack_imports WHERE server_id IS NULL')
      .all()) {
      const token = String(row.token),
        plan = JSON.parse(String(row.metadata)) as Plan;
      if (!retained.has(token) && plan.expires < Date.now()) {
        await rm(this.root(token), { recursive: true, force: true });
        this.repo.db.prepare('DELETE FROM modpack_imports WHERE token=?').run(token);
      }
    }
    if (startup) {
      const root = path.join(this.repo.root, 'modpack-imports');
      await mkdir(root, { recursive: true });
      for (const token of await readdir(root)) {
        if (!/^[a-f0-9-]{36}$/.test(token)) continue;
        const directory = await containedPath(root, token);
        if (!this.repo.db.prepare('SELECT token FROM modpack_imports WHERE token=?').get(token)) {
          await rm(directory, { recursive: true, force: true });
          continue;
        }
        for (const name of await readdir(directory))
          if (name === 'contents' || /^[a-f0-9-]{36}\.contents$/.test(name))
            await rm(await containedPath(directory, name), { recursive: true, force: true });
      }
    }
  }
  private async files(root: string): Promise<string[]> {
    const names: string[] = [];
    const walk = async (relative: string): Promise<void> => {
      for (const entry of await readdir(await containedPath(root, relative, true), {
        withFileTypes: true,
      })) {
        const name = [relative, entry.name].filter(Boolean).join('/');
        await containedPath(root, name);
        if (entry.isDirectory()) await walk(name);
        else if (entry.isFile()) names.push(name);
        else throw new DomainError('PATH', 'Only regular modpack files are allowed.');
        if (names.length > 200000)
          throw new DomainError('SIZE', 'The modpack contains too many files.');
      }
    };
    await walk('');
    return names;
  }
  async preview(source: string): Promise<ModpackPreview> {
    const info = await lstat(source);
    if (
      !/\.mrpack$/i.test(source) ||
      !info.isFile() ||
      info.isSymbolicLink() ||
      resolveSystemPath(await realpath(source)) !== resolveSystemPath(source)
    )
      throw new DomainError('MODPACK', 'Choose a regular Modrinth .mrpack archive.');
    if (info.size > 512 * 1024 ** 2)
      throw new DomainError('SIZE', 'The compressed modpack exceeds 512 MB.');
    await this.cleanup();
    const token = randomUUID(),
      root = this.root(token),
      archive = path.join(root, 'source.mrpack'),
      contents = path.join(root, 'contents');
    return this.jobs.run('modpack.preview', 'Preview modpack', undefined, async (context) => {
      try {
        await mkdir(root, { recursive: true, mode: 0o700 });
        context.phase('verifying');
        const original = await sha256(source, context.signal);
        await copyFile(source, archive, 1);
        if ((await sha256(archive, context.signal)) !== original)
          throw new DomainError(
            'IMPORT_CHANGED',
            'The modpack archive changed while preparing its preview.',
          );
        context.phase('extracting');
        await extractZip(archive, contents, 2 * 1024 ** 3, {
          signal: context.signal,
          progress: (bytes) => context.phase('extracting', bytes),
        });
        const manifest = await containedPath(contents, 'modrinth.index.json');
        if ((await stat(manifest)).size > 2 * 1024 ** 2)
          throw new DomainError('SIZE', 'The modpack manifest exceeds 2 MB.');
        const index = modpackIndexSchema.parse(JSON.parse(await readFile(manifest, 'utf8')));
        const minecraft = index.dependencies.minecraft;
        if (!minecraft || !/^[a-zA-Z0-9._-]{1,40}$/.test(minecraft))
          throw new DomainError(
            'MODPACK',
            'The modpack must declare a supported Minecraft version.',
          );
        const dependencies = Object.keys(index.dependencies).filter((key) => key !== 'minecraft');
        if (
          dependencies.length !== 1 ||
          !['fabric-loader', 'forge', 'neoforge'].includes(dependencies[0]!)
        )
          throw new DomainError(
            'MODPACK',
            'This modpack requires one supported Fabric, Forge or NeoForge loader.',
          );
        const key = dependencies[0]!,
          engine = key === 'fabric-loader' ? 'fabric' : (key as 'forge' | 'neoforge'),
          loader = index.dependencies[key]!;
        const seen = new Set<string>(),
          files = index.files.map((file) => {
            const side = file.env?.server ?? 'required';
            file.path =
              side === 'unsupported'
                ? validateRelative(file.path).split(path.sep).join('/')
                : safeContentPath(file.path);
            if (seen.has(file.path.toLowerCase()))
              throw new DomainError('COLLISION', 'The modpack contains duplicate file paths.');
            seen.add(file.path.toLowerCase());
            const available = file.downloads.some(permittedDownload);
            if (side === 'required' && !available)
              throw new DomainError(
                'DOWNLOAD_URL',
                'A required modpack file has no permitted HTTPS download source.',
              );
            return { path: file.path, size: file.fileSize, side, available };
          });
        const bytes = files
          .filter((file) => file.side !== 'unsupported')
          .reduce((sum, file) => sum + file.size, 0);
        if (bytes > 64 * 1024 ** 3)
          throw new DomainError('SIZE', 'The modpack download total exceeds 64 GB.');
        const entries = await this.files(contents),
          overrides: string[] = [],
          ignoredOverrides: string[] = [];
        for (const name of entries.filter((name) =>
          /^(?:overrides|server-overrides)\//.test(name),
        )) {
          const relative = name.slice(name.indexOf('/') + 1);
          try {
            safeContentPath(relative);
            overrides.push(name);
          } catch {
            ignoredOverrides.push(name);
          }
        }
        const warnings: string[] = [];
        if (ignoredOverrides.length)
          warnings.push(
            'Launcher files, EULA, network properties and unsupported override paths will not replace MineDock-managed files.',
          );
        if (files.some((file) => file.side === 'optional'))
          warnings.push('Optional server files are excluded unless selected in this preview.');
        const preview: ModpackPreview = {
          token,
          name: index.name,
          versionId: index.versionId,
          summary: index.summary,
          minecraft,
          engine,
          loader,
          java: javaForVersion(minecraft),
          files,
          bytes,
          overrides,
          ignoredOverrides,
          warnings,
        };
        this.save(token, { preview, index, sha256: original, expires: Date.now() + 15 * 60000 });
        await rm(contents, { recursive: true });
        return preview;
      } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
      }
    });
  }
  private preparation(token: string): EnginePreparation {
    return async (stage, server, context) => {
      if (!context)
        throw new DomainError('MODPACK', 'Modpack installation requires a persistent operation.');
      const plan = this.plan(token),
        archive = path.join(this.root(token), 'source.mrpack'),
        contents = path.join(this.root(token), context.id + '.contents');
      if (!plan.approved || !server.modpack || server.modpack.token !== token)
        throw new DomainError('CONFIRM', 'Review and confirm the modpack before installing.');
      const installed: InstalledContent[] = [];
      try {
        context.phase('verifying');
        if ((await sha256(archive, context.signal)) !== plan.sha256)
          throw new DomainError('HASH', 'The saved modpack archive has changed. Import it again.');
        context.phase('extracting');
        await extractZip(archive, contents, 2 * 1024 ** 3, {
          signal: context.signal,
          progress: (bytes) => context.phase('extracting', bytes),
        });
        for (const file of plan.index.files) {
          const side = file.env?.server ?? 'required';
          if (
            side === 'unsupported' ||
            (side === 'optional' && !plan.optionalFiles?.includes(file.path))
          )
            continue;
          const url = file.downloads.find(permittedDownload);
          if (!url)
            throw new DomainError(
              'DOWNLOAD_URL',
              'A selected modpack file has no permitted download source.',
            );
          const target = await containedPath(stage, safeContentPath(file.path));
          await mkdir(path.dirname(target), { recursive: true });
          context.phase('downloading');
          await this.downloads.download(
            url,
            target,
            path.basename(file.path),
            { algorithm: 'sha512', value: file.hashes.sha512 },
            file.fileSize,
            context.signal,
          );
          if ((await stat(target)).size !== file.fileSize)
            throw new DomainError('SIZE', 'A modpack file does not match its declared size.');
          const hash = createHash('sha1');
          for await (const chunk of createReadStream(target, { signal: context.signal }))
            hash.update(chunk as Buffer);
          if (hash.digest('hex').toLowerCase() !== file.hashes.sha1.toLowerCase())
            throw new DomainError('HASH', 'A modpack file does not match its SHA-1 hash.');
          if (/^mods\/[^/]+\.jar$/i.test(file.path)) {
            const version = await this.catalog.byHash(file.hashes.sha512, context.signal);
            if (version) {
              const project = await this.catalog.project(version.projectId, context.signal);
              if (
                !project.serverSide ||
                !compatibleContent(server, version) ||
                !version.files.some(
                  (entry) => entry.hash?.value.toLowerCase() === file.hashes.sha512.toLowerCase(),
                )
              )
                throw new DomainError(
                  'CONTENT',
                  'A modpack mod is incompatible with this dedicated server.',
                );
              const dependencies: string[] = [];
              for (const dependency of version.dependencies.filter(
                (dependency) => dependency.required,
              ))
                dependencies.push(
                  dependency.projectId ??
                    (dependency.versionId
                      ? (await this.catalog.version(dependency.versionId, context.signal)).projectId
                      : ''),
                );
              if (installed.some((item) => item.projectId === version.projectId))
                throw new DomainError(
                  'DEPENDENCIES',
                  'The modpack includes multiple binaries for the same managed mod.',
                );
              installed.push({
                id: randomUUID(),
                serverId: server.id,
                projectId: project.id,
                title: project.title,
                versionId: version.id,
                filename: path.basename(file.path),
                enabled: true,
                provider: 'modrinth',
                kind: 'mod',
                folder: 'mods',
                sha256: await sha256(target, context.signal),
                versionName: version.name,
                gameVersion: server.version,
                loader: server.engine,
                dependencies,
                installedAt: new Date().toISOString(),
              });
            }
          }
        }
        for (const name of [...plan.preview.overrides].sort(
          (a, b) =>
            Number(a.startsWith('server-overrides/')) - Number(b.startsWith('server-overrides/')),
        )) {
          context.signal.throwIfAborted();
          const relative = safeContentPath(name.slice(name.indexOf('/') + 1)),
            target = await containedPath(stage, relative);
          await mkdir(path.dirname(target), { recursive: true });
          await copyFile(await containedPath(contents, name), target);
          const tracked = installed.find((item) => relative === 'mods/' + item.filename);
          if (tracked && (await sha256(target, context.signal)) !== tracked.sha256)
            throw new DomainError(
              'HASH',
              'A modpack override replaces a verified managed mod with different bytes.',
            );
        }
        for (const item of installed)
          for (const dependency of item.dependencies ?? [])
            if (!dependency || !installed.some((candidate) => candidate.projectId === dependency))
              throw new DomainError(
                'DEPENDENCIES',
                'The modpack omits a required managed mod dependency.',
              );
        this.repo.audit('modpack.prepared', plan.preview.name, server.id);
        return installed;
      } finally {
        await rm(contents, { recursive: true, force: true });
      }
    };
  }
  async create(selection: ModpackSelection, raw: CreateServerInput): Promise<Server> {
    const input = createServerSchema.parse(raw),
      chosen = modpackSelectionSchema.parse(selection),
      plan = this.plan(chosen.token);
    if (plan.expires < Date.now())
      throw new DomainError(
        'IMPORT_PREVIEW',
        'The modpack preview expired. Select the archive again.',
      );
    if (chosen.confirmation !== plan.preview.name)
      throw new DomainError('CONFIRM', 'The modpack name does not match.');
    if (this.repo.servers().some((server) => server.modpack?.token === chosen.token))
      throw new DomainError(
        'MODPACK',
        'This preview already belongs to a server. Retry its installation instead.',
      );
    if (
      chosen.optionalFiles.some(
        (name) =>
          !plan.preview.files.some(
            (file) => file.path === name && file.side === 'optional' && file.available,
          ),
      )
    )
      throw new DomainError('MODPACK', 'Invalid optional modpack file selection.');
    if (input.engine !== plan.preview.engine || input.version !== plan.preview.minecraft)
      throw new DomainError(
        'CONTENT',
        'Use the engine and Minecraft version declared by the modpack.',
      );
    const loader =
      plan.preview.engine === 'forge' &&
      !plan.preview.loader.startsWith(plan.preview.minecraft + '-')
        ? plan.preview.minecraft + '-' + plan.preview.loader
        : plan.preview.loader;
    const profile: ModpackProfile = {
      token: chosen.token,
      name: plan.preview.name,
      versionId: plan.preview.versionId,
      sha256: plan.sha256,
      format: 'mrpack',
      optionalFiles: [...new Set(chosen.optionalFiles)],
    };
    plan.approved = true;
    plan.optionalFiles = profile.optionalFiles;
    this.save(chosen.token, plan);
    try {
      const server = await this.createPrepared(
        { ...input, loaderVersion: loader },
        {
          kind: 'modpack.install',
          prepare: this.preparation(chosen.token),
          profile: { modpack: profile },
        },
      );
      this.save(chosen.token, plan, server.id);
      this.repo.audit('modpack.installed', plan.preview.name, server.id);
      return server;
    } catch (error) {
      const server = this.repo.servers().find((server) => server.modpack?.token === chosen.token);
      if (server) this.save(chosen.token, plan, server.id);
      this.repo.audit('modpack.failed', readableError(error), server?.id, false);
      throw error;
    }
  }
  async retry(id: string): Promise<Server> {
    const server = this.repo.server(id);
    if (!server.modpack || server.installationComplete !== false)
      throw new DomainError('MODPACK', 'This server has no incomplete modpack installation.');
    const result = await this.installer.install(id, {
      kind: 'modpack.install',
      prepare: this.preparation(server.modpack.token),
    });
    this.repo.audit('modpack.installed', server.modpack.name, id);
    return result;
  }
}
