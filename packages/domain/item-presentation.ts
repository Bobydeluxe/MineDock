import type { ItemStack } from './administration';
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** Read actual text only; never evaluate JSON, click events, selectors or HTML. */
export function itemText(value: unknown, depth = 0): string | undefined {
  if (depth > 8) return;
  if (typeof value === 'string') {
    if (value.length > 4000) return;
    if (depth === 0)
      try {
        return itemText(JSON.parse(value), depth + 1);
      } catch {
        /* Plain component strings are supported. */
      }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 32) return;
    const text = value.map((v) => itemText(v, depth + 1) ?? '').join('');
    return text.slice(0, 4000) || undefined;
  }
  const v = object(value);
  if (typeof v.text !== 'string') return;
  return (v.text + (Array.isArray(v.extra) ? (itemText(v.extra, depth + 1) ?? '') : '')).slice(
    0,
    4000,
  );
}
export function actualEnchantments(item: Pick<ItemStack, 'components'>): string[] {
  const modern = object(item.components['minecraft:enchantments']),
    levels = object(modern.levels ?? modern);
  const values = Object.entries(levels)
    .filter(
      ([id, level]) =>
        /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id) &&
        typeof level === 'number' &&
        Number.isInteger(level) &&
        level > 0,
    )
    .map(([id, level]) => id + ' ' + level);
  const legacy = item.components.Enchantments ?? item.components.ench;
  if (Array.isArray(legacy))
    for (const raw of legacy.slice(0, 64)) {
      const e = object(raw);
      if (
        (typeof e.id === 'string' || typeof e.id === 'number') &&
        typeof e.lvl === 'number' &&
        e.lvl > 0
      )
        values.push(String(e.id) + ' ' + e.lvl);
    }
  return values.slice(0, 64);
}
export function itemTextDetails(components: Record<string, unknown>): {
  name?: string;
  lore: string[];
} {
  const display = object(components.display),
    lore = components['minecraft:lore'] ?? display.Lore;
  return {
    name: itemText(components['minecraft:custom_name'] ?? display.Name),
    lore: Array.isArray(lore)
      ? lore
          .slice(0, 32)
          .map((v) => itemText(v))
          .filter((v): v is string => !!v)
      : [],
  };
}
