import { z } from 'zod';
export const worldNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/)
  .refine((name) => !/(?:_nether|_the_end)$/.test(name), 'Choose a base world name.');
export interface WorldSummary {
  name: string;
  active: boolean;
  folders: string[];
  bytes: number;
  files: number;
  modified: string;
  seed?: string;
  lastPlayed?: string;
  version?: string;
  lastBackup?: string;
  metadataError?: string;
}
export interface WorldImportPreview {
  token: string;
  name: string;
  edition: 'java' | 'bedrock';
  folders: string[];
  bytes: number;
  files: number;
  seed?: string;
  version?: string;
  warnings: string[];
}
export const existingWorldNameSchema = z
  .string()
  .regex(/^[^/\\:\0]{1,120}$/)
  .refine((name) => name !== '.' && name !== '..');
export const worldActionSchema = z
  .object({
    action: z.enum(['duplicate', 'rename', 'delete', 'select']),
    name: existingWorldNameSchema,
    newName: worldNameSchema.optional(),
    confirmation: z.string().max(120),
  })
  .superRefine((value, context) => {
    if ((value.action === 'duplicate' || value.action === 'rename') && !value.newName)
      context.addIssue({ code: 'custom', path: ['newName'], message: 'Enter a new world name.' });
  });
export type WorldAction = z.infer<typeof worldActionSchema>;
export const worldImportSchema = z.object({
  token: z.string().uuid(),
  name: worldNameSchema,
  confirmation: z.string().max(60),
});
export type WorldImportInput = z.infer<typeof worldImportSchema>;
