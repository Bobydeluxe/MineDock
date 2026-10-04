import { z } from 'zod';
import type { Backup } from './types';
export const retentionPolicySchema = z
  .object({
    mode: z.enum(['disabled', 'count', 'days', 'gfs']),
    count: z.number().int().min(1).max(10000).default(10),
    days: z.number().int().min(1).max(36500).default(7),
    hourly: z.number().int().min(0).max(10000).default(24),
    daily: z.number().int().min(0).max(10000).default(7),
    weekly: z.number().int().min(0).max(10000).default(4),
    monthly: z.number().int().min(0).max(10000).default(12),
    includeManual: z.boolean().default(false),
    timezone: z.string().max(80).default('UTC'),
  })
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid retention timezone.' },
  );
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
export interface RetentionPreview {
  token: string;
  serverId: string;
  createdAt: string;
  policy: RetentionPolicy;
  archives: Backup[];
  bytes: number;
  protectedCount: number;
  unavailableCount: number;
}
export const retentionPurgeSchema = z.object({
  token: z.string().uuid(),
  confirmation: z.string().max(60),
  manualConfirmation: z.string().max(60).default(''),
});
export type RetentionPurge = z.infer<typeof retentionPurgeSchema>;
