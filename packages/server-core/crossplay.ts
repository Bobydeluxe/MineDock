import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parseDocument } from 'yaml';
import { satisfies, coerce } from 'semver';
import { Repository } from '../database/database';
import { ManagedContentService } from '../marketplace/content';
import { ModrinthCatalog } from '../marketplace/modrinth';
import { GeyserCatalog } from '../marketplace/geyser';
import { DomainError } from '../domain/errors';
import { engineDefinition } from '../domain/engines';
import {
  crossplaySchema,
  type CrossplayInput,
  type CrossplayStatus,
  type CrossplayVersions,
} from '../domain/crossplay';
import type { Server } from '../domain/types';
import { containedPath, atomicWrite } from '../security/paths';
import { readZipEntries } from '../security/zip-reader';
import { checkPort } from '../networking/network';
import { sha256 } from '../backups/archive';
const geyserId = 'wKkoqHrH',
  floodgateId = 'bWrNNfkb',
  viaVersionId = 'P1OZGk5p';
export class CrossplayService {
  private readonly modrinth = new ModrinthCatalog();
  private readonly plugins = new GeyserCatalog();
  constructor(
    private readonly repo: Repository,
    private readonly content: ManagedContentService,
  ) {}
  private config(server: Server): string {
    return server.engine === 'fabric'
      ? 'config/Geyser-Fabric/config.yml'
      : server.engine === 'neoforge'
        ? 'config/Geyser-NeoForge/config.yml'
        : 'plugins/Geyser-Spigot/config.yml';
  }
  async versions(server: Server, signal?: AbortSignal): Promise<CrossplayVersions> {
    if (!engineDefinition(server.engine).capabilities.crossplay || server.javaMajor < 21)
      return { geyser: [], floodgate: [] };
    const mods = engineDefinition(server.engine).capabilities.mods;
    const geyser = mods
      ? (
          await this.modrinth.allVersions(
            geyserId,
            engineDefinition(server.engine).contentLoaders,
            signal,
          )
        )
          .filter((v) => v.releaseType !== 'alpha' && v.releaseType !== 'snapshot')
          .slice(0, 1)
          .filter((v) => v.gameVersions.includes(server.version))
      : (await this.modrinth.versions(server, geyserId, signal))
          .filter((v) => v.releaseType !== 'alpha' && v.releaseType !== 'snapshot')
          .slice(0, 1);
    const floodgate = mods
      ? await this.modrinth.versions(server, floodgateId, signal)
      : await this.plugins.versions(server, 'floodgate', signal);
    return { geyser, floodgate };
  }
  async status(server: Server): Promise<CrossplayStatus> {
    const supported = engineDefinition(server.engine).capabilities.crossplay,
      items = this.repo.content(server.id);
    const result: CrossplayStatus = {
      supported,
      geyserInstalled: false,
      floodgateInstalled: false,
      configured: false,
    };
    if (!supported) return result;
    const folder = engineDefinition(server.engine).contentFolder!;
    for (const item of items.filter((item) => item.enabled)) {
      if (![geyserId, floodgateId, 'floodgate'].includes(item.projectId)) continue;
      try {
        const filename = await containedPath(server.path, path.join(folder, item.filename));
        await stat(filename);
        if (item.sha256 && (await sha256(filename)) !== item.sha256)
          throw new DomainError(
            'CONTENT_CHANGED',
            'A crossplay file was changed outside MineDock.',
          );
        if (item.projectId === geyserId) result.geyserInstalled = true;
        else result.floodgateInstalled = true;
      } catch (error) {
        result.error =
          error instanceof Error ? error.message : 'Unable to inspect crossplay files.';
      }
    }
    result.configPath = this.config(server);
    try {
      const filename = await containedPath(server.path, result.configPath);
      if ((await stat(filename)).size > 2 * 1024 ** 2)
        throw new DomainError('SIZE', 'The Geyser configuration is too large.');
      const document = parseDocument(await readFile(filename, 'utf8'));
      if (document.errors.length)
        throw new DomainError('YAML', 'The Geyser configuration contains invalid YAML.');
      const value = z
        .object({
          bedrock: z.object({ port: z.number().int().min(1024).max(65535) }),
          java: z.object({ 'auth-type': z.enum(['online', 'offline', 'floodgate']) }).optional(),
          remote: z.object({ 'auth-type': z.enum(['online', 'offline', 'floodgate']) }).optional(),
        })
        .parse(document.toJS({ maxAliasCount: 100 }));
      result.port = value.bedrock.port;
      result.authType = (value.java ?? value.remote)?.['auth-type'];
      result.configured =
        result.geyserInstalled &&
        !!result.authType &&
        (result.authType !== 'floodgate' || result.floodgateInstalled);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        result.error =
          error instanceof Error ? error.message : 'Unable to inspect Geyser configuration.';
    }
    return result;
  }
  async configure(server: Server, raw: CrossplayInput): Promise<void> {
    const input = crossplaySchema.parse(raw);
    if (input.confirmation !== server.name)
      throw new DomainError('CONFIRM', 'The server name does not match.');
    if (!engineDefinition(server.engine).capabilities.crossplay)
      throw new DomainError(
        'COMPATIBILITY',
        'This engine does not support this Geyser integration.',
      );
    if (server.javaMajor < 21) throw new DomainError('JAVA', 'Geyser requires Java 21 or newer.');
    if (!(await checkPort(input.port, 'udp')))
      throw new DomainError('PORT', 'The Bedrock UDP port is already in use.');
    if (
      this.repo
        .servers()
        .some(
          (other) =>
            other.id !== server.id &&
            (other.crossplayPort === input.port ||
              (engineDefinition(other.engine).protocol === 'udp' &&
                (other.port === input.port || other.ipv6Port === input.port))),
        )
    )
      throw new DomainError('PORT', 'The Bedrock UDP port is reserved by another server.');
    const versions = await this.versions(server);
    const geyser = versions.geyser.find((v) => v.id === input.geyserVersion);
    if (!geyser)
      throw new DomainError(
        'COMPATIBILITY',
        'No currently supported Geyser version matches this server.',
      );
    const mods = engineDefinition(server.engine).capabilities.mods;
    const selections = [
      {
        catalog: this.modrinth as import('../marketplace/content').ContentCatalog,
        projectId: geyserId,
        versionId: geyser.id,
      },
    ];
    if (input.floodgate) {
      const flood = versions.floodgate.find((v) => v.id === input.floodgateVersion);
      if (!flood)
        throw new DomainError('COMPATIBILITY', 'No compatible Floodgate version is selected.');
      selections.push({
        catalog: mods ? this.modrinth : this.plugins,
        projectId: mods ? floodgateId : 'floodgate',
        versionId: flood.id,
      });
    }
    if (!mods) {
      const latest = geyser.gameVersions
        .map((value) => coerce(value))
        .filter((v) => v !== null)
        .sort((a, b) => b.compare(a))[0];
      if (latest && coerce(server.version)?.compare(latest) !== 0) {
        const via = (await this.modrinth.versions(server, viaVersionId)).find(
          (v) => v.releaseType === 'release',
        );
        if (!via)
          throw new DomainError(
            'DEPENDENCIES',
            'A compatible ViaVersion plugin is required for this Geyser version.',
          );
        selections.push({ catalog: this.modrinth, projectId: viaVersionId, versionId: via.id });
      }
    }
    await this.content.bundle(server, selections, async (stage, context) => {
      const folder = engineDefinition(server.engine).contentFolder!;
      const geyserFile = geyser.files.find((file) => file.primary) ?? geyser.files[0];
      if (!geyserFile) throw new DomainError('CONTENT', 'Geyser has no downloadable file.');
      const archive = await containedPath(stage, path.join(folder, geyserFile.filename));
      const metadata = await readZipEntries(
        archive,
        ['config.yml', 'fabric.mod.json', 'org/geysermc/geyser/configuration/GeyserConfig.class'],
        2 * 1024 ** 2,
        context?.signal,
      );
      if (server.engine === 'fabric') {
        const fabric = z
          .object({
            depends: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
          })
          .parse(JSON.parse(metadata.get('fabric.mod.json')?.toString('utf8') ?? '{}'));
        for (const id of ['fabricloader', 'java']) {
          const predicate = fabric.depends?.[id];
          const range = Array.isArray(predicate) ? predicate.join(' || ') : predicate;
          const actual = id === 'java' ? `${server.javaMajor}.0.0` : server.loaderVersion;
          if (range && (!actual || !satisfies(actual, range, { includePrerelease: true })))
            throw new DomainError('COMPATIBILITY', `The Geyser mod requires ${id} ${range}.`);
        }
      }
      const config = await containedPath(stage, this.config(server));
      let source: string;
      try {
        source = await readFile(config, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const defaults = metadata.get('config.yml');
        if (defaults) source = defaults.toString('utf8');
        else if (metadata.has('org/geysermc/geyser/configuration/GeyserConfig.class'))
          source = 'bedrock: {}\njava: {}\n';
        else
          throw new DomainError('CONFIG', 'Unable to determine the Geyser configuration format.');
      }
      const document = parseDocument(source);
      if (document.errors.length)
        throw new DomainError('YAML', 'The Geyser configuration contains invalid YAML.');
      const section = document.has('java') ? 'java' : 'remote';
      document.setIn(['bedrock', 'address'], '0.0.0.0');
      document.setIn(['bedrock', 'port'], input.port);
      document.setIn(['bedrock', 'clone-remote-port'], false);
      document.setIn([section, 'address'], '127.0.0.1');
      document.setIn([section, 'port'], server.port);
      document.setIn(
        [section, 'auth-type'],
        input.floodgate ? 'floodgate' : server.onlineMode ? 'online' : 'offline',
      );
      await mkdir(path.dirname(config), { recursive: true });
      await atomicWrite(config, document.toString());
      context?.signal.throwIfAborted();
      return { crossplayPort: input.port };
    });
    this.repo.audit(
      'crossplay.configured',
      `Geyser UDP ${input.port}; Floodgate ${input.floodgate}`,
      server.id,
    );
  }
}
