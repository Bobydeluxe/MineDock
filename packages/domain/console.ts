import { z } from 'zod';
export const macroSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    steps: z
      .array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('announce'),
            message: z
              .string()
              .max(200)
              .regex(/^[^\r\n\0]*$/),
          }),
          z.object({ type: z.literal('delay'), seconds: z.number().int().min(1).max(300) }),
          z.object({ type: z.enum(['save', 'backup', 'stop', 'restart']) }),
        ]),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine(
    (m) =>
      m.steps
        .filter((s) => s.type === 'delay')
        .reduce((sum, s) => sum + ('seconds' in s ? s.seconds : 0), 0) <= 600,
    { message: 'A macro cannot wait longer than ten minutes.' },
  );
export type MacroInput = z.infer<typeof macroSchema>;
export const logSearchSchema = z
  .object({
    query: z.string().max(120).default(''),
    category: z.enum(['all', 'chat', 'warnings', 'errors']).default('all'),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    player: z
      .string()
      .regex(/^[A-Za-z\d_. -]{0,32}$/)
      .default(''),
  })
  .strict();
export type LogSearch = z.input<typeof logSearchSchema>;
export interface LogSearchResult {
  lines: { file: string; text: string; at?: string }[];
  truncated: boolean;
  files: number;
}
export const commandCatalog = [
  { command: 'whitelist add ', description: 'whitelistAdd' },
  { command: 'whitelist remove ', description: 'whitelistRemove' },
  { command: 'op ', description: 'op' },
  { command: 'deop ', description: 'deop' },
  { command: 'kick ', description: 'kick' },
  { command: 'ban ', description: 'ban' },
  { command: 'pardon ', description: 'pardon' },
  { command: 'save-all flush', description: 'backup' },
  { command: 'time set day', description: 'console.day' },
  { command: 'weather clear', description: 'console.weather' },
  { command: 'gamemode survival ', description: 'survival' },
] as const;
export const logCategory = (line: string): 'chat' | 'warnings' | 'errors' | 'all' =>
  /\b(?:ERROR|FATAL)\b|Exception|Caused by:/.test(line)
    ? 'errors'
    : /\bWARN(?:ING)?\b/.test(line)
      ? 'warnings'
      : /\]:\s*(?:<[^>]{1,32}>|\[[A-Za-z\d_. -]{1,32}\])/i.test(line)
        ? 'chat'
        : 'all';
