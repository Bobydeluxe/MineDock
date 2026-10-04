import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, lstat, stat, realpath, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../database/database';
import { OperationService } from './operations';
import { engineDefinition } from '../domain/engines';
import { DomainError, readableError } from '../domain/errors';
import { parseProperties, serializeProperties } from '../domain/properties';
import { containedPath, atomicWrite } from '../security/paths';
import { copyDirectory } from '../security/copy';
import { readLevelMetadata, type LevelMetadata } from '../security/nbt';
import { extractZip, sha256, zipDirectory } from '../backups/archive';
import {
  worldActionSchema,
  worldImportSchema,
  existingWorldNameSchema,
  type WorldAction,
  type WorldImportInput,
  type WorldImportPreview,
  type WorldSummary,
} from '../domain/worlds';
import type { Server } from '../domain/types';
import type { OperationContext } from '../domain/operations';

interface Ticket {
  serverId: string;
  root: string;
  world: WorldSummary;
  fingerprint: string;
  preview: WorldImportPreview;
  expires: number;
  temporary: boolean;
  cleanupRoot?: string;
}
export class WorldService {
  private readonly tickets = new Map<string, Ticket>();
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
    private readonly assertStopped: (id: string) => Server,
    private readonly backup: (id: string, reason: string) => Promise<unknown>,
  ) {}
  private base(server: Server) {
    return engineDefinition(server.engine).worldFolder;
  }
  private async metadata(root: string, name: string): Promise<LevelMetadata> {
    const file = await containedPath(root, name + '/level.dat');
    if ((await stat(file)).size > 16 * 1024 ** 2)
      throw new DomainError('SIZE', 'World metadata exceeds 16 MB.');
    return readLevelMetadata(await readFile(file));
  }
  private async measure(
    root: string,
    folders: string[],
    context?: OperationContext,
  ): Promise<{ bytes: number; files: number; modified: string }> {
    let bytes = 0,
      files = 0,
      modified = 0,
      count = 0;
    const walk = async (name: string): Promise<void> => {
      context?.signal.throwIfAborted();
      if (++count > 200000) throw new DomainError('SIZE', 'The world contains too many entries.');
      const target = await containedPath(root, name),
        info = await lstat(target);
      modified = Math.max(modified, info.mtimeMs);
      if (info.isDirectory())
        for (const entry of await readdir(target)) await walk(name + '/' + entry);
      else if (info.isFile()) {
        bytes += info.size;
        files++;
        if (bytes > 64 * 1024 ** 3) throw new DomainError('SIZE', 'The world exceeds 64 GB.');
        context?.phase('verifying', bytes);
      } else throw new DomainError('PATH', 'Worlds may contain only regular files and folders.');
    };
    for (const folder of folders) await walk(folder);
    return { bytes, files, modified: new Date(modified).toISOString() };
  }
  private async discover(
    root: string,
    active = '',
    context?: OperationContext,
    onlyBase?: string,
  ): Promise<WorldSummary[]> {
    const names: string[] = [];
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        context?.signal.throwIfAborted();
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        try {
          if ((await stat(await containedPath(root, entry.name + '/level.dat'))).isFile())
            names.push(entry.name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const result: WorldSummary[] = [];
    for (const name of names) {
      if (onlyBase && name !== onlyBase) continue;
      if (
        names.includes(name.replace(/_(?:nether|the_end)$/, '')) &&
        /_(?:nether|the_end)$/.test(name)
      )
        continue;
      const folders = [
        name,
        ...['_nether', '_the_end']
          .filter((suffix) => names.includes(name + suffix))
          .map((suffix) => name + suffix),
      ];
      let metadata: LevelMetadata | undefined, metadataError: string | undefined;
      try {
        metadata = await this.metadata(root, name);
      } catch (error) {
        metadataError = readableError(error);
      }
      result.push({
        name,
        folders,
        active: name === active,
        ...(await this.measure(root, folders, context)),
        seed: metadata?.seed,
        lastPlayed: metadata?.lastPlayed,
        version: metadata?.version,
        metadataError,
      });
    }
    return result;
  }
  async list(id: string): Promise<WorldSummary[]> {
    const server = this.repo.server(id),
      base = this.base(server),
      root = await containedPath(server.path, base, true);
    const properties = parseProperties(
      await readFile(await containedPath(server.path, 'server.properties'), 'utf8'),
    );
    return this.jobs.run('world.scan', 'Inspect worlds', id, async (context) => {
      const worlds = await this.discover(root, properties['level-name'] ?? 'world', context),
        backups = this.repo
          .backups()
          .filter((backup) => backup.serverId === id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const world of worlds) {
        const created = this.repo.db
          .prepare(
            "SELECT MIN(at) AS at FROM world_history WHERE server_id=? AND name=? AND action IN ('import','duplicate')",
          )
          .get(id, world.name)?.at;
        world.lastBackup = backups.find(
          (backup) => !created || backup.createdAt >= String(created),
        )?.createdAt;
      }
      return worlds;
    });
  }
  private async fingerprint(root: string, world: WorldSummary): Promise<string> {
    const values = [];
    for (const folder of world.folders)
      values.push([folder, await sha256(await containedPath(root, folder + '/level.dat'))]);
    return JSON.stringify(values);
  }
  private async removeTicket(ticket: Ticket) {
    if (ticket.temporary)
      await rm(ticket.cleanupRoot ?? ticket.root, { recursive: true, force: true });
  }
  async cleanPreviews(): Promise<void> {
    for (const directory of ['world-imports', 'world-exports']) {
      const root = path.join(this.repo.root, 'cache', directory);
      await mkdir(root, { recursive: true });
      for (const entry of await readdir(root))
        if (/^[a-f0-9-]{36}$/.test(entry))
          await rm(path.join(root, entry), { recursive: true, force: true });
    }
  }
  async preview(id: string, source: string): Promise<WorldImportPreview> {
    const server = this.assertStopped(id),
      token = randomUUID(),
      info = await lstat(source);
    if (info.isSymbolicLink() || path.resolve(await realpath(source)) !== path.resolve(source))
      throw new DomainError('PATH', 'Choose a world source without symbolic links.');
    const temporary = info.isFile();
    if (temporary && !/\.(zip|mcworld)$/i.test(source))
      throw new DomainError('WORLD', 'Choose a world folder, ZIP or MCWORLD archive.');
    const root = temporary
      ? path.join(this.repo.root, 'cache', 'world-imports', token)
      : path.dirname(source);
    return this.jobs.run('world.preview', 'Preview world import', undefined, async (context) => {
      try {
        if (temporary) {
          context.phase('extracting');
          await extractZip(source, root, 64 * 1024 ** 3, {
            signal: context.signal,
            progress: (bytes) => context.phase('extracting', bytes),
          });
        }
        let effectiveRoot = root,
          worlds: WorldSummary[];
        if (
          temporary &&
          (await stat(path.join(root, 'level.dat')).then(
            (entry) => entry.isFile(),
            () => false,
          ))
        ) {
          const wrapper = path.join(root, 'world');
          await mkdir(wrapper);
          for (const name of await readdir(root))
            if (name !== 'world')
              await rename(await containedPath(root, name), path.join(wrapper, name));
          worlds = await this.discover(root, '', context);
        } else
          worlds = (
            await this.discover(root, '', context, temporary ? undefined : path.basename(source))
          ).filter((world) => temporary || world.name === path.basename(source));
        if (!worlds.length && temporary) {
          const entries = await readdir(root, { withFileTypes: true });
          if (entries.length === 1 && entries[0]!.isDirectory()) {
            effectiveRoot = await containedPath(root, entries[0]!.name);
            worlds = await this.discover(effectiveRoot, '', context);
          }
        }
        if (worlds.length !== 1)
          throw new DomainError(
            'WORLD',
            'Select an archive or folder containing exactly one base world and its dimensions.',
          );
        const world = worlds[0]!,
          metadata = await this.metadata(effectiveRoot, world.name);
        if (metadata.edition !== engineDefinition(server.engine).edition)
          throw new DomainError(
            'WORLD',
            'This world belongs to a different Minecraft edition. MineDock does not convert worlds.',
          );
        const preview: WorldImportPreview = {
          token,
          name: world.name,
          edition: metadata.edition,
          folders: world.folders,
          bytes: world.bytes,
          files: world.files,
          seed: world.seed,
          version: world.version,
          warnings:
            metadata.version && metadata.version !== server.version
              ? [
                  'The world version differs from the server. Verify compatibility before importing.',
                ]
              : [],
        };
        for (const [key, ticket] of this.tickets)
          if (ticket.expires < Date.now()) {
            await this.removeTicket(ticket);
            this.tickets.delete(key);
          }
        if (this.tickets.size >= 20) {
          const key = this.tickets.keys().next().value!,
            ticket = this.tickets.get(key)!;
          await this.removeTicket(ticket);
          this.tickets.delete(key);
        }
        this.tickets.set(token, {
          serverId: id,
          root: effectiveRoot,
          world,
          fingerprint: await this.fingerprint(effectiveRoot, world),
          preview,
          expires: Date.now() + 15 * 60000,
          temporary,
          cleanupRoot: temporary ? root : undefined,
        });
        return preview;
      } catch (error) {
        if (temporary) await rm(root, { recursive: true, force: true });
        throw error;
      }
    });
  }
  private async edit<T>(
    server: Server,
    kind: string,
    action: (stage: string, context: OperationContext) => Promise<T>,
    profile: Partial<Server> = {},
    commit?: () => void,
  ): Promise<T> {
    return this.jobs.run(kind, 'Manage world', server.id, async (context) => {
      const stage = server.path + '.world-' + context.id + '.staging',
        previous = server.path + '.world-' + context.id + '.previous';
      context.checkpoint({
        destination: server.path,
        staging: stage,
        previous,
        hadDestination: true,
        beforeProfile: server,
        beforeContent: this.repo.content(server.id),
      });
      try {
        context.phase('extracting');
        await copyDirectory(server.path, stage, {
          signal: context.signal,
          progress: (bytes) => context.phase('extracting', bytes),
        });
        const value = await action(stage, context);
        await this.jobs.swap(
          context,
          {
            destination: server.path,
            staging: stage,
            previous,
            beforeProfile: server,
            beforeContent: this.repo.content(server.id),
          },
          () => {
            this.repo.saveServer({ ...server, ...profile });
            commit?.();
          },
        );
        return value;
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  private record(id: string, name: string, action: string, metadata: unknown) {
    this.repo.db
      .prepare('INSERT INTO world_history VALUES(?,?,?,?,?,?)')
      .run(randomUUID(), id, name, new Date().toISOString(), action, JSON.stringify(metadata));
    this.repo.audit('world.' + action, name, id);
  }
  async act(id: string, raw: WorldAction): Promise<void> {
    const input = worldActionSchema.parse(raw),
      server = this.assertStopped(id);
    if (input.confirmation !== input.name)
      throw new DomainError('CONFIRM', 'The world name does not match.');
    const worlds = await this.list(id),
      world = worlds.find((world) => world.name === input.name);
    if (!world) throw new DomainError('WORLD', 'World not found.');
    if (input.action === 'delete' && world.active)
      throw new DomainError('WORLD', 'Select another world before deleting the active world.');
    if (input.newName === input.name)
      throw new DomainError('WORLD', 'Choose a different world name.');
    const profile: Partial<Server> = {};
    await this.backup(id, 'before_world_' + input.action);
    await this.edit(
      server,
      'world.' + input.action,
      async (stage, context) => {
        const root = await containedPath(stage, this.base(server), true);
        if (input.newName)
          for (const folder of world.folders) {
            const target = await containedPath(
              root,
              input.newName + folder.slice(input.name.length),
            );
            if (
              await stat(target).then(
                () => true,
                (error: NodeJS.ErrnoException) => {
                  if (error.code === 'ENOENT') return false;
                  throw error;
                },
              )
            )
              throw new DomainError('COLLISION', 'A world folder with this name already exists.');
          }
        for (const folder of world.folders) {
          context.signal.throwIfAborted();
          const source = await containedPath(root, folder);
          if (input.action === 'duplicate') {
            await copyDirectory(
              source,
              await containedPath(root, input.newName! + folder.slice(input.name.length)),
              { signal: context.signal, progress: (bytes) => context.phase('extracting', bytes) },
            );
            const clone = await containedPath(
              root,
              input.newName! + folder.slice(input.name.length),
            );
            for (const name of ['uid.dat', 'session.lock'])
              await rm(await containedPath(clone, name), { force: true });
          } else if (input.action === 'rename')
            await rename(
              source,
              await containedPath(root, input.newName! + folder.slice(input.name.length)),
            );
          else if (input.action === 'delete') await rm(source, { recursive: true });
        }
        if (input.action === 'select' || (input.action === 'rename' && world.active)) {
          const filename = await containedPath(stage, 'server.properties'),
            props = parseProperties(await readFile(filename, 'utf8'));
          props['level-name'] = input.action === 'rename' ? input.newName! : input.name;
          props['level-seed'] = world.seed ?? '';
          profile.seed = props['level-seed'];
          await atomicWrite(filename, serializeProperties(props));
        }
      },
      profile,
      () =>
        this.record(id, input.newName ?? input.name, input.action, {
          previousName: input.name,
          folders: world.folders,
        }),
    );
  }
  async import(id: string, raw: WorldImportInput): Promise<void> {
    const input = worldImportSchema.parse(raw),
      server = this.assertStopped(id),
      ticket = this.tickets.get(input.token);
    if (!ticket || ticket.serverId !== id || ticket.expires < Date.now())
      throw new DomainError(
        'IMPORT_PREVIEW',
        'The world preview expired. Select the source again.',
      );
    if (input.confirmation !== input.name)
      throw new DomainError('CONFIRM', 'The world name does not match.');
    if ((await this.fingerprint(ticket.root, ticket.world)) !== ticket.fingerprint)
      throw new DomainError(
        'IMPORT_CHANGED',
        'The source world changed after its preview. Review it again.',
      );
    await this.backup(id, 'before_world_import');
    await this.edit(
      server,
      'world.import',
      async (stage, context) => {
        const root = await containedPath(stage, this.base(server), true);
        await mkdir(root, { recursive: true });
        for (const folder of ticket.world.folders) {
          const target = await containedPath(
            root,
            input.name + folder.slice(ticket.world.name.length),
          );
          if (
            await stat(target).then(
              () => true,
              (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return false;
                throw error;
              },
            )
          )
            throw new DomainError('COLLISION', 'A world folder with this name already exists.');
          await copyDirectory(await containedPath(ticket.root, folder), target, {
            signal: context.signal,
            progress: (bytes) => context.phase('extracting', bytes),
          });
          for (const name of ['uid.dat', 'session.lock'])
            await rm(await containedPath(target, name), { force: true });
        }
      },
      {},
      () =>
        this.record(id, input.name, 'import', {
          edition: ticket.preview.edition,
          folders: ticket.preview.folders,
          seed: ticket.preview.seed,
        }),
    );
    await this.removeTicket(ticket).catch((error) =>
      this.repo.audit('world.preview.cleanup_failed', readableError(error), id, false),
    );
    this.tickets.delete(input.token);
  }
  async export(id: string, name: string, destination: string): Promise<void> {
    const server = this.assertStopped(id),
      world = (await this.list(id)).find(
        (world) => world.name === existingWorldNameSchema.parse(name),
      );
    if (!world) throw new DomainError('WORLD', 'World not found.');
    const relative = path.relative(server.path, path.resolve(destination));
    if (!relative.startsWith('..') && !path.isAbsolute(relative))
      throw new DomainError('PATH', 'Export the world outside its server folder.');
    await this.jobs.run('world.export', 'Export world', id, async (context) => {
      const stage = path.join(this.repo.root, 'cache', 'world-exports', context.id);
      try {
        await mkdir(stage, { recursive: true });
        const root = await containedPath(server.path, this.base(server), true);
        context.phase('extracting');
        for (const folder of world.folders)
          await copyDirectory(await containedPath(root, folder), path.join(stage, folder), {
            signal: context.signal,
            progress: (bytes) => context.phase('extracting', bytes, world.bytes),
          });
        await this.jobs.exportFile(
          context,
          destination,
          (temporary) =>
            zipDirectory(stage, temporary, undefined, {
              signal: context.signal,
              progress: (bytes) => context.phase('applying', bytes, world.bytes),
            }),
          () => this.record(id, name, 'export', { folders: world.folders, bytes: world.bytes }),
        );
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
}
