import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, stat, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { EventBus } from '../core/events';
import { DomainError } from '../domain/errors';
import type { Repository } from '../database/database';
import type { DownloadPartial } from '../domain/operations';

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
  'api.purpurmc.org',
  'meta.fabricmc.net',
  'maven.fabricmc.net',
  'files.minecraftforge.net',
  'maven.minecraftforge.net',
  'maven.neoforged.net',
  'api.github.com',
  'www.minecraft.net',
  'net-secondary.web.minecraft-services.net',
  'www.minecraftservices.com',
  'www.minecraft.net',
  'minecraft.net',
  'bedrock.azureedge.net',
  'api.curseforge.com',
  'edge.forgecdn.net',
  'media.forgecdn.net',
  'mediafilez.forgecdn.net',
  'hangar.papermc.io',
  'hangarcdn.papermc.io',
  'download.geysermc.org',
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
  'User-Agent': 'MineDock/0.3.0 (local desktop manager; https://github.com/Bobydeluxe/MineDock)',
};
export async function fetchApproved(
  url: string,
  signal: AbortSignal,
  extra: Record<string, string> = {},
  allowStatuses: number[] = [],
  policy?: (url: URL) => boolean,
): Promise<Response> {
  let current = approvedUrl(url).href;
  const originalHost = new URL(current).hostname;
  for (let i = 0; i < 6; i++) {
    if (policy && !policy(new URL(current)))
      throw new DomainError('DOWNLOAD_URL', 'Download source is not allowed.');
    const safeExtra = Object.fromEntries(
      Object.entries(extra).filter(
        ([key]) =>
          new URL(current).hostname === originalHost || !/authorization|api-key/i.test(key),
      ),
    );
    const response = await fetch(current, {
      headers: { ...headers, ...safeExtra },
      signal,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect has no destination.');
      current = approvedUrl(new URL(location, current).href).href;
      continue;
    }
    if (!response.ok && !allowStatuses.includes(response.status)) {
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
export async function fetchText(
  url: string,
  extra: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<string> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(20000);
      const response = await fetchApproved(
        url,
        signal ? AbortSignal.any([timeout, signal]) : timeout,
        extra,
      );
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
      return Buffer.concat(chunks).toString('utf8');
    } catch (e) {
      signal?.throwIfAborted();
      last = e;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw last;
}
export async function fetchJson<T>(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  return JSON.parse(await fetchText(url, headers, signal)) as T;
}
export class DownloadManager {
  private closing = false;
  private readonly controllers = new Map<string, AbortController>();
  private queue: Promise<void> = Promise.resolve();
  private readonly partials = new Map<string, DownloadPartial>();
  constructor(
    private readonly bus: EventBus,
    private readonly repo?: Repository,
  ) {}
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
    hash: { algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512'; value: string } | undefined,
    maximum = 1024 * 1024 * 1024,
    signal?: AbortSignal,
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
    const temp = destination + '.download.part';
    const metadataFile = this.repo?.partial(destination) ?? this.partials.get(destination);
    const operationSignal = AbortSignal.any([
      controller.signal,
      ...(signal ? [signal] : []),
      AbortSignal.timeout(15 * 60 * 1000),
    ]);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let partial: DownloadPartial | undefined;
    let keepPartial = false;
    try {
      operationSignal.throwIfAborted();
      await mkdir(path.dirname(destination), { recursive: true });
      try {
        if ((await lstat(temp)).isSymbolicLink())
          throw new DomainError('PATH', 'Symbolic links are not allowed.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      let offset = 0;
      if (
        metadataFile &&
        metadataFile.url === url &&
        metadataFile.temporary === temp &&
        JSON.stringify(metadataFile.hash) === JSON.stringify(hash) &&
        (metadataFile.etag || metadataFile.lastModified)
      ) {
        try {
          offset = (await stat(temp)).size;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (offset > maximum) offset = 0;
      const requestHeaders: Record<string, string> = { 'Accept-Encoding': 'identity' };
      if (offset) {
        requestHeaders.Range = `bytes=${offset}-`;
        requestHeaders['If-Range'] = metadataFile!.etag ?? metadataFile!.lastModified!;
      }
      let response = await fetchApproved(url, operationSignal, requestHeaders, [416]);
      if (offset && response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
          response.headers.get('content-range') ?? '',
        );
        const etag = response.headers.get('etag');
        const modified = response.headers.get('last-modified');
        if (
          !range ||
          Number(range[1]) !== offset ||
          Number(range[2]) < offset ||
          Number(range[3]) <= Number(range[2]) ||
          (metadataFile!.expectedSize && Number(range[3]) !== metadataFile!.expectedSize) ||
          (metadataFile!.etag && etag !== metadataFile!.etag) ||
          (!metadataFile!.etag && modified !== metadataFile!.lastModified)
        ) {
          await response.body?.cancel();
          offset = 0;
          response = await fetchApproved(url, operationSignal, { 'Accept-Encoding': 'identity' });
        } else progress.total = Number(range[3]);
      } else if (response.status === 416) {
        await response.body?.cancel();
        offset = 0;
        response = await fetchApproved(url, operationSignal, { 'Accept-Encoding': 'identity' });
      } else offset = 0;
      if (response.status === 206 && !offset) {
        await response.body?.cancel();
        throw new Error('Unexpected partial download response.');
      }
      if (!offset) progress.total = Number(response.headers.get('content-length') ?? 0);
      if (progress.total > maximum) {
        await response.body?.cancel();
        throw new DomainError('SIZE', 'Download is too large.');
      }
      file = await open(temp, offset ? 'a' : 'w', 0o600);
      partial = {
        destination,
        temporary: temp,
        url: approvedUrl(url).href,
        hash,
        expectedSize: progress.total,
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
        offset,
      };
      this.partials.set(destination, partial);
      this.repo?.savePartial(partial);
      const digest = hash ? createHash(hash.algorithm) : undefined;
      if (offset && digest)
        for await (const chunk of createReadStream(temp)) {
          operationSignal.throwIfAborted();
          digest.update(chunk as Buffer);
        }
      progress.received = offset;
      const start = Date.now();
      let emitted = 0;
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty download.');
      progress.phase = 'downloading';
      for (;;) {
        operationSignal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        progress.received += next.value.length;
        if (progress.received > maximum) {
          await reader.cancel();
          throw new DomainError('SIZE', 'Download is too large.');
        }
        digest?.update(next.value);
        let offset = 0;
        while (offset < next.value.length) {
          const written = await file.write(next.value, offset, next.value.length - offset);
          if (!written.bytesWritten) throw new Error('Writing the download was interrupted.');
          offset += written.bytesWritten;
        }
        progress.speed = progress.received / Math.max((Date.now() - start) / 1000, 0.1);
        if (Date.now() - emitted > 150) {
          emitted = Date.now();
          partial.offset = progress.received;
          this.repo?.savePartial(partial);
          this.bus.emit({ type: 'progress', progress: { ...progress } });
        }
      }
      if (progress.total && progress.received !== progress.total)
        throw new DomainError('DOWNLOAD', 'The download was interrupted before completion.');
      if (hash && digest!.digest('hex').toLowerCase() !== hash.value.toLowerCase())
        throw new DomainError(
          'CHECKSUM',
          'The downloaded file is corrupted. It was not installed.',
        );
      await file.sync();
      await file.close();
      file = undefined;
      operationSignal.throwIfAborted();
      await rename(temp, destination);
      this.bus.emit({ type: 'progress', progress: { ...progress, phase: 'verified', done: true } });
    } catch (e) {
      keepPartial =
        !!partial &&
        !!(partial.etag || partial.lastModified) &&
        !controller.signal.aborted &&
        !signal?.aborted &&
        (!(e instanceof DomainError) || ['NETWORK', 'DOWNLOAD'].includes(e.code));
      if (keepPartial && partial) {
        partial.offset = progress.received;
        this.repo?.savePartial(partial);
      }
      this.bus.emit({
        type: 'progress',
        progress: {
          ...progress,
          phase: controller.signal.aborted || signal?.aborted ? 'cancelled' : 'failed',
          done: true,
          error: e instanceof Error ? e.message : 'Failed',
        },
      });
      throw e;
    } finally {
      try {
        await file?.close();
        if (!keepPartial) {
          await rm(temp, { force: true });
          this.partials.delete(destination);
          this.repo?.deletePartial(destination);
        }
      } finally {
        this.controllers.delete(id);
        release();
      }
    }
  }
}
