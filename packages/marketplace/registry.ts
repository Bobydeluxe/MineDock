import { z } from 'zod';
import type { Repository } from '../database/database';
import type { MarketplaceId, MarketplaceSettings } from '../domain/content';
import type { ContentCatalog } from './content';
import { ModrinthCatalog } from './modrinth';
import { HangarCatalog } from './hangar';
import { GeyserCatalog } from './geyser';
export class MarketplaceRegistry {
  private readonly catalogs: Record<MarketplaceId, ContentCatalog>;
  constructor(private readonly repo: Repository) {
    this.catalogs = {
      modrinth: new ModrinthCatalog(repo),
      hangar: new HangarCatalog(),
      geyser: new GeyserCatalog(),
    };
  }
  catalog(provider: MarketplaceId): ContentCatalog {
    return this.catalogs[provider];
  }
  settings(): MarketplaceSettings {
    const row = this.repo.db
      .prepare("SELECT value FROM marketplace_settings WHERE key='content-history-limit'")
      .get();
    return { historyLimit: row ? Math.max(1, Number(row.value)) : 5 };
  }
  configure(input: { historyLimit: number }): MarketplaceSettings {
    const value = z
      .object({ historyLimit: z.number().int().min(1).max(20) })
      .strict()
      .parse(input);
    this.repo.db
      .prepare(
        "INSERT INTO marketplace_settings VALUES('content-history-limit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(String(value.historyLimit));
    this.repo.audit('marketplace.configured', 'Content history settings updated.');
    return this.settings();
  }
}
