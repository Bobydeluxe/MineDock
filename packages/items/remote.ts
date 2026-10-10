import { createHash } from 'node:crypto';
import { fetchApproved } from '../minecraft/downloads';

export type BinarySource = 'client' | 'language' | 'skin' | 'mod';
/** No caller-supplied hosts, credentials, query strings, fragments or downgrade redirects. */
export function assetUrl(value: string, kind: BinarySource): boolean {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.port && u.port !== '443')
    )
      return false;
    if (kind === 'client')
      return (
        u.hostname === 'piston-data.mojang.com' &&
        /^\/v1\/objects\/[a-f0-9]{40}\/client\.jar$/.test(u.pathname)
      );
    if (kind === 'language')
      return (
        u.hostname === 'resources.download.minecraft.net' &&
        /^\/[a-f0-9]{2}\/[a-f0-9]{40}$/.test(u.pathname)
      );
    if (kind === 'skin')
      return (
        u.hostname === 'textures.minecraft.net' && /^\/texture\/[a-f0-9]{64}$/.test(u.pathname)
      );
    return (
      u.hostname === 'cdn.modrinth.com' &&
      /^\/data\/[a-zA-Z0-9]{8}\/versions\/[a-zA-Z0-9]{8}\/[a-zA-Z0-9_.+%-]+\.jar$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
export async function assetBytes(
  url: string,
  kind: BinarySource,
  maximum: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (!assetUrl(url, kind)) throw new Error('Asset URL is not allowed');
  const response = await fetchApproved(
    url,
    AbortSignal.any([
      signal,
      AbortSignal.timeout(kind === 'client' || kind === 'mod' ? 120000 : 15000),
    ]),
    {},
    [],
    (u) => assetUrl(u.href, kind),
  );
  if (Number(response.headers.get('content-length') ?? 0) > maximum) {
    await response.body?.cancel();
    throw new Error('Asset download exceeds limits');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing asset response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maximum) throw new Error('Asset download exceeds limits');
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}
export function verified(
  bytes: Buffer,
  digest: string,
  algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1',
): Buffer {
  if (createHash(algorithm).update(bytes).digest('hex') !== digest)
    throw new Error('Asset integrity mismatch');
  return bytes;
}
