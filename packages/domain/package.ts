import { z } from 'zod';
import { createServerSchema, installedContentSchema } from './types';
import { packFileSchema } from './packs';
import { jvmSchema } from './performance';
export const packageManifestSchema = z
  .object({
    format: z.literal('minedock'),
    version: z.literal(1),
    createdAt: z.string().datetime(),
    sourcePlatform: z.enum(['win32', 'linux', 'darwin']),
    includesSensitiveConfiguration: z.boolean(),
    profile: createServerSchema,
    javaRequired: z.number().int().min(0).max(100),
    jvm: jvmSchema.optional(),
    packs: z.array(packFileSchema).max(1000),
    activeResourcePack: z.string().uuid().optional(),
    content: z.array(installedContentSchema).max(1000),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(500),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            bytes: z
              .number()
              .int()
              .nonnegative()
              .max(64 * 1024 ** 3),
          })
          .strict(),
      )
      .max(100000),
  })
  .strict();
export type PackageManifest = z.infer<typeof packageManifestSchema>;
export interface PackagePreview {
  token: string;
  name: string;
  engine: import('./types').Engine;
  version: string;
  javaRequired: number;
  sourcePlatform: string;
  includesSensitiveConfiguration: boolean;
  files: number;
  bytes: number;
  worlds: string[];
  content: number;
  port: number;
  ipv6Port?: number;
  memoryMin: number;
  memoryMax: number;
}
export const packageImportSchema = z
  .object({
    token: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    acceptEula: z.literal(true),
    confirmation: z.string().max(60),
  })
  .strict();
