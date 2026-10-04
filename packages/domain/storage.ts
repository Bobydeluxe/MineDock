import { z } from 'zod';
export const storageCategories = [
  'worlds',
  'plugins',
  'mods',
  'logs',
  'backups',
  'config',
  'cache',
  'other',
] as const;
export type StorageCategory = (typeof storageCategories)[number];
export interface StorageFile {
  relativePath: string;
  size: number;
  category: StorageCategory;
  modifiedAt: string;
  backupId?: string;
}
export interface StorageReport {
  at: string;
  serverBytes: number;
  totalBytes: number;
  files: number;
  excludedEntries: number;
  categories: Record<StorageCategory, number>;
  largest: StorageFile[];
}
export interface StorageOverview {
  latest?: StorageReport;
  history: { at: string; serverBytes: number; totalBytes: number }[];
}
export const storageLocationSchema = z.object({
  relativePath: z.string().min(1).max(1000),
  backupId: z.string().uuid().optional(),
});
export type StorageLocation = z.infer<typeof storageLocationSchema>;
