import { expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { HealthService } from '../packages/core/health';
it('persists grouped alerts, suppresses optional player alerts and acknowledges them', async () => {
  const f = await fixture(),
    health = new HealthService(f.repo, f.bus);
  try {
    for (let i = 0; i < 100; i++) health.push(f.server.id, 'crash');
    health.push(f.server.id, 'playerJoin');
    expect(health.notices()).toHaveLength(1);
    expect(health.notices()[0]?.read).toBe(false);
    health.read();
    expect(health.notices()[0]?.read).toBe(true);
    expect(() => health.configure({ ...health.settings(), cpuPercent: 0 })).toThrow();
  } finally {
    health.close();
    await f.cleanup();
  }
});
it('requires a sustained threshold and distinguishes normal stops from unexpected offline', async () => {
  const f = await fixture(),
    health = new HealthService(f.repo, f.bus);
  vi.useFakeTimers();
  try {
    const emit = () =>
      f.bus.emit({
        type: 'metric',
        serverId: f.server.id,
        metric: { at: new Date().toISOString(), cpu: 99, memory: 0, players: 0 },
      });
    emit();
    expect(health.notices()).toHaveLength(0);
    vi.advanceTimersByTime(31000);
    emit();
    expect(health.notices()[0]?.code).toBe('highCpu');
    for (const status of ['running', 'stopping', 'stopped'] as const)
      f.bus.emit({ type: 'server', server: { ...f.server, status } });
    expect(health.notices().some((n) => n.code === 'offline')).toBe(false);
    for (const status of ['running', 'stopped'] as const)
      f.bus.emit({ type: 'server', server: { ...f.server, status } });
    expect(health.notices().some((n) => n.code === 'offline')).toBe(true);
  } finally {
    vi.useRealTimers();
    health.close();
    await f.cleanup();
  }
});
it('reads bounded real crash evidence and flags missing backups without inventing measurements', async () => {
  const f = await fixture(),
    health = new HealthService(f.repo, f.bus);
  try {
    await mkdir(path.join(f.server.path, 'crash-reports'));
    await writeFile(
      path.join(f.server.path, 'crash-reports/crash-fixture.txt'),
      'Caused by: java.lang.OutOfMemoryError: Java heap space\n',
    );
    const report = await health.crash(f.server.id);
    expect(report.path).toContain('crash-fixture');
    expect(report.evidence).toHaveLength(1);
    expect(report.diagnosis).toContain('memory');
    expect(report.candidates).toEqual([]);
    const state = await health.report(f.server.id);
    expect(state.state).toBe('attention');
    expect(state.issues.some((i) => i.code === 'backupOld')).toBe(true);
    expect(state.memorySource).toBe('process-working-set');
  } finally {
    health.close();
    await f.cleanup();
  }
});
