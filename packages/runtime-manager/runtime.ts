import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, stat, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as tar from 'tar';
import { z } from 'zod';
import { Repository } from '../database/database';
import { DownloadManager, fetchJson } from '../minecraft/downloads';
import { extractZip } from '../backups/archive';
import { validateRelative } from '../security/paths';
import type { Runtime } from '../domain/types';
const exec = promisify(execFile);
export async function inspectJava(filename: string): Promise<Runtime | null> {
  try {
    const result = await exec(filename, ['-version'], { timeout: 10000, windowsHide: true });
    const match = /(?:openjdk|java) version "(\d+)(?:\.(\d+))?/i.exec(
      result.stderr + result.stdout,
    );
    if (!match?.[1]) return null;
    const major = Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
    return { major, path: filename, source: 'system' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn('Java detection:', (error as Error).message);
    return null;
  }
}
export class RuntimeManager {
  private readonly pending = new Map<number, Promise<Runtime>>();
  constructor(
    private readonly repo: Repository,
    private readonly downloads: DownloadManager,
  ) {}
  async list(): Promise<Runtime[]> {
    const managed: Runtime[] = [];
    for (const runtime of this.repo.runtimes()) {
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
      });
      for (const filename of located.stdout.trim().split(/\r?\n/).filter(Boolean))
        candidates.add(filename);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        Number((error as { code?: unknown }).code) !== 1
      )
        console.warn('Java path detection:', error);
    }
    const found = await Promise.all([...candidates].map(inspectJava));
    return [
      ...managed,
      ...found.filter((r): r is Runtime => r !== null && !managed.some((m) => m.path === r.path)),
    ];
  }
  async ensure(major: number): Promise<Runtime> {
    const existing = (await this.list()).find((r) => r.major === major);
    return existing ?? this.install(major);
  }
  async install(major: number): Promise<Runtime> {
    if (![8, 11, 16, 17, 21, 25].includes(major)) throw new Error('Unsupported Java version.');
    const active = this.pending.get(major);
    if (active) return active;
    const work = this.provision(major);
    this.pending.set(major, work);
    try {
      return await work;
    } finally {
      this.pending.delete(major);
    }
  }
  private async provision(major: number): Promise<Runtime> {
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
      ),
    );
    const asset = assets[0];
    if (!asset) throw new Error('Java runtime is unavailable for this system.');
    const root = path.join(this.repo.root, 'runtimes');
    await mkdir(root, { recursive: true });
    const archive = path.join(root, `java-${major}${platform === 'windows' ? '.zip' : '.tar.gz'}`);
    const stage = path.join(root, `java-${major}.staging`);
    const destination = path.join(root, `java-${major}`);
    // This staging path is fully controlled by the application and contains no user data.
    await rm(stage, { force: true, recursive: true });
    await mkdir(stage);
    try {
      await this.downloads.download(asset.binary.package.link, archive, `Temurin Java ${major}`, {
        algorithm: 'sha256',
        value: asset.binary.package.checksum,
      });
      if (platform === 'windows') await extractZip(archive, stage, 2 * 1024 ** 3);
      else {
        let bytes = 0;
        let archiveError: unknown;
        await tar.t({
          file: archive,
          onReadEntry: (entry) => {
            try {
              validateRelative(entry.path.replace(/\/$/, ''));
              bytes += entry.size;
              if (
                bytes > 2 * 1024 ** 3 ||
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
        await tar.x({
          file: archive,
          cwd: stage,
          strict: true,
          preservePaths: false,
          filter: (_path, entry) =>
            'type' in entry && ['File', 'Directory', 'SymbolicLink', 'Link'].includes(entry.type),
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
      if (!java) throw new Error('The downloaded runtime does not contain Java.');
      const detected = await inspectJava(java);
      if (detected?.major !== major) throw new Error('Incorrect downloaded Java version.');
      try {
        await stat(destination);
        throw new Error('This runtime already exists. Reuse it or remove the incomplete folder.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rename(stage, destination);
      const runtime: Runtime = {
        major,
        path: path.join(destination, path.relative(stage, java)),
        source: 'managed',
      };
      this.repo.saveRuntime(runtime);
      this.repo.audit('runtime.installed', `Java ${major}`);
      return runtime;
    } finally {
      await rm(archive, { force: true });
      await rm(stage, { force: true, recursive: true });
    }
  }
}
