import { z } from 'zod';
export const marketplaceIds = ['modrinth', 'curseforge', 'hangar', 'geyser'] as const;
export const marketplaceSchema = z.enum(marketplaceIds);
export type MarketplaceId = (typeof marketplaceIds)[number];
export type ContentKind = 'plugin' | 'mod' | 'datapack' | 'resourcepack';
export interface ContentVersion {
  id: string;
  projectId: string;
  name: string;
  publishedAt: string;
  changelog: string;
  releaseType?: 'release' | 'beta' | 'alpha' | 'snapshot';
  minimumJava?: number;
  gameVersions: string[];
  loaders: string[];
  files: {
    url: string;
    filename: string;
    primary: boolean;
    hash?: { algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512'; value: string };
  }[];
  dependencies: { projectId?: string; versionId?: string; required: boolean }[];
}
export interface ContentProject {
  id: string;
  title: string;
  serverSide: boolean;
  kind: ContentKind;
  sideUnknown?: boolean;
}
export interface MarketplaceSettings {
  curseforgeConfigured: boolean;
  historyLimit: number;
}
export interface ContentHistory {
  id: string;
  contentId: string;
  serverId: string;
  at: string;
  item: import('./types').InstalledContent;
  sha256: string;
  path: string;
}
export interface ContentUpdate {
  contentId: string;
  status: 'upToDate' | 'updateAvailable' | 'incompatible' | 'unknown' | 'manual';
  installedVersion: string;
  available?: ContentVersion;
  error?: string;
}
export interface ManualContent {
  filename: string;
  enabled: boolean;
  size: number;
  modified: string;
}
