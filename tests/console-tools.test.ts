import { expect, it, vi } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import { macroSchema, logCategory } from '../packages/domain/console';
it('searches bounded plain/compressed historical logs and redacts secrets', async () => {
  const f = await fixture();
  await mkdir(path.join(f.server.path, 'logs'));
  await writeFile(
    path.join(f.server.path, 'logs/latest.log'),
    '[10:00:00] [Server thread/INFO]: <Alex> Hello\n[10:00:01] [Server thread/ERROR]: token=hidden\n',
  );
  await writeFile(
    path.join(f.server.path, 'logs/2026-10-08-1.log.gz'),
    gzipSync('[09:00:00] [Server thread/WARN]: slow\n'),
  );
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    expect(logCategory('[INFO]: <Alex> Hello')).toBe('chat');
    const chat = await core.consoleTools.search(f.server.id, { category: 'chat', player: 'Alex' });
    expect(chat.lines).toHaveLength(1);
    const errors = await core.consoleTools.search(f.server.id, { category: 'errors' });
    expect(errors.lines[0]?.text).toContain('[redacted]');
    const warnings = await core.consoleTools.search(f.server.id, { category: 'warnings' });
    expect(warnings.lines[0]?.file).toContain('.gz');
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('persists bounded custom macros and cancels an actual delayed operation without restarting', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    expect(() =>
      macroSchema.parse({ name: 'Bad', steps: [{ type: 'announce', message: 'line\nstop' }] }),
    ).toThrow();
    expect(() =>
      macroSchema.parse({
        name: 'Bad',
        steps: Array.from({ length: 3 }, () => ({ type: 'delay', seconds: 300 })),
      }),
    ).toThrow();
    core.repo.saveServer({ ...f.server, status: 'running' });
    const restart = vi.spyOn(core.supervisor, 'restart').mockResolvedValue();
    const macro = {
      name: 'Wait',
      steps: [{ type: 'delay' as const, seconds: 300 }, { type: 'restart' as const }],
    };
    core.consoleTools.save(f.server.id, macro);
    expect(core.repo.server(f.server.id).macros?.[0]?.name).toBe('Wait');
    const id = await core.consoleTools.macro(f.server.id, macro);
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    core.jobs.cancel(id);
    await core.close();
    expect(restart).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    await f.cleanup();
  }
});
