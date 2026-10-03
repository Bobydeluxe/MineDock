import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { EventBus } from '../core/events';
import { DomainError } from '../domain/errors';

const hosts = [
  'piston-meta.mojang.com',
  'piston-data.mojang.com',
  'launchermeta.mojang.com',
  'launcher.mojang.com',
  'resources.download.minecraft.net',
  'fill.papermc.io',
  'fill-data.papermc.io',
  'api.papermc.io',
  'api.adoptium.net',
  'github.com',
  'githubusercontent.com',
  'api.modrinth.com',
  'cdn.modrinth.com',
];
export function approvedUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !hosts.some(
      (h) =>
        url.hostname === h || (h === 'githubusercontent.com' && url.hostname.endsWith('.' + h)),
    )
  )
    throw new DomainError('DOWNLOAD_URL', 'Download source is not allowed.');
  return url;
}
const headers = {
  'User-Agent': 'MineDock/0.1.0 (local desktop manager; https://www.minecraft.net/)',
};
export async function fetchApproved(url: string, signal: AbortSignal): Promise<Response> {
  let current = approvedUrl(url).href;
  for (let i = 0; i < 6; i++) {
    const response = await fetch(current, { headers, signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect has no destination.');
      current = approvedUrl(new URL(location, current).href).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new DomainError(
        'NETWORK',
        `The download service returned ${response.status}. Try again later.`,
      );
    }
    return response;
  }
  throw new Error('Too many redirects.');
}
export async function fetchJson<T>(url: string): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchApproved(url, AbortSignal.timeout(20000));
      if (Number(response.headers.get('content-length') ?? 0) > 8 * 1024 * 1024)
        throw new Error('Response is too large.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty response.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Response is too large.');
        }
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
    } catch (e) {
      last = e;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw last;
}
export class DownloadManager {
  private closing = false;
  private readonly controllers = new Map<string, AbortController>();
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly bus: EventBus) {}
  cancel(id: string): void {
    this.controllers.get(id)?.abort();
  }
  cancelAll(): void {
    this.closing = true;
    for (const controller of this.controllers.values()) controller.abort();
  }
  async download(
    url: string,
    destination: string,
    label: string,
    hash: { algorithm: 'sha1' | 'sha256' | 'sha512'; value: string },
    maximum = 1024 * 1024 * 1024,
  ): Promise<void> {
    if (this.closing) throw new Error('The download manager is closed.');
    const id = randomUUID();
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const progress = { id, label, received: 0, total: 0, speed: 0, phase: 'queued' };
    this.bus.emit({ type: 'progress', progress });
    const before = this.queue;
    let release!: () => void;
    this.queue = new Promise((resolve) => {
      release = resolve;
    });
    await before;
    const temp = destination + '.' + id + '.part';
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      controller.signal.throwIfAborted();
      await mkdir(path.dirname(destination), { recursive: true });
      const response = await fetchApproved(
        url,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60 * 1000)]),
      );
      progress.total = Number(response.headers.get('content-length') ?? 0);
      if (progress.total > maximum) throw new Error('Download is too large.');
      file = await open(temp, 'wx', 0o600);
      const digest = createHash(hash.algorithm);
      const start = Date.now();
      let emitted = 0;
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty download.');
      progress.phase = 'downloading';
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        progress.received += next.value.length;
        if (progress.received > maximum) {
          await reader.cancel();
          throw new Error('Download is too large.');
        }
        digest.update(next.value);
        let offset = 0;
        while (offset < next.value.length) {
          const written = await file.write(next.value, offset, next.value.length - offset);
          if (!written.bytesWritten) throw new Error('Writing the download was interrupted.');
          offset += written.bytesWritten;
        }
        progress.speed = progress.received / Math.max((Date.now() - start) / 1000, 0.1);
        if (Date.now() - emitted > 150) {
          emitted = Date.now();
          this.bus.emit({ type: 'progress', progress: { ...progress } });
        }
      }
      if (digest.digest('hex').toLowerCase() !== hash.value.toLowerCase())
        throw new DomainError(
          'CHECKSUM',
          'The downloaded file is corrupted. It was not installed.',
        );
      await file.sync();
      await file.close();
      file = undefined;
      await rename(temp, destination);
      this.bus.emit({ type: 'progress', progress: { ...progress, phase: 'verified', done: true } });
    } catch (e) {
      this.bus.emit({
        type: 'progress',
        progress: {
          ...progress,
          phase: 'failed',
          done: true,
          error: e instanceof Error ? e.message : 'Failed',
        },
      });
      throw e;
    } finally {
      await file?.close();
      await rm(temp, { force: true });
      this.controllers.delete(id);
      release();
    }
  }
}
