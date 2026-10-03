import { it, expect, vi } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fixture } from './helpers';
import { ServerProcessSupervisor } from '../packages/server-core/supervisor';
import { Logger } from '../packages/core/logger';
it('bounds automatic restarts after repeated actual process crashes', async () => {
  const f = await fixture();
  const server = f.repo.server(f.server.id);
  server.autoRestart = true;
  f.repo.saveServer(server);
  let starts = 0;
  const runner = new ServerProcessSupervisor(
    f.repo,
    f.secrets,
    f.bus,
    new Logger(path.join(f.root, 'logs')),
    (_file, _args, options) => {
      starts++;
      return spawn(process.execPath, [path.resolve('tests/fixtures/mock-crash.cjs')], {
        ...options,
        stdio: 'pipe',
      });
    },
  );
  const nextCrash = () =>
    new Promise<void>((resolve) => {
      const off = f.bus.subscribe((event) => {
        if (
          event.type === 'server' &&
          event.server.id === server.id &&
          event.server.status === 'crashed'
        ) {
          off();
          resolve();
        }
      });
    });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const first = nextCrash();
    await runner.start(server.id);
    await first;
    const second = nextCrash();
    await vi.advanceTimersByTimeAsync(15000);
    await second;
    const third = nextCrash();
    await vi.advanceTimersByTimeAsync(30000);
    await third;
    await vi.advanceTimersByTimeAsync(120000);
    expect(starts).toBe(3);
    expect(f.repo.server(server.id).error).toContain('Trois crashes');
    expect(f.repo.server(server.id).status).toBe('crashed');
  } finally {
    vi.useRealTimers();
    await runner.close();
    await f.cleanup();
  }
});
