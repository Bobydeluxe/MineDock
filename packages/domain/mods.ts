import { z } from 'zod';
import type { Project, InstalledContent } from './types';
import type { ContentProject, ContentVersion, ContentUpdate } from './content';
export const modId = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
export const modSearchSchema = z
  .object({
    query: z.string().max(120).default(''),
    offset: z.number().int().min(0).max(10000).default(0),
    sort: z.enum(['relevance', 'downloads', 'follows', 'updated', 'newest']).default('relevance'),
    category: z
      .string()
      .regex(/^[a-z-]{0,60}$/)
      .default(''),
    compatibleOnly: z.boolean().default(true),
    gameVersion: z.string().max(40).optional(),
    loader: z.enum(['fabric', 'forge', 'neoforge']).optional(),
    side: z.enum(['server', 'client', 'any']).default('server'),
    recent: z.boolean().default(false),
  })
  .strict();
export type ModSearch = z.input<typeof modSearchSchema>;
export interface ModSearchResult {
  items: (Project & { compatible: boolean; updatedAt?: string })[];
  total: number;
  offset: number;
  offline: boolean;
}
export const modSelectionSchema = z
  .object({ projectId: modId, versionId: modId.optional() })
  .strict();
export type ModSelection = z.infer<typeof modSelectionSchema>;
export const modPlanInputSchema = z
  .object({
    selections: z.array(modSelectionSchema).min(1).max(300),
    allowPrerelease: z.boolean().default(false),
    collection: z.boolean().default(false),
    bulkUpdate: z.boolean().default(false),
  })
  .strict();
export type ModPlanInput = z.input<typeof modPlanInputSchema>;
export interface ModPlanEntry {
  project: ContentProject;
  version: ContentVersion;
  action: 'install' | 'update' | 'keep';
  automatic: boolean;
  parents: string[];
}
export interface ModDependency {
  projectId: string;
  title: string;
  parentId: string;
  type: 'required' | 'optional' | 'incompatible' | 'embedded';
  installed: boolean;
  versionId?: string;
}
export interface ModPlan {
  token: string;
  entries: ModPlanEntry[];
  dependencies: ModDependency[];
  warnings: string[];
  roots: string[];
}
export interface ModProblem {
  code:
    | 'minecraft'
    | 'loader'
    | 'missing'
    | 'dependency'
    | 'conflict'
    | 'duplicate'
    | 'corrupt'
    | 'changed'
    | 'manual';
  severity: 'critical' | 'warning';
  title: string;
  filename: string;
  detail?: string;
}
export interface LocalMod {
  filename: string;
  enabled: boolean;
  size: number;
  title: string;
  version?: string;
  modIds: string[];
  loaders: string[];
  minecraft?: string;
  serverOnly?: boolean;
  required?: Record<string, string>;
  corrupted: boolean;
}
export interface ModInventory {
  installed: InstalledContent[];
  manual: LocalMod[];
  problems: ModProblem[];
  scannedAt: string;
}
export interface ModDetail {
  project: ContentProject;
  versions: ContentVersion[];
  offline: boolean;
}
export interface ModCollection {
  id: string;
  name: string;
  projects: ModSelection[];
  createdAt: string;
}
export const modCollectionSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80),
    projects: z.array(modSelectionSchema).min(1).max(300),
  })
  .strict();
export interface ModLibrary {
  favorites: Project[];
  collections: ModCollection[];
}
export interface ModEvent {
  id: string;
  at: string;
  action:
    | 'installed'
    | 'updated'
    | 'uninstalled'
    | 'rollback'
    | 'enabled'
    | 'disabled'
    | 'pinned'
    | 'unpinned';
  title: string;
  version?: string;
  previousVersion?: string;
}
export const modBulkSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(300),
    action: z.enum(['enable', 'disable', 'uninstall']),
    removeOrphans: z.boolean().default(false),
    confirmation: z.string().max(100),
  })
  .strict();
export interface ModRemoval {
  selected: InstalledContent[];
  unused: InstalledContent[];
  shared: { item: InstalledContent; users: number }[];
  blocked: string[];
}
export interface ModUpdateResult {
  updates: ContentUpdate[];
  offline: boolean;
  checkedAt: string;
}
export const modTargetSchema = z
  .object({
    engine: z.enum(['fabric', 'forge', 'neoforge']),
    version: z.string().regex(/^[a-zA-Z0-9_.-]{1,40}$/),
    loaderVersion: z
      .string()
      .regex(/^[a-zA-Z0-9_.+-]{1,80}$/)
      .optional(),
    build: z
      .string()
      .regex(/^[a-zA-Z0-9_.+-]{1,80}$/)
      .optional(),
  })
  .strict();
export type ModTarget = z.infer<typeof modTargetSchema>;
export interface ModMigration {
  target: ModTarget;
  compatible: string[];
  replace: ModSelection[];
  incompatible: string[];
  manual: string[];
}
