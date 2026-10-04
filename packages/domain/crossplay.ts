import { z } from 'zod';
import type { ContentVersion } from './content';
export const crossplaySchema = z.object({
  port: z.number().int().min(1024).max(65535),
  floodgate: z.boolean(),
  geyserVersion: z.string().regex(/^[a-zA-Z0-9_:+/.-]{1,150}$/),
  floodgateVersion: z
    .string()
    .regex(/^[a-zA-Z0-9_:+/.-]{1,150}$/)
    .optional(),
  confirmation: z.string().max(60),
});
export type CrossplayInput = z.infer<typeof crossplaySchema>;
export interface CrossplayStatus {
  supported: boolean;
  geyserInstalled: boolean;
  floodgateInstalled: boolean;
  configured: boolean;
  port?: number;
  authType?: 'online' | 'offline' | 'floodgate';
  configPath?: string;
  error?: string;
}
export interface CrossplayVersions {
  geyser: ContentVersion[];
  floodgate: ContentVersion[];
}
