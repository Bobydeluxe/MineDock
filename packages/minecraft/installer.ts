import path from 'node:path';
import { mkdir, readFile, stat, rm, chmod, copyFile } from 'node:fs/promises';
import { Repository } from '../database/database';
import { RuntimeManager } from '../runtime-manager/runtime';
import { MinecraftVersionService } from './versions';
import { DownloadManager } from './downloads';
import { Logger } from '../core/logger';
import type { SecretStore } from '../security/secrets';
import { atomicWrite } from '../security/paths';
import { findAvailablePort } from '../networking/network';
import { parseProperties, serializeProperties } from '../domain/properties';
import { supportsJavaProperty, javaPropertyFields } from '../domain/property-fields';
import { readableError } from '../domain/errors';
import type { Server, InstalledContent } from '../domain/types';
import { engineDefinition } from '../domain/engines';
import type { OperationService } from '../core/operations';
import type { OperationContext } from '../domain/operations';
import type { PhpRuntimeManager } from '../runtime-manager/php';
import { extractZip } from '../backups/archive';
import { copyDirectory } from '../security/copy';
import { containedPath } from '../security/paths';
import { installerProcess } from './process';
export type EnginePreparation = (
  stage: string,
  server: Server,
  context?: OperationContext,
) => Promise<InstalledContent[]>;
export interface InstallationOptions {
  prepare?: EnginePreparation;
  kind?: string;
  replacement?: Server;
}
export class ServerInstaller {
  constructor(
    private readonly repo: Repository,
    private readonly runtime: RuntimeManager,
    private readonly versions: MinecraftVersionService,
    private readonly downloads: DownloadManager,
    private readonly secrets: SecretStore,
    private readonly logger: Logger,
    private readonly jobs?: OperationService,
    private readonly php?: PhpRuntimeManager,
  ) {}
  async install(id: string, options: InstallationOptions = {}): Promise<Server> {
    return this.jobs
      ? this.jobs.run(options.kind ?? 'engine.install', 'Server installation', id, (context) =>
          this.prepare(id, context, options.prepare, options.replacement),
        )
      : this.prepare(id, undefined, options.prepare, options.replacement);
  }
  private async prepare(
    id: string,
    context?: OperationContext,
    preparation?: EnginePreparation,
    replacement?: Server,
  ): Promise<Server> {
    const before = this.repo.server(id);
    const server = replacement
      ? {
          ...replacement,
          installationComplete: false,
          entrypoint: undefined,
          launchArgsFile: undefined,
        }
      : before;
    if (server.installationComplete !== false)
      throw new Error('Installation of this server is already complete.');
    server.status = 'installing';
    server.error = undefined;
    this.repo.saveServer(server);
    try {
      const definition = engineDefinition(server.engine);
      const artifact = await this.versions.artifact(server.engine, server.version, server.build, {
        loaderVersion: server.loaderVersion,
        installerVersion: server.installerVersion,
      });
      const password = this.secrets.decrypt(this.repo.secret(id));
      const stage = server.path + '.install-staging';
      context?.checkpoint({
        destination: server.path,
        staging: stage,
        previous: server.path + '.install-previous',
        hadDestination: true,
        beforeProfile: before,
        beforeContent: this.repo.content(id),
      });
      await rm(stage, { force: true, recursive: true });
      if (replacement) await copyDirectory(before.path, stage, { signal: context?.signal });
      else await mkdir(stage);
      if (definition.edition === 'java')
        await atomicWrite(
          path.join(stage, 'eula.txt'),
          `# Explicit consent recorded at creation: ${server.createdAt}\n# https://www.minecraft.net/eula\neula=true\n`,
        );
      if (definition.runtimeType === 'java') {
        const runtime = await this.runtime.ensure(artifact.java, context?.signal);
        server.javaPath = runtime.path;
        server.runtimePath = runtime.path;
      } else if (definition.runtimeType === 'php') {
        if (!this.php) throw new Error('PHP runtime manager is unavailable.');
        server.runtimePath = (await this.php.ensure(server.version, context?.signal)).path;
      }
      server.javaMajor = artifact.java;
      server.minecraftVersion = artifact.minecraftVersion;
      server.loaderVersion = artifact.loaderVersion;
      server.installerVersion = artifact.installerVersion;
      context?.phase('downloading');
      const filename =
        artifact.kind === 'jar' && ['vanilla', 'paper'].includes(server.engine)
          ? 'server.jar'
          : artifact.filename;
      const cache = path.join(this.repo.root, 'cache', 'engines', id);
      await mkdir(cache, { recursive: true });
      const downloaded = path.join(cache, filename);
      await this.downloads.download(
        artifact.url,
        downloaded,
        `${server.engine} ${server.version}`,
        artifact.hash,
        undefined,
        context?.signal,
      );
      await copyFile(downloaded, path.join(stage, filename));
      await rm(downloaded);
      context?.signal.throwIfAborted();
      server.entrypoint = filename;
      if (artifact.kind === 'zip') {
        context?.phase('extracting');
        await extractZip(path.join(stage, filename), stage, 2 * 1024 ** 3, {
          signal: context?.signal,
          progress: (received) => context?.phase('extracting', received),
        });
        await rm(path.join(stage, filename));
        server.entrypoint = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
        if (process.platform !== 'win32') await chmod(path.join(stage, server.entrypoint), 0o700);
      }
      if (artifact.kind === 'installer') {
        context?.phase('applying');
        const args =
          server.engine === 'fabric'
            ? [
                '-jar',
                filename,
                'server',
                '-mcversion',
                server.version,
                '-loader',
                server.loaderVersion!,
                '-downloadMinecraft',
              ]
            : ['-jar', filename, '--installServer'];
        await installerProcess(server.javaPath, args, stage, context?.signal, (line) =>
          this.logger.write(`engine.install.output ${id}: ${line}`),
        );
        if (server.engine === 'fabric') server.entrypoint = 'fabric-server-launch.jar';
        else {
          const coordinates =
            server.engine === 'forge'
              ? `net/minecraftforge/forge/${server.build}`
              : `net/neoforged/neoforge/${server.build}`;
          const argsFile = `libraries/${coordinates}/${process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'}`;
          try {
            await stat(await containedPath(stage, argsFile));
            server.launchArgsFile = argsFile;
            server.entrypoint = undefined;
            await atomicWrite(
              path.join(stage, 'user_jvm_args.txt'),
              `-Xms${server.memoryMin}M\n-Xmx${server.memoryMax}M\n`,
            );
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            server.entrypoint = `forge-${server.build}.jar`;
            await stat(await containedPath(stage, server.entrypoint));
          }
        }
        await rm(path.join(stage, filename));
      }
      const oldPropertiesText = replacement
        ? await readFile(path.join(stage, 'server.properties'), 'utf8')
        : undefined;
      const oldProperties =
        oldPropertiesText === undefined ? undefined : parseProperties(oldPropertiesText);
      const rconPort = oldProperties?.['rcon.port']
        ? Number(oldProperties['rcon.port'])
        : definition.capabilities.rcon
          ? await this.rconPort(server)
          : 0;
      const props: Record<string, string> = {
        'server-port': String(server.port),
        'server-ip': '',
        'enable-rcon': 'true',
        'rcon.port': String(rconPort),
        'rcon.password': password,
        'broadcast-rcon-to-ops': 'false',
        gamemode: server.gamemode,
        difficulty: server.difficulty,
        'max-players': String(server.maxPlayers),
        'view-distance': String(server.viewDistance),
        'simulation-distance': String(server.simulationDistance),
        pvp: String(server.pvp),
        'white-list': String(server.whitelist),
        'online-mode': String(server.onlineMode),
        'level-seed': server.seed,
        'level-name': 'world',
        motd: server.motd,
        'enable-command-block': 'false',
        'spawn-protection': '16',
      };
      if(definition.edition==='java')for(const field of javaPropertyFields)if(field.key in props&&!supportsJavaProperty(server.version,field.key))delete props[field.key];
      if (definition.edition === 'bedrock') {
        server.ipv6Port = server.ipv6Port ?? 19133;
        for (const key of [
          'enable-rcon',
          'rcon.port',
          'rcon.password',
          'broadcast-rcon-to-ops',
          'simulation-distance',
          'pvp',
          'white-list',
          'motd',
          'enable-command-block',
          'spawn-protection',
        ])
          delete props[key];
        Object.assign(props, {
          'server-name': server.motd,
          'allow-list': String(server.whitelist),
          'server-portv6': String(server.ipv6Port ?? 19133),
          'view-distance': String(Math.max(5, server.viewDistance)),
          'tick-distance': '4',
        });
        await mkdir(path.join(stage, 'worlds'), { recursive: true });
        if (server.engine === 'bedrock') {
          await atomicWrite(path.join(stage, 'allowlist.json'), '[]\n');
          await atomicWrite(path.join(stage, 'permissions.json'), '[]\n');
        }
      }
      await atomicWrite(path.join(stage, 'server.properties'), serializeProperties(props));
      if (definition.contentFolder)
        await mkdir(path.join(stage, definition.contentFolder), { recursive: true });
      if (server.entrypoint) await stat(await containedPath(stage, server.entrypoint));
      if (oldPropertiesText !== undefined)
        await atomicWrite(path.join(stage, 'server.properties'), oldPropertiesText);
      const content = preparation ? await preparation(stage, server, context) : [];
      context?.signal.throwIfAborted();
      server.diskBytes = 0;
      server.installationComplete = true;
      server.status = 'stopped';
      if (context && this.jobs)
        await this.jobs.swap(
          context,
          {
            destination: server.path,
            staging: stage,
            previous: server.path + '.install-previous',
            beforeProfile: before,
            beforeContent: this.repo.content(id),
          },
          () => {
            this.repo.saveServer(server);
            for (const item of content) this.repo.saveContent(item);
          },
        );
      else {
        const { rename } = await import('node:fs/promises');
        await rm(server.path, { force: true, recursive: true });
        await rename(stage, server.path);
        this.repo.saveServer(server);
        for (const item of content) this.repo.saveContent(item);
      }
      this.repo.audit(
        'server.installed',
        `${server.name} · ${server.engine} ${server.version} build ${server.build}`,
        id,
      );
      return server;
    } catch (e) {
      if (replacement) {
        this.repo.saveServer(before);
        throw e;
      }
      server.status = 'crashed';
      server.error = readableError(e);
      this.repo.saveServer(server);
      throw e;
    }
  }
  private async rconPort(server: Server): Promise<number> {
    let port = await findAvailablePort(Math.min(server.port + 10, 65400));
    const used = new Set(this.repo.servers().map((s) => s.port));
    for (const other of this.repo.servers().filter((s) => s.id !== server.id)) {
      try {
        used.add(
          Number(
            parseProperties(await readFile(path.join(other.path, 'server.properties'), 'utf8'))[
              'rcon.port'
            ],
          ),
        );
      } catch (e) {
        this.logger.write('RCON port detection: ' + String(e));
      }
    }
    while (used.has(port)) port = await findAvailablePort(port + 1);
    return port;
  }
}
