import { z } from 'zod';
import type { IconCache } from '../marketplace/icons';
import { fetchJson } from '../minecraft/downloads';
/** Mojang identity and texture URLs only; no third-party username tracking service. */
export class PlayerSkins {
  private cache = new Map<string, { at: number; image: string | null }>();
  constructor(private icons: IconCache) {}
  async get(uuid: string): Promise<string | null> {
    const id = z
      .string()
      .regex(/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i)
      .parse(uuid)
      .replaceAll('-', '')
      .toLowerCase();
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.at < 3600000) return cached.image;
    let image: string | null = null;
    try {
      const response = z
        .object({
          id: z.string(),
          properties: z.array(z.object({ name: z.string(), value: z.string().max(16384) })).max(20),
        })
        .parse(await fetchJson('https://sessionserver.mojang.com/session/minecraft/profile/' + id));
      if (response.id.toLowerCase() !== id) return null;
      const encoded = response.properties.find((p) => p.name === 'textures')?.value;
      if (encoded) {
        const data = z
          .object({
            profileId: z.string(),
            textures: z.object({ SKIN: z.object({ url: z.string().url() }).optional() }),
          })
          .parse(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')));
        if (data.profileId.toLowerCase() !== id) return null;
        if (data.textures.SKIN) {
          const url = new URL(data.textures.SKIN.url);
          if (
            url.hostname === 'textures.minecraft.net' &&
            /^\/texture\/[a-f0-9]{32,128}$/.test(url.pathname) &&
            !url.username &&
            !url.password &&
            !url.port
          ) {
            url.protocol = 'https:';
            image = await this.icons.get(url.href);
          }
        }
      }
    } catch {
      /* No skin is a valid fallback for unavailable or offline identities. */
    }
    if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(id, { at: Date.now(), image });
    return image;
  }
}
