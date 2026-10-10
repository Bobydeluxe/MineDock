import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, mkdir, readFile } from 'node:fs/promises';
import { atomicWrite, containedPath } from '../security/paths';
import type { AssetReader } from './models';

type Json = Record<string, unknown>;
interface Archive extends AssetReader {
  bytes(name: string, limit?: number): Promise<Buffer | undefined>;
  close(): void;
}
export interface ResourceContext {
  id: string;
  path: string;
  engine: string;
}
export interface LayerSet {
  fingerprint: string;
  origin: 'mod-resources' | 'resource-pack';
  names: Record<string, string>;
  readers: Archive[];
  provenance: string[];
  close(): void;
}
const licenses = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'MPL-2.0',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
]);
const languageNames: Record<string, string> = {
  en: 'en_us',
  fr: 'fr_fr',
  de: 'de_de',
  es: 'es_es',
  pt: 'pt_pt',
  it: 'it_it',
};
export class ResourceLayers {
  constructor(
    private root: string,
    private open: (file: string, version: string) => Promise<Archive>,
  ) {}
  private file(id: string) {
    return containedPath(
      this.root,
      'layers-' + createHash('sha256').update(id).digest('hex') + '.json',
    );
  }
  private async settings(
    context: ResourceContext,
  ): Promise<{ version?: string; filename?: string; mods?: string[] }> {
    try {
      const f = await this.file(context.id),
        i = await lstat(f);
      if (!i.isFile() || i.isSymbolicLink() || i.size > 8192)
        throw new Error('Invalid resource settings');
      const c = JSON.parse(await readFile(f, 'utf8'));
      return {
        version: typeof c.version === 'string' ? c.version : undefined,
        filename: typeof c.filename === 'string' ? c.filename : undefined,
        mods: Array.isArray(c.mods)
          ? c.mods
              .filter((v: unknown) => typeof v === 'string' && /^mod-[a-f0-9]{128}\.jar$/.test(v))
              .slice(0, 16)
          : [],
      };
    } catch {
      return {};
    }
  }
  async addMod(context: ResourceContext, version: string, name: string): Promise<void> {
    if (!/^mod-[a-f0-9]{128}\.jar$/.test(name)) throw new Error('Invalid mod resource cache');
    const previous = await this.settings(context),
      config = previous.version === version ? previous : {};
    const mods = [...new Set([...(config.mods ?? []), name])];
    if (mods.length > 16) throw new Error('Mod resource cache limit');
    await atomicWrite(await this.file(context.id), JSON.stringify({ ...config, version, mods }));
  }
  async pack(context: ResourceContext, version: string, filename: string): Promise<void> {
    const archive = await this.open(filename, version);
    try {
      const metadata = await archive.json('pack.mcmeta');
      if (!metadata?.pack || typeof metadata.pack !== 'object')
        throw new Error('Resource pack metadata missing');
      const pack = metadata.pack as Json,
        expected: Record<string, number> = { '1.20.1': 15, '1.21.1': 34, '1.21.4': 46 };
      if (expected[version] !== undefined && pack.pack_format !== expected[version])
        throw new Error('Resource pack format does not match the selected release');
      if (version === '26.3') {
        const number = (v: unknown) =>
          Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')
            ? Number(v[0]) * 1000 + Number(v[1])
            : typeof v === 'number'
              ? v * 1000
              : NaN;
        if (
          pack.pack_format !== 97 &&
          !(number(pack.min_format) <= 97001 && number(pack.max_format) >= 97001)
        )
          throw new Error('Resource pack format does not match 26.3');
      } else if (expected[version] === undefined)
        throw new Error('Resource pack format is not validated for this release');
      await mkdir(this.root, { recursive: true });
      // User explicitly selects this pack for this exact release and confirms usage rights in the UI.
      const previous = await this.settings(context);
      await atomicWrite(
        await this.file(context.id),
        JSON.stringify({
          version,
          filename: path.resolve(filename),
          mods: previous.version === version ? previous.mods : [],
        }),
      );
    } finally {
      archive.close();
    }
  }
  async load(
    context: ResourceContext | undefined,
    version: string,
    language: string,
  ): Promise<LayerSet> {
    const readers: Archive[] = [],
      provenance: string[] = [],
      names: Record<string, string> = {};
    let origin: LayerSet['origin'] = 'mod-resources';
    let totalBytes = 0;
    const add = async (file: string, pack: boolean, authorizedMod = false) => {
      let archive: Archive | undefined;
      try {
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 150 * 1024 ** 2) return;
        if (totalBytes + info.size > 512 * 1024 ** 2) return;
        totalBytes += info.size;
        archive = await this.open(file, version);
        let license = 'user-authorized-pack';
        if (!pack) {
          const fabric = await archive.json('fabric.mod.json');
          if (fabric) {
            const value = fabric.license;
            const list = Array.isArray(value) ? value : [value];
            license = list.find((v) => typeof v === 'string' && licenses.has(v)) ?? '';
          } else {
            const toml =
              (
                (await archive.bytes('META-INF/neoforge.mods.toml')) ??
                (await archive.bytes('META-INF/mods.toml'))
              )?.toString() ?? '';
            license = /^\s*license\s*=\s*["']([^"']+)["']/m.exec(toml)?.[1] ?? '';
          }
          if (!licenses.has(license) && !authorizedMod) return;
          if (authorizedMod) license = 'verified-Modrinth-permitted-license';
        }
        // Hash actual bytes, never just a filename or mod ID. Stream bounded archive; never run it.
        const digest = createHash('sha256');
        const integrity = authorizedMod ? createHash('sha512') : undefined;
        let size = 0;
        for await (const b of createReadStream(file)) {
          size += b.length;
          if (size > 150 * 1024 ** 2) throw new Error('Mod resource archive exceeds limits');
          digest.update(b);
          integrity?.update(b);
        }
        if (integrity && path.basename(file) !== 'mod-' + integrity.digest('hex') + '.jar')
          throw new Error('Mod resource integrity mismatch');
        provenance.push(
          (pack ? 'pack:' : 'mod:') +
            path.basename(file) +
            ':' +
            digest.digest('hex') +
            ':' +
            license,
        );
        readers.push(archive);
        archive = undefined;
      } catch {
        /* Corrupt/unknown-license/server-only resources leave genuine IDs and text intact. */
      } finally {
        archive?.close();
      }
    };
    if (context && ['fabric', 'forge', 'neoforge'].includes(context.engine)) {
      const dir = await containedPath(context.path, 'mods');
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries
        .filter((e) => e.isFile() && !e.isSymbolicLink() && e.name.endsWith('.jar'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 64))
        await add(await containedPath(dir, e.name), false);
    }
    if (context)
      try {
        const config = await this.settings(context);
        if (config.version === version)
          for (const name of config.mods ?? [])
            await add(await containedPath(this.root, name), false, true);
        if (config.version === version && typeof config.filename === 'string') {
          await add(config.filename, true);
          origin = 'resource-pack';
        }
      } catch {
        /* No selected override. */
      }
    // Last selected resource pack wins. Mods are ordered by filename and explicitly documented.
    for (const reader of readers) {
      for (const lang of ['en_us', languageNames[language] ?? 'en_us']) {
        // Namespace list comes from observed resources via lookup below; vanilla names are overridden here.
        const values = await reader
          .json(`assets/minecraft/lang/${lang}.json`)
          .catch(() => undefined);
        for (const [k, v] of Object.entries(values ?? {}))
          if (typeof v === 'string' && v.length <= 300) names[k] = v;
      }
    }
    return {
      readers: readers.reverse(),
      provenance,
      names,
      origin,
      fingerprint: createHash('sha256')
        .update(JSON.stringify([version, context?.id, provenance]))
        .digest('hex'),
      close() {
        for (const r of readers) r.close();
      },
    };
  }
}
export function layeredReader(layers: LayerSet, base: AssetReader): AssetReader {
  return {
    async json(p) {
      for (const r of layers.readers) {
        const value = await r.json(p);
        if (value) return value;
      }
      return base.json(p);
    },
    async texture(id) {
      for (const r of layers.readers) {
        try {
          return await r.texture(id);
        } catch (e) {
          if (!(e instanceof Error) || e.message !== 'Texture unavailable') throw e;
        }
      }
      return base.texture(id);
    },
  };
}
