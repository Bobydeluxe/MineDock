import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, stat, rm, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as tar from 'tar';
import { z } from 'zod';
import { Repository } from '../database/database';
import { DownloadManager, fetchJson } from '../minecraft/downloads';
import { extractZip } from '../backups/archive';
import { validateRelative, containedPath } from '../security/paths';
import { DomainError } from '../domain/errors';
import type { Runtime } from '../domain/types';
import type { OperationService } from '../core/operations';
import type { OperationContext } from '../domain/operations';
import { executableArchitectures, normalizeArchitecture } from './architecture';
import { guardRuntimeFolder } from './safety';
const exec = promisify(execFile);
export async function inspectJava(filename: string, signal?: AbortSignal): Promise<Runtime | null> {
  try {
    const result = await exec(filename, ['-XshowSettings:properties', '-version'], {
      timeout: 10000,
      windowsHide: true,
      signal,
    });
    const output = result.stderr + result.stdout;
    const match = /(?:openjdk|java) version "(\d+)(?:\.(\d+))?/i.exec(output);
    if (!match?.[1]) return null;
    const major = Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
    const arch = normalizeArchitecture(/^\s*os\.arch\s*=\s*(\S+)/m.exec(output)?.[1]);
    const binaries = await executableArchitectures(filename);
    if (arch && binaries.length && !binaries.includes(arch)) return null;
    return {
      major,
      path: filename,
      source: 'system',
      type: 'java',
      arch,
      version: /(?:openjdk|java) version "([^"\s]+)/i.exec(output)?.[1],
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn('Java detection failed:', (error as NodeJS.ErrnoException).code ?? 'PROBE');
    return null;
  }
}
export class RuntimeManager {
  private readonly pending = new Map<number, Promise<Runtime>>();
  constructor(
    private readonly repo: Repository,
    private readonly downloads: DownloadManager,
    private readonly jobs?: OperationService,
    private readonly guardReplacement?: (folder: string) => void,
    private readonly probe: typeof inspectJava = inspectJava,
  ) {}
  async list(signal?: AbortSignal): Promise<Runtime[]> {
    signal?.throwIfAborted();
    const managed: Runtime[] = [];
    for (const runtime of this.repo.runtimes()) {
      signal?.throwIfAborted();
      try {
        await stat(runtime.path);
        managed.push(runtime);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const candidates = new Set<string>();
    if (process.env.JAVA_HOME)
      candidates.add(
        path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
      );
    try {
      const located = await exec(process.platform === 'win32' ? 'where.exe' : 'which', ['java'], {
        windowsHide: true,
        timeout: 5000,
        signal,
      });
      for (const filename of located.stdout.trim().split(/\r?\n/).filter(Boolean))
        candidates.add(filename);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        Number((error as { code?: unknown }).code) !== 1
      )
        console.warn('Java path detection:', error);
    }
    const found = await Promise.all(
      [...candidates].map((filename) => inspectJava(filename, signal)),
    );
    return [
      ...managed,
      ...found.filter((r): r is Runtime => r !== null && !managed.some((m) => m.path === r.path)),
    ];
  }
  async ensure(major: number, signal?: AbortSignal): Promise<Runtime> {
    signal?.throwIfAborted();
    const existing = (await this.list(signal)).find((r) => r.major === major);
    signal?.throwIfAborted();
    if (existing) {
      const checked =
        existing.source === 'managed' ? await this.probe(existing.path, signal) : existing;
      signal?.throwIfAborted();
      if (checked?.major !== major || checked.arch !== process.arch)
        throw new DomainError(
          'RUNTIME',
          'The selected Java runtime is unhealthy or has an incompatible architecture. Verify and repair it first.',
        );
    }
    return existing ?? this.install(major, signal);
  }
  async install(major: number, signal?: AbortSignal): Promise<Runtime> {
    return this.installRuntime(major, signal, false);
  }
  async repair(major: number, signal?: AbortSignal): Promise<Runtime> {
    if (
      !this.repo
        .runtimes()
        .some((runtime) => runtime.major === major && runtime.source === 'managed')
    )
      throw new DomainError('RUNTIME', 'Only a registered managed Java runtime can be repaired.');
    return this.installRuntime(major, signal, true);
  }
  private async installRuntime(
    major: number,
    signal: AbortSignal | undefined,
    replacing: boolean,
  ): Promise<Runtime> {
    if (![8, 11, 16, 17, 21, 25].includes(major)) throw new Error('Unsupported Java version.');
    const active = this.pending.get(major);
    if (active) {
      if (replacing) throw new DomainError('BUSY', 'Wait for this runtime installation to finish.');
      return active;
    }
    const work = this.jobs
      ? this.jobs.run(
          replacing ? 'runtime.repair' : 'runtime.install',
          `Temurin Java ${major}`,
          undefined,
          (context) => this.provision(major, context, replacing),
          signal,
        )
      : this.provision(major, undefined, replacing);
    this.pending.set(major, work);
    try {
      return await work;
    } finally {
      this.pending.delete(major);
    }
  }
  private async provision(
    major: number,
    context?: OperationContext,
    replacing = false,
  ): Promise<Runtime> {
    const platform = { win32: 'windows', linux: 'linux', darwin: 'mac' }[
      process.platform as 'win32' | 'linux' | 'darwin'
    ];
    const architecture = { x64: 'x64', arm64: 'aarch64' }[os.arch() as 'x64' | 'arm64'];
    if (!platform || !architecture)
      throw new Error('Automatic Java installation is unavailable on this system.');
    const schema = z.array(
      z.object({
        binary: z.object({ package: z.object({ link: z.string().url(), checksum: z.string() }) }),
      }),
    );
    const assets = schema.parse(
      await fetchJson<unknown>(
        `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${architecture}&image_type=jre&os=${platform}&vendor=eclipse`,
        undefined,
        context?.signal,
      ),
    );
    const asset = assets[0];
    if (!asset) throw new Error('Java runtime is unavailable for this system.');
    const root = await containedPath(this.repo.root, 'runtimes');
    await mkdir(root, { recursive: true });
    const archive = path.join(root, `java-${major}${platform === 'windows' ? '.zip' : '.tar.gz'}`);
    const stage = path.join(root, `java-${major}.staging`);
    const destination = path.join(root, `java-${major}`);
    const previous = destination + '.previous';
    let hadDestination = await stat(destination).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    if (
      hadDestination &&
      !replacing &&
      !this.repo.runtimes().some((runtime) => runtime.major === major) &&
      (await readdir(destination)).length === 0
    ) {
      guardRuntimeFolder(this.repo, destination, this.guardReplacement, context?.id);
      await rmdir(destination);
      hadDestination = false;
    }
    if (hadDestination && !replacing)
      throw new DomainError(
        'RUNTIME',
        'This runtime already exists. Use runtime repair to replace it safely.',
      );
    guardRuntimeFolder(this.repo, destination, this.guardReplacement, context?.id);
    context?.checkpoint({ destination, staging: stage, previous, hadDestination });
    // This staging path is fully controlled by the application and contains no user data.
    await rm(stage, { force: true, recursive: true });
    await mkdir(stage);
    try {
      context?.phase('downloading');
      await this.downloads.download(
        asset.binary.package.link,
        archive,
        `Temurin Java ${major}`,
        {
          algorithm: 'sha256',
          value: asset.binary.package.checksum,
        },
        undefined,
        context?.signal,
      );
      context?.phase('extracting');
      if (platform === 'windows')
        await extractZip(archive, stage, 2 * 1024 ** 3, {
          signal: context?.signal,
          progress: (received) => context?.phase('extracting', received),
        });
      else {
        let bytes = 0,
          count = 0;
        let archiveError: unknown;
        await tar.t({
          file: archive,
          onReadEntry: (entry) => {
            try {
              context?.signal.throwIfAborted();
              validateRelative(entry.path.replace(/\/$/, ''));
              bytes += entry.size;
              if (
                bytes > 2 * 1024 ** 3 ||
                ++count > 50000 ||
                ![
                  'File',
                  'Directory',
                  'ExtendedHeader',
                  'GlobalExtendedHeader',
                  'SymbolicLink',
                  'Link',
                ].includes(entry.type)
              )
                throw new Error('Unsafe runtime archive.');
              if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
                const link = entry.linkpath;
                if (!link || path.posix.isAbsolute(link)) throw new Error('Unsafe runtime link.');
                const target = path.posix.normalize(
                  entry.type === 'Link'
                    ? link
                    : path.posix.join(path.posix.dirname(entry.path), link),
                );
                validateRelative(target);
              }
            } catch (error) {
              archiveError = error;
            }
          },
        });
        if (archiveError) throw archiveError;
        context?.signal.throwIfAborted();
        await tar.x({
          file: archive,
          cwd: stage,
          strict: true,
          preservePaths: false,
          filter: (_path, entry) => {
            context?.signal.throwIfAborted();
            return (
              'type' in entry && ['File', 'Directory', 'SymbolicLink', 'Link'].includes(entry.type)
            );
          },
        });
      }
      const search = async (folder: string): Promise<string | undefined> => {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          const child = path.join(folder, entry.name);
          if (
            entry.isFile() &&
            entry.name === (platform === 'windows' ? 'java.exe' : 'java') &&
            path.basename(folder) === 'bin'
          )
            return child;
          if (entry.isDirectory()) {
            const found = await search(child);
            if (found) return found;
          }
        }
        return undefined;
      };
      const java = await search(stage);
      context?.signal.throwIfAborted();
      if (!java) throw new Error('The downloaded runtime does not contain Java.');
      const detected = await this.probe(java, context?.signal);
      if (detected?.major !== major || detected.arch !== process.arch)
        throw new Error('Incorrect downloaded Java version or architecture.');
      guardRuntimeFolder(this.repo, destination, this.guardReplacement, context?.id);
      const runtime: Runtime = {
        major,
        path: path.join(destination, path.relative(stage, java)),
        source: 'managed',
        type: 'java',
        arch: detected.arch,
        version: detected.version,
      };
      if (context && this.jobs)
        await this.jobs.swap(context, { destination, staging: stage, previous }, () =>
          this.repo.saveRuntime(runtime),
        );
      else {
        if (hadDestination)
          throw new DomainError('RUNTIME', 'Runtime repair requires the operation journal.');
        await rename(stage, destination);
        this.repo.saveRuntime(runtime);
      }
      this.repo.audit(replacing ? 'runtime.repaired' : 'runtime.installed', `Java ${major}`);
      return runtime;
    } finally {
      await rm(archive, { force: true });
      await rm(stage, { force: true, recursive: true });
    }
  }
}
