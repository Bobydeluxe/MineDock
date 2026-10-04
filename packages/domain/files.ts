import { z } from 'zod';
export const fileActionSchema = z.object({
  action: z.enum(['rename', 'move', 'copy']),
  source: z.string().min(1).max(1000),
  destination: z.string().min(1).max(1000),
  overwrite: z.boolean().default(false),
  confirmation: z.string().max(255),
  overwriteConfirmation: z.string().max(255).optional(),
});
export type FileAction = z.infer<typeof fileActionSchema>;
export const extractArchiveSchema = z.object({
  destination: z.string().min(1).max(1000),
  overwrite: z.boolean().default(false),
  confirmation: z.string().max(255),
});
export type ExtractArchiveInput = z.infer<typeof extractArchiveSchema>;
