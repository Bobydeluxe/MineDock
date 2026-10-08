import { z } from 'zod';
import { modId } from './mods';
import type { ContentProject, ContentVersion } from './content';
export const packKindSchema = z.enum(['datapack', 'resourcepack']);
export type PackKind = z.infer<typeof packKindSchema>;
export interface PackFile {
  id: string;
  kind: PackKind;
  world?: string;
  projectId?: string;
  versionId?: string;
  title: string;
  version?: string;
  filename: string;
  enabled: boolean;
  sha256: string;
  sha1: string;
  size: number;
  url?: string;
  installedAt: string;
  dependencies: string[];
}
export interface PackInventory {
  installed: PackFile[];
  manual: { filename: string; enabled: boolean; size: number }[];
  problems: string[];
  active?: string;
}
export const packRequestSchema = z
  .object({
    kind: packKindSchema,
    world: z.string().max(120).optional(),
    projectId: modId,
    versionId: modId.optional(),
  })
  .strict();
export type PackRequest = z.infer<typeof packRequestSchema>;
export interface PackPlan {
  token: string;
  entries: {
    project: ContentProject;
    version: ContentVersion;
    action: 'keep' | 'install' | 'update';
  }[];
  optional: string[];
  conflicts: string[];
}
export const packActionSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(['toggle', 'remove', 'select']),
    confirmation: z.string().max(60),
    url: z.string().url().max(2048).optional(),
  })
  .strict();
export type PackAction = z.infer<typeof packActionSchema>;
