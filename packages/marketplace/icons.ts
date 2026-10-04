import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, stat, rm, utimes } from 'node:fs/promises';
import { approvedUrl, fetchApproved } from '../minecraft/downloads';
import { containedPath } from '../security/paths';
const maximum = 512 * 1024;
const iconHosts = new Set([
  'cdn.modrinth.com',
  'media.forgecdn.net',
  'mediafilez.forgecdn.net',
  'hangarcdn.papermc.io',
]);
function imageType(bytes: Buffer): string | undefined {
  const bounded = (width: number, height: number) =>
    width > 0 && height > 0 && width <= 2048 && height <= 2048;
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR' &&
    bounded(bytes.readUInt32BE(16), bytes.readUInt32BE(20))
  )
    return 'image/png';
  if (
    bytes.length >= 10 &&
    ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')) &&
    bounded(bytes.readUInt16LE(6), bytes.readUInt16LE(8))
  )
    return 'image/gif';
  if (
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const type = bytes.subarray(12, 16).toString('ascii');
    if (type === 'VP8X' && bounded(bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1))
      return 'image/webp';
    if (
      type === 'VP8 ' &&
      bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42])) &&
      bounded(bytes.readUInt16LE(26) & 16383, bytes.readUInt16LE(28) & 16383)
    )
      return 'image/webp';
    if (type === 'VP8L' && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21);
      if (bounded((bits & 16383) + 1, ((bits >>> 14) & 16383) + 1)) return 'image/webp';
    }
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset] !== 255) return;
      const marker = bytes[offset + 1]!;
      if (marker === 255) {
        offset++;
        continue;
      }
      if (marker === 217 || marker === 218) return;
      const size = bytes.readUInt16BE(offset + 2);
      if (size < 2 || offset + size + 2 > bytes.length) return;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker))
        return bounded(bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5))
          ? 'image/jpeg'
          : undefined;
      offset += size + 2;
    }
  }
}
/** Renderer receives a bounded raster data URL, never an arbitrary local filesystem URL. */
export class IconCache {
  private readonly pending = new Map<string, Promise<string | null>>();
  constructor(private readonly root: string) {}
  get(value: string): Promise<string | null> {
    let url: URL;
    try {
      url = approvedUrl(value);
      if (!iconHosts.has(url.hostname)) return Promise.resolve(null);
    } catch {
      return Promise.resolve(null);
    }
    const key = createHash('sha256').update(url.href).digest('hex');
    const existing = this.pending.get(key);
    if (existing) return existing;
    const work = this.load(key, url.href)
      .catch(() => null)
      .finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }
  private async load(key: string, url: string): Promise<string | null> {
    await mkdir(this.root, { recursive: true });
    const filename = await containedPath(this.root, key + '.img');
    let bytes: Buffer | undefined;
    try {
      const info = await stat(filename);
      if (info.size <= maximum && Date.now() - info.mtimeMs < 7 * 86400000)
        bytes = await readFile(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!bytes) {
      const response = await fetchApproved(url, AbortSignal.timeout(15000), {}, [], (candidate) =>
        iconHosts.has(candidate.hostname),
      );
      if (Number(response.headers.get('content-length') ?? 0) > maximum) {
        await response.body?.cancel();
        return null;
      }
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > maximum) {
          await reader.cancel();
          return null;
        }
        chunks.push(chunk.value);
      }
      bytes = Buffer.concat(chunks);
      if (!imageType(bytes)) return null;
      await writeFile(filename, bytes, { mode: 0o600 });
      await this.clean();
    }
    const type = imageType(bytes);
    if (!type) return null;
    await utimes(filename, new Date(), new Date());
    return `data:${type};base64,${bytes.toString('base64')}`;
  }
  async clean(clear = false): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const items = [];
    for (const name of await readdir(this.root)) {
      if (!/^[a-f0-9]{64}\.img$/.test(name)) continue;
      const filename = await containedPath(this.root, name),
        info = await stat(filename);
      items.push({ filename, size: info.size, mtime: info.mtimeMs });
    }
    items.sort((a, b) => b.mtime - a.mtime);
    let retained = 0;
    for (const item of items) {
      retained += item.size;
      if (clear || retained > 50 * 1024 ** 2 || Date.now() - item.mtime > 30 * 86400000)
        await rm(item.filename, { force: true });
    }
  }
}
