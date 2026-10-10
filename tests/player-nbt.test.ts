import { expect, it } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readPlayerNbt, writePlayerNbt, child, readSnbt } from '../packages/security/player-nbt';
import {
  inventoryReport,
  editInventory,
  fileUuid,
  restoreInventory,
} from '../packages/core/player-inventory-format';
import { playerData, playerUuid } from './fixtures/player-data';

it.each([1519, 3465, 3837, 4671])(
  'reads Java inventory schema %i and preserves every original byte on round trip',
  (version) => {
    const bytes = playerData(version, version >= 4325),
      root = readPlayerNbt(bytes);
    expect(gunzipSync(writePlayerNbt(root))).toEqual(gunzipSync(bytes));
    expect(fileUuid(root)).toBe(playerUuid);
    const report = inventoryReport(root, 'saved', '2026-10-09T00:00:00Z');
    expect(report.slots).toHaveLength(68);
    expect(report.slots.filter((s) => s.section === 'inventory')).toHaveLength(36);
    expect(report.slots.filter((s) => s.section === 'armor')).toHaveLength(4);
    expect(report.slots.filter((s) => s.section === 'offhand')).toHaveLength(1);
    expect(report.slots.filter((s) => s.section === 'ender')).toHaveLength(27);
    expect(
      report.slots.find((s) => s.section === 'inventory' && s.index === 15)?.item,
    ).toMatchObject({ id: 'example:custom_apple', count: 64 });
    expect(report.slots.filter((s) => s.item === null)).toHaveLength(63);
    expect(report).toMatchObject({
      writable: true,
      health: 18,
      hunger: 16,
      saturation: 2.5,
      level: 12,
      gamemode: 'survival',
    });
  },
);
it('edits the exact slot, preserves custom components, unknown arrays and position, and restores only inventory fields', () => {
  const original = readPlayerNbt(playerData()),
    root = readPlayerNbt(playerData());
  editInventory(root, {
    name: 'Friend',
    uuid: playerUuid,
    sha256: 'a'.repeat(64),
    slot: { section: 'inventory', index: 15 },
    action: 'remove',
    count: 3,
    confirmation: 'Friend',
  });
  const report = inventoryReport(
    readPlayerNbt(writePlayerNbt(root)),
    'saved',
    new Date().toISOString(),
  );
  expect(report.slots.find((s) => s.section === 'inventory' && s.index === 15)?.item).toMatchObject(
    {
      count: 61,
      components: { 'custom:test': 'untouched custom data', precise: '9223372036854775806' },
    },
  );
  expect(child(root, 'unknown_bytes')?.raw).toEqual(child(original, 'unknown_bytes')?.raw);
  expect(child(root, 'unknown_longs')?.raw).toEqual(child(original, 'unknown_longs')?.raw);
  expect(child(root, 'Pos')?.raw).toEqual(child(original, 'Pos')?.raw);
  editInventory(root, {
    name: 'Friend',
    uuid: playerUuid,
    sha256: 'a'.repeat(64),
    slot: { section: 'offhand', index: 0 },
    action: 'empty',
    confirmation: 'Friend',
  });
  expect(
    inventoryReport(root, 'saved', '').slots.find((s) => s.section === 'offhand')?.item,
  ).toBeNull();
  restoreInventory(root, original);
  expect(gunzipSync(writePlayerNbt(root))).toEqual(gunzipSync(playerData()));
});
it('refuses unknown schemas, excessive removals, malformed gzip, trailing bytes and allocation bombs', () => {
  const root = readPlayerNbt(playerData(99999));
  expect(inventoryReport(root, 'saved', '').writable).toBe(false);
  expect(() =>
    editInventory(root, {
      name: 'Friend',
      uuid: playerUuid,
      sha256: 'a'.repeat(64),
      slot: { section: 'inventory', index: 0 },
      action: 'empty',
      confirmation: 'Friend',
    }),
  ).toThrow('not been validated');
  expect(() => readPlayerNbt(Buffer.from('Bedrock data'))).toThrow('gzip');
  expect(() => readPlayerNbt(playerData().subarray(0, 20))).toThrow();
  expect(() =>
    readPlayerNbt(gzipSync(Buffer.concat([gunzipSync(playerData()), Buffer.from([0])]))),
  ).toThrow('Unexpected');
  expect(() => readPlayerNbt(gzipSync(Buffer.alloc(17 * 1024 ** 2)))).toThrow();
});
it('parses native SNBT without executing text, rejects malformed arrays, duplicates and truncation', () => {
  const root = readSnbt(
    '{Inventory:[{Slot:0b,id:"minecraft:stone",count:2}],UUID:[I;1,2,3,4],Health:19.5f,custom:{name:"a\\\\b"},EnderItems:[]}',
  );
  expect(inventoryReport(root, 'live', 'now')).toMatchObject({
    source: 'live',
    writable: false,
    health: 19.5,
  });
  expect(inventoryReport(root, 'live', 'now').slots[0]?.item).toMatchObject({
    id: 'minecraft:stone',
    count: 2,
  });
  for (const malformed of [
    '{Inventory:[',
    '{x:1,x:2}',
    '{x:[I;1b]}',
    '{x:999999999999999999999999l}',
    '{x:1} injected',
  ])
    expect(() => readSnbt(malformed)).toThrow();
});
