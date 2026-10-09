import { readdir, lstat, mkdir, chmod } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { containedPath } from './paths';
import { DomainError } from '../domain/errors';
export interface CopyOptions {
  signal?: AbortSignal;
  maximumBytes?: number;
  maximumFiles?: number;
  progress?: (bytes: number) => void;
  exclude?: (relative: string) => boolean;
}
export async function copyRegularFile(
  source: string,
  destination: string,
  options: CopyOptions = {},
): Promise<number> {
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink())
    throw new DomainError('PATH', 'Only regular files can be copied.');
  const maximum = options.maximumBytes ?? 64 * 1024 ** 3;
  if (info.size > maximum) throw new DomainError('SIZE', 'The file exceeds the copy limit.');
  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maximum) callback(new DomainError('SIZE', 'The file exceeds the copy limit.'));
      else {
        options.progress?.(received);
        callback(null, chunk);
      }
    },
  });
  await pipeline(
    createReadStream(source, { signal: options.signal }),
    limit,
    createWriteStream(destination, { flags: 'wx', mode: info.mode & 0o777 }),
    { signal: options.signal },
  );
  const after = await lstat(source);
  if (
    received !== info.size ||
    after.size !== info.size ||
    after.mtimeMs !== info.mtimeMs ||
    after.isSymbolicLink()
  )
    throw new DomainError(
      'COPY_CHANGED',
      'A source file changed while it was being copied. Retry with a stopped source.',
    );
  if (process.platform !== 'win32') await chmod(destination, info.mode & 0o777);
  return received;
}
/** Follow no links, reject collisions, and bound work before applying a prepared directory. */
export async function copyDirectory(
  source: string,
  destination: string,
  options: CopyOptions = {},
): Promise<void> {
  if (!(await lstat(source)).isDirectory() || (await lstat(source)).isSymbolicLink())
    throw new DomainError('PATH', 'Choose a regular folder without symbolic links.');
  await mkdir(destination, { recursive: true });
  let bytes = 0,
    count = 0;
  const maximum = options.maximumBytes ?? 64 * 1024 ** 3;
  const walk = async (relative: string): Promise<void> => {
    const folder = await containedPath(source, relative, true);
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      options.signal?.throwIfAborted();
      if (++count > (options.maximumFiles ?? 200000))
        throw new DomainError('SIZE', 'The folder contains too many entries.');
      const child = path.join(relative, entry.name),
        file = await containedPath(source, child),
        target = await containedPath(destination, child),
        info = await lstat(file);
      if (options.exclude?.(child)) continue;
      if (info.isDirectory()) {
        await mkdir(target);
        await walk(child);
      } else if (info.isFile())
        bytes += await copyRegularFile(file, target, {
          signal: options.signal,
          maximumBytes: maximum - bytes,
          progress: (received) => options.progress?.(bytes + received),
        });
      else throw new DomainError('PATH', 'Only regular files and folders can be copied.');
    }
  };
  await walk('');
}
