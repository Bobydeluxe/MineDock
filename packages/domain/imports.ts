import { z } from 'zod';
import { engineSchema } from './types';
export interface ImportServerPreview {
  token: string;
  sourcePath: string;
  name: string;
  engine?: import('./types').Engine;
  version?: string;
  loaderVersion?: string;
  entrypoint?: string;
  launchArgsFile?: string;
  launchOptions?: {
    engine: import('./types').Engine;
    version: string;
    loaderVersion: string;
    launchArgsFile: string;
  }[];
  entrypoints: string[];
  properties: Record<string, string>;
  worlds: string[];
  plugins: number;
  mods: number;
  confidence: 'detected' | 'uncertain';
  warnings: string[];
  eulaAccepted: boolean;
}
export const importServerSchema = z
  .object({
    token: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    engine: engineSchema,
    version: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
    loaderVersion: z
      .string()
      .regex(/^[a-zA-Z0-9._+-]{1,80}$/)
      .optional(),
    entrypoint: z.string().max(400).optional(),
    launchArgsFile: z.string().max(400).optional(),
    copy: z.boolean().default(true),
    acceptEula: z.boolean().default(false),
    port: z.number().int().min(1024).max(65535),
    ipv6Port: z.number().int().min(1024).max(65535).optional(),
    memoryMin: z.number().int().min(256).max(131072).default(1024),
    memoryMax: z.number().int().min(512).max(131072).default(4096),
    confirmation: z.string().max(60),
  })
  .refine((value) => value.memoryMin <= value.memoryMax, {
    message: 'Minimum memory exceeds maximum memory.',
  });
export type ImportServerInput = z.infer<typeof importServerSchema>;
