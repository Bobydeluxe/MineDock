import { z } from 'zod';
export const modpackIndexSchema = z.object({
  formatVersion: z.literal(1),
  game: z.literal('minecraft'),
  versionId: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  summary: z.string().max(5000).optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        hashes: z.object({
          sha1: z.string().regex(/^[a-f0-9]{40}$/i),
          sha512: z.string().regex(/^[a-f0-9]{128}$/i),
        }),
        env: z
          .object({
            client: z.enum(['required', 'optional', 'unsupported']),
            server: z.enum(['required', 'optional', 'unsupported']),
          })
          .optional(),
        downloads: z.array(z.string().url().max(2000)).min(1).max(8),
        fileSize: z
          .number()
          .int()
          .min(1)
          .max(1024 ** 3),
      }),
    )
    .max(2000),
  dependencies: z.record(z.string().max(80), z.string().regex(/^[a-zA-Z0-9._+-]{1,80}$/)),
});
export type ModpackIndex = z.infer<typeof modpackIndexSchema>;
export interface ModpackFilePreview {
  path: string;
  size: number;
  side: 'required' | 'optional' | 'unsupported';
  available: boolean;
}
export interface ModpackPreview {
  token: string;
  name: string;
  versionId: string;
  summary?: string;
  minecraft: string;
  engine: 'fabric' | 'forge' | 'neoforge';
  loader: string;
  java: number;
  files: ModpackFilePreview[];
  overrides: string[];
  ignoredOverrides: string[];
  bytes: number;
  warnings: string[];
}
export const modpackProfileSchema = z.object({
  token: z.string().uuid(),
  name: z.string().max(120),
  versionId: z.string().max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  format: z.literal('mrpack'),
  optionalFiles: z.array(z.string().max(500)).max(2000),
});
export type ModpackProfile = z.infer<typeof modpackProfileSchema>;
export const modpackSelectionSchema = z.object({
  token: z.string().uuid(),
  optionalFiles: z.array(z.string().max(500)).max(2000),
  confirmation: z.string().max(120),
});
export type ModpackSelection = z.infer<typeof modpackSelectionSchema>;
