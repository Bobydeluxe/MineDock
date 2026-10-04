import { z } from 'zod';
export const recoveryActionSchema = z.object({
  action: z.enum(['retry', 'rollback', 'backup']),
  confirmation: z.string().max(300),
  backupId: z.string().uuid().optional(),
});
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;
export interface RecoveryReview {
  id: string;
  label: string;
  copies: { role: 'destination' | 'staging' | 'previous'; path: string; exists: boolean }[];
  rollbackAvailable: boolean;
  backups: import('./types').Backup[];
  preservedCopies: string[];
}
export type OperationStatus =
  | 'pending'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'applying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'attention';
export interface Operation {
  id: string;
  kind: string;
  serverId?: string;
  label: string;
  status: OperationStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  recoverable: boolean;
  preservedCopies?: string[];
}
export interface DownloadPartial {
  destination: string;
  url: string;
  temporary: string;
  hash?: { algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512'; value: string };
  expectedSize: number;
  etag?: string;
  lastModified?: string;
  offset: number;
}
export interface SwapCheckpoint {
  exportTicket?: string;
  importTicket?: string;
  destination: string;
  staging: string;
  previous: string;
  hadDestination?: boolean;
  committed?: boolean;
  /** Profiles are local journal data, never writable from the renderer. */
  beforeProfile?: import('./types').Server;
  beforeContent?: import('./types').InstalledContent[];
}
export interface OperationContext {
  id: string;
  signal: AbortSignal;
  phase(status: OperationStatus, received?: number, total?: number): void;
  checkpoint(value: SwapCheckpoint): void;
}
