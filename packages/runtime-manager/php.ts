import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Repository } from '../database/database';
import { DownloadManager, fetchJson } from '../minecraft/downloads';
import { githubRelease, githubAssetHash } from '../minecraft/catalogs';
import { extractZip } from '../backups/archive';
import { containedPath } from '../security/paths';
import { extractRuntimeTar } from '../security/runtime-tar';
import { DomainError } from '../domain/errors';
import type { OperationService } from '../core/operations';
import type { OperationContext } from '../domain/operations';
import type { Runtime } from '../domain/types';
import { executableArchitectures, normalizeArchitecture } from './architecture';
import { guardRuntimeFolder } from './safety';
const exec = promisify(execFile);
/** Official Unix PHP archives retain a relative extension_dir; servers run in another folder. */
export async function phpRuntimeArguments(filename: string): Promise<string[]> {
  const directory = path.dirname(filename);
  if (process.platform === 'win32' || path.basename(directory) !== 'bin') return [];
  const root = path.dirname(directory),
    extensions = path.join(root, 'lib/php/extensions');
  try {
    const folders = (await readdir(extensions, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && /^(?:no-)?debug-(?:non-)?zts-\d+$/.test(entry.name),
    );
    if (folders.length !== 1) return [];
    const target = await containedPath(root, 'lib/php/extensions/' + folders[0]!.name);
    return ['-d', 'extension_dir=' + target];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
export async function inspectPhp(
  filename: string,
  signal?: AbortSignal,
  diagnostic?: (message: string) => void,
): Promise<{ version: string; zts: boolean; architecture: string } | null> {
  try {
    const output = await exec(
      filename,
      [
        ...(await phpRuntimeArguments(filename)),
        '-r',
        'echo json_encode(["version"=>PHP_VERSION,"zts"=>(bool)PHP_ZTS,"architecture"=>php_uname("m")]);',
      ],
      { windowsHide: true, timeout: 10000, signal, env: { ...process.env, PHPRC: '' } },
    );
    const detected = z
      .object({ version: z.string(), zts: z.boolean(), architecture: z.string() })
      .parse(JSON.parse(output.stdout));
    const architectures = await executableArchitectures(filename),
      reported = normalizeArchitecture(detected.architecture);
    if (reported && architectures.length && !architectures.includes(reported)) return null;
    return {
      ...detected,
      architecture: reported ?? (architectures.length === 1 ? architectures[0]! : 'unknown'),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    diagnostic?.(error instanceof Error ? error.message.slice(0, 1500) : 'PHP probe failed.');
    return null;
  }
}
export class PhpRuntimeManager {
  private readonly pending = new Map<string, Promise<Runtime>>();
  constructor(
    private readonly repo: Repository,
    private readonly downloads: DownloadManager,
    private readonly jobs: OperationService,
    private readonly guardReplacement?: (folder: string) => void,
  ) {}
  async ensure(serverVersion: string, signal?: AbortSignal): Promise<Runtime> {
    signal?.throwIfAborted();
    const info = z
      .object({ php_version: z.string(), php_download_url: z.string().url() })
      .parse(
        await fetchJson(
          `https://github.com/pmmp/PocketMine-MP/releases/download/${encodeURIComponent(serverVersion)}/build_info.json`,
          undefined,
          signal,
        ),
      );
    const tag =
      /^https:\/\/github\.com\/pmmp\/PHP-Binaries\/releases\/tag\/([a-zA-Z0-9._-]+)$/.exec(
        info.php_download_url,
      )?.[1];
    if (!tag) throw new DomainError('PHP', 'PocketMine does not list a supported PHP runtime.');
    const id = `php-${tag}-${process.platform}-${process.arch}`;
    const row = this.repo.db.prepare('SELECT metadata FROM managed_runtimes WHERE id=?').get(id);
    if (row) {
      const runtime = JSON.parse(String(row.metadata)) as Runtime;
      const checked = await inspectPhp(runtime.path, signal);
      if (
        checked?.zts &&
        checked.architecture === process.arch &&
        checked.version.startsWith(info.php_version + '.')
      )
        return runtime;
    }
    const active = this.pending.get(id);
    if (active) return active;
    const work = this.jobs.run(
      'runtime.install',
      `PocketMine PHP ${info.php_version}`,
      undefined,
      (context) => this.provision(id, tag, info.php_version, context),
      signal,
    );
    this.pending.set(id, work);
    try {
      return await work;
    } finally {
      this.pending.delete(id);
    }
  }
  async repair(id: string, signal?: AbortSignal): Promise<Runtime> {
    const row = this.repo.db.prepare('SELECT metadata FROM managed_runtimes WHERE id=?').get(id);
    if (!row) throw new DomainError('RUNTIME', 'This managed PHP runtime is not registered.');
    const runtime = JSON.parse(String(row.metadata)) as Runtime;
    if (!runtime.release || !runtime.requiredVersion)
      throw new DomainError(
        'RUNTIME',
        'Reinstall the server-required PHP runtime to recover its verified release metadata.',
      );
    if (this.pending.has(id))
      throw new DomainError('BUSY', 'Wait for this runtime installation to finish.');
    const work = this.jobs.run(
      'runtime.repair',
      'Repair PocketMine PHP',
      undefined,
      (context) => this.provision(id, runtime.release!, runtime.requiredVersion!, context),
      signal,
    );
    this.pending.set(id, work);
    try {
      return await work;
    } finally {
      this.pending.delete(id);
    }
  }
  private async provision(
    id: string,
    tag: string,
    version: string,
    context: OperationContext,
  ): Promise<Runtime> {
    const platform = { win32: 'Windows', linux: 'Linux', darwin: 'MacOS' }[
      process.platform as 'win32' | 'linux' | 'darwin'
    ];
    const architecture =
      process.arch === 'arm64' ? 'arm64' : process.platform === 'win32' ? 'x64' : 'x86_64';
    if (!platform || !['x64', 'arm64'].includes(process.arch))
      throw new DomainError('PLATFORM', 'PocketMine PHP is unavailable for this system.');
    const release = await githubRelease('pmmp/PHP-Binaries', tag, context.signal);
    const asset = release.assets.find(
      (a) =>
        a.name.startsWith('PHP-') &&
        a.name.includes(`-${platform}-${architecture}-`) &&
        /\.(zip|tar.gz)$/.test(a.name),
    );
    if (!asset)
      throw new DomainError(
        'PLATFORM',
        'The required PocketMine PHP runtime is unavailable for this architecture.',
      );
    const hash = githubAssetHash(asset.digest);
    if (!hash)
      throw new DomainError(
        'CHECKSUM',
        'The official PHP release does not provide a SHA-256 checksum.',
      );
    const root = await containedPath(this.repo.root, 'runtimes');
    await mkdir(root, { recursive: true });
    const destination = path.join(root, id),
      stage = destination + '.staging',
      archive = path.join(root, asset.name);
    guardRuntimeFolder(this.repo, destination, this.guardReplacement, context.id);
    const hadDestination = await stat(destination).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    context.checkpoint({
      destination,
      staging: stage,
      previous: destination + '.previous',
      hadDestination,
    });
    await rm(stage, { force: true, recursive: true });
    await mkdir(stage);
    try {
      context.phase('downloading');
      await this.downloads.download(
        asset.browser_download_url,
        archive,
        `PocketMine PHP ${version}`,
        hash,
        1024 ** 3,
        context.signal,
      );
      context.phase('extracting');
      if (asset.name.endsWith('.zip'))
        await extractZip(archive, stage, 2 * 1024 ** 3, { signal: context.signal });
      else await extractRuntimeTar(archive, stage, context.signal);
      const find = async (folder: string): Promise<string | undefined> => {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          context.signal.throwIfAborted();
          if (entry.isSymbolicLink()) continue;
          const file = path.join(folder, entry.name);
          if (entry.isFile() && entry.name === (process.platform === 'win32' ? 'php.exe' : 'php'))
            return file;
          if (entry.isDirectory()) {
            const found = await find(file);
            if (found) return found;
          }
        }
        return undefined;
      };
      const executable = await find(stage);
      let diagnostic = '';
      const inspected = executable
        ? await inspectPhp(executable, context.signal, (message) => {
            diagnostic = message;
          })
        : null;
      if (
        !executable ||
        !inspected?.zts ||
        inspected.architecture !== process.arch ||
        !inspected.version.startsWith(version + '.')
      )
        throw new DomainError(
          'PHP',
          'The downloaded PHP runtime does not match PocketMine requirements.' +
            (diagnostic ? '\n' + diagnostic : ''),
        );
      const runtime: Runtime = {
        path: path.join(destination, path.relative(stage, executable)),
        major: Number(version.split('.')[0]),
        source: 'managed',
        type: 'php',
        arch: inspected.architecture,
        version: inspected.version,
        requiredVersion: version,
        release: tag,
      };
      guardRuntimeFolder(this.repo, destination, this.guardReplacement, context.id);
      await this.jobs.swap(
        context,
        { destination, staging: stage, previous: destination + '.previous' },
        () =>
          this.repo.db
            .prepare(
              'INSERT INTO managed_runtimes VALUES(?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata',
            )
            .run(id, JSON.stringify(runtime)),
      );
      return runtime;
    } finally {
      await rm(stage, { force: true, recursive: true });
      await rm(archive, { force: true });
    }
  }
}
