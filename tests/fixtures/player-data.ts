import { writePlayerNbt, type NbtTag } from '../../packages/security/player-nbt';
export const playerUuid = '12345678-1234-4234-8234-123456789abc';
export function playerData(version = 4671, equipment = true): Buffer {
  const modern = version >= 3837;
  const item = (id: string, count: number, slot?: number): NbtTag => ({
    type: 10,
    value: [
      { type: 8, name: 'id', value: id },
      { type: modern ? 3 : 1, name: modern ? 'count' : 'Count', value: count },
      ...(slot !== undefined ? [{ type: 1, name: 'Slot', value: slot }] : []),
      {
        type: 10,
        name: modern ? 'components' : 'tag',
        value: [
          { type: 8, name: 'custom:test', value: 'untouched custom data' },
          { type: 4, name: 'precise', value: 9223372036854775806n },
        ],
      },
    ],
  });
  const uuidBytes = Buffer.from(playerUuid.replaceAll('-', ''), 'hex');
  const root: NbtTag = {
    type: 10,
    name: '',
    value: [
      { type: 3, name: 'DataVersion', value: version },
      { type: 11, name: 'UUID', value: uuidBytes },
      {
        type: 9,
        name: 'Inventory',
        subtype: 10,
        value: [
          item('minecraft:diamond_sword', 1, 0),
          item('example:custom_apple', 64, 15),
          ...(!equipment
            ? [item('minecraft:shield', 1, -106), item('minecraft:iron_boots', 1, 100)]
            : []),
        ],
      },
      { type: 9, name: 'EnderItems', subtype: 10, value: [item('example:gem', 8, 26)] },
      ...(equipment
        ? [
            {
              type: 10,
              name: 'equipment',
              value: [
                { ...item('minecraft:iron_boots', 1), name: 'feet' },
                { ...item('minecraft:shield', 1), name: 'offhand' },
              ],
            } as NbtTag,
          ]
        : []),
      { type: 5, name: 'Health', value: 18 },
      { type: 3, name: 'foodLevel', value: 16 },
      { type: 5, name: 'foodSaturationLevel', value: 2.5 },
      { type: 3, name: 'XpLevel', value: 12 },
      { type: 3, name: 'XpTotal', value: 240 },
      { type: 3, name: 'playerGameType', value: 0 },
      { type: 7, name: 'unknown_bytes', value: Buffer.from([0, 255, 128]) },
      {
        type: 12,
        name: 'unknown_longs',
        value: Buffer.from('7fffffffffffffff8000000000000000', 'hex'),
      },
      { type: 9, name: 'Pos', subtype: 6, value: [1, 80, -12].map((n) => ({ type: 6, value: n })) },
    ],
  };
  return writePlayerNbt(root);
}
