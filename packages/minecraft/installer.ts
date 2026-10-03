import path from 'node:path';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { Repository } from '../database/database';
import { RuntimeManager } from '../runtime-manager/runtime';
import { MinecraftVersionService } from './versions';
import { DownloadManager } from './downloads';
import { Logger } from '../core/logger';
import type { SecretStore } from '../security/secrets';
import { atomicWrite } from '../security/paths';
import { findAvailablePort } from '../networking/network';
import { parseProperties, serializeProperties } from '../domain/properties';
import { readableError } from '../domain/errors';
import type { Server } from '../domain/types';
export class ServerInstaller {
  constructor(
    private readonly repo: Repository,
    private readonly runtime: RuntimeManager,
    private readonly versions: MinecraftVersionService,
    private readonly downloads: DownloadManager,
    private readonly secrets: SecretStore,
    private readonly logger: Logger,
  ) {}
  async install(id: string): Promise<Server> {
    const server = this.repo.server(id);
    if (server.installationComplete !== false)
      throw new Error('Installation of this server is already complete.');
    server.status = 'installing';
    server.error = undefined;
    this.repo.saveServer(server);
    try {
      const artifact = await this.versions.artifact(server.engine, server.version, server.build);
      const password = this.secrets.decrypt(this.repo.secret(id));
      await atomicWrite(
        path.join(server.path, 'eula.txt'),
        `# Explicit consent recorded at creation: ${server.createdAt}\n# https://www.minecraft.net/eula\neula=true\n`,
      );
      const runtime = await this.runtime.ensure(artifact.java);
      server.javaPath = runtime.path;
      server.javaMajor = artifact.java;
      await this.downloads.download(
        artifact.url,
        path.join(server.path, 'server.jar'),
        `${server.engine} ${server.version}`,
        artifact.hash,
      );
      const rconPort = await this.rconPort(server);
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
      await atomicWrite(path.join(server.path, 'server.properties'), serializeProperties(props));
      await mkdir(path.join(server.path, server.engine === 'paper' ? 'plugins' : 'mods'), {
        recursive: true,
      });
      server.diskBytes = (await stat(path.join(server.path, 'server.jar'))).size;
      server.installationComplete = true;
      server.status = 'stopped';
      this.repo.saveServer(server);
      this.repo.audit(
        'server.installed',
        `${server.name} · ${server.engine} ${server.version} build ${server.build}`,
        id,
      );
      return server;
    } catch (e) {
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
