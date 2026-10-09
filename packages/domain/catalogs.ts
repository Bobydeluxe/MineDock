import type { Engine } from './types';
export interface CatalogOption {
  version: string;
  stable: boolean;
  recommended?: boolean;
}
export interface EngineCatalogData {
  engine: Engine;
  minecraftVersion?: string;
  versions: CatalogOption[];
  builds: CatalogOption[];
  installers: CatalogOption[];
  fetchedAt: string;
  cached: boolean;
  offline: boolean;
}
