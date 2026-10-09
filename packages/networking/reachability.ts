import net from 'node:net';
import { z } from 'zod';
import type { Server } from '../domain/types';
import { engineDefinition } from '../domain/engines';
import { DomainError } from '../domain/errors';
export const reachabilitySchema = z
  .object({
    host: z
      .string()
      .trim()
      .max(253)
      .regex(/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/)
      .optional(),
    consent: z.boolean().default(false),
  })
  .strict();
export interface Reachability {
  local: 'reachable' | 'unreachable' | 'unknown';
  external: 'reachable' | 'unreachable' | 'unknown';
  at: string;
  observerAt?: string;
  port: number;
  firewall: 'unknown';
}
export async function testReachability(
  server: Server,
  raw: unknown,
  request: typeof fetch = fetch,
): Promise<Reachability> {
  const input = reachabilitySchema.parse(raw),
    edition = engineDefinition(server.engine).edition;
  const local =
    edition === 'java'
      ? await new Promise<boolean>((resolve) => {
          const socket = net.createConnection({ host: '127.0.0.1', port: server.port });
          const done = (value: boolean) => {
            socket.destroy();
            resolve(value);
          };
          socket.setTimeout(2000);
          socket.once('connect', () => done(true));
          socket.once('error', () => done(false));
          socket.once('timeout', () => done(false));
        })
      : undefined;
  const result: Reachability = {
    local: local === undefined ? 'unknown' : local ? 'reachable' : 'unreachable',
    external: 'unknown',
    at: new Date().toISOString(),
    port: server.port,
    firewall: 'unknown',
  };
  if (!input.consent) return result;
  if (
    !input.host ||
    /^(?:localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(
      input.host,
    ) ||
    /\.(?:local|localhost)$/i.test(input.host) ||
    !input.host.includes('.')
  )
    throw new DomainError('ADDRESS', 'Enter a public IPv4 address or hostname.');
  const response = await request(
    'https://api.mcstatus.io/v2/status/' +
      edition +
      '/' +
      encodeURIComponent(input.host + ':' + server.port) +
      '?query=false&timeout=5',
    { redirect: 'error', signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok)
    throw new DomainError('OBSERVER', 'The external observer could not complete this test.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (!response.body) throw new DomainError('OBSERVER', 'The observer returned no result.');
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw new DomainError('OBSERVER', 'The observer response exceeds the size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const value = z
    .object({ online: z.boolean(), retrieved_at: z.number().optional() })
    .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  result.external = value.online ? 'reachable' : 'unreachable';
  if (
    value.retrieved_at &&
    value.retrieved_at > 1000000000000 &&
    value.retrieved_at <= Date.now() + 60000
  )
    result.observerAt = new Date(value.retrieved_at).toISOString();
  return result;
}
