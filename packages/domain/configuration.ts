import { z } from 'zod';
export const configEditSchema = z
  .object({
    file: z.string().min(1).max(240),
    key: z.array(z.string().min(1).max(120)).min(1).max(12),
    value: z.union([z.boolean(), z.number().finite(), z.string().max(2000)]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ConfigEdit = z.infer<typeof configEditSchema>;
export interface ConfigField {
  key: string[];
  value: string | number | boolean;
  category: 'gameplay' | 'resources' | 'world' | 'network' | 'advanced';
}
export interface ConfigDocument {
  file: string;
  sha256: string;
  fields: ConfigField[];
}
export interface ConfigVersion {
  id: string;
  file: string;
  at: string;
}
export type AuditCode =
  | 'offlineIdentity'
  | 'publicBind'
  | 'whitelistOff'
  | 'rconEnabled'
  | 'rconMissing'
  | 'permissionsOpen'
  | 'permissionsUnknown';
export interface ConfigAudit {
  findings: AuditCode[];
  port: number;
  bind: string;
}
