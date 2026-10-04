import path from 'node:path';
import * as tar from 'tar';
import { lstat, symlink, link } from 'node:fs/promises';
import { validateRelative, containedPath } from './paths';

/** Official native runtimes may contain internal library links. Server ZIP imports still reject all links. */
export async function extractRuntimeTar(
  archive: string,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  let bytes = 0,
    count = 0,
    failure: unknown;
  const allowed = ['File', 'Directory', 'SymbolicLink', 'Link'],
    seen = new Map<string, string>(),
    links = new Map<string, { type: string; raw: string; target: string }>();
  const relative = (name: string): string => {
    if (name.includes('\\')) throw new Error('Unsafe runtime archive path.');
    const normalized = name.replace(/^(?:\.\/)+/, '').replace(/\/$/, '');
    if (normalized === '.') return '';
    if (normalized.length > 4096 || normalized.split('/').length > 64)
      throw new Error('Unsafe runtime archive path depth.');
    validateRelative(normalized);
    return normalized;
  };
  await tar.t({
    file: archive,
    onReadEntry: (entry) => {
      try {
        signal?.throwIfAborted();
        if (['ExtendedHeader', 'GlobalExtendedHeader'].includes(entry.type)) return;
        const name = relative(entry.path);
        if (!name && entry.type !== 'Directory') throw new Error('Unsafe runtime archive path.');
        bytes += entry.size;
        if (bytes > 2 * 1024 ** 3 || ++count > 50000 || !allowed.includes(entry.type))
          throw new Error('Unsafe runtime archive.');
        if (seen.has(name) && (entry.type !== 'Directory' || seen.get(name) !== 'Directory'))
          throw new Error('Duplicate runtime archive entry.');
        seen.set(name, entry.type);
        if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
          const link = entry.linkpath;
          if (!link || path.posix.isAbsolute(link) || link.includes('\\'))
            throw new Error('Unsafe runtime link.');
          const target = path.posix.normalize(
            entry.type === 'Link' ? link : path.posix.join(path.posix.dirname(name), link),
          );
          if (!relative(target)) throw new Error('Unsafe runtime link.');
          links.set(name, { type: entry.type, raw: link, target });
        }
      } catch (error) {
        failure = error;
      }
    },
  });
  if (failure) throw failure;
  const linkedPrefix = (name: string): string | undefined => {
    let cursor = '';
    for (const part of name.split('/')) {
      cursor = cursor ? cursor + '/' + part : part;
      if (links.has(cursor)) return cursor;
    }
    return undefined;
  };
  for (const name of seen.keys()) {
    const prefix = linkedPrefix(name);
    if (prefix && prefix !== name)
      throw new Error('Runtime archive writes through a linked directory.');
  }
  const finalTarget = (name: string): string => {
    const visited = new Set<string>();
    for (let depth = 0; depth < 100; depth++) {
      if (visited.has(name)) throw new Error('Cyclic runtime archive link.');
      visited.add(name);
      const prefix = linkedPrefix(name);
      if (!prefix) return name;
      name = path.posix.normalize(links.get(prefix)!.target + name.slice(prefix.length));
      relative(name);
    }
    throw new Error('Runtime archive link chain is too deep.');
  };
  for (const value of links.values()) finalTarget(value.target);
  signal?.throwIfAborted();
  await tar.x({
    file: archive,
    cwd: destination,
    strict: true,
    preservePaths: false,
    filter: (_name, entry) => {
      signal?.throwIfAborted();
      return (
        'type' in entry && ['File', 'Directory'].includes(entry.type) && !!relative(entry.path)
      );
    },
  });
  // tar refuses even validated chained library links. Create them only after regular files,
  // with every final target checked inside the prepared runtime and cycles already rejected.
  for (const [name, value] of links) {
    signal?.throwIfAborted();
    const target = await containedPath(destination, finalTarget(value.target)),
      filename = await containedPath(destination, name),
      info = await lstat(target);
    if (
      info.isSymbolicLink() ||
      (!info.isFile() && !info.isDirectory()) ||
      (value.type === 'Link' && !info.isFile())
    )
      throw new Error('Unsafe runtime link target.');
    if (value.type === 'Link') await link(target, filename);
    else await symlink(value.raw, filename);
  }
}
