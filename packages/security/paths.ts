import path from 'node:path';
import { lstat, realpath, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { realpathSync, lstatSync } from 'node:fs';
import { DomainError } from '../domain/errors';

const systemAliases =
  process.platform === 'darwin'
    ? ['/var', '/tmp', '/etc'].flatMap((alias) => {
        const target = '/private' + alias;
        try {
          return realpathSync(alias) === target ? [[alias, target] as const] : [];
        } catch {
          return [];
        }
      })
    : [];
/** Normalize verified macOS system aliases only; user-created links remain subject to containment checks. */
export function resolveSystemPath(...parts: string[]): string {
  const resolved = path.resolve(...parts);
  for (const [alias, target] of systemAliases)
    if (resolved === alias || resolved.startsWith(alias + path.sep))
      return target + resolved.slice(alias.length);
  if (process.platform === 'win32' && /~\d+(?:[\\/]|$)/.test(resolved)) {
    const tail: string[] = [];
    let existing = resolved;
    while (true) {
      try {
        lstatSync(existing);
        for (let cursor = existing; cursor !== path.dirname(cursor); cursor = path.dirname(cursor))
          if (lstatSync(cursor).isSymbolicLink()) return resolved;
        return path.join(realpathSync.native(existing), ...tail);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'ENOENT' ||
          existing === path.dirname(existing)
        )
          return resolved;
        tail.unshift(path.basename(existing));
        existing = path.dirname(existing);
      }
    }
  }
  return resolved;
}

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
