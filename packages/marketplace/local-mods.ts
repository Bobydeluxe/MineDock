import yauzl from 'yauzl';
import { stat } from 'node:fs/promises';
import type { LocalMod } from '../domain/mods';

/** Reads only bounded metadata entries; never extracts or executes a JAR. */
export async function inspectMod(filename: string, enabled: boolean): Promise<LocalMod> {
  const info = await stat(filename);
  const result: LocalMod = {
    filename: '',
    enabled,
    size: info.size,
    title: '',
    modIds: [],
    loaders: [],
    corrupted: false,
  };
  if (info.size > 256 * 1024 ** 2) return { ...result, corrupted: true };
  try {
    const metadata = await new Promise<Record<string, string>>((resolve, reject) => {
      yauzl.open(filename, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
        if (error || !zip) {
          reject(error);
          return;
        }
        const values: Record<string, string> = {};
        let count = 0;
        zip.on('error', reject);
        zip.on('end', () => resolve(values));
        zip.on('entry', (entry: yauzl.Entry) => {
          if (++count > 100000) {
            zip.close();
            reject(new Error('Too many entries.'));
            return;
          }
          if (
            ![
              'fabric.mod.json',
              'quilt.mod.json',
              'META-INF/mods.toml',
              'META-INF/neoforge.mods.toml',
            ].includes(entry.fileName)
          ) {
            zip.readEntry();
            return;
          }
          if (entry.uncompressedSize > 1024 ** 2) {
            zip.close();
            reject(new Error('Metadata is too large.'));
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              zip.close();
              reject(error);
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on('data', (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 1024 ** 2) {
                stream.destroy(new Error('Metadata is too large.'));
                return;
              }
              chunks.push(chunk);
            });
            stream.on('error', reject);
            stream.on('end', () => {
              values[entry.fileName] = Buffer.concat(chunks).toString('utf8');
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      });
    });
    if (metadata['fabric.mod.json']) {
      const data = JSON.parse(metadata['fabric.mod.json']) as Record<string, unknown>;
      result.title = typeof data.name === 'string' ? data.name : '';
      result.version = typeof data.version === 'string' ? data.version : undefined;
      if (typeof data.id === 'string') result.modIds.push(data.id);
      result.loaders.push('fabric');
      const depends = data.depends as Record<string, unknown> | undefined;
      result.required = Object.fromEntries(
        Object.entries(depends ?? {}).filter(
          (value): value is [string, string] => typeof value[1] === 'string',
        ),
      );
      if (typeof depends?.minecraft === 'string') result.minecraft = depends.minecraft;
      result.serverOnly = data.environment === 'server' ? true : undefined;
      if (data.environment === 'client') result.serverOnly = false;
    }
    for (const [name, text] of Object.entries(metadata).filter(([name]) =>
      name.endsWith('.toml'),
    )) {
      result.loaders.push(name.includes('neoforge') ? 'neoforge' : 'forge');
      for (const block of text.matchAll(/\[\[mods\]\]([\s\S]*?)(?=\[\[|$)/g)) {
        const id = /^\s*modId\s*=\s*["']([^"']+)["']/m.exec(block[1]!)?.[1];
        if (id) result.modIds.push(id);
      }
      result.title ||= /^\s*displayName\s*=\s*["']([^"']+)["']/m.exec(text)?.[1] ?? '';
      result.version ||= /^\s*version\s*=\s*["']([^"']+)["']/m.exec(text)?.[1];
    }
    result.modIds = [...new Set(result.modIds)];
  } catch {
    result.corrupted = true;
  }
  return result;
}
