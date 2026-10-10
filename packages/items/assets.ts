import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, lstat, stat, rm, utimes } from 'node:fs/promises';
import yauzl, { type ZipFile, type Entry } from 'yauzl';
import { z } from 'zod';
import { fetchApproved } from '../minecraft/downloads';
import { atomicWrite, containedPath } from '../security/paths';
import { assetId, renderItem, type AssetReader } from './models';
import { decodeTexture, encode, type Raster } from './raster';
import { animationFrame } from './animation';
import { assetBytes, verified } from './remote';
import { headTexture } from './profile';
import { ResourceLayers, layeredReader, type ResourceContext, type LayerSet } from './layers';
import { ModResourceDownloads, type ModResourceChoice } from './modrinth';
import type {
  ItemVisual,
  ItemAssetContext,
  ItemCatalog,
  ItemStack,
} from '../domain/administration';

export const releaseId = z.string().regex(/^[0-9][a-zA-Z0-9._-]{0,39}$/);
export const visualRequest = z
  .object({
    id: z.string().max(150),
    components: z.record(z.string().max(160), z.unknown()).default({}),
  })
  .strict()
  .refine((v) => JSON.stringify(v).length <= 16384, 'Item presentation exceeds limits');
const sourceSchema = z
  .object({
    version: releaseId,
    filename: z.string().max(4000),
    sha1: z.string().regex(/^[a-f0-9]{40}$/),
    assets: z.string().max(4000).optional(),
    origin: z.enum(['local-client', 'official-private']).optional(),
  })
  .strict();
type Source = z.infer<typeof sourceSchema>;
type Json = Record<string, unknown>;
const object = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
async function boundedFile(filename: string, maximum: number): Promise<Buffer> {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw new Error('Item cache file exceeds limits');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of createReadStream(filename)) {
    const chunk = value as Buffer;
    size += chunk.length;
    if (size > maximum) throw new Error('Item cache file exceeds limits');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function clientDigest(filename: string, signal: AbortSignal): Promise<string> {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 150 * 1024 ** 2)
    throw new Error('Invalid client archive');
  const digest = createHash('sha1');
  let total = 0;
  for await (const b of createReadStream(filename, { signal })) {
    total += b.length;
    if (total > 150 * 1024 ** 2) throw new Error('Client exceeds limits');
    digest.update(b);
  }
  return digest.digest('hex');
}
const knownLanguages: Record<string, string> = {
  en: 'en_us',
  fr: 'fr_fr',
  de: 'de_de',
  es: 'es_es',
  pt: 'pt_pt',
  it: 'it_it',
};

/** Only official client metadata and exact mcmeta generated registry facts travel over HTTPS. */
export async function itemMetadata(url: string, signal: AbortSignal): Promise<unknown> {
  const allowed = (u: URL) =>
    u.hostname === 'piston-meta.mojang.com' ||
    (u.hostname === 'raw.githubusercontent.com' &&
      /^\/misode\/mcmeta\/[0-9][a-zA-Z0-9._-]{0,39}-registries\/(?:version\.json|item\/data\.json)$/.test(
        u.pathname,
      ));
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetchApproved(
        url,
        AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        {},
        [404],
        allowed,
      );
      if (response.status === 404) return undefined;
      if (Number(response.headers.get('content-length') ?? 0) > 2 * 1024 ** 2)
        throw new Error('Metadata too large');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing metadata');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 2 * 1024 ** 2) {
          await reader.cancel();
          throw new Error('Metadata too large');
        }
        chunks.push(part.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {
      failure = e;
      if (attempt === 0 && !signal.aborted) await new Promise<void>((r) => setTimeout(r, 200));
    }
  }
  throw failure;
}
export class ClientAssets implements AssetReader {
  private constructor(
    readonly zip: ZipFile,
    private readonly entries: Map<string, Entry>,
    readonly version: string,
  ) {}
  static async open(filename: string, resourceVersion?: string): Promise<ClientAssets> {
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 150 * 1024 ** 2)
      throw new Error('Select a regular Minecraft client JAR under 150 MB.');
    // Reject links through parent folders as well as the archive itself.
    for (let p = path.dirname(filename); p !== path.dirname(p); p = path.dirname(p))
      if ((await lstat(p)).isSymbolicLink())
        throw new Error('Linked client paths are unsupported.');
    const zip = await new Promise<ZipFile>((resolve, reject) =>
      yauzl.open(filename, { lazyEntries: true, autoClose: false }, (e, z) =>
        e ? reject(e) : resolve(z!),
      ),
    );
    const entries = new Map<string, Entry>();
    try {
      await new Promise<void>((resolve, reject) => {
        zip.on('error', reject);
        zip.once('end', resolve);
        zip.on('entry', (entry: Entry) => {
          if (
            entries.size >= 60000 ||
            entries.has(entry.fileName) ||
            entry.fileName.includes('\\') ||
            entry.fileName.split('/').some((p) => p === '..' || p === '.') ||
            entry.fileName.startsWith('/') ||
            entry.fileName.includes(':')
          ) {
            reject(new Error('Unsafe client archive'));
            zip.close();
            return;
          }
          entries.set(entry.fileName, entry);
          zip.readEntry();
        });
        zip.readEntry();
      });
      const provisional = new ClientAssets(zip, entries, '');
      const version = resourceVersion ?? (await provisional.json('version.json'))?.id;
      return new ClientAssets(zip, entries, releaseId.parse(version));
    } catch (e) {
      zip.close();
      throw e;
    }
  }
  async bytes(name: string, limit = 512 * 1024): Promise<Buffer | undefined> {
    if (
      !/^(?:version\.json|pack\.mcmeta|fabric\.mod\.json|META-INF\/(?:neoforge\.)?mods\.toml|assets\/[a-z0-9_.-]+\/(?:models|items|textures|lang)\/[a-zA-Z0-9_./-]+\.(?:json|png|png\.mcmeta))$/.test(
        name,
      ) ||
      name.split('/').some((p) => p === '..' || p === '.')
    )
      throw new Error('Invalid asset path');
    const entry = this.entries.get(name);
    if (!entry) return;
    if (
      entry.uncompressedSize > limit ||
      entry.generalPurposeBitFlag & 1 ||
      ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
    )
      throw new Error('Unsafe asset entry');
    return new Promise<Buffer>((resolve, reject) =>
      this.zip.openReadStream(entry, (e, s) => {
        if (e || !s) {
          reject(e);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        s.on('error', reject);
        s.on('data', (b: Buffer) => {
          size += b.length;
          if (size > limit) {
            s.destroy(new Error('Asset exceeds limits'));
            return;
          }
          chunks.push(b);
        });
        s.on('end', () => resolve(Buffer.concat(chunks)));
      }),
    );
  }
  async json(name: string): Promise<Json | undefined> {
    const b = await this.bytes(name, 1024 ** 2);
    return b ? object(JSON.parse(b.toString())) : undefined;
  }
  async texture(id: string): Promise<Raster> {
    const [ns, name] = assetId(id).split(':');
    const b = await this.bytes(`assets/${ns}/textures/${name}.png`);
    if (!b) {
      const trim = /^(trims\/items\/(?:boots|helmet|chestplate|leggings)_trim)_([a-z_]+)$/.exec(
        name!,
      );
      if (!trim) throw new Error('Texture unavailable');
      const [base, palette, target] = await Promise.all([
        this.texture(`${ns}:${trim[1]}`),
        this.texture('minecraft:trims/color_palettes/trim_palette'),
        this.texture('minecraft:trims/color_palettes/' + trim[2]),
      ]);
      if (palette.data.length !== target.data.length || palette.data.length > 4096)
        throw new Error('Trim palette mismatch');
      const map = new Map<string, Buffer>();
      for (let i = 0; i < palette.data.length; i += 4)
        map.set(palette.data.subarray(i, i + 3).toString('hex'), target.data.subarray(i, i + 4));
      const data = Buffer.from(base.data);
      for (let i = 0; i < data.length; i += 4) {
        const replacement = map.get(data.subarray(i, i + 3).toString('hex'));
        if (replacement && data[i + 3]) {
          replacement.copy(data, i, 0, 3);
          data[i + 3] = (data[i + 3]! * replacement[3]!) / 255;
        }
      }
      return { ...base, data };
    }
    const image = decodeTexture(b);
    const metadata = await this.json(`assets/${ns}/textures/${name}.png.mcmeta`);
    return metadata ? animationFrame(image, metadata) : image;
  }
  close(): void {
    this.zip.close();
  }
}
export class ItemAssets {
  private readonly modDownloads = new ModResourceDownloads();
  private readonly resourceLayers: ResourceLayers;
  private readonly layerCache = new Map<string, { value: LayerSet; at: number; leases: number }>();
  private readonly abort = new AbortController();
  private navigation = new AbortController();
  private scopeKey: string | null = null;
  private scopeGeneration = 0;
  private readonly work = new AsyncLocalStorage<AbortSignal>();
  scope(id: string | null): void {
    if (id === this.scopeKey) return;
    this.navigation.abort();
    this.navigation = new AbortController();
    this.scopeKey = id;
    this.scopeGeneration++;
  }
  private signal(): AbortSignal {
    return this.work.getStore() ?? AbortSignal.any([this.abort.signal, this.navigation.signal]);
  }
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly visuals = new Map<string, ItemVisual>();
  private readonly negative = new Map<string, number>();
  private readonly registries = new Map<string, { ids: Set<string>; retry: number }>();
  private readonly clients = new Map<
    string,
    { client: ClientAssets; stamp: string; sha1: string }
  >();
  private readonly languages = new Map<string, Record<string, string>>();
  private readonly leases = new WeakMap<ClientAssets, number>();
  private active = 0;
  private waiters: (() => void)[] = [];
  private transferTail: Promise<void> = Promise.resolve();
  private transfers = 0;
  private async transfer<T>(work: () => Promise<T>): Promise<T> {
    if (this.transfers >= 8) throw new Error('Resource download queue is full');
    this.transfers++;
    const previous = this.transferTail;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    this.transferTail = previous.then(() => gate);
    await previous;
    try {
      this.signal().throwIfAborted();
      return await work();
    } finally {
      this.transfers--;
      release();
    }
  }
  readonly metrics = {
    renders: 0,
    memoryHits: 0,
    diskHits: 0,
    metadataRequests: 0,
    fallbacks: 0,
    peakConcurrent: 0,
  };
  constructor(
    readonly root: string,
    private readonly fetchJson = itemMetadata,
    private readonly fetchBytes = assetBytes,
  ) {
    this.resourceLayers = new ResourceLayers(root, (file, version) =>
      ClientAssets.open(file, version),
    );
  }
  private async resources(
    context: ResourceContext | undefined,
    version: string,
    language: string,
  ): Promise<LayerSet> {
    const key = JSON.stringify([context?.id, version, language]);
    const entry = await this.once('layers:' + key, async () => {
      let saved = this.layerCache.get(key);
      if (saved && (Date.now() - saved.at < 30000 || saved.leases)) return saved;
      if (saved) {
        saved.value.close();
        this.layerCache.delete(key);
      }
      if (this.layerCache.size >= 4) {
        const old = [...this.layerCache].find(([, v]) => !v.leases);
        if (old) {
          old[1].value.close();
          this.layerCache.delete(old[0]);
        } else throw new Error('Resource context limit');
      }
      saved = {
        value: await this.resourceLayers.load(context, version, language),
        at: Date.now(),
        leases: 0,
      };
      this.layerCache.set(key, saved);
      return saved;
    });
    entry.leases++;
    return entry.value;
  }
  private releaseResources(value: LayerSet) {
    const entry = [...this.layerCache.values()].find((e) => e.value === value);
    if (entry) entry.leases = Math.max(0, entry.leases - 1);
  }
  async importPack(context: ResourceContext, version: string, filename: string): Promise<void> {
    if ([...this.layerCache.values()].some((v) => v.leases))
      throw new Error('Wait for image requests to finish.');
    await this.resourceLayers.pack(context, version, filename);
    for (const v of this.layerCache.values()) v.value.close();
    this.layerCache.clear();
    this.visuals.clear();
    this.languages.clear();
  }
  async modChoices(
    context: ResourceContext,
    version: string,
    project: string,
  ): Promise<ModResourceChoice[]> {
    return this.once('mod-choices:' + context.id + ':' + version + ':' + project, () =>
      this.modDownloads.choices(project, version, context.engine, this.signal()),
    );
  }
  async downloadMod(
    context: ResourceContext,
    version: string,
    project: string,
    versionId: string,
  ): Promise<void> {
    return this.once(
      'download-mod:' + context.id + ':' + version + ':' + project + ':' + versionId,
      async () => {
        if ([...this.layerCache.values()].some((v) => v.leases))
          throw new Error('Wait for image requests to finish.');
        const result = await this.transfer(() =>
          this.modDownloads.download(project, versionId, version, context.engine, this.signal()),
        );
        const name = 'mod-' + result.sha512 + '.jar',
          filename = await this.file(name);
        const archive = await this.file(name);
        let size = result.bytes.length;
        for (const n of await readdir(this.root))
          if (/^(?:mod-[a-f0-9]{128}|official-[a-zA-Z0-9._-]+)\.jar$/.test(n) && n !== name)
            size += (await stat(await this.file(n))).size;
        if (size > 256 * 1024 ** 2)
          throw new Error('Private resource cache is full; clear image caches first.');
        await atomicWrite(filename, result.bytes);
        const reader = await ClientAssets.open(archive, version);
        reader.close();
        await this.resourceLayers.addMod(context, version, name);
        for (const v of this.layerCache.values()) v.value.close();
        this.layerCache.clear();
        this.visuals.clear();
        this.languages.clear();
      },
    );
  }
  private once<T>(key: string, work: () => Promise<T>): Promise<T> {
    key = this.scopeGeneration + ':' + key;
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    if (this.pending.size >= 256) return Promise.reject(new Error('Item request queue is full.'));
    const signal = this.signal();
    const promise = this.work.run(signal, work).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  private async limited<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= 4) await new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.signal().aborted) {
      this.waiters.shift()?.();
      this.signal().throwIfAborted();
    }
    this.signal().throwIfAborted();
    this.active++;
    this.metrics.peakConcurrent = Math.max(this.metrics.peakConcurrent, this.active);
    try {
      return await work();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
  private async file(name: string): Promise<string> {
    await mkdir(this.root, { recursive: true });
    return containedPath(this.root, name);
  }
  private async config(): Promise<Source[]> {
    try {
      if ((await stat(await this.file('sources.json'))).size > 128 * 1024) return [];
      return z
        .array(sourceSchema)
        .max(32)
        .parse(
          JSON.parse((await boundedFile(await this.file('sources.json'), 128 * 1024)).toString()),
        );
    } catch {
      return [];
    }
  }
  async registry(version: string): Promise<Set<string> | undefined> {
    releaseId.parse(version);
    const cached = this.registries.get(version);
    if (cached && cached.retry > Date.now()) return cached.ids.size ? cached.ids : undefined;
    return this.once('registry:' + version, async () => {
      if (this.registries.size >= 32) this.registries.delete(this.registries.keys().next().value!);
      const filename = await this.file('registry-' + version + '.json');
      const parse = (v: unknown) =>
        new Set(
          z
            .array(z.string().regex(/^[a-z0-9_]+$/))
            .min(100)
            .max(10000)
            .parse(v)
            .map((id) => 'minecraft:' + id),
        );
      try {
        if ((await stat(filename)).size > 256 * 1024) throw new Error('Registry cache too large');
        const stored = object(JSON.parse((await boundedFile(filename, 256 * 1024)).toString()));
        if (
          stored.version !== version ||
          stored.source !== 'mcmeta-generated' ||
          stored.sha256 !== hash(JSON.stringify([version, stored.ids]))
        )
          throw new Error('Registry cache context mismatch');
        const ids = parse(stored.ids);
        this.rememberRegistry(version, ids, Infinity);
        return ids;
      } catch {
        /* Fetch exact tag only. */
      }
      try {
        const base = `https://raw.githubusercontent.com/misode/mcmeta/${version}-registries/`;
        this.metrics.metadataRequests += 2;
        const [meta, data] = await Promise.all([
          this.fetchJson(base + 'version.json', this.signal()),
          this.fetchJson(base + 'item/data.json', this.signal()),
        ]);
        if (object(meta).id !== version) throw new Error('Registry version mismatch');
        const ids = parse(data);
        const values = [...ids].map((id) => id.slice(10));
        await atomicWrite(
          filename,
          JSON.stringify({
            version,
            source: 'mcmeta-generated',
            ids: values,
            sha256: hash(JSON.stringify([version, values])),
          }),
        );
        this.rememberRegistry(version, ids, Infinity);
        await this.clean();
        return ids;
      } catch {
        this.signal().throwIfAborted();
        this.rememberRegistry(version, new Set(), Date.now() + 60000);
        return undefined;
      }
    });
  }
  private rememberRegistry(version: string, ids: Set<string>, retry: number): void {
    if (!this.registries.has(version) && this.registries.size >= 32)
      this.registries.delete(this.registries.keys().next().value!);
    this.registries.set(version, { ids, retry });
  }
  async importClient(
    version: string,
    filename: string,
    assets?: string,
    origin: 'local-client' | 'official-private' = 'local-client',
  ): Promise<ItemAssetContext> {
    releaseId.parse(version);
    const client = await ClientAssets.open(path.resolve(filename));
    try {
      if (client.version !== version)
        throw new Error('Client Minecraft version does not match this server.');
      this.metrics.metadataRequests += 2;
      const manifest = object(
        await this.fetchJson(
          'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
          this.signal(),
        ),
      );
      const entry = Array.isArray(manifest.versions)
        ? manifest.versions.map(object).find((v) => v.id === version)
        : undefined;
      if (typeof entry?.url !== 'string') throw new Error('Official client version unavailable.');
      const meta = object(await this.fetchJson(entry.url, this.signal()));
      if (meta.id !== version) throw new Error('Official version mismatch');
      const download = object(object(meta.downloads).client);
      const sha1 = await clientDigest(filename, this.signal());
      if (download.sha1 !== sha1)
        throw new Error('Client JAR does not match the official Mojang SHA-1.');
      const sources = (await this.config()).filter((s) => s.version !== version);
      if (sources.length >= 32)
        throw new Error('At most 32 local Minecraft versions can be registered.');
      sources.push({ version, filename: path.resolve(filename), sha1, assets, origin });
      await atomicWrite(await this.file('sources.json'), JSON.stringify(sources));
      const old = this.clients.get(version);
      if (old && !this.leases.get(old.client)) {
        old.client.close();
        this.clients.delete(version);
      }
      this.languages.clear();
      this.visuals.clear();
      return { version, available: true, source: origin };
    } finally {
      client.close();
    }
  }
  async discover(version: string): Promise<boolean> {
    releaseId.parse(version);
    const roaming =
      process.env.APPDATA ?? path.join(os.homedir(), 'Library', 'Application Support');
    const locations = [
      { base: path.join(roaming, 'ModrinthApp', 'meta'), versions: 'versions' },
      { base: path.join(roaming, '.minecraft'), versions: 'versions' },
      { base: path.join(os.homedir(), '.minecraft'), versions: 'versions' },
      {
        base: path.join(os.homedir(), '.local', 'share', 'ModrinthApp', 'meta'),
        versions: 'versions',
      },
    ];
    for (const location of locations) {
      const jar = path.join(location.base, location.versions, version, version + '.jar');
      if (await stat(jar).catch(() => undefined)) {
        await this.importClient(version, jar, path.join(location.base, 'assets'));
        return true;
      }
    }
    return false;
  }
  async context(version: string): Promise<ItemAssetContext> {
    const source = (await this.config()).find((s) => s.version === version);
    return {
      version,
      available: !!source && !!(await stat(source.filename).catch(() => undefined)),
      source: source?.origin ?? 'local-client',
    };
  }
  /** Explicit owner/EULA consent is required by the named IPC before this private download. */
  async downloadOfficial(version: string): Promise<ItemAssetContext> {
    releaseId.parse(version);
    return this.once('download:' + version, () =>
      this.transfer(async () => {
        const manifest = object(
          await this.fetchJson(
            'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
            this.signal(),
          ),
        );
        const entry = Array.isArray(manifest.versions)
          ? manifest.versions.map(object).find((v) => v.id === version)
          : undefined;
        if (typeof entry?.url !== 'string') throw new Error('Official version unavailable');
        const meta = object(await this.fetchJson(entry.url, this.signal()));
        if (meta.id !== version) throw new Error('Official version mismatch');
        const d = object(object(meta.downloads).client);
        const size = z
          .number()
          .int()
          .min(1)
          .max(150 * 1024 ** 2)
          .parse(d.size);
        const sha1 = z
          .string()
          .regex(/^[a-f0-9]{40}$/)
          .parse(d.sha1);
        const url = z.string().parse(d.url);
        if (!url.includes('/' + sha1 + '/')) throw new Error('Official object mismatch');
        // One verified archive for this release only; never installed or executed.
        await mkdir(this.root, { recursive: true });
        let total = size;
        for (const name of await readdir(this.root))
          if (
            /^(?:official-[a-zA-Z0-9._-]+|mod-[a-f0-9]{128})\.jar$/.test(name) &&
            name !== `official-${version}-${sha1}.jar`
          )
            total += (await stat(await this.file(name))).size;
        if (total > 256 * 1024 ** 2)
          throw new Error('Private source cache is full; clear image caches first.');
        const bytes = verified(await this.fetchBytes(url, 'client', size, this.signal()), sha1);
        if (bytes.length !== size) throw new Error('Official archive size mismatch');
        const filename = await this.file('official-' + version + '-' + sha1 + '.jar');
        await atomicWrite(filename, bytes);
        try {
          const result = await this.importClient(version, filename, undefined, 'official-private');
          // The small version manifest is needed for authorized translated language objects.
          await atomicWrite(await this.file('official-' + version + '.json'), JSON.stringify(meta));
          return result;
        } catch (e) {
          await rm(filename, { force: true });
          throw e;
        }
      }),
    );
  }
  async purge(): Promise<void> {
    if (this.pending.size || this.transfers)
      throw new Error('Wait for image requests to finish before clearing caches.');
    for (const c of this.clients.values()) c.client.close();
    for (const c of this.layerCache.values()) c.value.close();
    this.layerCache.clear();
    this.clients.clear();
    this.languages.clear();
    this.visuals.clear();
    this.negative.clear();
    this.registries.clear();
    const sources = (await this.config()).filter((s) => s.origin !== 'official-private');
    // Only app-owned cache files. Never remove selected client/mod/pack archives or server data.
    for (const name of await readdir(this.root))
      if (
        /^(?:[a-f0-9]{64}\.(?:png|visual\.json)|registry-[a-zA-Z0-9._-]+\.json|official-[a-zA-Z0-9._-]+\.(?:jar|json)|mod-[a-f0-9]{128}\.jar|object-[a-f0-9]{40}\.json|skin-[a-f0-9]{32,64}\.png)$/.test(
          name,
        )
      )
        await rm(await this.file(name), { force: true });
    await atomicWrite(await this.file('sources.json'), JSON.stringify(sources));
  }
  private async client(version: string): Promise<ClientAssets | undefined> {
    const opened = await this.once('client:' + version, async () => {
      const source = (await this.config()).find((s) => s.version === version);
      if (!source) return;
      const info = await lstat(source.filename).catch(() => undefined);
      if (!info?.isFile() || info.isSymbolicLink()) return;
      const stamp = info.size + ':' + info.mtimeMs,
        existing = this.clients.get(version);
      if (existing?.stamp === stamp && existing.sha1 === source.sha1) return existing.client;
      if (existing && this.leases.get(existing.client)) return;
      existing?.client.close();
      this.clients.delete(version);
      if ((await clientDigest(source.filename, this.signal())) !== source.sha1) return;
      const client = await ClientAssets.open(source.filename);
      if (client.version !== version) {
        client.close();
        return;
      }
      if (this.clients.size >= 4) {
        const key = [...this.clients].find(([, v]) => !this.leases.get(v.client))?.[0];
        if (!key) {
          client.close();
          return;
        }
        this.clients.get(key)!.client.close();
        this.clients.delete(key);
      }
      this.clients.set(version, { client, stamp, sha1: source.sha1 });
      return client;
    });
    if (opened) this.leases.set(opened, (this.leases.get(opened) ?? 0) + 1);
    return opened;
  }
  private release(client: ClientAssets): void {
    this.leases.set(client, Math.max(0, (this.leases.get(client) ?? 0) - 1));
  }
  async names(version: string, language: string): Promise<Record<string, string>> {
    return this.once('names:' + version + ':' + language, async () => {
      const key = version + ':' + language,
        existing = this.languages.get(key);
      if (existing) return existing;
      const client = await this.client(version).catch(() => undefined);
      let en: Json | undefined;
      try {
        en = await client?.json('assets/minecraft/lang/en_us.json');
      } catch {
        /* A damaged source cannot hide the catalogue. */
      } finally {
        if (client) this.release(client);
      }
      let localized: Json = {};
      const source = (await this.config()).find((s) => s.version === version);
      if (source?.origin === 'official-private' && language !== 'en')
        try {
          const meta = object(
            JSON.parse(
              (
                await boundedFile(await this.file('official-' + version + '.json'), 2 * 1024 ** 2)
              ).toString(),
            ),
          );
          const indexMeta = object(meta.assetIndex);
          const indexHash = z
            .string()
            .regex(/^[a-f0-9]{40}$/)
            .parse(indexMeta.sha1);
          const indexFile = await this.file('object-' + indexHash + '.json');
          let indexBytes = await boundedFile(indexFile, 2 * 1024 ** 2).catch(() => undefined);
          if (!indexBytes) {
            // Metadata JSON has the same bounded HTTPS policy; preserve its official digest.
            const response = await fetchApproved(
              z.string().parse(indexMeta.url),
              this.signal(),
              {},
              [],
              (u) => u.hostname === 'piston-meta.mojang.com',
            );
            const reader = response.body!.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              for (;;) {
                const p = await reader.read();
                if (p.done) break;
                size += p.value.length;
                if (size > 2 * 1024 ** 2) throw new Error('Index exceeds limits');
                chunks.push(p.value);
              }
            } finally {
              await reader.cancel();
            }
            indexBytes = verified(Buffer.concat(chunks), indexHash);
            await atomicWrite(indexFile, indexBytes);
          }
          const index = object(JSON.parse(verified(indexBytes, indexHash).toString()));
          const entry = object(
            object(index.objects)['minecraft/lang/' + knownLanguages[language] + '.json'],
          );
          const digest = z
            .string()
            .regex(/^[a-f0-9]{40}$/)
            .parse(entry.hash);
          const file = await this.file('object-' + digest + '.json');
          let bytes = await boundedFile(file, 1024 ** 2).catch(() => undefined);
          if (!bytes) {
            bytes = verified(
              await this.fetchBytes(
                'https://resources.download.minecraft.net/' + digest.slice(0, 2) + '/' + digest,
                'language',
                1024 ** 2,
                this.signal(),
              ),
              digest,
            );
            await atomicWrite(file, bytes);
          }
          localized = object(JSON.parse(verified(bytes, digest).toString()));
        } catch {
          /* Exact-version English remains available offline. */
        }
      if (source?.assets && language !== 'en')
        try {
          // Index is read only from the selected launcher's own assets directory; object hash is verified.
          const siblingPath = source.filename.replace(/\.jar$/, '.json');
          if ((await stat(siblingPath)).size > 2 * 1024 ** 2)
            throw new Error('Version metadata too large');
          const sibling = JSON.parse((await boundedFile(siblingPath, 2 * 1024 ** 2)).toString());
          const indexId = z
            .string()
            .regex(/^[a-zA-Z0-9_.-]{1,40}$/)
            .parse(sibling.assetIndex?.id);
          const indexPath = await containedPath(source.assets, 'indexes/' + indexId + '.json');
          if ((await stat(indexPath)).size > 2 * 1024 ** 2) throw new Error('Index too large');
          const index = JSON.parse((await boundedFile(indexPath, 2 * 1024 ** 2)).toString());
          const digest = z
            .string()
            .regex(/^[a-f0-9]{40}$/)
            .parse(index.objects?.['minecraft/lang/' + knownLanguages[language] + '.json']?.hash);
          const file = await containedPath(
            source.assets,
            'objects/' + digest.slice(0, 2) + '/' + digest,
          );
          if ((await stat(file)).size > 1024 ** 2) throw new Error('Language too large');
          const b = await boundedFile(file, 1024 ** 2);
          if (createHash('sha1').update(b).digest('hex') !== digest)
            throw new Error('Language hash mismatch');
          localized = object(JSON.parse(b.toString()));
        } catch {
          /* English is the honest fallback when a local translation is unavailable. */
        }
      const names: Record<string, string> = {};
      for (const [k, v] of Object.entries({ ...en, ...localized }))
        if (typeof v === 'string' && v.length <= 300) names[k] = v;
      if (this.languages.size >= 18) this.languages.delete(this.languages.keys().next().value!);
      this.languages.set(key, names);
      return names;
    });
  }
  async catalog(
    version: string,
    language: string,
    observed: Set<string>,
    context?: ResourceContext,
  ): Promise<ItemCatalog> {
    const [registry, baseNames] = await Promise.all([
      this.registry(version),
      this.names(version, language),
    ]);
    const names = { ...baseNames };
    const resources = await this.resources(context, version, language);
    try {
      Object.assign(names, resources.names);
      for (const ns of new Set([...observed].map((id) => id.split(':')[0]!)))
        for (const reader of [...resources.readers].reverse())
          for (const lang of ['en_us', knownLanguages[language] ?? 'en_us']) {
            const values = await reader
              .json(`assets/${ns}/lang/${lang}.json`)
              .catch(() => undefined);
            for (const [k, v] of Object.entries(values ?? {}))
              if (typeof v === 'string' && v.length <= 300) names[k] = v;
          }
      return {
        source: registry ? 'registry-report' : 'saved-items',
        version,
        complete: !!registry,
        provenance: registry
          ? `https://github.com/misode/mcmeta/tree/${version}-registries/item`
          : undefined,
        entries: [...new Set([...(registry ?? []), ...observed])].sort().map((id) => ({
          id,
          name: this.name(id, names),
          namespace: id.split(':')[0]!,
          category: '',
          observed: observed.has(id),
          registered: registry?.has(id) ?? false,
          compatible: registry && id.startsWith('minecraft:') ? registry.has(id) : undefined,
        })),
      };
    } finally {
      this.releaseResources(resources);
    }
  }
  private name(id: string, names: Record<string, string>): string {
    const key = id.replace(':', '.');
    return names['item.' + key] ?? names['block.' + key] ?? id.split(':')[1]!.replaceAll('_', ' ');
  }
  async visual(
    version: string,
    item: Pick<ItemStack, 'id' | 'components'>,
    language: string,
    context?: ResourceContext,
  ): Promise<ItemVisual> {
    releaseId.parse(version);
    visualRequest.parse(item);
    const id = assetId(item.id);
    const source = (await this.config()).find((s) => s.version === version);
    const resources = await this.resources(context, version, language);
    const key = hash(
      JSON.stringify([
        'renderer-9',
        'java',
        version,
        id,
        item.components,
        source?.sha1 ?? 'none',
        resources.fingerprint,
        language,
      ]),
    );
    const existing = this.visuals.get(key);
    if (existing && (existing.status === 'ready' || (this.negative.get(key) ?? 0) > Date.now())) {
      this.metrics.memoryHits++;
      this.releaseResources(resources);
      return existing;
    }
    return this.once('visual:' + key, () =>
      this.limited(async () => {
        const names = { ...(await this.names(version, language)), ...resources.names };
        for (const r of [...resources.readers].reverse())
          for (const lang of ['en_us', knownLanguages[language] ?? 'en_us']) {
            const values = await r
              .json(`assets/${id.split(':')[0]}/lang/${lang}.json`)
              .catch(() => undefined);
            for (const [k, v] of Object.entries(values ?? {}))
              if (typeof v === 'string' && v.length <= 300) names[k] = v;
          }
        const base: ItemVisual = {
          id,
          version,
          name: this.name(id, names),
          status: 'unavailable',
          source: source?.origin ?? 'local-client',
        };
        if (!id.startsWith('minecraft:') && !resources.readers.length) base.status = 'custom';
        else if (!source && !resources.readers.length) base.status = 'no-client';
        else if (id.startsWith('minecraft:') && (await this.registry(version))?.has(id) === false)
          base.status = 'unavailable';
        else {
          try {
            const filename = await this.file(key + '.png'),
              metadata = await this.file(key + '.visual.json');
            try {
              const bytes = await boundedFile(filename, 512 * 1024);
              decodeTexture(bytes);
              const saved = JSON.parse((await boundedFile(metadata, 1024)).toString());
              if (
                !['flat', 'layered', 'model'].includes(saved.render) ||
                saved.sha256 !== hash(bytes) ||
                saved.version !== version ||
                saved.context !== resources.fingerprint ||
                saved.client !== source?.sha1
              )
                throw new Error('Cache schema');
              this.metrics.diskHits++;
              await utimes(filename, new Date(), new Date());
              Object.assign(base, {
                status: 'ready',
                render: saved.render,
                url: 'minedock-item://cache/' + key + '.png',
              });
            } catch {
              const client = await this.client(version);
              let rendered;
              try {
                const assets = layeredReader(
                  resources,
                  client ?? {
                    json: async () => undefined,
                    texture: async () => {
                      throw new Error('No base resources');
                    },
                  },
                );
                const modern =
                  !!(await assets.json('assets/minecraft/items/diamond_sword.json')) ||
                  !!(await assets.json(
                    assetId(item.components['minecraft:item_model'] ?? id).replace(
                      /^([^:]+):(.+)$/,
                      'assets/$1/items/$2.json',
                    ),
                  ));
                const reader: AssetReader = {
                  json: (p) => assets.json(p),
                  texture: async (resource) => {
                    if (resource !== 'minedock:profile/skin') return assets.texture(resource);
                    const url = headTexture(item.components);
                    if (!url) throw new Error('Saved head profile has no safe texture');
                    const digest = new URL(url).pathname.split('/').pop()!;
                    const file = await this.file('skin-' + digest + '.png');
                    let b = await boundedFile(file, 512 * 1024)
                      .then((b) => verified(b, digest, 'sha256'))
                      .catch(() => undefined);
                    if (!b) {
                      b = await this.once('skin:' + digest, () =>
                        this.fetchBytes(url, 'skin', 512 * 1024, this.signal()),
                      );
                      verified(b, digest, 'sha256');
                      decodeTexture(b);
                      await atomicWrite(file, b);
                    }
                    // Mojang texture URL is a content identifier; PNG validation is repeated offline.
                    return decodeTexture(b);
                  },
                };
                rendered = await renderItem(reader, id, modern, item.components);
              } finally {
                if (client) this.release(client);
              }
              const bytes = encode(rendered.image);
              decodeTexture(bytes);
              await atomicWrite(filename, bytes);
              await atomicWrite(
                metadata,
                JSON.stringify({
                  render: rendered.kind,
                  sha256: hash(bytes),
                  version,
                  context: resources.fingerprint,
                  client: source?.sha1,
                }),
              );
              Object.assign(base, {
                status: 'ready',
                render: rendered.kind,
                url: 'minedock-item://cache/' + key + '.png',
              });
              this.metrics.renders++;
              await this.clean();
            }
          } catch (error) {
            this.signal().throwIfAborted();
            base.detail =
              error instanceof Error ? error.message.slice(0, 200) : 'Image unavailable';
            this.metrics.fallbacks++;
          }
        }
        if (base.status === 'ready' && resources.readers.length) base.source = resources.origin;
        if (this.visuals.size >= 512) this.visuals.delete(this.visuals.keys().next().value!);
        this.visuals.set(key, base);
        if (base.status !== 'ready') {
          if (this.negative.size >= 512) this.negative.delete(this.negative.keys().next().value!);
          this.negative.set(key, Date.now() + 60000);
        }
        return base;
      }),
    ).finally(() => this.releaseResources(resources));
  }
  async image(name: string): Promise<Buffer | undefined> {
    if (!/^[a-f0-9]{64}\.png$/.test(name)) return;
    try {
      const file = await this.file(name);
      if ((await stat(file)).size > 512 * 1024) return;
      const b = await boundedFile(file, 512 * 1024);
      decodeTexture(b);
      return b;
    } catch {
      return;
    }
  }
  async clean(): Promise<void> {
    return this.once('clean', async () => {
      const files = [];
      for (const name of await readdir(this.root)) {
        if (
          !/^(?:[a-f0-9]{64}\.(?:png|visual\.json)|registry-[a-zA-Z0-9._-]+\.json|object-[a-f0-9]{40}\.json|skin-[a-f0-9]{32,64}\.png)$/.test(
            name,
          )
        )
          continue;
        const file = await containedPath(this.root, name),
          info = await lstat(file);
        if (!info.isFile()) continue;
        files.push({ file, size: info.size, time: info.mtimeMs });
      }
      files.sort((a, b) => b.time - a.time);
      let bytes = 0,
        count = 0;
      for (const f of files) {
        bytes += f.size;
        count++;
        if (bytes > 128 * 1024 ** 2 || count > 5000 || Date.now() - f.time > 90 * 86400000)
          await rm(f.file, { force: true });
      }
    });
  }
  close(): void {
    for (const c of this.layerCache.values()) c.value.close();
    this.layerCache.clear();
    this.abort.abort();
    for (const c of this.clients.values()) c.client.close();
    this.clients.clear();
    for (const w of this.waiters.splice(0)) w();
  }
  stats(): Record<string, number> {
    return {
      ...this.metrics,
      visualEntries: this.visuals.size,
      negativeEntries: this.negative.size,
      registryContexts: this.registries.size,
      languageContexts: this.languages.size,
      openClients: this.clients.size,
      pending: this.pending.size,
    };
  }
}
