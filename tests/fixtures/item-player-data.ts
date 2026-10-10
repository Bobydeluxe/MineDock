import { playerData } from './player-data';
import { readPlayerNbt, writePlayerNbt, type NbtTag } from '../../packages/security/player-nbt';
/** Synthetic saved inventory for UI QA, not gameplay. Item images are resolved separately. */
export function itemPlayerData(specials?: {
  headProperties?: { name: string; value: string }[];
}): Buffer {
  const root = readPlayerNbt(playerData(5023)),
    children = root.value as NbtTag[];
  const inventory = children.find((t) => t.name === 'Inventory')!.value as NbtTag[];
  const stack = (id: string, count: number, slot: number, components: NbtTag[] = []): NbtTag => ({
    type: 10,
    value: [
      { type: 8, name: 'id', value: 'minecraft:' + id },
      { type: 3, name: 'count', value: count },
      { type: 1, name: 'Slot', value: slot },
      { type: 10, name: 'components', value: components },
    ],
  });
  const sword = inventory[0]!.value as NbtTag[];
  (sword.find((t) => t.name === 'components')!.value as NbtTag[]).push(
    { type: 3, name: 'minecraft:damage', value: 50 },
    { type: 3, name: 'minecraft:max_damage', value: 1561 },
    {
      type: 10,
      name: 'minecraft:enchantments',
      value: [{ type: 3, name: 'minecraft:unbreaking', value: 3 }],
    },
    { type: 8, name: 'minecraft:custom_name', value: JSON.stringify({ text: "Friend's sword" }) },
  );
  inventory.push(
    stack('apple', 64, 9),
    stack('stone', 64, 10),
    stack('crafting_table', 1, 11),
    stack('leather_chestplate', 1, 12, [
      { type: 3, name: 'minecraft:dyed_color', value: 0x43a097 },
    ]),
  );
  const ender = children.find((t) => t.name === 'EnderItems')!.value as NbtTag[];
  if (specials) {
    const patterns: NbtTag = {
      type: 9,
      name: 'minecraft:banner_patterns',
      subtype: 10,
      value: [
        ['minecraft:stripe_top', 'red'],
        ['minecraft:border', 'blue'],
      ].map(([pattern, color]) => ({
        type: 10,
        value: [
          { type: 8, name: 'pattern', value: pattern! },
          { type: 8, name: 'color', value: color! },
        ],
      })),
    };
    inventory.push(
      stack('white_banner', 1, 13, [patterns]),
      stack('shield', 1, 14, [{ type: 8, name: 'minecraft:base_color', value: 'red' }, patterns]),
      stack('skeleton_skull', 1, 16),
      stack(
        'player_head',
        1,
        17,
        specials.headProperties
          ? [
              {
                type: 10,
                name: 'minecraft:profile',
                value: [
                  {
                    type: 9,
                    name: 'properties',
                    subtype: 10,
                    value: specials.headProperties.map((p) => ({
                      type: 10,
                      value: [
                        { type: 8, name: 'name', value: p.name },
                        { type: 8, name: 'value', value: p.value },
                      ],
                    })),
                  },
                ],
              },
            ]
          : [],
      ),
      stack('crossbow', 1, 18, [
        {
          type: 9,
          name: 'minecraft:charged_projectiles',
          subtype: 10,
          value: [
            {
              type: 10,
              value: [
                { type: 8, name: 'id', value: 'minecraft:firework_rocket' },
                { type: 3, name: 'count', value: 1 },
              ],
            },
          ],
        },
      ]),
      stack('potion', 1, 19, [
        {
          type: 10,
          name: 'minecraft:potion_contents',
          value: [{ type: 3, name: 'custom_color', value: 0x00cc55 }],
        },
      ]),
      stack('bow', 1, 20),
      stack('bundle', 1, 21),
    );
  }
  ender.push(stack('diamond', 12, 0), stack('oak_log', 32, 1));
  return writePlayerNbt(root);
}
