import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readdir, readFile, lstat, stat, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../database/database';
import { OperationService } from './operations';
import type { SecretStore } from '../security/secrets';
import { containedPath, atomicWrite, resolveSystemPath } from '../security/paths';
import { copyDirectory } from '../security/copy';
import { readZipEntries } from '../security/zip-reader';
import { zipDirectory } from '../backups/archive';
import { DomainError } from '../domain/errors';
import { parseProperties, serializeProperties } from '../domain/properties';
import { engineDefinition } from '../domain/engines';
import { javaForVersion, javaForPaper } from '../minecraft/versions';
import { neoforgeMinecraftVersion } from '../minecraft/catalogs';
import type { RuntimeManager } from '../runtime-manager/runtime';
import type { PhpRuntimeManager } from '../runtime-manager/php';
import { checkPort, findAvailablePort } from '../networking/network';
import type { Server, Engine } from '../domain/types';
import {
  importServerSchema,
  type ImportServerInput,
  type ImportServerPreview,
} from '../domain/imports';
interface Ticket {
  preview: ImportServerPreview;
  fingerprint: string;
  expires: number;
}
export class ServerImportService {
  private readonly tickets = new Map<string, Ticket>();
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
    private readonly runtime: RuntimeManager,
    private readonly php: PhpRuntimeManager,
    private readonly secrets: SecretStore,
    private readonly reserved: () => Promise<Set<number>>,
  ) {}
  private async text(root: string, name: string): Promise<string | undefined> {
    try {
      const file = await containedPath(root, name);
      if ((await stat(file)).size > 2 * 1024 ** 2)
        throw new DomainError('SIZE', 'Import metadata exceeds the 2 MB limit.');
      return readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
  private async fingerprint(root: string): Promise<string> {
    const entries = await readdir(root, { withFileTypes: true });
    const values = [];
    const critical = entries.filter(
      (entry) =>
        entry.isFile() &&
        (/\.(jar|phar|properties|json|txt)$/.test(entry.name) ||
          entry.name.startsWith('bedrock_server')),
    );
    if (critical.length > 200) throw new DomainError('SIZE', 'Too many server metadata files.');
    for (const entry of critical) {
      const info = await lstat(await containedPath(root, entry.name));
      values.push([entry.name, info.size, info.mtimeMs]);
    }
    for (const prefix of [
      'libraries/net/neoforged/neoforge',
      'libraries/net/minecraftforge/forge',
    ]) {
      const builds = await readdir(await containedPath(root, prefix)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        },
      );
      if (builds.length > 100)
        throw new DomainError('SIZE', 'Too many loader builds to preview safely.');
      for (const build of builds)
        for (const args of ['win_args.txt', 'unix_args.txt']) {
          const name = `${prefix}/${build}/${args}`,
            content = await this.text(root, name);
          if (content !== undefined)
            values.push([name, createHash('sha256').update(content).digest('hex')]);
        }
    }
    return createHash('sha256').update(JSON.stringify(values.sort())).digest('hex');
  }
  async preview(source: string): Promise<ImportServerPreview> {
    const root = resolveSystemPath(source);
    if (path.parse(root).root === root || (await lstat(root)).isSymbolicLink())
      throw new DomainError('PATH', 'Choose a dedicated server folder without symbolic links.');
    if (resolveSystemPath(await realpath(root)) !== root)
      throw new DomainError('PATH', 'The selected folder contains a symbolic link.');
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.length > 10000)
      throw new DomainError('SIZE', 'The selected folder contains too many entries.');
    const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const props = parseProperties((await this.text(root, 'server.properties')) ?? '');
    delete props['rcon.password'];
    let engine: Engine | undefined,
      version: string | undefined,
      loaderVersion: string | undefined,
      entrypoint: string | undefined,
      launchArgsFile: string | undefined;
    const warnings: string[] = [];
    const launchOptions: NonNullable<ImportServerPreview['launchOptions']> = [];
    let ambiguous = false;
    if (names.includes('bedrock_server.exe') || names.includes('bedrock_server')) {
      engine = 'bedrock';
      entrypoint = names.includes('bedrock_server.exe') ? 'bedrock_server.exe' : 'bedrock_server';
      version = /bedrock-server-[\w-]*([\d.]+)/.exec(path.basename(root))?.[1];
    } else if (names.some((name) => /pocketmine.*\.phar$/i.test(name))) {
      engine = 'pocketmine';
      entrypoint = names.find((name) => /pocketmine.*\.phar$/i.test(name));
      version = /([5-9]\.\d+\.\d+)/.exec(entrypoint ?? '')?.[1];
    }
    for (const [family, prefix] of [
      ['neoforge', 'libraries/net/neoforged/neoforge'],
      ['forge', 'libraries/net/minecraftforge/forge'],
    ] as const) {
      try {
        const directory = await containedPath(root, prefix);
        const builds = await readdir(directory);
        if (builds.length > 100)
          throw new DomainError('SIZE', 'Too many loader builds to preview safely.');
        for (const build of builds) {
          const args = `${prefix}/${build}/${process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'}`;
          try {
            await stat(await containedPath(root, args));
            const detectedVersion =
              family === 'forge' ? build.split('-')[0]! : neoforgeMinecraftVersion(build);
            if (!/^\d+(?:\.\d+){1,4}$/.test(detectedVersion)) {
              warnings.push('An unrecognized loader version was ignored.');
              continue;
            }
            launchOptions.push({
              engine: family,
              loaderVersion: build,
              launchArgsFile: args,
              version: detectedVersion,
            });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const script =
      (await this.text(root, process.platform === 'win32' ? 'run.bat' : 'run.sh'))
        ?.split(/\r?\n/)
        .filter((line) => !/^\s*(#|rem\b|::)/i.test(line))
        .join('\n')
        .replaceAll('\\', '/') ?? '';
    const referenced = launchOptions.filter((option) => script.includes(option.launchArgsFile));
    const selected =
      referenced.length === 1
        ? referenced[0]
        : launchOptions.length === 1
          ? launchOptions[0]
          : undefined;
    if (selected && !engine) {
      engine = selected.engine;
      version = selected.version;
      loaderVersion = selected.loaderVersion;
      launchArgsFile = selected.launchArgsFile;
    } else if (launchOptions.length > 0) {
      ambiguous = true;
      warnings.push(
        'Multiple or conflicting launch configurations were found. Select and verify the engine and launch arguments explicitly.',
      );
    }
    if (names.includes('fabric-server-launch.jar')) {
      if (launchArgsFile || launchOptions.length > 0) ambiguous = true;
      engine = 'fabric';
      entrypoint = 'fabric-server-launch.jar';
      try {
        const loaders = await readdir(
          await containedPath(root, 'libraries/net/fabricmc/fabric-loader'),
        );
        loaderVersion = loaders.length === 1 ? loaders[0] : undefined;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const jars = names.filter(
      (name) => /\.jar$/i.test(name) && !/(installer|launcher|plugins)/i.test(name),
    );
    if (!engine) {
      const purpur = jars.find((name) => /purpur/i.test(name)),
        paper = jars.find((name) => /paper/i.test(name));
      if (purpur) {
        engine = 'purpur';
        entrypoint = purpur;
      } else if (paper) {
        engine = 'paper';
        entrypoint = paper;
      } else if (names.includes('server.jar')) entrypoint = 'server.jar';
      else if (jars.length === 1) entrypoint = jars[0];
    }
    if (entrypoint?.endsWith('.jar')) {
      try {
        const metadata = await readZipEntries(
          await containedPath(root, entrypoint),
          [
            'version.json',
            'META-INF/MANIFEST.MF',
            'META-INF/versions.list',
            'META-INF/download-context',
          ],
          1024 ** 2,
        );
        const manifest = metadata.get('META-INF/MANIFEST.MF')?.toString('utf8') ?? '';
        if (!engine) {
          if (/purpur/i.test(manifest)) engine = 'purpur';
          else if (/paperclip|papermc/i.test(manifest)) engine = 'paper';
          else if (/net\.minecraft|ServerMain|BundlerMain/.test(manifest)) engine = 'vanilla';
        }
        const json = metadata.get('version.json');
        if (json) {
          const parsed = JSON.parse(json.toString('utf8')) as { id?: string };
          if (parsed.id && /^[\w.-]{1,40}$/.test(parsed.id)) version = parsed.id;
        }
        const bundled = metadata.get('META-INF/versions.list')?.toString('utf8');
        version ??= bundled
          ?.split(/\r?\n/)
          .map((line) => line.split('\t')[1])
          .find((value) => !!value && /^[\d.]+$/.test(value));
        version ??= /\b((?:1\.\d{1,2}|2[6-9]\.\d{1,2})(?:\.\d{1,2})?)\b/.exec(
          metadata.get('META-INF/download-context')?.toString('utf8') ?? entrypoint,
        )?.[1];
      } catch (error) {
        warnings.push(
          error instanceof Error ? error.message : 'Unable to inspect server JAR metadata.',
        );
      }
    }
    const log = await this.text(root, 'logs/latest.log').catch((error) => {
      warnings.push(error instanceof Error ? error.message : 'Unable to inspect server log.');
      return undefined;
    });
    if (
      engine === 'paper' &&
      /(?:running|This server is running) Purpur|Purpur version/i.test(log ?? '')
    )
      engine = 'purpur';
    version ??= /Starting minecraft server version ([\w.-]+)/i.exec(log ?? '')?.[1];
    if (!version)
      warnings.push(
        'The server version could not be detected. Enter and verify it before importing.',
      );
    if (!engine)
      warnings.push(
        'The server engine could not be detected with certainty. Select it before importing.',
      );
    if (ambiguous) {
      engine = undefined;
      version = undefined;
      loaderVersion = undefined;
      entrypoint = undefined;
      launchArgsFile = undefined;
      if (!warnings.some((warning) => warning.startsWith('Multiple or conflicting')))
        warnings.push(
          'Multiple or conflicting launch configurations were found. Select and verify the engine and launch arguments explicitly.',
        );
    }
    const definition = engine ? engineDefinition(engine) : undefined;
    const worldRoot =
      definition?.worldFolder === 'worlds' ? await containedPath(root, 'worlds') : root;
    const worlds: string[] = [];
    try {
      for (const entry of await readdir(worldRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        try {
          await stat(await containedPath(worldRoot, entry.name + '/level.dat'));
          worlds.push(entry.name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const count = async (folder: string) => {
      try {
        return (await readdir(await containedPath(root, folder), { withFileTypes: true })).filter(
          (entry) => entry.isFile() && /\.(jar|phar)(\.disabled)?$/i.test(entry.name),
        ).length;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw error;
      }
    };
    const preview: ImportServerPreview = {
      token: randomUUID(),
      sourcePath: root,
      name: path.basename(root).slice(0, 60),
      engine,
      version,
      loaderVersion,
      entrypoint,
      launchArgsFile,
      launchOptions,
      entrypoints: [
        ...jars,
        ...names.filter((name) => /\.phar$/i.test(name) || name.startsWith('bedrock_server')),
      ],
      properties: props,
      worlds,
      plugins: await count('plugins'),
      mods: await count('mods'),
      confidence: engine && version && !ambiguous ? 'detected' : 'uncertain',
      warnings,
      eulaAccepted: /^\s*eula\s*=\s*true\s*$/m.test((await this.text(root, 'eula.txt')) ?? ''),
    };
    for (const [key, value] of this.tickets)
      if (value.expires < Date.now()) this.tickets.delete(key);
    if (this.tickets.size >= 20) this.tickets.delete(this.tickets.keys().next().value!);
    this.tickets.set(preview.token, {
      preview,
      fingerprint: await this.fingerprint(root),
      expires: Date.now() + 15 * 60000,
    });
    return preview;
  }
  async import(raw: ImportServerInput): Promise<Server> {
    const input = importServerSchema.parse(raw),
      ticket = this.tickets.get(input.token);
    if (!ticket || ticket.expires < Date.now())
      throw new DomainError(
        'IMPORT_PREVIEW',
        'The import preview expired. Select the source folder again.',
      );
    const preview = ticket.preview,
      source = preview.sourcePath;
    if (input.confirmation !== input.name)
      throw new DomainError('CONFIRM', 'The server name does not match.');
    if ((await this.fingerprint(source)) !== ticket.fingerprint)
      throw new DomainError(
        'IMPORT_CHANGED',
        'The source changed after the preview. Review it again.',
      );
    const definition = engineDefinition(input.engine);
    if (!definition.platforms.includes(process.platform))
      throw new DomainError(
        'PLATFORM',
        'This server engine is unavailable on this operating system.',
      );
    if (this.repo.servers().some((server) => resolveSystemPath(server.path) === source))
      throw new DomainError('IMPORT_DUPLICATE', 'This folder is already managed by MineDock.');
    const reserved = await this.reserved();
    if (definition.protocol === 'udp' && input.port === (input.ipv6Port ?? 19133))
      throw new DomainError('PORT', 'Choose different IPv4 and IPv6 UDP ports.');
    const sourcePort = Number(preview.properties['server-port']);
    if (
      Number.isInteger(sourcePort) &&
      sourcePort >= 1024 &&
      sourcePort <= 65535 &&
      !(await checkPort(sourcePort, definition.protocol))
    )
      throw new DomainError(
        'IMPORT_RUNNING',
        'The source server port is occupied. Stop the source server before importing.',
      );
    const sourceV6 = Number(preview.properties['server-portv6']);
    if (
      definition.protocol === 'udp' &&
      Number.isInteger(sourceV6) &&
      sourceV6 >= 1024 &&
      sourceV6 <= 65535 &&
      !(await checkPort(sourceV6, 'udp', true))
    )
      throw new DomainError(
        'IMPORT_RUNNING',
        'The source IPv6 port is occupied. Stop the source server before importing.',
      );
    if (reserved.has(input.port) || !(await checkPort(input.port, definition.protocol)))
      throw new DomainError(
        'PORT',
        'The server port is already in use. Stop the source server first.',
      );
    if (definition.edition === 'java' && !preview.eulaAccepted && !input.acceptEula)
      throw new DomainError(
        'EULA',
        'Read and accept the Minecraft EULA before importing this Java server.',
      );
    if (!input.copy && definition.edition === 'java' && !preview.eulaAccepted)
      throw new DomainError(
        'EULA',
        'Managing the original folder requires an already accepted EULA. Choose a copy to record new consent.',
      );
    if (input.launchArgsFile) await stat(await containedPath(source, input.launchArgsFile));
    else {
      if (!input.entrypoint)
        throw new DomainError('IMPORT_ENTRY', 'Choose the server entrypoint before importing.');
      await stat(await containedPath(source, input.entrypoint));
    }
    if (
      input.engine === 'bedrock' &&
      input.entrypoint !== (process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server')
    )
      throw new DomainError(
        'PLATFORM',
        'The imported Bedrock executable does not match this operating system.',
      );
    const id = randomUUID(),
      destination = input.copy ? path.join(this.repo.settings().serverRoot, id) : source;
    for (const target of [this.repo.root, ...(input.copy ? [destination] : [])]) {
      const relative = path.relative(source, target);
      if (
        relative === '' ||
        (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
      )
        throw new DomainError(
          'PATH',
          'The source folder must not contain MineDock data or the import destination.',
        );
    }
    const at = new Date().toISOString();
    const number = (key: string, fallback: number) => {
      const value = Number(preview.properties[key]);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const profile: Server = {
      id,
      name: input.name,
      engine: input.engine,
      version: input.version,
      loaderVersion: input.loaderVersion,
      entrypoint: input.launchArgsFile ? undefined : input.entrypoint,
      launchArgsFile: input.launchArgsFile,
      path: destination,
      javaMajor:
        definition.runtimeType === 'java'
          ? input.engine === 'paper' || input.engine === 'purpur'
            ? javaForPaper(input.version)
            : javaForVersion(input.version)
          : 0,
      javaPath: '',
      build: input.loaderVersion ?? 'imported',
      port: input.port,
      ipv6Port: definition.protocol === 'udp' ? (input.ipv6Port ?? 19133) : undefined,
      memoryMin: input.memoryMin,
      memoryMax: input.memoryMax,
      difficulty:
        (['peaceful', 'easy', 'normal', 'hard'] as const).find(
          (value) => value === preview.properties.difficulty,
        ) ?? 'normal',
      gamemode:
        (['survival', 'creative', 'adventure', 'spectator'] as const).find(
          (value) => value === preview.properties.gamemode,
        ) ?? 'survival',
      maxPlayers: number('max-players', 20),
      viewDistance: number('view-distance', 10),
      simulationDistance: number('simulation-distance', 8),
      pvp: preview.properties.pvp !== 'false',
      whitelist: (preview.properties['white-list'] ?? preview.properties['allow-list']) === 'true',
      onlineMode: preview.properties['online-mode'] !== 'false',
      seed: preview.properties['level-seed'] ?? '',
      motd: preview.properties.motd ?? preview.properties['server-name'] ?? input.name,
      autoStart: false,
      autoRestart: false,
      status: 'stopped',
      createdAt: at,
      updatedAt: at,
      cpu: 0,
      memory: 0,
      players: [],
      diskBytes: 0,
      imported: true,
      externalFolder: !input.copy,
      installationComplete: true,
    };
    const secret = randomBytes(32).toString('base64url');
    this.repo.db
      .prepare(
        'INSERT INTO import_history VALUES(?,NULL,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(input.token, JSON.stringify({ preview, approvedOriginal: !input.copy, createdAt: at }));
    const result = await this.jobs.run(
      'server.import',
      'Import existing server',
      undefined,
      async (context) => {
        if (definition.runtimeType === 'java')
          profile.javaPath = (await this.runtime.ensure(profile.javaMajor, context.signal)).path;
        else if (definition.runtimeType === 'php')
          profile.runtimePath = (await this.php.ensure(profile.version, context.signal)).path;
        context.signal.throwIfAborted();
        const props = parseProperties((await this.text(source, 'server.properties')) ?? '');
        props['server-port'] = String(input.port);
        if (profile.ipv6Port) {
          if (reserved.has(profile.ipv6Port) || !(await checkPort(profile.ipv6Port, 'udp', true)))
            throw new DomainError('PORT', 'The IPv6 UDP port is already in use.');
          props['server-portv6'] = String(profile.ipv6Port);
        }
        if (definition.capabilities.rcon) {
          let rcon = await findAvailablePort(25575);
          while (reserved.has(rcon) || rcon === profile.port)
            rcon = await findAvailablePort(rcon + 1);
          Object.assign(props, {
            'enable-rcon': 'true',
            'rcon.password': secret,
            'rcon.port': String(rcon),
          });
        }
        const commit = () => {
          this.repo.addServer(profile, this.secrets.encrypt(secret));
          this.repo.db.prepare('UPDATE import_history SET server_id=?,metadata=? WHERE id=?').run(
            id,
            JSON.stringify({
              preview,
              approvedOriginal: !input.copy,
              createdAt: at,
              importedAt: new Date().toISOString(),
              copy: input.copy,
              serverId: id,
            }),
            input.token,
          );
        };
        if (input.copy) {
          await mkdir(path.dirname(destination), { recursive: true });
          const stage = destination + '.import-staging',
            previous = destination + '.import-previous';
          context.checkpoint({ destination, staging: stage, previous, hadDestination: false });
          try {
            context.phase('extracting');
            await copyDirectory(source, stage, {
              signal: context.signal,
              progress: (received) => context.phase('extracting', received),
            });
            await atomicWrite(path.join(stage, 'server.properties'), serializeProperties(props));
            if (definition.edition === 'java' && !preview.eulaAccepted)
              await atomicWrite(
                path.join(stage, 'eula.txt'),
                `# Consent recorded by MineDock at ${at}\neula=true\n`,
              );
            await this.jobs.swap(context, { destination, staging: stage, previous }, commit);
          } finally {
            await rm(stage, { recursive: true, force: true });
          }
        } else {
          const safety = path.join(this.repo.root, 'import-safety');
          await mkdir(safety, { recursive: true });
          context.phase('extracting');
          const archive = path.join(safety, input.token + '-' + context.id + '.zip');
          try {
            await zipDirectory(source, archive, undefined, {
              signal: context.signal,
              progress: (received) => context.phase('extracting', received),
              preserveServerProperties: true,
            });
          } catch (error) {
            await rm(archive, { force: true });
            throw error;
          }
          const destination = await containedPath(source, 'server.properties'),
            stage = destination + '.minedock-' + input.token + '.staging',
            previous = destination + '.minedock-' + input.token + '.previous';
          const checkpoint = {
            destination,
            staging: stage,
            previous,
            importTicket: input.token,
            hadDestination: await stat(destination).then(
              () => true,
              (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return false;
                throw error;
              },
            ),
          };
          context.checkpoint(checkpoint);
          try {
            await atomicWrite(stage, serializeProperties(props));
            await this.jobs.swap(context, checkpoint, commit);
          } finally {
            await rm(stage, { force: true });
          }
        }
        return profile;
      },
    );
    this.tickets.delete(input.token);
    this.repo.audit(
      'server.imported',
      `${input.name}; ${input.copy ? 'copied source' : 'original folder with safety archive'}`,
      id,
    );
    return result;
  }
}
