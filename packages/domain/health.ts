import { z } from 'zod';
export const noticeCodes = [
  'crash',
  'backupFailed',
  'highMemory',
  'highCpu',
  'lowDisk',
  'offline',
  'update',
  'playerJoin',
  'playerLeave',
  'lag',
] as const;
export type NoticeCode = (typeof noticeCodes)[number];
export interface Notice {
  id: string;
  serverId?: string;
  code: NoticeCode;
  at: string;
  read: boolean;
  count: number;
  detail?: string;
}
export const healthSettingsSchema = z
  .object({
    nativeNotifications: z.boolean().default(false),
    crash: z.boolean().default(true),
    backupFailed: z.boolean().default(true),
    offline: z.boolean().default(true),
    update: z.boolean().default(true),
    lowDisk: z.boolean().default(true),
    playerJoin: z.boolean().default(false),
    playerLeave: z.boolean().default(false),
    cpuPercent: z.number().min(10).max(1000).default(90),
    memoryPercent: z.number().min(50).max(200).default(90),
    diskFreeGiB: z.number().min(0.25).max(1000).default(2),
    backupAgeHours: z.number().int().min(1).max(720).default(48),
  })
  .strict();
export type HealthSettings = z.infer<typeof healthSettingsSchema>;
export interface HealthIssue {
  code: 'crash' | 'installation' | 'backupOld' | 'lowDisk' | 'highMemory' | 'highCpu' | 'content';
  severity: 'warning' | 'problem';
  detail?: string;
}
export interface HealthReport {
  state: 'healthy' | 'attention' | 'problem';
  issues: HealthIssue[];
  diskFreeBytes?: number;
  hostFreeBytes: number;
  memorySource: 'process-working-set';
}
export interface CrashReport {
  path?: string;
  text: string;
  diagnosis: string;
  evidence: string[];
  candidates: {
    id?: string;
    title: string;
    filename: string;
    confidence: 'probable' | 'possible';
  }[];
}
