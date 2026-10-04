import path from 'node:path';
import { lstat, realpath, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors';

export function validateRelative(relative: string): string {
  if (
    relative.includes('\0') ||
    relative.includes(':') ||
    path.isAbsolute(relative) ||
    /^[\\/]/.test(relative)
  )
    throw new DomainError('PATH', 'Path is not allowed.');
  const parts = relative.replace(/\\/g, '/').split('/');
  if (
    parts.some(
      (p) => p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p),
    )
  )
    throw new DomainError('PATH', 'Path is not allowed.');
  return parts.filter((p) => p && p !== '.').join(path.sep);
}
export async function containedPath(
  root: string,
  relative: string,
  allowRoot = false,
): Promise<string> {
  const safe = validateRelative(relative);
  if (!safe && !allowRoot) throw new DomainError('PATH', 'The root folder is protected.');
  const resolvedRoot = await realpath(root);
  let cursor = resolvedRoot;
  for (const part of safe.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) throw new DomainError('PATH', 'Symbolic links are not allowed.');
      const resolved = await realpath(cursor);
      const rel = path.relative(resolvedRoot, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel))
        throw new DomainError('PATH', 'Path is not allowed.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return cursor;
}
export async function atomicWrite(filename: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temp = filename + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, content, { mode: 0o600, flag: 'wx' });
    await rename(temp, filename);
  } finally {
    await rm(temp, { force: true });
  }
}
