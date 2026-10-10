import { mkdir, stat, statfs, rename, rm, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from '../database/database';
import { ServerProcessSupervisor } from '../server-core/supervisor';
import { sha256, zipDirectory, extractZip, directorySize } from './archive';
import { parseProperties, serializeProperties } from '../domain/properties';
import type { SecretStore } from '../security/secrets';
import { atomicWrite } from '../security/paths';
import { DomainError } from '../domain/errors';
import type { Backup, Server } from '../domain/types';
import { z } from 'zod';
import type { OperationService } from '../core/operations';
import type { OperationContext } from '../domain/operations';
import { engineDefinition } from '../domain/engines';
import { engineSchema, installedContentSchema } from '../domain/types';
import { modpackProfileSchema } from '../domain/modpacks';
import { containedPath } from '../security/paths';
import { findAvailablePort } from '../networking/network';
import { packFileSchema } from '../domain/packs';
import { jvmSchema } from '../domain/performance';
import { nativeCommand } from '../domain/admin-commands';
const maximumBackupSize = 64 * 1024 ** 3;
export interface BackupStorageProvider {
  root(): string;
}
export class LocalBackupProvider implements BackupStorageProvider {
  constructor(private readonly repo: Repository) {}
  root(): string {
    return this.repo.settings().backupRoot;
  }
}
export class BackupService {
  constructor(
    private readonly repo: Repository,
    private readonly runner: ServerProcessSupervisor,
    private readonly secrets: SecretStore,
    private readonly provider: BackupStorageProvider,
    private readonly jobs?: OperationService,
  ) {}
  async create(id: string, reason = 'manual', signal?: AbortSignal): Promise<Backup> {
    return this.jobs
      ? this.jobs.run(
          'backup',
          'Backup',
          id,
          (context) => this.createArchive(id, reason, context),
          signal,
        )
      : this.createArchive(id, reason);
  }
  private async createArchive(
    id: string,
    reason: string,
    context?: OperationContext,
  ): Promise<Backup> {
    const server = this.repo.server(id);
    if (server.installationComplete === false)
      throw new DomainError('INSTALL', 'Finish installation before backing up this server.');
    if (this.runner.isOrphaned(id))
      throw new Error('Close the old process before backing up this server.');
    if (['installing', 'starting', 'stopping', 'restoring'].includes(server.status))
      throw new DomainError('BUSY', 'Wait for the current operation to finish.');
    const active = this.runner.isRunning(id);
    if (active && !engineDefinition(server.engine).capabilities.liveBackup)
      throw new DomainError('RUNNING', 'Stop this server before creating a consistent backup.');
    const previous = server.status;
    const root = this.provider.root();
    await mkdir(root, { recursive: true });
    const size = await directorySize(server.path, context?.signal);
    const disk = await statfs(root);
    if (size > maximumBackupSize)
      throw new DomainError('SIZE', 'This server exceeds the V1 backup limit (64 GB).');
    if (Number(disk.bavail) * Number(disk.bsize) < size + 128 * 1024 ** 2)
      throw new DomainError('DISK', 'Not enough disk space for a complete backup.');
    const backupId = randomUUID();
    const filename = path.join(root, `${backupId}.zip`);
    const temporary = filename + '.part';
    let savingHeld = false;
    server.status = 'backing_up';
    this.repo.saveServer(server);
    try {
      if (active) {
        // Set this before awaiting: even a lost reply must lead to save-on in finally.
        savingHeld = true;
        const held = await this.runner.command(id, nativeCommand(server, 'save-off'));
        if (
          !/^(?:Automatic saving is now disabled|Saving is already turned off)\.?$/.test(
            held.trim(),
          )
        )
          throw new Error('The server did not confirm disabling automatic saving.');
        const reply = await this.runner.command(id, nativeCommand(server, 'save-all flush'));
        if (
          !/^(?:Saving the game \(this may take a moment!\)\s*)?Saved the game\.?$/.test(
            reply.trim(),
          ) ||
          /Unknown|Incorrect|Error|failed/i.test(reply)
        )
          throw new Error('The server did not confirm saving the world.');
      }
      const manifest = JSON.stringify({
        format: 1,
        profile: {
          packs: server.packs,
          jvm: server.jvm,
          activeResourcePack: server.activeResourcePack,
          engine: server.engine,
          modpack: server.modpack,
          version: server.version,
          minecraftVersion: server.minecraftVersion,
          build: server.build,
          javaMajor: server.javaMajor,
          javaPath: server.javaPath,
          memoryMin: server.memoryMin,
          memoryMax: server.memoryMax,
          entrypoint: server.entrypoint,
          crossplayPort: server.crossplayPort,
          launchArgsFile: server.launchArgsFile,
          runtimePath: server.runtimePath,
          loaderVersion: server.loaderVersion,
          installerVersion: server.installerVersion,
        },
        content: this.repo.content(id),
      });
      context?.phase('applying');
      await zipDirectory(server.path, temporary, manifest, {
        signal: context?.signal,
        progress: (received) => context?.phase('applying', received, size),
      });
      context?.signal.throwIfAborted();
      context?.phase('verifying');
      const checksum = await sha256(temporary, context?.signal);
      const info = await stat(temporary);
      context?.signal.throwIfAborted();
      await rename(temporary, filename);
      const meta: Backup = {
        id: backupId,
        serverId: id,
        name: `${server.name} · ${new Date().toLocaleString(this.repo.settings().language)}`,
        createdAt: new Date().toISOString(),
        size: info.size,
        sha256: checksum,
        version: server.version,
        reason,
      };
      this.repo.addBackup(meta, filename);
      this.repo.audit('backup.completed', meta.name, id);
      return meta;
    } catch (e) {
      await rm(temporary, { force: true });
      this.repo.audit('backup.failed', String(e), id, false);
      throw e;
    } finally {
      if (savingHeld) await this.resumeSaving(id, server);
      const latest = this.repo.server(id);
      if (latest.status === 'backing_up') {
        latest.status =
          active && this.runner.isRunning(id)
            ? 'running'
            : previous === 'crashed'
              ? 'crashed'
              : 'stopped';
        this.repo.saveServer(latest);
      }
    }
  }
  private async resumeSaving(id: string, server: Server): Promise<void> {
    try {
      const resumed = await this.runner.command(id, nativeCommand(server, 'save-on'));
      if (
        !/^(?:Automatic saving is now enabled|Saving is already turned on)\.?$/.test(resumed.trim())
      )
        throw new Error('The server did not confirm resuming automatic saving.');
    } catch (error) {
      this.repo.audit(
        'backup.save_on_failed',
        'Failed to resume world saving: safety stop to prevent unsaved world changes. ' +
          String(error),
        id,
        false,
      );
      await this.runner.stop(id);
      throw new Error(
        'Automatic saving could not be verified. The server was stopped for safety; inspect the console before restarting.',
      );
    }
  }
  async verify(id: string, signal?: AbortSignal): Promise<boolean> {
    const item = this.repo.backup(id);
    const valid = (await sha256(item.path, signal)) === item.metadata.sha256;
    this.repo.audit(
      'backup.verified',
      valid ? 'SHA-256 integrity verified.' : 'The backup is corrupted.',
      item.metadata.serverId,
      valid,
    );
    return valid;
  }
  async restore(id: string, confirmation: string, recovery = false): Promise<void> {
    const item = this.repo.backup(id);
    return this.jobs
      ? this.jobs.run('backup.restore', 'Restore', item.metadata.serverId, (context) =>
          this.prepareRestore(id, confirmation, context, recovery),
        )
      : this.prepareRestore(id, confirmation, undefined, recovery);
  }
  private async prepareRestore(
    id: string,
    confirmation: string,
    context?: OperationContext,
    recovery = false,
  ): Promise<void> {
    const item = this.repo.backup(id);
    const server = this.repo.server(item.metadata.serverId);
    if (confirmation !== server.name)
      throw new DomainError('CONFIRM', 'The confirmation name is incorrect.');
    if (this.runner.isRunning(server.id) || this.runner.isOrphaned(server.id))
      throw new DomainError('RUNNING', 'Stop the server before restoring a backup.');
    if (!(await this.verify(id, context?.signal)))
      throw new DomainError('INTEGRITY', 'Corrupted backup. Restore cancelled.');
    const originalExists = await stat(server.path).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' && recovery) return false;
        throw error;
      },
    );
    if (originalExists) await this.create(server.id, 'before_restore', context?.signal);
    const stage = path.join(path.dirname(server.path), `${server.id}.restore-${randomUUID()}`);
    const original = stage + '.previous';
    const beforeProfile = { ...server };
    const beforeContent = this.repo.content(server.id);
    let swapped = false;
    server.status = 'restoring';
    this.repo.saveServer(server);
    try {
      const info = await statfs(path.dirname(server.path));
      // ZIP sizes are checked while extracting; disk errors preserve the original directory.
      if (Number(info.bavail) * Number(info.bsize) < item.metadata.size + 128 * 1024 ** 2)
        throw new DomainError('DISK', 'Not enough disk space to prepare the restore.');
      context?.phase('extracting');
      await extractZip(item.path, stage, maximumBackupSize, {
        signal: context?.signal,
        progress: (received) => context?.phase('extracting', received),
      });
      const manifestSchema = z.object({
        format: z.literal(1),
        profile: z.object({
          packs: z.array(packFileSchema).max(1000).optional(),
          jvm: jvmSchema.optional(),
          activeResourcePack: z.string().uuid().optional(),
          engine: engineSchema,
          modpack: modpackProfileSchema.optional(),
          version: z.string(),
          minecraftVersion: z.string().optional(),
          build: z.string(),
          javaMajor: z.number(),
          javaPath: z.string(),
          memoryMin: z.number(),
          memoryMax: z.number(),
          entrypoint: z.string().optional(),
          crossplayPort: z.number().int().min(1024).max(65535).optional(),
          launchArgsFile: z.string().optional(),
          runtimePath: z.string().optional(),
          loaderVersion: z.string().optional(),
          installerVersion: z.string().optional(),
        }),
        content: z.array(installedContentSchema),
      });
      const manifest = manifestSchema.parse(
        JSON.parse(await readFile(path.join(stage, '.minedock-backup.json'), 'utf8')),
      );
      await rm(path.join(stage, '.minedock-backup.json'));
      const props = parseProperties(await readFile(path.join(stage, 'server.properties'), 'utf8'));
      // Keep managed network ports stable across restores.
      const current = parseProperties(
        originalExists ? await readFile(path.join(server.path, 'server.properties'), 'utf8') : '',
      );
      const engine = engineDefinition(manifest.profile.engine);
      if (engine.capabilities.rcon) {
        props['rcon.password'] = this.secrets.decrypt(this.repo.secret(server.id));
        props['rcon.port'] =
          current['rcon.port'] ??
          String(await findAvailablePort(Math.min(server.port + 10, 65400)));
        props['enable-rcon'] = 'true';
      }
      props['server-port'] = String(server.port);
      await atomicWrite(path.join(stage, 'server.properties'), serializeProperties(props));
      await stat(
        await containedPath(
          stage,
          manifest.profile.launchArgsFile ?? manifest.profile.entrypoint ?? 'server.jar',
        ),
      );
      Object.assign(server, manifest.profile);
      server.packs = manifest.profile.packs;
      server.jvm = manifest.profile.jvm;
      server.activeResourcePack = manifest.profile.activeResourcePack;
      server.minecraftVersion = manifest.profile.minecraftVersion;
      server.entrypoint = manifest.profile.entrypoint;
      server.crossplayPort = manifest.profile.crossplayPort;
      server.modpack = manifest.profile.modpack;
      server.launchArgsFile = manifest.profile.launchArgsFile;
      server.runtimePath = manifest.profile.runtimePath;
      server.loaderVersion = manifest.profile.loaderVersion;
      server.installerVersion = manifest.profile.installerVersion;
      server.difficulty = props.difficulty as typeof server.difficulty;
      server.gamemode = props.gamemode as typeof server.gamemode;
      server.maxPlayers = Number(props['max-players']);
      server.viewDistance = Number(props['view-distance']);
      server.simulationDistance = Number(props['simulation-distance'] ?? server.simulationDistance);
      server.motd = props.motd ?? props['server-name'] ?? '';
      server.seed = props['level-seed'] ?? '';
      server.pvp = props.pvp === 'true';
      server.whitelist = (props['white-list'] ?? props['allow-list']) === 'true';
      server.onlineMode = props['online-mode'] === 'true';
      server.error = undefined;
      server.status = 'stopped';
      if (context && this.jobs) {
        await this.jobs.swap(
          context,
          {
            destination: server.path,
            staging: stage,
            previous: original,
            beforeProfile,
            beforeContent,
          },
          () => {
            this.repo.db.prepare('DELETE FROM installed_content WHERE server_id=?').run(server.id);
            for (const content of manifest.content) {
              if (content.serverId !== server.id) throw new Error('Inconsistent content metadata.');
              this.repo.saveContent(content);
            }
            this.repo.saveServer(server);
          },
        );
        swapped = true;
        this.repo.audit('backup.restored', item.metadata.name, server.id);
        return;
      }
      await rename(server.path, original);
      try {
        await rename(stage, server.path);
        swapped = true;
      } catch (error) {
        await rename(original, server.path);
        throw error;
      }
      this.repo.db.exec('BEGIN');
      try {
        this.repo.db.prepare('DELETE FROM installed_content WHERE server_id=?').run(server.id);
        for (const content of manifest.content) {
          if (content.serverId !== server.id) throw new Error('Inconsistent plugin metadata.');
          this.repo.saveContent(content);
        }
        this.repo.saveServer(server);
        this.repo.db.exec('COMMIT');
      } catch (e) {
        this.repo.db.exec('ROLLBACK');
        await rename(server.path, stage);
        await rename(original, server.path);
        swapped = false;
        throw e;
      }
      this.repo.audit('backup.restored', item.metadata.name, server.id);
      // Preserve the replaced directory if cleanup fails; never compromise the new server.
      await rm(original, { recursive: true, force: true });
    } finally {
      await rm(stage, { recursive: true, force: true });
      const latest = this.repo.server(server.id);
      if (latest.status === 'restoring') {
        latest.status = 'stopped';
        this.repo.saveServer(latest);
      }
      if (!swapped && (await readdir(path.dirname(server.path))).includes(path.basename(original)))
        this.repo.audit(
          'restore.recovery',
          `The previous copy is preserved: ${original}`,
          server.id,
          false,
        );
    }
  }
  async delete(id: string, confirmation: string): Promise<void> {
    const item = this.repo.backup(id);
    if (confirmation !== item.metadata.name)
      throw new DomainError('CONFIRM', 'Incorrect confirmation.');
    await rm(item.path);
    this.repo.deleteBackup(id);
    this.repo.audit('backup.deleted', item.metadata.name, item.metadata.serverId);
  }
}
