import { z } from 'zod';
export const restoreScopeSchema = z.enum([
  'all',
  'world',
  'config',
  'mods',
  'plugins',
  'datapacks',
]);
export type RestoreScope = z.infer<typeof restoreScopeSchema>;
export interface IncrementalSnapshot {
  id: string;
  serverId: string;
  at: string;
  logicalBytes: number;
  storedBytes: number;
  files: number;
  sha256: string;
}
export interface PartialPreview {
  token: string;
  snapshot: IncrementalSnapshot;
  scope: RestoreScope;
  paths: string[];
  replaced: string[];
}
export const backupSafetySchema = z
  .object({ beforeContent: z.boolean().default(true), beforeMinecraft: z.boolean().default(true) })
  .strict();
export type BackupSafety = z.infer<typeof backupSafetySchema>;
