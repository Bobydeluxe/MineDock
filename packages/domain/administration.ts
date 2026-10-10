import { z } from 'zod';
export const resourceIdSchema = z
  .string()
  .max(150)
  .regex(/^[a-z0-9_.-]+:[a-z0-9_./-]+$/);
export const playerNameSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_. -]+$/)
  .refine((s) => s.trim() === s);
export const safeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((text) =>
    [...text].every((character) => {
      const code = character.codePointAt(0)!;
      return code >= 32 && !(code >= 127 && code <= 159) && code !== 0x2028 && code !== 0x2029;
    }),
  );
export const coordinatesSchema = z
  .object({
    x: z.number().finite().min(-29999984).max(29999984),
    y: z.number().finite().min(-2048).max(2048),
    z: z.number().finite().min(-29999984).max(29999984),
    dimension: z
      .enum(['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'])
      .optional(),
  })
  .strict();
export const slotSchema = z
  .object({
    section: z.enum(['inventory', 'armor', 'offhand', 'ender']),
    index: z.number().int().min(0).max(35),
  })
  .strict()
  .refine(
    (s) =>
      s.index <
      (s.section === 'inventory' ? 36 : s.section === 'armor' ? 4 : s.section === 'ender' ? 27 : 1),
  );
export type PlayerSlot = z.infer<typeof slotSchema>;
const count = z.number().int().min(1).max(64);
export const playerActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('give'), item: resourceIdSchema, count }).strict(),
  z
    .object({
      action: z.literal('clear'),
      item: resourceIdSchema,
      count: z.number().int().min(1).max(2304),
    })
    .strict(),
  z
    .object({ action: z.literal('replace'), slot: slotSchema, item: resourceIdSchema, count })
    .strict(),
  z.object({ action: z.literal('message'), text: safeTextSchema }).strict(),
  z
    .object({
      action: z.literal('teleport'),
      destination: playerNameSchema.optional(),
      coordinates: coordinatesSchema.optional(),
    })
    .strict()
    .refine((v) => !!v.destination !== !!v.coordinates),
  z
    .object({
      action: z.literal('gamemode'),
      mode: z.enum(['survival', 'creative', 'adventure', 'spectator']),
    })
    .strict(),
  z.object({ action: z.enum(['kick', 'ban']), reason: safeTextSchema.optional() }).strict(),
  z
    .object({ action: z.enum(['pardon', 'op', 'deop', 'whitelistAdd', 'whitelistRemove', 'kill']) })
    .strict(),
  z
    .object({
      action: z.literal('effect'),
      effect: resourceIdSchema,
      seconds: z.number().int().min(1).max(1000000),
      amplifier: z.number().int().min(0).max(255),
    })
    .strict(),
  z.object({ action: z.literal('effectClear'), effect: resourceIdSchema.optional() }).strict(),
  z
    .object({
      action: z.literal('experience'),
      amount: z
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((n) => n !== 0),
      unit: z.enum(['points', 'levels']),
    })
    .strict(),
  z.object({ action: z.literal('spawnpoint'), coordinates: coordinatesSchema }).strict(),
  z
    .object({
      action: z.literal('title'),
      channel: z.enum(['title', 'subtitle', 'actionbar']),
      text: safeTextSchema,
    })
    .strict(),
]);
export type PlayerAction = z.infer<typeof playerActionSchema>;
export const playerActionInputSchema = z
  .object({
    name: playerNameSchema,
    uuid: z.string().uuid().optional(),
    input: playerActionSchema,
    confirmation: z.string().max(32),
  })
  .strict();
export type PlayerActionInput = z.infer<typeof playerActionInputSchema>;
export const playerBatchSchema = z
  .object({
    names: z
      .array(playerNameSchema)
      .min(1)
      .max(50)
      .refine((names) => new Set(names.map((n) => n.toLowerCase())).size === names.length),
    input: playerActionSchema,
    confirmation: z.string().max(1700),
  })
  .strict();
export type PlayerBatchInput = z.infer<typeof playerBatchSchema>;
export const ipActionSchema = z
  .object({
    action: z.enum(['ban-ip', 'pardon-ip']),
    ip: z.string().max(45),
    confirmation: z.string().max(45),
    reason: safeTextSchema.optional(),
  })
  .strict();
export type IpAction = z.infer<typeof ipActionSchema>;
export interface CommandResult {
  state: 'sent' | 'confirmed' | 'unverifiable' | 'failed';
  response: string;
  at: string;
}
export interface PlayerActionResult extends CommandResult {
  name: string;
}
export interface AdminEvent {
  id: string;
  at: string;
  name?: string;
  uuid?: string;
  action: string;
  state: CommandResult['state'];
  parameters: Record<string, string | number | boolean>;
}
export interface ItemStack {
  id: string;
  count: number;
  damage?: number;
  enchantments: string[];
  components: Record<string, unknown>;
}
export interface InventorySlot extends PlayerSlot {
  item: ItemStack | null;
}
export interface PlayerInventory {
  source: 'live' | 'saved' | 'unavailable';
  at?: string;
  sha256?: string;
  writable: boolean;
  reason?: string;
  dataVersion?: number;
  slots: InventorySlot[];
  health?: number;
  hunger?: number;
  saturation?: number;
  experience?: number;
  level?: number;
  gamemode?: string;
}
export interface PlayerSnapshot {
  id: string;
  at: string;
  sha256: string;
  reason: string;
}
export const inventoryEditSchema = z
  .object({
    name: playerNameSchema,
    uuid: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    slot: slotSchema,
    action: z.enum(['remove', 'empty', 'replace']),
    count: count.optional(),
    item: resourceIdSchema.optional(),
    confirmation: z.string().max(32),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action !== 'empty' && !v.count)
      ctx.addIssue({ code: 'custom', message: 'Enter an item count.' });
    if (v.action === 'replace' && !v.item)
      ctx.addIssue({ code: 'custom', message: 'Enter an item ID.' });
  });
export type InventoryEdit = z.infer<typeof inventoryEditSchema>;
export interface InventoryRestorePreview {
  token: string;
  snapshot: PlayerSnapshot;
  changes: { slot: PlayerSlot; before: ItemStack | null; after: ItemStack | null }[];
}
export interface ItemCatalog {
  source: 'registry-report' | 'saved-items' | 'unavailable';
  version: string;
  complete: boolean;
  provenance?: string;
  entries: {
    id: string;
    name: string;
    namespace: string;
    category: string;
    observed?: boolean;
    registered?: boolean;
    compatible?: boolean;
  }[];
}
export interface ItemAssetContext {
  version: string;
  available: boolean;
  source: 'local-client';
}
export interface ItemVisual {
  id: string;
  version: string;
  name: string;
  status: 'ready' | 'no-client' | 'custom' | 'unavailable';
  source: 'local-client';
  render?: 'flat' | 'layered' | 'model';
  url?: string;
}
export interface AdministrationCapabilities {
  actions: PlayerAction['action'][];
  nativeReads: boolean;
  edition: 'java' | 'bedrock';
  version: string;
  warnings: string[];
}
export interface GameRule {
  id: string;
  key: string;
  category: 'players' | 'world' | 'mobs' | 'messages';
  type: 'boolean' | 'integer';
  min?: number;
  max?: number;
  value?: boolean | number;
}
export const worldControlSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('time'),
      value: z.union([
        z.enum(['day', 'noon', 'night', 'midnight']),
        z.number().int().min(0).max(2147483647),
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal('weather'),
      value: z.enum(['clear', 'rain', 'thunder']),
      seconds: z.number().int().min(1).max(1000000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('difficulty'),
      value: z.enum(['peaceful', 'easy', 'normal', 'hard']),
    })
    .strict(),
  z
    .object({
      action: z.literal('gamerule'),
      id: z.string().max(150),
      value: z.union([z.boolean(), z.number().int().min(-1).max(1000000)]),
    })
    .strict(),
  z.object({ action: z.literal('announce'), text: safeTextSchema }).strict(),
  z.object({ action: z.enum(['save', 'list', 'seed', 'reload']) }).strict(),
  z
    .object({
      action: z.literal('worldborder'),
      diameter: z.number().finite().min(1).max(59999968),
      center: z
        .object({
          x: z.number().finite().min(-29999984).max(29999984),
          z: z.number().finite().min(-29999984).max(29999984),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal('worldspawn'), coordinates: coordinatesSchema }).strict(),
  z
    .object({
      action: z.literal('locate'),
      kind: z.enum(['structure', 'biome', 'poi']),
      id: resourceIdSchema,
    })
    .strict(),
  z
    .object({ action: z.literal('summon'), id: resourceIdSchema, coordinates: coordinatesSchema })
    .strict(),
  z
    .object({
      action: z.literal('setblock'),
      id: resourceIdSchema,
      coordinates: coordinatesSchema,
      mode: z.enum(['replace', 'destroy', 'keep']),
    })
    .strict(),
  z
    .object({
      action: z.literal('tick'),
      mode: z.enum(['freeze', 'unfreeze', 'rate']),
      rate: z.number().finite().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('team'),
      mode: z.enum(['add', 'remove', 'join', 'leave']),
      team: z.string().regex(/^[A-Za-z0-9_.-]{1,16}$/),
      player: playerNameSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('scoreboard'),
      mode: z.enum(['add', 'remove', 'set']),
      objective: z.string().regex(/^[A-Za-z0-9_.-]{1,16}$/),
      player: playerNameSchema.optional(),
      value: z.number().int().min(-2147483648).max(2147483647).optional(),
    })
    .strict(),
]);
export type WorldControl = z.infer<typeof worldControlSchema>;
export interface WorldControlsState {
  actions: WorldControl['action'][];
  rules: GameRule[];
  at?: string;
  source: 'live' | 'unavailable';
  time?: number;
  difficulty?: string;
  warnings: string[];
}
