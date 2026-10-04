import { z } from 'zod';
import type { Repository } from '../database/database';
import type { SecretStore } from '../security/secrets';
import type { MarketplaceId, MarketplaceSettings } from '../domain/content';
import type { ContentCatalog } from './content';
import { ModrinthCatalog } from './modrinth';
import { HangarCatalog } from './hangar';
import { CurseForgeCatalog } from './curseforge';
import { GeyserCatalog } from './geyser';
export class MarketplaceRegistry {
  private readonly catalogs: Record<MarketplaceId, ContentCatalog>;
  constructor(
    private readonly repo: Repository,
    private readonly secrets: SecretStore,
  ) {
    this.catalogs = {
      modrinth: new ModrinthCatalog(),
      hangar: new HangarCatalog(),
      curseforge: new CurseForgeCatalog(() => this.key()),
      geyser: new GeyserCatalog(),
    };
  }
  catalog(provider: MarketplaceId): ContentCatalog {
    return this.catalogs[provider];
  }
  private key(): string | undefined {
    const row = this.repo.db
      .prepare("SELECT value FROM marketplace_settings WHERE key='curseforge-key'")
      .get();
    return row ? this.secrets.decrypt(String(row.value)) : undefined;
  }
  settings(): MarketplaceSettings {
    const row = this.repo.db
      .prepare("SELECT value FROM marketplace_settings WHERE key='content-history-limit'")
      .get();
    return { curseforgeConfigured: !!this.key(), historyLimit: row ? Number(row.value) : 5 };
  }
  configure(input: { curseforgeKey?: string; historyLimit: number }): MarketplaceSettings {
    const value = z
      .object({
        curseforgeKey: z.string().max(1000).optional(),
        historyLimit: z.number().int().min(0).max(20),
      })
      .parse(input);
    if (value.curseforgeKey !== undefined) {
      if (value.curseforgeKey === '')
        this.repo.db.prepare("DELETE FROM marketplace_settings WHERE key='curseforge-key'").run();
      else
        this.repo.db
          .prepare(
            "INSERT INTO marketplace_settings VALUES('curseforge-key',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run(this.secrets.encrypt(value.curseforgeKey));
    }
    this.repo.db
      .prepare(
        "INSERT INTO marketplace_settings VALUES('content-history-limit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(String(value.historyLimit));
    this.repo.audit('marketplace.configured', 'Marketplace settings updated.');
    return this.settings();
  }
}
