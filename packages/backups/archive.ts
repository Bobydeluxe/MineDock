import yauzl from 'yauzl';
import yazl from 'yazl';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, readdir, stat, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { containedPath, validateRelative } from '../security/paths';
import { parseProperties, serializeProperties } from '../domain/properties';

export async function sha256(filename: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
export async function zipDirectory(
  root: string,
  destination: string,
  metadata?: string,
): Promise<void> {
  const zip = new yazl.ZipFile();
  const complete = pipeline(
    zip.outputStream,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
  );
  const walk = async (relative: string): Promise<void> => {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      validateRelative(child);
      if (metadata && child === '.minedock-backup.json') continue;
      if (entry.isSymbolicLink()) throw new Error('A symbolic link prevents a safe backup.');
      if (entry.isDirectory()) {
        zip.addEmptyDirectory(child.replace(/\\/g, '/'));
        await walk(child);
      } else if (entry.isFile() && entry.name !== 'session.lock' && !entry.name.endsWith('.lck')) {
        const filename = await containedPath(root, child);
        if (child === 'server.properties') {
          const props = parseProperties(await readFile(filename, 'utf8'));
          delete props['rcon.password'];
          zip.addBuffer(Buffer.from(serializeProperties(props)), child);
        } else zip.addFile(filename, child.replace(/\\/g, '/'));
      }
    }
  };
  try {
    await walk('');
    if (metadata) zip.addBuffer(Buffer.from(metadata), '.minedock-backup.json');
    zip.end();
    await complete;
  } catch (error) {
    (zip.outputStream as import('node:stream').Readable).destroy(
      error instanceof Error ? error : new Error(String(error)),
    );
    await complete.catch(() => undefined);
    throw error;
  }
}
export async function extractZip(
  archive: string,
  root: string,
  maximum = 20 * 1024 ** 3,
): Promise<void> {
  await mkdir(root, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    yauzl.open(archive, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error('Unreadable archive.'));
        return;
      }
      let total = 0;
      let count = 0;
      let settled = false;
      const fail = (e: unknown): void => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(e);
      };
      zip.on('error', fail);
      zip.on('end', () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on('entry', (entry: yauzl.Entry) => {
        void (async () => {
          if (++count > 200000) throw new Error('Archive contains too many files.');
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (mode === 0o120000) throw new Error('Archive contains a symbolic link.');
          const name = entry.fileName.replace(/\/$/, '');
          validateRelative(name);
          const target = await containedPath(root, name);
          total += entry.uncompressedSize;
          if (total > maximum || entry.uncompressedSize > maximum)
            throw new Error('Archive is too large.');
          if (entry.fileName.endsWith('/')) await mkdir(target, { recursive: true });
          else {
            await mkdir(path.dirname(target), { recursive: true });
            const input = await new Promise<import('node:stream').Readable>((res, rej) =>
              zip.openReadStream(entry, (err, stream) =>
                err || !stream ? rej(err ?? new Error('Unreadable archive entry.')) : res(stream),
              ),
            );
            // O_EXCL also rejects duplicate entries and file/directory collisions.
            await pipeline(input, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
          }
          zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  });
}
export async function directorySize(root: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(filename);
    else if (entry.isFile()) {
      const info = await lstat(filename);
      if (!info.isSymbolicLink()) total += info.size;
    }
  }
  return total;
}
export async function ensureFile(filename: string): Promise<void> {
  if (!(await stat(filename)).isFile()) throw new Error('Expected a file.');
}
