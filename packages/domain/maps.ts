import { z } from 'zod';
export const mapKindSchema = z.enum(['bluemap', 'dynmap']);
export type MapKind = z.infer<typeof mapKindSchema>;
export const mapApplySchema = z
  .object({
    kind: mapKindSchema,
    token: z.string().uuid(),
    port: z.number().int().min(1024).max(65535),
    acceptAssets: z.boolean(),
    confirmation: z.string().max(60),
  })
  .strict();
export interface MapStatus {
  kind: MapKind;
  installed: boolean;
  url?: string;
}
