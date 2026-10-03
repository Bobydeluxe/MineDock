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
import type { Backup } from '../domain/types';
import { z } from 'zod';
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
  ) {}
  async create(id: string, reason = 'manual'): Promise<Backup> {
    const server = this.repo.server(id);
    if (server.installationComplete === false)
      throw new DomainError('INSTALL', 'Terminez l’installation avant de sauvegarder ce serveur.');
    if (this.runner.isOrphaned(id))
      throw new Error('Fermez l’ancien processus avant de sauvegarder ce serveur.');
    if (['installing', 'starting', 'stopping', 'restoring'].includes(server.status))
      throw new DomainError('BUSY', 'Attendez la fin de l’opération en cours.');
    const active = this.runner.isRunning(id);
    const previous = server.status;
    const root = this.provider.root();
    await mkdir(root, { recursive: true });
    const size = await directorySize(server.path);
    const disk = await statfs(root);
    if (size > maximumBackupSize)
      throw new DomainError('SIZE', 'Ce serveur dépasse la limite de sauvegarde de la V1 (64 Go).');
    if (Number(disk.bavail) * Number(disk.bsize) < size + 128 * 1024 ** 2)
      throw new DomainError('DISK', 'Espace insuffisant pour une sauvegarde complète.');
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
        await this.runner.command(id, 'save-off');
        const reply = await this.runner.command(id, 'save-all flush');
        if (/Unknown|Incorrect|Error|failed/i.test(reply))
          throw new Error('Le serveur n’a pas confirmé la sauvegarde du monde.');
      }
      const manifest = JSON.stringify({
        format: 1,
        profile: {
          engine: server.engine,
          version: server.version,
          build: server.build,
          javaMajor: server.javaMajor,
          javaPath: server.javaPath,
          memoryMin: server.memoryMin,
          memoryMax: server.memoryMax,
        },
        content: this.repo.content(id),
      });
      await zipDirectory(server.path, temporary, manifest);
      const checksum = await sha256(temporary);
      const info = await stat(temporary);
      await rename(temporary, filename);
      const meta: Backup = {
        id: backupId,
        serverId: id,
        name: `${server.name} · ${new Date().toLocaleString('fr-FR')}`,
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
      if (savingHeld) {
        try {
          await this.runner.command(id, 'save-on');
        } catch (e) {
          this.repo.audit(
            'backup.save_on_failed',
            'Échec de save-on : arrêt de sécurité pour éviter un monde non sauvegardé. ' +
              String(e),
            id,
            false,
          );
          await this.runner.stop(id);
        }
      }
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
  async verify(id: string): Promise<boolean> {
    const item = this.repo.backup(id);
    const valid = (await sha256(item.path)) === item.metadata.sha256;
    this.repo.audit(
      'backup.verified',
      valid ? 'Intégrité SHA-256 vérifiée.' : 'La sauvegarde est endommagée.',
      item.metadata.serverId,
      valid,
    );
    return valid;
  }
  async restore(id: string, confirmation: string): Promise<void> {
    const item = this.repo.backup(id);
    const server = this.repo.server(item.metadata.serverId);
    if (confirmation !== server.name)
      throw new DomainError('CONFIRM', 'Le nom de confirmation est incorrect.');
    if (this.runner.isRunning(server.id) || this.runner.isOrphaned(server.id))
      throw new DomainError('RUNNING', 'Arrêtez le serveur avant de restaurer une sauvegarde.');
    if (!(await this.verify(id)))
      throw new DomainError('INTEGRITY', 'Sauvegarde corrompue. Restauration annulée.');
    await this.create(server.id, 'before_restore');
    const stage = path.join(path.dirname(server.path), `${server.id}.restore-${randomUUID()}`);
    const original = stage + '.previous';
    let swapped = false;
    server.status = 'restoring';
    this.repo.saveServer(server);
    try {
      const info = await statfs(path.dirname(server.path));
      // ZIP sizes are checked while extracting; disk errors preserve the original directory.
      if (Number(info.bavail) * Number(info.bsize) < item.metadata.size + 128 * 1024 ** 2)
        throw new DomainError('DISK', 'Espace insuffisant pour préparer la restauration.');
      await extractZip(item.path, stage, maximumBackupSize);
      const manifestSchema = z.object({
        format: z.literal(1),
        profile: z.object({
          engine: z.enum(['paper', 'vanilla']),
          version: z.string(),
          build: z.string(),
          javaMajor: z.number(),
          javaPath: z.string(),
          memoryMin: z.number(),
          memoryMax: z.number(),
        }),
        content: z.array(
          z.object({
            id: z.string().uuid(),
            serverId: z.string().uuid(),
            projectId: z.string(),
            title: z.string(),
            versionId: z.string(),
            filename: z.string(),
            enabled: z.boolean(),
          }),
        ),
      });
      const manifest = manifestSchema.parse(
        JSON.parse(await readFile(path.join(stage, '.minedock-backup.json'), 'utf8')),
      );
      await rm(path.join(stage, '.minedock-backup.json'));
      const props = parseProperties(await readFile(path.join(stage, 'server.properties'), 'utf8'));
      props['rcon.password'] = this.secrets.decrypt(this.repo.secret(server.id));
      // Keep managed network ports stable across restores.
      const current = parseProperties(
        await readFile(path.join(server.path, 'server.properties'), 'utf8'),
      );
      props['rcon.port'] = current['rcon.port'] ?? '';
      props['enable-rcon'] = 'true';
      props['server-port'] = String(server.port);
      await atomicWrite(path.join(stage, 'server.properties'), serializeProperties(props));
      await stat(path.join(stage, 'server.jar'));
      await rename(server.path, original);
      try {
        await rename(stage, server.path);
        swapped = true;
      } catch (e) {
        await rename(original, server.path);
        throw e;
      }
      Object.assign(server, manifest.profile);
      server.difficulty = props.difficulty as typeof server.difficulty;
      server.gamemode = props.gamemode as typeof server.gamemode;
      server.maxPlayers = Number(props['max-players']);
      server.viewDistance = Number(props['view-distance']);
      server.simulationDistance = Number(props['simulation-distance']);
      server.motd = props.motd ?? '';
      server.seed = props['level-seed'] ?? '';
      server.pvp = props.pvp === 'true';
      server.whitelist = props['white-list'] === 'true';
      server.onlineMode = props['online-mode'] === 'true';
      server.error = undefined;
      server.status = 'stopped';
      this.repo.db.exec('BEGIN');
      try {
        this.repo.db.prepare('DELETE FROM installed_content WHERE server_id=?').run(server.id);
        for (const content of manifest.content) {
          if (content.serverId !== server.id)
            throw new Error('Métadonnées de plugin incohérentes.');
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
          `La copie précédente est conservée : ${original}`,
          server.id,
          false,
        );
    }
  }
  async delete(id: string, confirmation: string): Promise<void> {
    const item = this.repo.backup(id);
    if (confirmation !== item.metadata.name)
      throw new DomainError('CONFIRM', 'Confirmation incorrecte.');
    await rm(item.path);
    this.repo.deleteBackup(id);
    this.repo.audit('backup.deleted', item.metadata.name, item.metadata.serverId);
  }
}
