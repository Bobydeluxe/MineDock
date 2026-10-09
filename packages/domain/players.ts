import { z } from 'zod';
export const moderationActions = [
  'whitelistAdd',
  'whitelistRemove',
  'op',
  'deop',
  'kick',
  'ban',
  'pardon',
] as const;
export type ModerationAction = (typeof moderationActions)[number];
export const moderatePlayerSchema = z.object({
  action: z.enum(moderationActions),
  name: z.string().trim().min(1).max(32),
  confirmation: z.string().max(32),
  reason: z.string().trim().max(200).optional(),
});
export type ModeratePlayerInput = z.infer<typeof moderatePlayerSchema>;
export interface PlayerObservation {
  name: string;
  uuid?: string;
  xuid?: string;
  identitySource?: string;
  identityMode?: 'online' | 'offline' | 'bedrock';
  firstSeen?: string;
  lastSeen?: string;
  joins: number;
  observedMs: number;
  sessionStartedAt?: string;
  lastObservedAt?: string;
  sessionId?: string;
}
export interface KnownPlayer extends PlayerObservation {
  online: boolean;
  operator: boolean;
  whitelisted: boolean;
  banned: boolean;
  operatorLevel?: number;
  permission?: string;
  banReason?: string;
  banExpires?: string;
  minecraftPlaySeconds?: number;
  pingMs?: number;
  identityConflict?: boolean;
}
export interface PlayerReport {
  players: KnownPlayer[];
  actions: ModerationAction[];
  bannedIpCount?: number;
  warnings: string[];
}
export interface PlayerSession {
  id: string;
  startedAt: string;
  lastAt: string;
  endedAt?: string;
  interrupted: boolean;
}
export interface PlayerDetails {
  note: string;
  sessions: PlayerSession[];
  observedMs: { today: number; week: number; month: number };
}
