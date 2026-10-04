import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, statfs, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventBus } from './events';
import { Repository } from '../database/database';
import { Logger } from './logger';
import { DownloadManager } from '../minecraft/downloads';
import { MinecraftVersionService } from '../minecraft/versions';
import { ServerInstaller } from '../minecraft/installer';
import type { InstallationOptions } from '../minecraft/installer';
import { RuntimeManager } from '../runtime-manager/runtime';
import { ServerProcessSupervisor } from '../server-core/supervisor';
import { BackupService, LocalBackupProvider } from '../backups/service';
import { RetentionService } from '../backups/retention';
import { SchedulerService } from './scheduler';
import { FileService } from './files';
import { FileOperations } from './file-operations';
import { ModrinthProvider } from '../marketplace/modrinth';
import { MarketplaceRegistry } from '../marketplace/registry';
import { IconCache } from '../marketplace/icons';
import { atomicWrite } from '../security/paths';
import { LocalSecretStore, type SecretStore } from '../security/secrets';
import { findAvailablePort, checkPort, lanIp } from '../networking/network';
import { parseProperties, serializeProperties } from '../domain/properties';
import { DomainError, readableError } from '../domain/errors';
import {
  createServerSchema,
  settingsSchema,
  serverOptionsSchema,
  type ServerOptions,
  type CreateServerInput,
  type Server,
  type Settings,
  type Diagnostic,
  type Snapshot,
} from '../domain/types';
import { z } from 'zod';
import { OperationService } from './operations';
import { PhpRuntimeManager } from '../runtime-manager/php';
import { engineDefinition } from '../domain/engines';
import { CrossplayService } from '../server-core/crossplay';
import { ServerImportService } from './imports';
import { WorldService } from './worlds';
import { ModpackService } from './modpacks';
import { StorageService } from './storage';
import type { PlayerService } from './players';
import { RuntimeMaintenance } from '../runtime-manager/maintenance';
import { recoveryActionSchema, type RecoveryAction } from '../domain/operations';
import { copyRegularFile } from '../security/copy';
import { sha256 } from '../backups/archive';
import { UpdateService } from '../updates/service';
import { PRODUCT } from '../domain/types';
const exec = promisify(execFile);
export class AppCore {
  readonly bus = new EventBus();
  readonly repo: Repository;
  readonly logger: Logger;
  readonly downloads: DownloadManager;
  readonly jobs: OperationService;
  readonly versions = new MinecraftVersionService();
  readonly runtime: RuntimeManager;
  readonly php: PhpRuntimeManager;
  readonly installer: ServerInstaller;
  readonly supervisor: ServerProcessSupervisor;
  readonly backups: BackupService;
  readonly retention: RetentionService;
  readonly updates: UpdateService;
  readonly scheduler: SchedulerService;
  readonly files = new FileService();
  readonly fileOperations: FileOperations;
  readonly marketplace: ModrinthProvider;
  readonly catalogs: MarketplaceRegistry;
  readonly icons: IconCache;
  readonly crossplay: CrossplayService;
  readonly imports: ServerImportService;
  readonly worlds: WorldService;
  readonly modpacks: ModpackService;
  readonly storage: StorageService;
  readonly players: PlayerService;
  readonly runtimeMaintenance: RuntimeMaintenance;
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly maintenance: NodeJS.Timeout;
  private maintenanceWork: Promise<void> = Promise.resolve();
  private closing = false;
  private constructor(
    readonly root: string,
    private readonly secrets: SecretStore,
  ) {
    this.repo = new Repository(root, this.bus);
    this.logger = new Logger(path.join(root, 'logs'));
    this.downloads = new DownloadManager(this.bus, this.repo);
    this.jobs = new OperationService(this.repo, this.bus, this.logger);
    this.updates = new UpdateService(this.repo, this.jobs, this.downloads, {
      version: PRODUCT.version,
      packaged: false,
      platform: process.platform,
      arch: process.arch,
      target:
        process.platform === 'win32'
          ? 'nsis'
          : process.platform === 'darwin'
            ? 'maczip'
            : 'appimage',
    });
    this.storage = new StorageService(this.repo, this.jobs);
    const runtimeGuard = (folder: string) => {
      for (const server of this.repo.servers()) {
        const relative = path.relative(folder, server.runtimePath ?? server.javaPath);
        if (
          relative &&
          !relative.startsWith('..') &&
          !path.isAbsolute(relative) &&
          (server.status === 'installing' ||
            this.supervisor?.isRunning(server.id) ||
            this.supervisor?.isOrphaned(server.id))
        )
          throw new DomainError(
            'RUNTIME_IN_USE',
            'Stop every server using this runtime before replacing it.',
          );
      }
    };
    this.runtime = new RuntimeManager(this.repo, this.downloads, this.jobs, runtimeGuard);
    this.php = new PhpRuntimeManager(this.repo, this.downloads, this.jobs, runtimeGuard);
    this.installer = new ServerInstaller(
      this.repo,
      this.runtime,
      this.versions,
      this.downloads,
      secrets,
      this.logger,
      this.jobs,
      this.php,
    );
    this.supervisor = new ServerProcessSupervisor(
      this.repo,
      secrets,
      this.bus,
      this.logger,
      undefined,
      (id) => this.exclusive(id, () => this.supervisor.start(id)),
    );
    this.players = this.supervisor.playerData;
    this.runtimeMaintenance = new RuntimeMaintenance(
      this.repo,
      this.jobs,
      this.runtime,
      this.php,
      (id) => this.assertStopped(id),
      (id) => this.supervisor.isRunning(id) || this.supervisor.isOrphaned(id),
    );
    this.backups = new BackupService(
      this.repo,
      this.supervisor,
      secrets,
      new LocalBackupProvider(this.repo),
      this.jobs,
    );
    this.retention = new RetentionService(this.repo, this.jobs, this.logger);
    this.marketplace = new ModrinthProvider(this.repo, this.downloads, this.jobs);
    this.catalogs = new MarketplaceRegistry(this.repo, secrets);
    this.icons = new IconCache(path.join(this.root, 'cache', 'icons'));
    this.crossplay = new CrossplayService(this.repo, this.marketplace.manager);
    this.imports = new ServerImportService(
      this.repo,
      this.jobs,
      this.runtime,
      this.php,
      secrets,
      () => this.reservedPorts(),
    );
    this.worlds = new WorldService(
      this.repo,
      this.jobs,
      (id) => this.assertStopped(id),
      (id, reason) => this.backups.create(id, reason),
    );
    this.fileOperations = new FileOperations(
      this.repo,
      this.jobs,
      (id) => this.assertStopped(id),
      (id, reason) => this.backups.create(id, reason),
    );
    this.modpacks = new ModpackService(
      this.repo,
      this.jobs,
      this.downloads,
      this.installer,
      (input, options) => this.create(input, options),
    );
    this.scheduler = new SchedulerService(
      this.repo,
      (job) =>
        this.exclusive(job.serverId, async () => {
          if (job.action === 'backup') await this.backups.create(job.serverId, 'scheduled');
          else if (job.action === 'command')
            await this.supervisor.command(job.serverId, job.command);
          else if (job.action === 'restart') {
            await this.supervisor.restart(job.serverId);
          } else await this.supervisor[job.action](job.serverId);
        }),
      async (job, seconds) => {
        if (this.supervisor.isRunning(job.serverId)) {
          const message = (
            job.warningMessage ?? '[MineDock] Restarting in {seconds} seconds.'
          ).replaceAll('{seconds}', String(seconds));
          if (/[\r\n\0]/.test(message)) throw new DomainError('COMMAND', 'Invalid command.');
          await this.supervisor.command(job.serverId, 'say ' + message);
        }
      },
    );
    this.maintenance = setInterval(() => {
      this.maintenanceWork = this.maintenanceWork
        .then(async () => {
          this.repo.retainMetrics();
          await this.repo.snapshotDatabase();
          await this.refreshStorage();
        })
        .catch((e) => this.logger.write(String(e), true));
    }, 3600000);
    this.maintenance.unref();
    this.logger.write('MineDock started.');
  }
  static async open(root: string, secrets?: SecretStore): Promise<AppCore> {
    await mkdir(root, { recursive: true });
    root = await realpath(root);
    const core = new AppCore(root, secrets ?? (await LocalSecretStore.open(root)));
    await mkdir(core.repo.settings().serverRoot, { recursive: true });
    await mkdir(core.repo.settings().backupRoot, { recursive: true });
    await core.jobs.recover();
    await core.retention.recover();
    await core.worlds.cleanPreviews();
    await core.modpacks.cleanup(true);
    await core.fileOperations.cleanTemporaryArchives();
    await core.repo.snapshotDatabase();
    return core;
  }
  snapshot(): Snapshot {
    return {
      servers: this.repo.servers(),
      backups: this.repo.backups(),
      schedules: this.repo.schedules(),
      settings: this.repo.settings(),
      activity: this.repo.activity(),
      mock: false,
      operations: this.repo.operations(),
    };
  }
  async exclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
    if (this.closing) throw new DomainError('CLOSING', 'The application is shutting down.');
    if (this.operations.has(id))
      throw new DomainError('BUSY', 'An operation is already in progress on this server.');
    const work = Promise.resolve().then(operation);
    this.operations.set(id, work);
    try {
      return await work;
    } catch (e) {
      this.repo.audit(
        'operation.failed',
        readableError(e),
        id === 'settings' ? undefined : id,
        false,
      );
      this.logger.write(`${id}: ${String(e)}`, true);
      throw e;
    } finally {
      this.operations.delete(id);
    }
  }
  async create(
    raw: CreateServerInput,
    options: InstallationOptions & { profile?: Partial<Server> } = {},
  ): Promise<Server> {
    const input = createServerSchema.parse(raw);
    const id = randomUUID();
    return this.exclusive('create', async () => {
      const definition = engineDefinition(input.engine);
      const ports = await this.reservedPorts();
      if (definition.protocol === 'udp') {
        const ipv6 = input.ipv6Port ?? 19133;
        if (ipv6 === input.port || ports.has(ipv6) || !(await checkPort(ipv6, 'udp', true)))
          throw new DomainError('PORT', 'Choose an available, separate IPv6 UDP port.');
      }
      if (ports.has(input.port) || !(await checkPort(input.port, definition.protocol)))
        throw new DomainError('PORT', `Port ${input.port} is already in use.`);
      if (!definition.platforms.includes(process.platform))
        throw new DomainError(
          'PLATFORM',
          'This server engine is unavailable on this operating system.',
        );
      const artifact = await this.versions.artifact(input.engine, input.version, undefined, input);
      const root = this.repo.settings().serverRoot;
      const folder = path.join(root, id);
      await mkdir(folder, { recursive: true });
      const space = await statfs(root);
      if (Number(space.bavail) * Number(space.bsize) < 512 * 1024 ** 2)
        throw new DomainError('DISK', 'At least 512 MB of free disk space is required.');
      const password = randomBytes(32).toString('base64url');
      const { eula: _eula, ...profile } = input;
      const server: Server = {
        ...profile,
        id,
        path: folder,
        javaMajor: artifact.java,
        javaPath: '',
        build: artifact.build,
        status: 'installing',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cpu: 0,
        memory: 0,
        players: [],
        diskBytes: 0,
        installationComplete: false,
        loaderVersion: artifact.loaderVersion,
        installerVersion: artifact.installerVersion,
        ...options.profile,
      };
      this.repo.addServer(server, this.secrets.encrypt(password));
      return this.installer.install(id, options);
    });
  }
  async retryInstallation(id: string): Promise<Server> {
    return this.exclusive('create', () =>
      this.exclusive(id, async () => {
        const server = this.assertStopped(id);
        if (server.installationComplete !== false)
          throw new DomainError('INSTALL', 'This server is already installed.');
        return server.modpack ? this.modpacks.retry(id) : this.installer.install(id);
      }),
    );
  }
  assertStopped(id: string): Server {
    const server = this.repo.server(id);
    if (
      this.repo
        .operations()
        .some((operation) => operation.serverId === id && operation.status === 'attention')
    )
      throw new DomainError(
        'RECOVERY',
        'Review and resolve interrupted operations before changing this server.',
      );
    if (
      this.supervisor.isRunning(id) ||
      this.supervisor.isOrphaned(id) ||
      server.status === 'installing'
    )
      throw new DomainError(
        'RUNNING',
        'Stop the server before editing its files or configuration.',
      );
    return server;
  }
  async resolveOperation(id: string, raw: RecoveryAction): Promise<void> {
    const input = recoveryActionSchema.parse(raw);
    const operation = this.repo.operations().find((item) => item.id === id);
    if (!operation) throw new DomainError('RECOVERY', 'Operation not found.');
    return this.exclusive(operation.serverId ?? 'runtimes', async () => {
      if (this.repo.db.prepare('SELECT id FROM backup_retention_runs WHERE id=?').get(id)) {
        if (input.action !== 'retry')
          throw new DomainError(
            'RECOVERY',
            'Retry safe retention recovery after reviewing its storage folder.',
          );
        await this.retention.review(id);
        await this.retention.recover();
        return;
      }
      const review = await this.jobs.review(id);
      if (input.action !== 'retry' && input.confirmation !== review.label)
        throw new DomainError('CONFIRM', 'Incorrect confirmation.');
      const checkpoint = this.repo.operationCheckpoint(id)!;
      for (const server of this.repo.servers()) {
        const relative = path.relative(
          checkpoint.destination,
          server.runtimePath ?? server.javaPath,
        );
        if (
          (server.id === operation.serverId ||
            (relative && !relative.startsWith('..') && !path.isAbsolute(relative))) &&
          (this.supervisor.isRunning(server.id) ||
            this.supervisor.isOrphaned(server.id) ||
            server.status === 'installing')
        )
          throw new DomainError('RUNNING', 'Stop every affected server before resolving recovery.');
      }
      if (input.action === 'retry') await this.jobs.retryRecovery(id);
      else if (input.action === 'rollback')
        await this.jobs.rollbackReviewed(id, input.confirmation);
      else {
        const backup = review.backups.find((item) => item.id === input.backupId);
        if (!backup || !operation.serverId)
          throw new DomainError('RECOVERY', 'Choose a safety backup for this server.');
        await this.backups.restore(backup.id, this.repo.server(operation.serverId).name, true);
        await this.jobs.resolvedFromBackup(id);
      }
    });
  }
  async recoveryReview(id: string) {
    return this.repo.db.prepare('SELECT id FROM backup_retention_runs WHERE id=?').get(id)
      ? this.retention.review(id)
      : this.jobs.review(id);
  }
  async properties(id: string): Promise<Record<string, string>> {
    const properties = parseProperties(
      await readFile(path.join(this.repo.server(id).path, 'server.properties'), 'utf8'),
    );
    delete properties['rcon.password'];
    return properties;
  }
  async saveProperties(id: string, raw: Record<string, string>): Promise<void> {
    await this.exclusive(id, async () => {
      const server = this.assertStopped(id);
      const values = z.record(z.string().max(120), z.string().max(2000)).parse(raw);
      const definition = engineDefinition(server.engine);
      if ('rcon.password' in values)
        throw new DomainError('SECRET', 'The application manages the RCON password.');
      const port = z.coerce.number().int().min(1024).max(65535).parse(values['server-port']);
      const players = z.coerce.number().int().min(1).max(1000).parse(values['max-players']);
      const view = z.coerce.number().int().min(2).max(32).parse(values['view-distance']);
      const simulation =
        definition.edition === 'bedrock'
          ? server.simulationDistance
          : z.coerce.number().int().min(2).max(32).parse(values['simulation-distance']);
      const mode = z
        .enum(['survival', 'creative', 'adventure', 'spectator'])
        .parse(values.gamemode);
      const difficulty = z.enum(['peaceful', 'easy', 'normal', 'hard']).parse(values.difficulty);
      if ((await this.reservedPorts(id)).has(port) || !(await checkPort(port, definition.protocol)))
        throw new DomainError('PORT', 'This port is already in use.');
      const worldName = values['level-name'] ?? 'world';
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(worldName))
        throw new DomainError(
          'WORLD',
          'The world folder name must contain only letters, digits, hyphens and underscores.',
        );
      if (values['server-ip'] && values['server-ip'] !== '127.0.0.1')
        throw new DomainError('BIND', 'V1 allows an empty bind address (LAN) or 127.0.0.1.');
      for (const key of ['online-mode', 'pvp', 'white-list'])
        if (definition.edition === 'java' || key === 'online-mode')
          z.enum(['true', 'false']).parse(values[key]);
      const current = parseProperties(
        await readFile(path.join(server.path, 'server.properties'), 'utf8'),
      );
      await this.backups.create(id, 'before_settings');
      const props: Record<string, string> = {
        ...current,
        ...values,
      };
      if (definition.capabilities.rcon)
        Object.assign(props, {
          'rcon.password': this.secrets.decrypt(this.repo.secret(id)),
          'rcon.port': current['rcon.port'] ?? '',
          'enable-rcon': 'true',
        });
      const ipv6Port =
        definition.protocol === 'udp'
          ? z.coerce
              .number()
              .int()
              .min(1024)
              .max(65535)
              .parse(props['server-portv6'] ?? 19133)
          : undefined;
      if (
        ipv6Port &&
        (ipv6Port === port ||
          !(await checkPort(ipv6Port, 'udp', true)) ||
          (await this.reservedPorts(id)).has(ipv6Port))
      )
        throw new DomainError('PORT', 'The IPv6 UDP port is already in use.');
      await atomicWrite(path.join(server.path, 'server.properties'), serializeProperties(props));
      Object.assign(server, {
        port,
        ipv6Port,
        maxPlayers: players,
        viewDistance: view,
        simulationDistance: simulation,
        difficulty,
        gamemode: mode,
        motd: props.motd ?? props['server-name'],
        seed: props['level-seed'],
        pvp: props.pvp === 'true',
        whitelist: (props['white-list'] ?? props['allow-list']) === 'true',
        onlineMode: props['online-mode'] === 'true',
        status: 'stopped',
      });
      this.repo.saveServer(server);
      this.repo.audit('server.configured', server.name, id);
    });
  }
  async settings(raw: Settings): Promise<Settings> {
    return this.exclusive('settings', async () => {
      const settings = settingsSchema.parse(raw);
      for (const folder of [settings.serverRoot, settings.backupRoot]) {
        if (!path.isAbsolute(folder) || path.parse(folder).root === folder)
          throw new DomainError('PATH', 'Choose a dedicated MineDock folder.');
        await mkdir(folder, { recursive: true });
      }
      for (const server of this.repo.servers()) {
        const relative = path.relative(server.path, settings.backupRoot);
        if (!relative.startsWith('..') && !path.isAbsolute(relative))
          throw new DomainError('PATH', 'The backup folder cannot be inside a server folder.');
      }
      this.repo.saveSettings(settings);
      this.repo.audit('settings.updated', 'Preferences updated.');
      return settings;
    });
  }
  async configureServer(id: string, raw: ServerOptions): Promise<Server> {
    return this.exclusive(id, async () => {
      const options = serverOptionsSchema.parse(raw);
      const server = this.assertStopped(id);
      if (!engineDefinition(server.engine).capabilities.javaMemory) {
        Object.assign(server, { autoStart: options.autoStart, autoRestart: options.autoRestart });
        this.repo.saveServer(server);
        return server;
      }
      const runtimes = await this.runtime.list();
      const runtime = runtimes.find(
        (r) => r.path === options.javaPath && r.major === server.javaMajor,
      );
      if (!runtime)
        throw new DomainError(
          'JAVA',
          `Select a Java ${server.javaMajor} runtime detected by MineDock.`,
        );
      await this.backups.create(id, 'before_settings');
      Object.assign(server, options, { runtimePath: runtime.path });
      this.repo.saveServer(server);
      this.repo.audit('server.profile_updated', server.name, id);
      return server;
    });
  }
  async diagnostic(): Promise<Diagnostic> {
    let docker = false;
    try {
      await exec('docker', ['version', '--format', '{{.Server.Version}}'], {
        timeout: 5000,
        windowsHide: true,
      });
      docker = true;
    } catch (e) {
      this.logger.write('Docker unavailable: ' + String(e));
    }
    const fs = await statfs(this.root);
    const usedPorts = await this.reservedPorts();
    let port = await findAvailablePort();
    while (usedPorts.has(port)) port = await findAvailablePort(port + 1);
    return {
      platform: os.platform(),
      arch: os.arch(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      freeDisk: Number(fs.bavail) * Number(fs.bsize),
      java: await this.runtime.list(),
      docker,
      lanIp: lanIp(),
      port,
      dataRoot: this.root,
    };
  }
  async remove(id: string, confirmation: string): Promise<void> {
    await this.exclusive(id, async () => {
      const server = this.assertStopped(id);
      if (confirmation !== server.name)
        throw new DomainError('CONFIRM', 'The server name does not match.');
      // Move to an app-owned trash folder, preserving worlds and any associated backups.
      const trash = path.join(this.root, 'trash');
      await mkdir(trash, { recursive: true });
      const { cp } = await import('node:fs/promises');
      await cp(server.path, path.join(trash, `${id}-${Date.now()}`), {
        recursive: true,
        dereference: false,
        errorOnExist: true,
        force: false,
      });
      if (!server.externalFolder) await rm(server.path, { recursive: true });
      this.repo.removeServer(id);
      this.repo.audit('server.trashed', server.name);
    });
  }
  private async reservedPorts(excludeGameServerId?: string): Promise<Set<number>> {
    const used = new Set<number>();
    for (const server of this.repo.servers()) {
      if (server.id !== excludeGameServerId) used.add(server.port);
      if (server.ipv6Port && server.id !== excludeGameServerId) used.add(server.ipv6Port);
      if (server.crossplayPort && server.id !== excludeGameServerId) used.add(server.crossplayPort);
      try {
        const props = parseProperties(
          await readFile(path.join(server.path, 'server.properties'), 'utf8'),
        );
        const port = Number(props['rcon.port']);
        if (Number.isInteger(port)) used.add(port);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return used;
  }
  async refreshStorage(): Promise<void> {
    const { directorySize } = await import('../backups/archive');
    for (const server of this.repo.servers()) {
      try {
        server.diskBytes = await directorySize(server.path);
        this.repo.saveServer(server);
      } catch (e) {
        this.logger.write(`Storage ${server.id}: ${String(e)}`, true);
      }
    }
  }
  async autoStart(): Promise<void> {
    for (const server of this.repo.servers().filter((s) => s.autoStart && s.status === 'stopped')) {
      try {
        await this.exclusive(server.id, () => this.supervisor.start(server.id));
      } catch (e) {
        this.logger.write(`Autostart ${server.id}: ${String(e)}`, true);
      }
    }
  }
  async exportBackup(id: string, destination: string): Promise<void> {
    const item = this.repo.backup(id);
    await this.jobs.run(
      'backup.export',
      'Export backup',
      item.metadata.serverId,
      async (context) => {
        context.phase('verifying');
        if (!(await this.backups.verify(id, context.signal)))
          throw new DomainError('INTEGRITY', 'Corrupted backup.');
        await this.jobs.exportFile(context, destination, async (staging) => {
          context.phase('applying');
          await copyRegularFile(item.path, staging, {
            signal: context.signal,
            progress: (bytes) => context.phase('applying', bytes, item.metadata.size),
          });
          context.phase('verifying');
          if ((await sha256(staging, context.signal)) !== item.metadata.sha256)
            throw new DomainError(
              'INTEGRITY',
              'The exported backup did not match its verified checksum.',
            );
        });
      },
    );
  }
  async close(): Promise<void> {
    this.closing = true;
    clearInterval(this.maintenance);
    const updateShutdown = this.updates.close();
    this.downloads.cancelAll();
    this.jobs.cancelAll();
    await updateShutdown;
    await this.scheduler.close();
    await Promise.allSettled([...this.operations.values()]);
    await this.maintenanceWork;
    await this.supervisor.close();
    await this.repo.snapshotDatabase();
    this.logger.write('MineDock stopped.');
    await this.logger.flush();
    this.repo.close();
  }
}
