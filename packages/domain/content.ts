import { z } from 'zod';
export const marketplaceIds = ['modrinth', 'hangar', 'geyser'] as const;
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
  serverSide?: boolean;
  gameVersions: string[];
  loaders: string[];
  files: {
    url: string;
    filename: string;
    primary: boolean;
    hash?: { algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512'; value: string };
  }[];
  dependencies: {
    projectId?: string;
    versionId?: string;
    required: boolean;
    type?: 'required' | 'optional' | 'incompatible' | 'embedded';
  }[];
}
export interface ContentProject {
  archived?: boolean;
  id: string;
  title: string;
  serverSide: boolean;
  kind: ContentKind;
  sideUnknown?: boolean;
  description?: string;
  body?: string;
  author?: string;
  iconUrl?: string;
  categories?: string[];
  downloads?: number;
  updatedAt?: string;
  gameVersions?: string[];
  loaders?: string[];
  clientSide?: string;
  environment?: string;
  slug?: string;
}
export interface MarketplaceSettings {
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
