import { it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { retainedBackups, type RetentionJournal } from '../packages/backups/retention';
import { retentionPolicySchema } from '../packages/domain/retention';
import { AppCore } from '../packages/core/app';
import { fixture } from './helpers';
import type { Backup } from '../packages/domain/types';
import type { Operation } from '../packages/domain/operations';
afterEach(() => vi.restoreAllMocks());
const archive = (at: string, reason = 'scheduled'): Backup => ({
  id: randomUUID(),
  serverId: randomUUID(),
  name: at,
  createdAt: at,
  size: 10,
  sha256: 'a'.repeat(64),
  version: '1.21.11',
  reason,
});
it('retains exact count/age policies while protecting manual, safety and invalid-date archives', () => {
  const items = [
    archive('2026-10-04T12:00:00Z'),
    archive('2026-10-03T12:00:00Z'),
    archive('2026-09-01T12:00:00Z'),
    archive('2020-01-01T00:00:00Z', 'manual'),
    archive('2020-01-02T00:00:00Z', 'before_restore'),
    archive('invalid'),
  ];
  expect(retainedBackups(items, retentionPolicySchema.parse({ mode: 'count', count: 2 }))).toEqual(
    new Set([items[0]!.id, items[1]!.id, items[3]!.id, items[4]!.id, items[5]!.id]),
  );
  expect(
    retainedBackups(
      items,
      retentionPolicySchema.parse({ mode: 'days', days: 7 }),
      Date.parse('2026-10-04T12:00:00Z'),
    ),
  ).toHaveLength(5);
  expect(
    retainedBackups(
      items,
      retentionPolicySchema.parse({ mode: 'count', count: 1, includeManual: true }),
    ),
  ).toEqual(new Set([items[0]!.id, items[5]!.id]));
  expect(retainedBackups(items, retentionPolicySchema.parse({ mode: 'disabled' }))).toHaveLength(
    items.length,
  );
  expect(
    retainedBackups([items[2]!], retentionPolicySchema.parse({ mode: 'days', days: 1 })),
  ).toEqual(new Set([items[2]!.id]));
  expect(() => retentionPolicySchema.parse({ mode: 'gfs', timezone: 'invalid-zone' })).toThrow(
    'timezone',
  );
});
it('selects newest GFS calendar representatives across gaps, local week/month boundaries and repeated DST hours', () => {
  const repeatedHour = [archive('2026-10-25T00:10:00Z'), archive('2026-10-25T01:10:00Z')];
  expect(
    retainedBackups(
      repeatedHour,
      retentionPolicySchema.parse({
        mode: 'gfs',
        hourly: 2,
        daily: 0,
        weekly: 0,
        monthly: 0,
        timezone: 'Europe/Paris',
      }),
    ),
  ).toHaveLength(2);
  const items = [
    archive('2026-10-04T23:30:00Z'),
    archive('2026-10-04T12:00:00Z'),
    archive('2026-10-03T12:00:00Z'),
    archive('2026-09-27T12:00:00Z'),
    archive('2026-08-30T12:00:00Z'),
    archive('2026-08-01T12:00:00Z'),
  ];
  const keep = retainedBackups(
    items,
    retentionPolicySchema.parse({
      mode: 'gfs',
      hourly: 0,
      daily: 1,
      weekly: 2,
      monthly: 3,
      timezone: 'Europe/Paris',
    }),
  );
  expect(keep).toEqual(new Set([items[0]!.id, items[1]!.id, items[3]!.id, items[4]!.id]));
});
async function backups(core: AppCore, serverId: string) {
  const saved: Backup[] = [];
  for (let index = 0; index < 4; index++) {
    const backup = await core.backups.create(serverId, index === 3 ? 'manual' : 'scheduled');
    backup.createdAt = new Date(Date.UTC(2026, 9, 4 - index, 12)).toISOString();
    core.repo.db
      .prepare('UPDATE backups SET metadata=? WHERE id=?')
      .run(JSON.stringify(backup), backup.id);
    saved.push(backup);
  }
  core.retention.configure(serverId, retentionPolicySchema.parse({ mode: 'count', count: 1 }));
  return saved;
}
it('previews verified bytes, persists policy and purges only approved automatic backups after exact confirmations', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets);
  try {
    const saved = await backups(core, f.server.id);
    const preview = await core.retention.preview(f.server.id);
    expect(preview.archives.map((item) => item.id).sort()).toEqual(
      [saved[1]!.id, saved[2]!.id].sort(),
    );
    expect(preview.bytes).toBe(saved[1]!.size + saved[2]!.size);
    expect(preview.protectedCount).toBe(2);
    await expect(
      core.retention.purge(f.server.id, {
        token: preview.token,
        confirmation: 'wrong',
        manualConfirmation: '',
      }),
    ).rejects.toThrow('Confirm');
    await core.retention.purge(f.server.id, {
      token: preview.token,
      confirmation: f.server.name,
      manualConfirmation: '',
    });
    expect(
      core.repo
        .backups()
        .map((item) => item.id)
        .sort(),
    ).toEqual([saved[0]!.id, saved[3]!.id].sort());
    expect(await readFile(core.repo.backup(saved[3]!.id).path)).toBeDefined();
    expect(core.retention.policy(f.server.id).count).toBe(1);
    expect(
      core.repo.db.prepare('SELECT COUNT(*) AS count FROM backup_retention_runs').get()?.count,
    ).toBe(0);
    expect(
      (await readdir(core.repo.settings().backupRoot)).some((name) =>
        name.startsWith('.retention-'),
      ),
    ).toBe(false);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('rejects changed/stale previews, excludes corrupt archives, and separately confirms manual-backup deletion', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets);
  try {
    const saved = await backups(core, f.server.id),
      preview = await core.retention.preview(f.server.id);
    await writeFile(core.repo.backup(saved[1]!.id).path, 'changed archive');
    await expect(
      core.retention.purge(f.server.id, {
        token: preview.token,
        confirmation: f.server.name,
        manualConfirmation: '',
      }),
    ).rejects.toThrow('changed');
    const next = await core.retention.preview(f.server.id);
    expect(next.unavailableCount).toBe(1);
    expect(next.archives.map((item) => item.id)).toEqual([saved[2]!.id]);
    core.retention.configure(
      f.server.id,
      retentionPolicySchema.parse({ mode: 'count', count: 1, includeManual: true }),
    );
    await expect(
      core.retention.purge(f.server.id, {
        token: next.token,
        confirmation: f.server.name,
        manualConfirmation: '',
      }),
    ).rejects.toThrow('preview');
    const manual = await core.retention.preview(f.server.id);
    expect(manual.archives.some((item) => item.reason === 'manual')).toBe(true);
    await expect(
      core.retention.purge(f.server.id, {
        token: manual.token,
        confirmation: f.server.name,
        manualConfirmation: '',
      }),
    ).rejects.toThrow('manual-backup');
    await core.retention.purge(f.server.id, {
      token: manual.token,
      confirmation: f.server.name,
      manualConfirmation: 'DELETE MANUAL BACKUPS',
    });
    expect(core.repo.backups().some((item) => item.id === saved[3]!.id)).toBe(false);
    expect(core.repo.backups().some((item) => item.id === saved[1]!.id)).toBe(true);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('rolls cancelled batch moves back before committing archive deletions', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets);
  try {
    const saved = await backups(core, f.server.id),
      preview = await core.retention.preview(f.server.id);
    const original = core.jobs.run.bind(core.jobs);
    vi.spyOn(core.jobs, 'run').mockImplementationOnce((kind, label, serverId, action, signal) =>
      original(
        kind,
        label,
        serverId,
        (context) =>
          action({
            ...context,
            phase: (phase, received, total) => {
              context.phase(phase, received, total);
              if (phase === 'applying') core.jobs.cancel(context.id);
            },
          }),
        signal,
      ),
    );
    await expect(
      core.retention.purge(f.server.id, {
        token: preview.token,
        confirmation: f.server.name,
        manualConfirmation: '',
      }),
    ).rejects.toThrow();
    expect(core.repo.backups()).toHaveLength(saved.length);
    for (const item of saved) expect(await stat(core.repo.backup(item.id).path)).toBeDefined();
    expect(
      core.repo
        .operations()
        .some((item) => item.kind === 'backup.retention' && item.status === 'cancelled'),
    ).toBe(true);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('recovers both pre-commit and committed retention batches after a simulated process interruption', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets);
  try {
    const saved = await backups(core, f.server.id),
      root = core.repo.settings().backupRoot;
    for (const state of ['prepared', 'committed'] as const) {
      const id = randomUUID(),
        trash = path.join(root, '.retention-' + id),
        candidate = saved[1]!;
      const journal: RetentionJournal = {
        id,
        serverId: f.server.id,
        root,
        state,
        candidates: [{ metadata: candidate, path: core.repo.backup(candidate.id).path, stamp: '' }],
      };
      const operation: Operation = {
        id,
        serverId: f.server.id,
        kind: 'backup.retention',
        label: 'Interrupted purge',
        status: 'applying',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recoverable: false,
      };
      core.repo.saveOperation(operation);
      core.repo.db
        .prepare('INSERT INTO backup_retention_runs VALUES(?,?,?)')
        .run(id, f.server.id, JSON.stringify(journal));
      await mkdir(trash);
      await rename(journal.candidates[0]!.path, path.join(trash, candidate.id + '.zip'));
      if (state === 'committed') core.repo.deleteBackup(candidate.id);
      await core.jobs.recover();
      await core.retention.recover();
      expect(core.repo.operations().find((item) => item.id === id)?.status).toBe(
        state === 'committed' ? 'completed' : 'failed',
      );
      if (state === 'prepared')
        expect(await stat(core.repo.backup(candidate.id).path)).toBeDefined();
      else expect(core.repo.backups().some((item) => item.id === candidate.id)).toBe(false);
    }
  } finally {
    await core.close();
    await f.cleanup();
  }
});
