import { z } from 'zod';
export const jvmSchema = z
  .object({
    preset: z.enum(['standard', 'optimized', 'custom']),
    flags: z
      .array(
        z
          .string()
          .regex(
            /^-XX:(?:\+UseG1GC|\+UseZGC|\+AlwaysPreTouch|\+UseStringDeduplication|MaxGCPauseMillis=[1-9]\d{0,3}|G1ReservePercent=(?:[1-9]|[1-4]\d|50))$/,
          ),
      )
      .max(12)
      .default([]),
  })
  .strict()
  .refine((v) => v.flags.filter((f) => f === '-XX:+UseG1GC' || f === '-XX:+UseZGC').length <= 1, {
    message: 'Choose one garbage collector.',
  });
export type JvmOptions = z.infer<typeof jvmSchema>;
export function jvmArguments(options: JvmOptions | undefined, java: number) {
  const value = jvmSchema.parse(options ?? { preset: 'standard' });
  if (value.preset === 'standard') return [];
  if (java < 17) throw new Error('Use the standard JVM preset for Java versions older than 17.');
  return value.preset === 'optimized' ? ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=100'] : value.flags;
}
export function recommendMemory(
  preset: 'small' | 'friends' | 'modded',
  totalMiB: number,
  freeMiB: number,
) {
  const target = preset === 'small' ? 3072 : preset === 'friends' ? 5120 : 8192;
  const max = Math.max(
    512,
    Math.min(
      target,
      Math.floor(Math.min(totalMiB * 0.6, Math.max(512, freeMiB - 2048)) / 256) * 256,
    ),
  );
  return { memoryMin: Math.min(1024, max), memoryMax: max };
}
export interface PerformanceSample {
  at: string;
  cpu: number;
  memory: number;
  players: number;
  tps?: number;
  mspt?: number;
  maxMspt?: number;
}
export interface LagEvent {
  at: string;
  tps?: number;
  mspt?: number;
  logs: string[];
}
export interface PerformanceReport {
  samples: PerformanceSample[];
  lags: LagEvent[];
}
export function parseTickMetrics(tpsText: string, msptText: string) {
  // Paper console replies may contain ANSI colour sequences.
  // eslint-disable-next-line no-control-regex
  const clean = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '').replace(/§[0-9a-fk-or]/gi, '');
  const tpsMatch = /TPS from last 1m, 5m, 15m:\s*\*?(\d+(?:[.,]\d+)?)/i.exec(clean(tpsText));
  const msptMatch =
    /Server tick times\s*\(avg\/min\/max\)\s*from last 5s, 10s, (?:1m|60s):\s*[^\d]*(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)/i.exec(
      clean(msptText),
    );
  const number = (s: string | undefined, max: number) => {
    const n = Number(s?.replace(',', '.'));
    return s && Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
  };
  return {
    tps: number(tpsMatch?.[1], 100),
    mspt: number(msptMatch?.[1], 60000),
    maxMspt: number(msptMatch?.[3], 60000),
  };
}
