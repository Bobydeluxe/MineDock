import { z } from 'zod';
import type { Runtime } from './types';
export interface RuntimeEntry extends Runtime {
  id: string;
  name: string;
  uses: { id: string; name: string; active: boolean }[];
}
export interface RuntimeHealth {
  id: string;
  status: 'healthy' | 'missing' | 'wrongVersion' | 'wrongArchitecture' | 'unavailable';
  checkedAt: string;
  version?: string;
  arch?: string;
  zts?: boolean;
}
export const runtimeActionSchema = z.object({
  id: z.string().min(1).max(160),
  confirmation: z.string().max(160),
  replacementId: z.string().max(160).optional(),
});
export type RuntimeActionInput = z.infer<typeof runtimeActionSchema>;
