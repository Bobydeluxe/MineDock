import path from 'node:path';
import * as tar from 'tar';
import { validateRelative } from './paths';

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
    seen = new Map<string, string>();
  const relative = (name: string): string => {
    if (name.includes('\\')) throw new Error('Unsafe runtime archive path.');
    const normalized = name.replace(/^(?:\.\/)+/, '').replace(/\/$/, '');
    if (normalized === '.') return '';
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
        }
      } catch (error) {
        failure = error;
      }
    },
  });
  if (failure) throw failure;
  signal?.throwIfAborted();
  await tar.x({
    file: archive,
    cwd: destination,
    strict: true,
    preservePaths: false,
    filter: (_name, entry) => {
      signal?.throwIfAborted();
      return 'type' in entry && allowed.includes(entry.type) && !!relative(entry.path);
    },
  });
}
