import { it, expect } from 'vitest';
import { readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fixture } from './helpers';
import { ServerProcessSupervisor } from '../packages/server-core/supervisor';
import { Logger } from '../packages/core/logger';
import { BackupService, LocalBackupProvider } from '../packages/backups/service';
import { containedPath } from '../packages/security/paths';
import { FileService } from '../packages/core/files';
import { SchedulerService } from '../packages/core/scheduler';
import { Repository } from '../packages/database/database';
import { migrations } from '../packages/database/migrations';
import { rconCommand } from '../packages/rcon/client';
import { sha256 } from '../packages/backups/archive';
async function until(test: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (test()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('Timed out');
}
it('real child lifecycle, live logs, fragmented RCON, safe live backup and stopped restore', async () => {
  const f = await fixture();
  const runner = new ServerProcessSupervisor(
    f.repo,
    f.secrets,
    f.bus,
    new Logger(path.join(f.root, 'logs')),
    (_executable, _args, options) =>
      spawn(process.execPath, [path.resolve('tests/fixtures/mock-minecraft.cjs')], {
        ...options,
        stdio: 'pipe',
      }),
  );
  const backups = new BackupService(f.repo, runner, f.secrets, new LocalBackupProvider(f.repo));
  try {
    await runner.start(f.server.id);
    await until(() => f.repo.server(f.server.id).status === 'running');
    expect(runner.logs(f.server.id).some((l) => l.text.includes('Done'))).toBe(true);
    expect(await runner.players(f.server.id)).toEqual(['TestPlayer']);
    expect(await runner.command(f.server.id, 'multipart')).toBe('firstsecond');
    await expect(rconCommand(f.rconPort, 'wrong', 'list')).rejects.toThrow('rejected');
    const backup = await backups.create(f.server.id);
    expect(await backups.verify(backup.id)).toBe(true);
    expect(runner.logs(f.server.id).some((l) => l.text.includes('save-on'))).toBe(true);
    await expect(backups.restore(backup.id, 'Integration')).rejects.toThrow('Stop');
    await runner.stop(f.server.id);
    expect(f.repo.server(f.server.id).status).toBe('stopped');
    await writeFile(path.join(f.server.path, 'world', 'level.dat'), 'changed');
    await backups.restore(backup.id, 'Integration');
    expect(await readFile(path.join(f.server.path, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(f.repo.backups().some((b) => b.reason === 'before_restore')).toBe(true);
    expect(await sha256(f.repo.backup(backup.id).path)).toBe(backup.sha256);
    await writeFile(f.repo.backup(backup.id).path, 'corrupt');
    await expect(backups.restore(backup.id, 'Integration')).rejects.toThrow('Corrupted');
    expect(await readFile(path.join(f.server.path, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
  } finally {
    await runner.close();
    await f.cleanup();
  }
});
it('SQLite persistence, migrations, metrics retention and encryption', async () => {
  const f = await fixture();
  try {
    expect(f.repo.secret(f.server.id)).not.toContain('test-secret');
    expect(f.secrets.decrypt(f.repo.secret(f.server.id))).toBe('test-secret');
    expect(f.repo.db.prepare('PRAGMA user_version').get()?.user_version).toBe(migrations.length);
    f.repo.addMetric(f.server.id, {
      at: new Date().toISOString(),
      cpu: 10,
      memory: 100,
      players: 1,
    });
    f.repo.addMetric(f.server.id, { at: '2000-01-01T00:00:00Z', cpu: 99, memory: 900, players: 9 });
    f.repo.retainMetrics();
    expect(f.repo.metrics(f.server.id, 24)).toHaveLength(1);
    await f.repo.snapshotDatabase();
    const restored = new Repository(path.join(f.root, 'other'), f.bus);
    restored.close();
  } finally {
    await f.cleanup();
  }
});
it('blocks junction escapes and keeps RCON secrets out of file reads', async () => {
  const f = await fixture();
  const files = new FileService();
  try {
    const outside = path.join(f.root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    await symlink(
      outside,
      path.join(f.server.path, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(containedPath(f.server.path, 'escape/secret.txt')).rejects.toThrow('Symbolic');
    expect(await files.read(f.server.path, 'server.properties')).not.toContain('test-secret');
    await expect(files.write(f.server.path, 'invalid.json', '{bad')).rejects.toThrow('JSON');
    await expect(files.delete(f.server.path, '', '')).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});
it('persists scheduled tasks and records a failed task without immediate replay', async () => {
  const f = await fixture();
  let called = 0;
  const scheduler = new SchedulerService(f.repo, async () => {
    called++;
    throw new Error('test failure');
  });
  try {
    const job = scheduler.add({
      serverId: f.server.id,
      action: 'backup',
      intervalMinutes: 5,
      command: '',
      enabled: true,
    });
    job.nextRun = new Date(0).toISOString();
    f.repo.saveSchedule(job);
    const now = Date.now();
    await scheduler.tick(now);
    await scheduler.tick(now);
    expect(called).toBe(1);
    expect(f.repo.schedules()[0]?.lastError).toBe('test failure');
    expect(Date.parse(f.repo.schedules()[0]!.nextRun)).toBeGreaterThan(now);
  } finally {
    await scheduler.close();
    await f.cleanup();
  }
});
