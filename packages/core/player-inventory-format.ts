import { child, children, scalar, setChild, type NbtTag } from '../security/player-nbt';
import type {
  InventorySlot,
  ItemStack,
  PlayerInventory,
  PlayerSlot,
  InventoryEdit,
} from '../domain/administration';
import { resourceIdSchema } from '../domain/administration';
import { DomainError } from '../domain/errors';

function fail(message: string): never {
  throw new DomainError('PLAYER_DATA', message);
}
const sections = { inventory: 36, armor: 4, offhand: 1, ender: 27 } as const;
const equipmentNames = ['feet', 'legs', 'chest', 'head', 'offhand'];
export const slotKey = (slot: PlayerSlot) => `${slot.section}:${slot.index}`;
export function emptySlots(): InventorySlot[] {
  return Object.entries(sections).flatMap(([section, count]) =>
    Array.from({ length: count }, (_, index) => ({
      section: section as PlayerSlot['section'],
      index,
      item: null,
    })),
  );
}
function plain(tag: NbtTag, depth = 0): unknown {
  if (depth > 16) return '[nested data]';
  if (tag.type === 10)
    return Object.fromEntries(children(tag).map((t) => [t.name!, plain(t, depth + 1)]));
  if (tag.type === 9)
    return children(tag)
      .slice(0, 128)
      .map((t) => plain(t, depth + 1));
  if (typeof tag.value === 'bigint') return tag.value.toString();
  if (Buffer.isBuffer(tag.value)) return { type: tag.type, bytes: tag.value.length };
  return typeof tag.value === 'string' ? tag.value.slice(0, 2000) : tag.value;
}
export function itemStack(tag: NbtTag): ItemStack | null {
  if (tag.type !== 10) fail('Unrecognized item format.');
  const id = scalar(child(tag, 'id'));
  if (!id) return null;
  if (typeof id !== 'string' || !resourceIdSchema.safeParse(id).success)
    fail('Unrecognized item identifier format.');
  const modern = child(tag, 'count'),
    legacy = child(tag, 'Count');
  if (modern && legacy) fail('Ambiguous item count format.');
  const count = Number(scalar(modern ?? legacy) ?? 1);
  if (!Number.isSafeInteger(count) || count < 0 || count > 2304) fail('Invalid item count.');
  if (!count || id === 'minecraft:air') return null;
  const components = child(tag, 'components'),
    metadata = child(tag, 'tag');
  if ((components && components.type !== 10) || (metadata && metadata.type !== 10))
    fail('Unrecognized item metadata.');
  const damage = Number(
    scalar(child(components, 'minecraft:damage')) ??
      scalar(child(metadata, 'Damage')) ??
      scalar(child(tag, 'Damage')),
  );
  const enchantments =
    child(components, 'minecraft:enchantments') ??
    child(metadata, 'Enchantments') ??
    child(metadata, 'ench');
  const descriptions =
    enchantments?.type === 9
      ? children(enchantments).map(
          (t) => `${scalar(child(t, 'id')) ?? '?'} ${scalar(child(t, 'lvl')) ?? '?'}`,
        )
      : enchantments
        ? [JSON.stringify(plain(enchantments))]
        : [];
  return {
    id,
    count,
    damage: Number.isFinite(damage) ? damage : undefined,
    enchantments: descriptions.slice(0, 64),
    components:
      (components ?? metadata) ? (plain((components ?? metadata)!) as Record<string, unknown>) : {},
  };
}
function mapped(slot: number, ender: boolean): PlayerSlot | undefined {
  if (ender) return slot >= 0 && slot < 27 ? { section: 'ender', index: slot } : undefined;
  if (slot >= 0 && slot < 36) return { section: 'inventory', index: slot };
  if (slot >= 100 && slot <= 103) return { section: 'armor', index: slot - 100 };
  if (slot === -106 || slot === 150) return { section: 'offhand', index: 0 };
  return undefined;
}
export function fileUuid(root: NbtTag): string | undefined {
  const tag = child(root, 'UUID');
  if (tag?.type === 11 && Buffer.isBuffer(tag.value) && tag.value.length === 16) {
    const hex = tag.value.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const most = child(root, 'UUIDMost'),
    least = child(root, 'UUIDLeast');
  if (most?.type === 4 && least?.type === 4) {
    const bytes = Buffer.alloc(16);
    bytes.writeBigInt64BE(most.value as bigint);
    bytes.writeBigInt64BE(least.value as bigint, 8);
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (tag || most || least) fail('Unrecognized player UUID format.');
  return undefined;
}
export function inventoryReport(
  root: NbtTag,
  source: 'saved' | 'live',
  at: string,
  sha256?: string,
): PlayerInventory {
  const report: PlayerInventory = { source, at, sha256, writable: false, slots: emptySlots() };
  const inventory = child(root, 'Inventory'),
    ender = child(root, 'EnderItems'),
    equipment = child(root, 'equipment');
  if (
    !inventory ||
    inventory.type !== 9 ||
    (children(inventory).length && inventory.subtype !== 10)
  )
    fail('No supported player inventory list was found.');
  if (ender && (ender.type !== 9 || (children(ender).length && ender.subtype !== 10)))
    fail('Unrecognized Ender Chest format.');
  if (equipment && equipment.type !== 10) fail('Unrecognized equipment format.');
  let reason: string | undefined;
  const seen = new Set<string>();
  const put = (slot: PlayerSlot, item: ItemStack | null) => {
    const key = slotKey(slot);
    if (seen.has(key)) {
      reason = 'Conflicting equipment or duplicate inventory slots. Editing is unavailable.';
      return;
    }
    seen.add(key);
    report.slots.find((s) => slotKey(s) === key)!.item = item;
  };
  for (const [list, isEnder] of [
    [inventory, false],
    [ender, true],
  ] as const)
    for (const entry of children(list)) {
      const slot = child(entry, 'Slot'),
        position =
          typeof scalar(slot) === 'number' ? mapped(Number(scalar(slot)), isEnder) : undefined;
      if (!position || slot?.type !== 1) {
        reason = 'Custom inventory slots are read-only.';
        continue;
      }
      put(position, itemStack(entry));
    }
  for (const entry of children(equipment)) {
    const index = equipmentNames.indexOf(entry.name ?? '');
    if (index < 0) {
      reason = 'Custom equipment is read-only.';
      continue;
    }
    put(
      index === 4 ? { section: 'offhand', index: 0 } : { section: 'armor', index },
      itemStack(entry),
    );
  }
  const version = Number(scalar(child(root, 'DataVersion')));
  report.dataVersion = Number.isSafeInteger(version) ? version : undefined;
  // 1.13 through 1.21.11 saved schemas. Future/custom schemas are displayed conservatively, never rewritten.
  if (source === 'saved' && (!Number.isSafeInteger(version) || version < 1519 || version > 4671))
    reason = 'This saved data version has not been validated for editing.';
  report.writable = source === 'saved' && !reason;
  report.reason = reason;
  for (const [field, key] of [
    ['health', 'Health'],
    ['hunger', 'foodLevel'],
    ['saturation', 'foodSaturationLevel'],
    ['experience', 'XpTotal'],
    ['level', 'XpLevel'],
  ] as const) {
    const value = scalar(child(root, key));
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) report[field] = value;
  }
  const mode = scalar(child(root, 'playerGameType'));
  if (typeof mode === 'number' && Number.isInteger(mode) && mode >= 0 && mode <= 3)
    report.gamemode = ['survival', 'creative', 'adventure', 'spectator'][mode];
  return report;
}
function positionTag(slot: PlayerSlot): number {
  return slot.section === 'armor'
    ? 100 + slot.index
    : slot.section === 'offhand'
      ? -106
      : slot.index;
}
export function editInventory(root: NbtTag, edit: InventoryEdit): void {
  const report = inventoryReport(root, 'saved', new Date().toISOString());
  if (!report.writable) fail(report.reason ?? 'This inventory is read-only.');
  const equipment = child(root, 'equipment'),
    modernEquipment = equipment && ['armor', 'offhand'].includes(edit.slot.section);
  const container = modernEquipment
    ? equipment
    : child(root, edit.slot.section === 'ender' ? 'EnderItems' : 'Inventory');
  if (!container) fail('This inventory section is unavailable.');
  const name = edit.slot.section === 'offhand' ? 'offhand' : equipmentNames[edit.slot.index]!,
    position = positionTag(edit.slot);
  const existing = modernEquipment
    ? child(container, name)
    : children(container).find(
        (t) =>
          scalar(child(t, 'Slot')) === position ||
          (position === -106 && scalar(child(t, 'Slot')) === 150),
      );
  const item = existing ? itemStack(existing) : null;
  if (edit.action !== 'replace' && !item) fail('The selected slot is empty.');
  if (edit.action === 'remove' && edit.count! > item!.count)
    fail('The requested amount exceeds this slot.');
  let replacement: NbtTag | undefined;
  if (edit.action === 'remove' && edit.count! < item!.count) {
    replacement = existing!;
    const key = child(replacement, 'Count') ? 'Count' : 'count',
      countTag = child(replacement, key);
    setChild(replacement, key, { type: countTag?.type ?? 3, value: item!.count - edit.count! });
  } else if (edit.action === 'replace') {
    const version = report.dataVersion!,
      modern = version >= 3837;
    replacement = {
      type: 10,
      value: [
        { type: 8, name: 'id', value: edit.item! },
        { type: modern ? 3 : 1, name: modern ? 'count' : 'Count', value: edit.count! },
        ...(!modernEquipment ? [{ type: 1, name: 'Slot', value: position }] : []),
      ],
    };
  }
  if (modernEquipment) setChild(container, name, replacement);
  else {
    const entries = children(container),
      index = existing ? entries.indexOf(existing) : -1;
    if (replacement) {
      if (index < 0) entries.push(replacement);
      else entries[index] = replacement;
    } else if (index >= 0) entries.splice(index, 1);
    container.value = entries;
    container.subtype = entries.length ? 10 : (container.subtype ?? 0);
    container.raw = undefined;
  }
  inventoryReport(root, 'saved', new Date().toISOString());
}
export function restoreInventory(current: NbtTag, previous: NbtTag): void {
  for (const root of [current, previous]) {
    const report = inventoryReport(root, 'saved', new Date().toISOString());
    if (!report.writable) fail(report.reason ?? 'This inventory is read-only.');
  }
  if (scalar(child(current, 'DataVersion')) !== scalar(child(previous, 'DataVersion')))
    fail('Restoring across player data versions is unavailable.');
  for (const name of ['Inventory', 'EnderItems', 'equipment'])
    setChild(current, name, child(previous, name));
}
