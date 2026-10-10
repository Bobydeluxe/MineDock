import { assetUrl } from './remote';
type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
/** A profile is taken from this item, never from the player viewing the panel. */
export function headTexture(state: Json): string | undefined {
  const profile = obj(state['minecraft:profile'] ?? state.SkullOwner);
  const legacy = obj(profile.Properties).textures;
  const properties = profile.properties ?? legacy;
  if (!Array.isArray(properties) || properties.length > 16) return;
  const property = properties
    .map(obj)
    .find(
      (p) =>
        p.name === 'textures' ||
        p.Name === 'textures' ||
        (legacy === properties && typeof p.Value === 'string'),
    );
  const encoded = property?.value ?? property?.Value;
  if (typeof encoded !== 'string' || encoded.length > 12000 || !/^[A-Za-z0-9+/=]+$/.test(encoded))
    return;
  try {
    const data = obj(JSON.parse(Buffer.from(encoded, 'base64').toString()));
    const raw = obj(obj(data.textures).SKIN).url;
    if (typeof raw !== 'string') return;
    const url = new URL(raw);
    // Legacy Mojang profiles used HTTP. Upgrade only this exact official path; never request HTTP.
    if (url.hostname === 'textures.minecraft.net' && url.protocol === 'http:')
      url.protocol = 'https:';
    if (assetUrl(url.href, 'skin')) return url.href;
  } catch {
    /* Unsafe or missing item profile remains unavailable. */
  }
}
