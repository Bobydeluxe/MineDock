import { createHash } from 'node:crypto';
import { stat, mkdir, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../database/database';
import { OperationService } from '../core/operations';
import { RuntimeManager, inspectJava } from './runtime';
import { PhpRuntimeManager, inspectPhp } from './php';
import { containedPath } from '../security/paths';
import { DomainError, readableError } from '../domain/errors';
import {
  runtimeActionSchema,
  type RuntimeActionInput,
  type RuntimeEntry,
  type RuntimeHealth,
} from '../domain/runtimes';
import type { Runtime } from '../domain/types';
import { guardRuntimeFolder } from './safety';
const normalized = (value: string) =>
  process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
export class RuntimeMaintenance {
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
    private readonly java: RuntimeManager,
    private readonly php: PhpRuntimeManager,
    private readonly assertStopped: (id: string) => unknown,
    private readonly active: (id: string) => boolean,
  ) {}
  private entry(id: string, runtime: Runtime): RuntimeEntry {
    return {
      ...runtime,
      id,
      name:
        (runtime.type === 'php' ? 'PocketMine PHP ' : 'Java ') + (runtime.version ?? runtime.major),
      uses: this.repo
        .servers()
        .filter(
          (server) =>
            normalized(server.runtimePath ?? server.javaPath) === normalized(runtime.path),
        )
        .map((server) => ({
          id: server.id,
          name: server.name,
          active: server.status === 'installing' || this.active(server.id),
        })),
    };
  }
  async list(signal?: AbortSignal): Promise<RuntimeEntry[]> {
    signal?.throwIfAborted();
    const managed = this.repo
      .runtimes()
      .map((runtime) => this.entry('java:' + runtime.major, { ...runtime, type: 'java' }));
    for (const row of this.repo.db.prepare('SELECT id,metadata FROM managed_runtimes').all()) {
      const runtime = JSON.parse(String(row.metadata)) as Runtime;
      if (runtime.type === 'php') managed.push(this.entry(String(row.id), runtime));
    }
    const system = (await this.java.list(signal))
      .filter((runtime) => runtime.source === 'system')
      .map((runtime) =>
        this.entry(
          'system:' +
            createHash('sha256').update(normalized(runtime.path)).digest('hex').slice(0, 24),
          runtime,
        ),
      );
    return [...managed, ...system];
  }
  private async resolve(id: string, signal?: AbortSignal): Promise<RuntimeEntry> {
    const entry = (await this.list(signal)).find((runtime) => runtime.id === id);
    if (!entry) throw new DomainError('RUNTIME', 'This runtime is not registered or detected.');
    return entry;
  }
  private async managedFolder(entry: RuntimeEntry): Promise<string> {
    if (entry.source !== 'managed')
      throw new DomainError('RUNTIME', 'System runtimes cannot be changed or deleted by MineDock.');
    const folder = await containedPath(
      this.repo.root,
      path.join('runtimes', entry.type === 'php' ? entry.id : 'java-' + entry.major),
    );
    const relative = path.relative(folder, entry.path);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw new DomainError('PATH', 'The runtime path is outside its registered managed folder.');
    await containedPath(this.repo.root, path.relative(this.repo.root, entry.path));
    return folder;
  }
  private async check(entry: RuntimeEntry, signal?: AbortSignal): Promise<RuntimeHealth> {
    signal?.throwIfAborted();
    const health: RuntimeHealth = {
      id: entry.id,
      status: 'unavailable',
      checkedAt: new Date().toISOString(),
    };
    try {
      if (!(await stat(entry.path)).isFile()) return health;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        health.status = 'missing';
        return health;
      }
      throw error;
    }
    if (entry.source === 'managed') await this.managedFolder(entry);
    if (entry.type === 'php') {
      const php = await inspectPhp(entry.path, signal);
      if (!php) return health;
      health.version = php.version;
      health.arch = php.architecture;
      health.zts = php.zts;
      health.status =
        php.architecture !== process.arch
          ? 'wrongArchitecture'
          : !php.zts ||
              Number(php.version.split('.')[0]) !== entry.major ||
              (entry.requiredVersion && !php.version.startsWith(entry.requiredVersion + '.'))
            ? 'wrongVersion'
            : 'healthy';
    } else {
      const java = await inspectJava(entry.path, signal);
      if (!java) return health;
      health.version = java.version;
      health.arch = java.arch;
      health.status = !java.arch
        ? 'unavailable'
        : java.arch !== process.arch
          ? 'wrongArchitecture'
          : java.major !== entry.major
            ? 'wrongVersion'
            : 'healthy';
    }
    return health;
  }
  async health(id: string): Promise<RuntimeHealth> {
    return this.jobs.run('runtime.scan', 'Verify runtime', undefined, async (context) => {
      const entry = await this.resolve(id, context.signal);
      context.signal.throwIfAborted();
      context.phase('verifying');
      const health = await this.check(entry, context.signal);
      context.signal.throwIfAborted();
      return health;
    });
  }
  private confirm(entry: RuntimeEntry, input: RuntimeActionInput): void {
    if (input.confirmation !== entry.id)
      throw new DomainError('CONFIRM', 'Confirm the exact runtime identifier.');
    if (entry.source !== 'managed')
      throw new DomainError('RUNTIME', 'System runtimes cannot be changed or deleted by MineDock.');
    for (const use of entry.uses) this.assertStopped(use.id);
  }
  async repair(raw: RuntimeActionInput): Promise<void> {
    const input = runtimeActionSchema.parse(raw),
      entry = await this.resolve(input.id);
    this.confirm(entry, input);
    guardRuntimeFolder(this.repo, await this.managedFolder(entry));
    if (entry.type === 'php') await this.php.repair(entry.id);
    else await this.java.repair(entry.major);
  }
  async delete(raw: RuntimeActionInput): Promise<void> {
    const input = runtimeActionSchema.parse(raw),
      entry = await this.resolve(input.id);
    this.confirm(entry, input);
    const folder = await this.managedFolder(entry);
    guardRuntimeFolder(this.repo, folder);
    await mkdir(path.dirname(folder), { recursive: true });
    let replacement: RuntimeEntry | undefined;
    if (entry.uses.length) {
      if (!input.replacementId || input.replacementId === entry.id)
        throw new DomainError(
          'RUNTIME_IN_USE',
          'Select an explicit compatible replacement for every server using this runtime.',
        );
      replacement = await this.resolve(input.replacementId);
      if (
        replacement.type !== entry.type ||
        replacement.major !== entry.major ||
        (entry.type === 'php' &&
          (!entry.requiredVersion ||
            !(replacement.version ?? '').startsWith(entry.requiredVersion + '.'))) ||
        (await this.check(replacement)).status !== 'healthy'
      )
        throw new DomainError(
          'RUNTIME',
          'The selected replacement runtime is incompatible or unhealthy.',
        );
    }
    await this.jobs.run('runtime.delete', 'Delete runtime', undefined, async (context) => {
      const stage = folder + '.delete-' + context.id + '.staging',
        previous = folder + '.delete-' + context.id + '.previous';
      const hadDestination = await stat(folder).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      );
      context.checkpoint({ destination: folder, staging: stage, previous, hadDestination });
      await mkdir(stage);
      try {
        guardRuntimeFolder(this.repo, folder, undefined, context.id);
        for (const use of entry.uses) this.assertStopped(use.id);
        await this.jobs.swap(
          context,
          { destination: folder, staging: stage, previous, hadDestination },
          () => {
            for (const use of entry.uses) {
              const server = this.repo.server(use.id);
              this.repo.saveServer({
                ...server,
                runtimePath: replacement!.path,
                ...(entry.type === 'java' ? { javaPath: replacement!.path } : {}),
              });
            }
            if (entry.type === 'php')
              this.repo.db.prepare('DELETE FROM managed_runtimes WHERE id=?').run(entry.id);
            else
              this.repo.db.prepare('DELETE FROM runtime_versions WHERE major=?').run(entry.major);
            this.repo.audit('runtime.deleted', entry.name);
          },
        );
        try {
          await rmdir(folder);
        } catch (error) {
          this.repo.audit('runtime.cleanup.warning', readableError(error), undefined, false);
        }
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
}
