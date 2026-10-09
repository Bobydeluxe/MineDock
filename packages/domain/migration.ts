import { z } from 'zod';
export const migrationTargetSchema = z
  .object({
    engine: z.enum(['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge']),
    version: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
    build: z
      .string()
      .regex(/^[a-zA-Z0-9._+@-]{1,80}$/)
      .optional(),
    loaderVersion: z
      .string()
      .regex(/^[a-zA-Z0-9._+-]{1,80}$/)
      .optional(),
    installerVersion: z.string().regex(/^[a-zA-Z0-9._+-]{1,80}$/).optional(),
  })
  .strict();
export type MigrationTarget = z.infer<typeof migrationTargetSchema>;
export interface MigrationReview {
  token: string;
  target: MigrationTarget;
  javaMajor: number;
  latest?: string;
  items: {
    category: 'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'runtime' | 'world' | 'config';
    title: string;
    status: 'compatible' | 'update' | 'unknown' | 'incompatible';
    version?: string;
  }[];
  blocked: boolean;
}
export const cloneSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    port: z.number().int().min(1024).max(65535),
    mode: z.enum(['complete', 'newWorld']),
    confirmation: z.string().max(60),
  })
  .strict();
export type CloneInput = z.infer<typeof cloneSchema>;
