import { createPublicKey, createHash, verify } from 'node:crypto';
import { z } from 'zod';
import semver from 'semver';
import { DomainError } from '../domain/errors';
import type { UpdateTarget, VerifiedUpdate } from '../domain/updates';
const version = z
  .string()
  .max(60)
  .refine(
    (value) => !!semver.valid(value) && !semver.prerelease(value),
    'Invalid stable update version.',
  );
export const updatePayloadSchema = z.object({
  format: z.literal(1),
  product: z.literal('app.minedock.desktop'),
  channel: z.literal('stable'),
  version,
  notes: z.string().max(16000),
  publishedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  artifacts: z
    .array(
      z.object({
        platform: z.enum(['win32', 'linux', 'darwin']),
        arch: z.enum(['x64', 'arm64']),
        target: z.enum(['nsis', 'portable', 'appimage', 'deb', 'maczip', 'dmg']),
        filename: z.string().regex(/^[A-Za-z0-9._+-]{1,160}$/),
        url: z.string().url().max(2048),
        size: z
          .number()
          .int()
          .min(1)
          .max(2 * 1024 ** 3),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(12),
});
export type UpdatePayload = z.infer<typeof updatePayloadSchema>;
export const signedUpdateSchema = z.object({
  keyId: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z
    .string()
    .max(350000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  signature: z
    .string()
    .max(88)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export type SignedUpdate = z.infer<typeof signedUpdateSchema>;
export function updateKeyId(publicPem: string): string {
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== 'ed25519')
    throw new DomainError('UPDATE_SIGNATURE', 'The configured update key must be Ed25519.');
  return createHash('sha256')
    .update(key.export({ format: 'der', type: 'spki' }))
    .digest('hex');
}
export function verifyUpdateMetadata(
  raw: unknown,
  publicPem: string,
  currentVersion: string,
  platform: string,
  arch: string,
  target: UpdateTarget,
  now = Date.now(),
): VerifiedUpdate | null {
  if (!publicPem)
    throw new DomainError('UPDATE_SIGNATURE', 'No trusted publisher update key is configured.');
  const wrapper = signedUpdateSchema.parse(raw),
    payloadBytes = Buffer.from(wrapper.payload, 'base64'),
    signature = Buffer.from(wrapper.signature, 'base64');
  if (
    payloadBytes.length > 256 * 1024 ||
    payloadBytes.toString('base64') !== wrapper.payload ||
    signature.length !== 64 ||
    signature.toString('base64') !== wrapper.signature ||
    updateKeyId(publicPem) !== wrapper.keyId ||
    !verify(null, payloadBytes, createPublicKey(publicPem), signature)
  )
    throw new DomainError('UPDATE_SIGNATURE', 'Update metadata signature verification failed.');
  const payload = updatePayloadSchema.parse(JSON.parse(payloadBytes.toString('utf8')));
  if (
    Date.parse(payload.publishedAt) > now + 86400000 ||
    Date.parse(payload.expiresAt) <= now ||
    Date.parse(payload.expiresAt) <= Date.parse(payload.publishedAt)
  )
    throw new DomainError(
      'UPDATE_SIGNATURE',
      'Update metadata is expired or has an invalid publication date.',
    );
  const expected: Record<UpdateTarget, { platform: string; extension: string }> = {
    nsis: { platform: 'win32', extension: '.exe' },
    portable: { platform: 'win32', extension: '.exe' },
    appimage: { platform: 'linux', extension: '.AppImage' },
    deb: { platform: 'linux', extension: '.deb' },
    maczip: { platform: 'darwin', extension: '.zip' },
    dmg: { platform: 'darwin', extension: '.dmg' },
  };
  const unique = new Set<string>();
  for (const artifact of payload.artifacts) {
    const id = `${artifact.platform}/${artifact.arch}/${artifact.target}`,
      url = new URL(artifact.url),
      policy = expected[artifact.target];
    if (
      unique.has(id) ||
      artifact.platform !== policy.platform ||
      !artifact.filename.endsWith(policy.extension) ||
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !==
        `/Bobydeluxe/MineDock/releases/download/v${payload.version}/${artifact.filename}`
    )
      throw new DomainError(
        'UPDATE_SIGNATURE',
        'Update artifact metadata is invalid or outside the MineDock release repository.',
      );
    unique.add(id);
  }
  if (!semver.valid(currentVersion))
    throw new DomainError('UPDATE_VERSION', 'The installed application version is invalid.');
  if (!semver.gt(payload.version, currentVersion)) return null;
  const artifact = payload.artifacts.find(
    (item) => item.platform === platform && item.arch === arch && item.target === target,
  );
  if (!artifact)
    throw new DomainError(
      'UPDATE_PLATFORM',
      'This verified update has no installer matching this platform and architecture.',
    );
  return {
    version: payload.version,
    notes: payload.notes,
    publishedAt: payload.publishedAt,
    artifact,
  };
}
