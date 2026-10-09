import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { processUsage, clearProcessUsage } from './metrics';
import { Repository } from '../database/database';
import { EventBus } from '../core/events';
import { Logger } from '../core/logger';
import { analyzeCrash } from '../core/crash';
import { checkPort } from '../networking/network';
import { parseProperties } from '../domain/properties';
import { DomainError } from '../domain/errors';
import { redact, type SecretStore } from '../security/secrets';
import { rconCommand } from '../rcon/client';
import type { Server, LogLine } from '../domain/types';
import { engineDefinition } from '../domain/engines';
import { containedPath } from '../security/paths';
import { PlayerService } from '../core/players';
import { phpRuntimeArguments } from '../runtime-manager/php';
import { jvmArguments } from '../domain/performance';
export async function startCommand(
  server: Server,
): Promise<{ executable: string; args: string[] }> {
  const engine = engineDefinition(server.engine);
  if (engine.runtimeType === 'native')
    return {
      executable: await containedPath(
        server.path,
        server.entrypoint ??
          (process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server'),
      ),
      args: [],
    };
  if (engine.runtimeType === 'php')
    return {
      executable: server.runtimePath ?? '',
      args: [
        ...(await phpRuntimeArguments(server.runtimePath ?? '')),
        '-d',
        'phar.readonly=0',
        await containedPath(server.path, server.entrypoint ?? 'PocketMine-MP.phar'),
        '--no-wizard',
        '--disable-ansi',
      ],
    };
  const args = [
    `-Xms${server.memoryMin}M`,
    `-Xmx${server.memoryMax}M`,
    ...jvmArguments(server.jvm, server.javaMajor),
  ];
  if (server.launchArgsFile) {
    await stat(await containedPath(server.path, server.launchArgsFile));
    args.push('@' + server.launchArgsFile, 'nogui');
  } else {
    const entry = server.entrypoint ?? 'server.jar';
    await stat(await containedPath(server.path, entry));
    args.push('-jar', entry, 'nogui');
  }
  return { executable: server.runtimePath ?? server.javaPath, args };
}

interface Instance {
  process: ChildProcessWithoutNullStreams;
  stopping: boolean;
  ready: boolean;
  ended: Promise<void>;
  startupTimer: NodeJS.Timeout;
  lines: ReturnType<typeof createInterface>[];
}
export interface ServerRunner {
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  command(id: string, command: string): Promise<string>;
}
export type ProcessLauncher = (
  executable: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;
export class ServerProcessSupervisor implements ServerRunner {
  readonly playerData: PlayerService;
  private readonly instances = new Map<string, Instance>();
  private readonly buffers = new Map<string, LogLine[]>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private readonly crashes = new Map<string, number[]>();
  private readonly orphaned = new Map<string, number>();
  private seq = 0;
  private metricsBusy = false;
  private ticks = 0;
  private readonly interval: NodeJS.Timeout;
  private closing = false;
  constructor(
    private readonly repo: Repository,
    private readonly secrets: SecretStore,
    private readonly bus: EventBus,
    private readonly logger: Logger,
    private readonly launch: ProcessLauncher = (file, args, options) =>
      spawn(file, args, { ...options, stdio: 'pipe' }),
    private readonly requestStart?: (id: string) => Promise<void>,
    private readonly preflight?: (server: Server) => Promise<void>,
  ) {
    this.playerData = new PlayerService(
      repo,
      (id, command) => this.command(id, command),
      (id) => this.isRunning(id),
    );
    // Never kill a persisted PID: after a crash it may have been reused by another application.
    for (const server of repo.servers()) {
      this.playerData.endSessions(server.id, true);
      if (server.pid) {
        try {
          process.kill(server.pid, 0);
          this.orphaned.set(server.id, server.pid);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ESRCH')
            this.orphaned.set(server.id, server.pid);
        }
      }
      const recovered = {
        ...server,
        status:
          this.orphaned.has(server.id) || server.installationComplete === false
            ? 'crashed'
            : 'stopped',
        pid: undefined,
        startedAt: undefined,
        players: [],
        cpu: 0,
        memory: 0,
        error: this.orphaned.has(server.id)
          ? 'An old process may still be running. Close it or restart your computer before managing this server.'
          : server.installationComplete === false
            ? 'Installation is incomplete. Retry installation from this server.'
            : undefined,
      } satisfies Server;
      repo.saveServer(recovered);
    }
    this.interval = setInterval(() => {
      void this.sample().catch((e) => logger.write(String(e), true));
    }, 5000);
    this.interval.unref();
  }
  logs(id: string): LogLine[] {
    return this.buffers.get(id) ?? [];
  }
  isRunning(id: string): boolean {
    return this.instances.has(id);
  }
  isOrphaned(id: string): boolean {
    const pid = this.orphaned.get(id);
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return true;
      this.orphaned.delete(id);
      const server = this.repo.server(id);
      server.status = 'stopped';
      server.error = undefined;
      this.repo.saveServer(server);
      return false;
    }
  }
  private log(id: string, text: string, error = false): void {
    // ANSI escape bytes are expected in Minecraft console output.
    // eslint-disable-next-line no-control-regex
    const cleaned = redact(text.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 16000));
    this.playerData.observeLog(id, cleaned);
    const level =
      error || /\bERROR\b|Exception/.test(cleaned)
        ? 'ERROR'
        : /\bWARN\b/.test(cleaned)
          ? 'WARN'
          : /\bDEBUG\b/.test(cleaned)
            ? 'DEBUG'
            : /<[^>]+>/.test(cleaned)
              ? 'CHAT'
              : 'INFO';
    const line: LogLine = { seq: ++this.seq, at: new Date().toISOString(), level, text: cleaned };
    const lines = this.buffers.get(id) ?? [];
    lines.push(line);
    if (lines.length > 5000) lines.splice(0, lines.length - 5000);
    this.buffers.set(id, lines);
    this.bus.emit({ type: 'log', serverId: id, line });
    const instance = this.instances.get(id);
    if (
      instance &&
      !instance.ready &&
      engineDefinition(this.repo.server(id).engine).readyPattern.test(text)
    ) {
      instance.ready = true;
      clearTimeout(instance.startupTimer);
      const server = this.repo.server(id);
      server.status = 'running';
      this.repo.saveServer(server);
      this.repo.audit('server.started', server.name, id);
    }
    const joined =
      /(?:^|[\s:])([A-Za-z0-9_.]{1,32}) joined the game/.exec(text)?.[1] ??
      /Player connected: (.{1,32}?), xuid:/.exec(text)?.[1];
    const left =
      /(?:^|[\s:])([A-Za-z0-9_.]{1,32}) left the game/.exec(text)?.[1] ??
      /Player disconnected: (.{1,32}?), xuid:/.exec(text)?.[1];
    if (joined || left) {
      const server = this.repo.server(id);
      if (joined) {
        server.players = [...new Set([...server.players, joined])];
        this.repo.seenPlayer(id, joined);
      }
      if (left) server.players = server.players.filter((p) => p !== left);
      this.repo.saveServer(server);
    }
  }
  async start(id: string): Promise<void> {
    if (this.closing) throw new DomainError('CLOSING', 'The application is shutting down.');
    if (this.isOrphaned(id))
      throw new DomainError(
        'ORPHAN',
        'An old process must be closed before managing this server. Restart your computer if needed.',
      );
    if (this.instances.has(id)) throw new DomainError('RUNNING', 'This server is already running.');
    const server = this.repo.server(id);
    const engine = engineDefinition(server.engine);
    await this.preflight?.(server);
    const runtime = server.runtimePath ?? server.javaPath;
    if (
      runtime &&
      this.repo.operations().some((operation) => {
        if (
          !/^runtime\.(?:install|repair|delete)$/.test(operation.kind) ||
          (!operation.recoverable &&
            ['completed', 'failed', 'cancelled'].includes(operation.status))
        )
          return false;
        const checkpoint = this.repo.operationCheckpoint(operation.id);
        if (!checkpoint) return false;
        const relative = path.relative(checkpoint.destination, runtime);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
      })
    )
      throw new DomainError(
        'RUNTIME_BUSY',
        'Resolve or finish this runtime operation before starting its servers.',
      );
    if (
      server.status === 'installing' ||
      (engine.runtimeType === 'java' && !server.javaPath) ||
      server.installationComplete === false
    )
      throw new DomainError('INSTALL', 'Server installation is not complete.');
    const props = parseProperties(
      await readFile(path.join(server.path, 'server.properties'), 'utf8'),
    );
    if (props['online-mode'] !== 'true')
      this.repo.audit('server.warning', 'Minecraft account verification is disabled.', id);
    if (!(await checkPort(server.port, engine.protocol)))
      throw new DomainError(
        'PORT',
        `Port ${server.port} is already in use. Change it in settings.`,
      );
    if (engine.capabilities.rcon && !(await checkPort(Number(props['rcon.port']))))
      throw new DomainError('PORT', `RCON port ${props['rcon.port']} is already in use.`);
    if (server.crossplayPort && !(await checkPort(server.crossplayPort, 'udp')))
      throw new DomainError('PORT', 'The Geyser UDP port is already in use.');
    if (
      engine.protocol === 'udp' &&
      server.ipv6Port &&
      !(await checkPort(server.ipv6Port, 'udp', true))
    )
      throw new DomainError('PORT', 'The IPv6 UDP port is already in use.');
    const launch = await startCommand(server);
    await stat(launch.executable);
    if (
      engine.edition === 'java' &&
      !/eula\s*=\s*true/.test(await readFile(path.join(server.path, 'eula.txt'), 'utf8'))
    )
      throw new DomainError(
        'EULA',
        'You must accept the Minecraft EULA before starting the server.',
      );
    clearTimeout(this.retryTimers.get(id));
    this.retryTimers.delete(id);
    server.status = 'starting';
    server.error = undefined;
    server.exitCode = undefined;
    server.startedAt = new Date().toISOString();
    this.repo.saveServer(server);
    const child = this.launch(launch.executable, launch.args, {
      cwd: server.path,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        ...(engine.runtimeType === 'php' ? { PHPRC: '' } : {}),
        ...(engine.runtimeType === 'native' && process.platform === 'linux'
          ? { LD_LIBRARY_PATH: server.path }
          : {}),
      },
    });
    let ended!: () => void;
    const completion = new Promise<void>((resolve) => {
      ended = resolve;
    });
    const startupTimer = setTimeout(() => {
      this.log(id, 'Startup exceeded 5 minutes. Stopping for safety.', true);
      void this.stop(id).catch((e) => this.logger.write(String(e), true));
    }, 300000);
    const instance: Instance = {
      process: child,
      stopping: false,
      ready: false,
      ended: completion,
      startupTimer,
      lines: [],
    };
    this.instances.set(id, instance);
    child.stdin.on('error', (e) => this.logger.write(`Process input ${id}: ${String(e)}`, true));
    server.pid = child.pid;
    this.repo.saveServer(server);
    for (const [stream, isError] of [
      [child.stdout, false],
      [child.stderr, true],
    ] as const) {
      const lines = createInterface({ input: stream });
      instance.lines.push(lines);
      lines.on('line', (line) => this.log(id, line, isError));
    }
    child.on('error', (e) => {
      this.log(id, e.message, true);
      this.logger.write(`Process ${id}: ${e.message}`, true);
    });
    child.once('close', (code, signal) => {
      clearTimeout(startupTimer);
      instance.lines.forEach((line) => line.close());
      this.instances.delete(id);
      this.playerData.endSessions(id);
      clearProcessUsage(child.pid);
      const latest = this.repo.server(id);
      latest.pid = undefined;
      latest.startedAt = undefined;
      latest.cpu = 0;
      latest.memory = 0;
      latest.players = [];
      latest.exitCode = code ?? undefined;
      const crashed = !instance.stopping && (code !== 0 || !instance.ready);
      latest.status = crashed ? 'crashed' : 'stopped';
      if (crashed)
        latest.error = analyzeCrash(
          this.logs(id)
            .slice(-100)
            .map((l) => l.text)
            .join('\n'),
          latest.javaMajor,
        );
      this.repo.saveServer(latest);
      this.repo.audit(
        crashed ? 'server.crashed' : 'server.stopped',
        `${latest.name} (exit ${code ?? signal})${latest.error ? ': ' + latest.error : ''}`,
        id,
        !crashed,
      );
      ended();
      if (crashed && latest.autoRestart && !this.closing) {
        const history = [
          ...(this.crashes.get(id) ?? []).filter((t) => t > Date.now() - 10 * 60 * 1000),
          Date.now(),
        ];
        this.crashes.set(id, history);
        if (history.length < 3) {
          const delay = 15000 * 2 ** (history.length - 1);
          this.log(id, `Automatic restart in ${delay / 1000} seconds (${history.length}/3).`);
          this.retryTimers.set(
            id,
            setTimeout(() => {
              void (this.requestStart ? this.requestStart(id) : this.start(id)).catch((e) => {
                this.repo.audit('server.restart_failed', String(e), id, false);
                this.logger.write(String(e), true);
              });
            }, delay),
          );
        } else {
          latest.error += ' Three crashes in ten minutes: automatic restart suspended.';
          this.repo.saveServer(latest);
        }
      }
    });
    // Only report success once the OS confirms the process was spawned.
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  }
  async stop(id: string): Promise<void> {
    clearTimeout(this.retryTimers.get(id));
    this.retryTimers.delete(id);
    const instance = this.instances.get(id);
    if (!instance) return;
    if (instance.stopping) {
      await instance.ended;
      return;
    }
    instance.stopping = true;
    clearTimeout(instance.startupTimer);
    const server = this.repo.server(id);
    server.status = 'stopping';
    this.repo.saveServer(server);
    if (instance.ready && engineDefinition(server.engine).capabilities.rcon) {
      try {
        await this.command(id, 'save-all flush');
      } catch (e) {
        this.log(id, `RCON unavailable: ${String(e)}`);
      }
    }
    instance.process.stdin.write('stop\n');
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      instance.ended,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 30000);
      }),
    ]);
    clearTimeout(timer);
    if (this.instances.has(id)) {
      this.log(
        id,
        'Graceful shutdown exceeded 30 seconds. The process was forcefully terminated.',
        true,
      );
      if (!instance.process.kill('SIGKILL'))
        throw new DomainError('STOP', 'The system could not terminate the process.');
      let forceTimer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          instance.ended,
          new Promise<never>((_resolve, reject) => {
            forceTimer = setTimeout(
              () =>
                reject(
                  new DomainError(
                    'STOP',
                    'The process did not confirm shutdown. Check your task manager.',
                  ),
                ),
              10000,
            );
          }),
        ]);
      } finally {
        clearTimeout(forceTimer);
      }
    }
  }
  async restart(id: string): Promise<void> {
    await this.stop(id);
    await this.start(id);
  }
  async command(id: string, command: string): Promise<string> {
    if (!this.instances.has(id))
      throw new DomainError('STOPPED', 'Start the server before sending a command.');
    const server = this.repo.server(id);
    if (!engineDefinition(server.engine).capabilities.rcon) {
      if (/[\r\n\0]/.test(command) || Buffer.byteLength(command) > 4096)
        throw new DomainError('COMMAND', 'Invalid command.');
      await new Promise<void>((resolve, reject) =>
        this.instances
          .get(id)!
          .process.stdin.write(command + '\n', (error) => (error ? reject(error) : resolve())),
      );
      return 'Command sent. See the console for its response.';
    }
    const props = parseProperties(
      await readFile(path.join(server.path, 'server.properties'), 'utf8'),
    );
    return rconCommand(
      Number(props['rcon.port']),
      this.secrets.decrypt(this.repo.secret(id)),
      command,
    );
  }
  async players(id: string): Promise<string[]> {
    if (!this.instances.get(id)?.ready) return [];
    if (!engineDefinition(this.repo.server(id).engine).capabilities.rcon)
      return this.repo.server(id).players;
    const output = await this.command(id, 'list');
    const names = (output.split(':').slice(1).join(':').trim() || '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => /^[A-Za-z0-9_.]{1,32}$/.test(n));
    this.playerData.observeOnline(id, names);
    const server = this.repo.server(id);
    server.players = names;
    this.repo.saveServer(server);
    names.forEach((name) => this.repo.seenPlayer(id, name));
    return names;
  }
  private async sample(): Promise<void> {
    if (this.metricsBusy || this.closing || !this.instances.size) return;
    this.metricsBusy = true;
    this.ticks++;
    try {
      for (const [id, instance] of this.instances) {
        if (!instance.process.pid) continue;
        try {
          const usage = await processUsage(instance.process.pid);
          if (!this.instances.has(id)) continue;
          const server = this.repo.server(id);
          this.playerData.observeOnline(id, server.players);
          server.cpu = usage.cpu;
          server.memory = usage.memory;
          this.repo.saveServer(server);
          const metric = {
            at: new Date().toISOString(),
            cpu: usage.cpu,
            memory: usage.memory,
            players: server.players.length,
          };
          if (this.ticks % 3 === 0) this.repo.addMetric(id, metric);
          this.bus.emit({ type: 'metric', serverId: id, metric });
          if (this.ticks % 4 === 0 && instance.ready && !instance.stopping) await this.players(id);
        } catch (e) {
          if (this.instances.has(id)) this.logger.write(`Metrics ${id}: ${String(e)}`, true);
        }
      }
    } finally {
      this.metricsBusy = false;
    }
  }
  async close(): Promise<void> {
    this.closing = true;
    clearInterval(this.interval);
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    await Promise.all([...this.instances.keys()].map((id) => this.stop(id)));
    clearProcessUsage();
    // Allow an in-flight sampling operation to settle before closing SQLite.
    while (this.metricsBusy) await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
