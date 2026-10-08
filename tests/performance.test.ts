import { expect, it, vi } from 'vitest';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import { parseTickMetrics, jvmArguments, recommendMemory } from '../packages/domain/performance';
import { startCommand } from '../packages/server-core/supervisor';
it('parses only recognized tick replies, supports decimal commas and refuses fake measurements', () => {
  expect(
    parseTickMetrics(
      'TPS from last 1m, 5m, 15m: *19.9, 20.0, 20.0',
      'Server tick times (avg/min/max) from last 5s, 10s, 1m:\n◴ 52.1/1.1/80.2, 12.3/1.0/90.0, 1.2/0.5/90.0',
    ),
  ).toEqual({ tps: 19.9, mspt: 52.1, maxMspt: 80.2 });
  expect(
    parseTickMetrics('TPS from last 1m, 5m, 15m: 18,7, 20,0, 20,0', 'Unknown command'),
  ).toEqual({ tps: 18.7, mspt: undefined, maxMspt: undefined });
  expect(parseTickMetrics('Unknown command: 20', 'Error: 50')).toEqual({
    tps: undefined,
    mspt: undefined,
    maxMspt: undefined,
  });
});
it('keeps host memory available and validates JVM flags before spawning', async () => {
  const f = await fixture();
  try {
    expect(recommendMemory('modded', 8192, 4096).memoryMax).toBeLessThanOrEqual(2048);
    expect(() => jvmArguments({ preset: 'custom', flags: ['-javaagent:evil.jar'] }, 21)).toThrow();
    expect(() => jvmArguments({ preset: 'optimized', flags: [] }, 8)).toThrow();
    const command = await startCommand({ ...f.server, jvm: { preset: 'optimized', flags: [] } });
    expect(command.args).toContain('-XX:+UseG1GC');
    expect(command.args).toContain('-Xmx1024M');
  } finally {
    await f.cleanup();
  }
});
it('stores actual samples, keeps unsupported tick values null and records lag context', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    core.repo.saveServer({ ...f.server, status: 'running' });
    vi.spyOn(core.supervisor, 'command').mockImplementation(async (_id, command) =>
      command === 'tps'
        ? 'TPS from last 1m, 5m, 15m: 17.0, 19.0, 20.0'
        : 'Server tick times (avg/min/max) from last 5s, 10s, 1m:\n◴ 60.0/10.0/100.0, 40.0/10.0/100.0, 40.0/10.0/100.0',
    );
    core.bus.emit({
      type: 'metric',
      serverId: f.server.id,
      metric: { at: new Date().toISOString(), cpu: 12, memory: 1024, players: 2 },
    });
    await vi.waitFor(() => expect(core.performance.report(f.server.id, 1).samples).toHaveLength(1));
    const report = core.performance.report(f.server.id, 1);
    expect(report.samples[0]?.tps).toBe(17);
    expect(report.lags).toHaveLength(1);
  } finally {
    vi.restoreAllMocks();
    await core.close();
    await f.cleanup();
  }
});
it('records CPU and working-set pressure without inventing TPS or JVM heap', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    core.repo.saveServer({ ...f.server, engine: 'fabric', status: 'running' });
    core.bus.emit({
      type: 'metric',
      serverId: f.server.id,
      metric: { at: new Date().toISOString(), cpu: 99, memory: 1024 ** 3, players: 1 },
    });
    await vi.waitFor(() => expect(core.performance.report(f.server.id, 1).lags).toHaveLength(1));
    expect(core.performance.report(f.server.id, 1).lags[0]).toMatchObject({
      cpu: 99,
      memory: 1024 ** 3,
    });
    expect(core.performance.report(f.server.id, 1).samples[0]?.tps).toBeUndefined();
  } finally {
    await core.close();
    await f.cleanup();
  }
});
