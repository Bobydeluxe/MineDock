import { resolveSystemPath } from '../security/paths';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lstat, realpath, mkdir, rename, rm, rmdir } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import type { Backup } from '../domain/types';
import {
  retentionPolicySchema,
  retentionPurgeSchema,
  type RetentionPolicy,
  type RetentionPreview,
  type RetentionPurge,
} from '../domain/retention';
import { DomainError } from '../domain/errors';
import { Repository } from '../database/database';
import { OperationService } from '../core/operations';
import { sha256 } from './archive';
import type { Logger } from '../core/logger';
const stamp = (info: Stats) =>
  `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const automatic = (backup: Backup) => ['scheduled', 'automatic'].includes(backup.reason);
/** Retain representatives of the most recent existing calendar buckets, including gaps. */
export function retainedBackups(
  backups: Backup[],
  policy: RetentionPolicy,
  now = Date.now(),
): Set<string> {
  const keep = new Set(
    backups
      .filter(
        (item) =>
          !Number.isFinite(Date.parse(item.createdAt)) ||
          (!policy.includeManual && !automatic(item)),
      )
      .map((item) => item.id),
  );
  const eligible = backups
    .filter((item) => !keep.has(item.id))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  if (policy.mode === 'disabled') return new Set(backups.map((item) => item.id));
  // Always retain the most recent eligible archive, even when every archive is old.
  if (eligible[0]) keep.add(eligible[0].id);
  if (policy.mode === 'count') eligible.slice(0, policy.count).forEach((item) => keep.add(item.id));
  else if (policy.mode === 'days')
    eligible
      .filter((item) => Date.parse(item.createdAt) >= now - policy.days * 86400000)
      .forEach((item) => keep.add(item.id));
  else {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: policy.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const calendar = (value: string) => {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
      );
      const day = `${parts.year}-${parts.month}-${parts.day}`;
      const week = new Date(
        Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
      );
      week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
      return [
        String(Math.floor(Date.parse(value) / 3600000)),
        day,
        week.toISOString().slice(0, 10),
        `${parts.year}-${parts.month}`,
      ];
    };
    const limits = [policy.hourly, policy.daily, policy.weekly, policy.monthly];
    const groups = limits.map(() => new Set<string>());
    for (const item of eligible)
      for (const [index, key] of calendar(item.createdAt).entries()) {
        if (groups[index]!.size < limits[index]! && !groups[index]!.has(key)) {
          groups[index]!.add(key);
          keep.add(item.id);
        }
      }
  }
  return keep;
}
interface Candidate {
  metadata: Backup;
  path: string;
  stamp: string;
}
interface Plan {
  preview: RetentionPreview;
  candidates: Candidate[];
  root: string;
}
export interface RetentionJournal {
  id: string;
  serverId: string;
  root: string;
  state: 'prepared' | 'committed';
  candidates: Candidate[];
}
export class RetentionService {
  private readonly plans = new Map<string, Plan>();
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
    private readonly logger?: Logger,
  ) {}
  policy(serverId: string): RetentionPolicy {
    this.repo.server(serverId);
    const row = this.repo.db
      .prepare('SELECT metadata FROM retention_policies WHERE server_id=?')
      .get(serverId);
    return retentionPolicySchema.parse(
      row
        ? JSON.parse(String(row.metadata))
        : { mode: 'disabled', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    );
  }
  configure(serverId: string, raw: RetentionPolicy): RetentionPolicy {
    this.repo.server(serverId);
    const policy = retentionPolicySchema.parse(raw);
    this.repo.db
      .prepare(
        'INSERT INTO retention_policies VALUES(?,?) ON CONFLICT(server_id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(serverId, JSON.stringify(policy));
    this.repo.audit('backup.retention.configured', JSON.stringify(policy), serverId);
    for (const [token, plan] of this.plans)
      if (plan.preview.serverId === serverId) this.plans.delete(token);
    return policy;
  }
  private async root(): Promise<string> {
    const root = resolveSystemPath(this.repo.settings().backupRoot);
    await mkdir(root, { recursive: true });
    if ((await lstat(root)).isSymbolicLink() || resolveSystemPath(await realpath(root)) !== root)
      throw new DomainError('PATH', 'Backup retention does not allow linked storage folders.');
    return root;
  }
  private async candidate(backup: Backup, root: string): Promise<Candidate> {
    const item = this.repo.backup(backup.id);
    if (resolveSystemPath(item.path) !== path.join(root, backup.id + '.zip'))
      throw new DomainError('PATH', 'This backup is outside the current retention folder.');
    const info = await lstat(item.path);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== backup.size)
      throw new DomainError('INTEGRITY', 'The backup changed. Generate a new retention preview.');
    return { metadata: backup, path: item.path, stamp: stamp(info) };
  }
  async preview(serverId: string): Promise<RetentionPreview> {
    return this.jobs.run(
      'backup.retention.preview',
      'Preview backup retention',
      serverId,
      async (context) => {
        const policy = this.policy(serverId),
          root = await this.root(),
          backups = this.repo.backups().filter((item) => item.serverId === serverId),
          keep = retainedBackups(backups, policy);
        const candidates: Candidate[] = [];
        let unavailableCount = 0;
        context.phase('verifying');
        for (const backup of backups.filter((item) => !keep.has(item.id))) {
          context.signal.throwIfAborted();
          try {
            const candidate = await this.candidate(backup, root);
            if ((await sha256(candidate.path, context.signal)) !== backup.sha256)
              throw new DomainError('INTEGRITY', 'The backup is corrupted.');
            candidates.push(candidate);
          } catch (error) {
            if (context.signal.aborted) throw error;
            unavailableCount++;
          }
        }
        const preview: RetentionPreview = {
          token: randomUUID(),
          serverId,
          createdAt: new Date().toISOString(),
          policy,
          archives: candidates.map((item) => item.metadata),
          bytes: candidates.reduce((sum, item) => sum + item.metadata.size, 0),
          protectedCount: keep.size,
          unavailableCount,
        };
        for (const [token, plan] of this.plans)
          if (Date.now() - Date.parse(plan.preview.createdAt) > 600000) this.plans.delete(token);
        if (this.plans.size >= 20) this.plans.delete(this.plans.keys().next().value!);
        this.plans.set(preview.token, { preview, candidates, root });
        this.repo.audit(
          'backup.retention.previewed',
          `${preview.archives.length} archives; ${preview.bytes} bytes; ${unavailableCount} unavailable`,
          serverId,
        );
        return preview;
      },
    );
  }
  private async validateJournal(journal: RetentionJournal): Promise<string> {
    if (
      !/^[a-f0-9-]{36}$/i.test(journal.id) ||
      !path.isAbsolute(journal.root) ||
      resolveSystemPath(await realpath(journal.root)) !== resolveSystemPath(journal.root)
    )
      throw new DomainError('RECOVERY_PATH', 'Invalid backup retention recovery folder.');
    const trash = path.join(journal.root, '.retention-' + journal.id);
    for (const item of journal.candidates)
      if (
        !/^[a-f0-9-]{36}$/i.test(item.metadata.id) ||
        resolveSystemPath(item.path) !== path.join(journal.root, item.metadata.id + '.zip') ||
        item.metadata.serverId !== journal.serverId
      )
        throw new DomainError('RECOVERY_PATH', 'Invalid backup retention recovery archive.');
    for (const filename of [
      trash,
      ...journal.candidates.flatMap((item) => [
        item.path,
        path.join(trash, item.metadata.id + '.zip'),
      ]),
    ]) {
      const info = await lstat(filename).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (
        info &&
        (info.isSymbolicLink() || (filename === trash ? !info.isDirectory() : !info.isFile()))
      )
        throw new DomainError(
          'RECOVERY_PATH',
          'Linked or unexpected backup recovery paths are forbidden.',
        );
    }
    return trash;
  }
  async purge(serverId: string, raw: RetentionPurge): Promise<void> {
    const input = retentionPurgeSchema.parse(raw),
      plan = this.plans.get(input.token),
      server = this.repo.server(serverId);
    if (
      !plan ||
      plan.preview.serverId !== serverId ||
      Date.now() - Date.parse(plan.preview.createdAt) > 600000
    )
      throw new DomainError('PREVIEW', 'Generate a new retention preview before purging.');
    if (
      input.confirmation !== server.name ||
      (plan.preview.policy.includeManual && input.manualConfirmation !== 'DELETE MANUAL BACKUPS')
    )
      throw new DomainError(
        'CONFIRM',
        'Confirm the server name and explicit manual-backup deletion phrase when required.',
      );
    return this.jobs.run(
      'backup.retention',
      'Purge backup retention preview',
      serverId,
      async (context) => {
        if (
          JSON.stringify(this.policy(serverId)) !== JSON.stringify(plan.preview.policy) ||
          (await this.root()) !== plan.root
        )
          throw new DomainError(
            'PREVIEW',
            'The retention policy or backup folder changed. Generate a new preview.',
          );
        const keep = retainedBackups(
          this.repo.backups().filter((item) => item.serverId === serverId),
          plan.preview.policy,
        );
        context.phase('verifying');
        for (const item of plan.candidates) {
          context.signal.throwIfAborted();
          const current = await this.candidate(
            this.repo.backup(item.metadata.id).metadata,
            plan.root,
          );
          if (
            keep.has(item.metadata.id) ||
            current.stamp !== item.stamp ||
            JSON.stringify(current.metadata) !== JSON.stringify(item.metadata) ||
            (await sha256(item.path, context.signal)) !== item.metadata.sha256
          )
            throw new DomainError('PREVIEW', 'A backup changed. Generate a new retention preview.');
        }
        const journal: RetentionJournal = {
          id: context.id,
          serverId,
          root: plan.root,
          state: 'prepared',
          candidates: plan.candidates,
        };
        const trash = await this.validateJournal(journal);
        this.repo.db
          .prepare('INSERT INTO backup_retention_runs VALUES(?,?,?)')
          .run(journal.id, serverId, JSON.stringify(journal));
        await mkdir(trash);
        try {
          for (const [index, item] of plan.candidates.entries()) {
            context.signal.throwIfAborted();
            context.phase('applying', index, plan.candidates.length);
            await rename(item.path, path.join(trash, item.metadata.id + '.zip'));
          }
          context.signal.throwIfAborted();
          this.repo.db.exec('BEGIN IMMEDIATE');
          try {
            for (const item of plan.candidates) {
              this.repo.deleteBackup(item.metadata.id);
              this.repo.audit('backup.retention.deleted', item.metadata.name, serverId);
            }
            journal.state = 'committed';
            this.repo.db
              .prepare('UPDATE backup_retention_runs SET metadata=? WHERE id=?')
              .run(JSON.stringify(journal), journal.id);
            this.repo.db.exec('COMMIT');
          } catch (error) {
            this.repo.db.exec('ROLLBACK');
            journal.state = 'prepared';
            throw error;
          }
          this.plans.delete(input.token);
          for (const item of plan.candidates)
            this.logger?.write('backup.retention.deleted ' + item.metadata.id);
          await this.recoverJournal(journal);
        } catch (error) {
          await this.recoverJournal(journal);
          throw error;
        }
      },
    );
  }
  private async recoverJournal(journal: RetentionJournal): Promise<void> {
    const trash = await this.validateJournal(journal);
    if (journal.state === 'prepared')
      for (const item of journal.candidates) {
        const registered = this.repo.backup(item.metadata.id);
        if (resolveSystemPath(registered.path) !== resolveSystemPath(item.path))
          throw new DomainError(
            'RECOVERY_PATH',
            'Backup retention metadata changed during recovery.',
          );
        const original = await lstat(item.path).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
        const archived = await lstat(path.join(trash, item.metadata.id + '.zip')).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return undefined;
            throw error;
          },
        );
        if (original && archived)
          throw new DomainError(
            'RECOVERY',
            'Both backup copies exist. Retention recovery needs review.',
          );
        if (!original && !archived)
          throw new DomainError(
            'RECOVERY',
            'An interrupted retention archive is missing. Review its storage folder.',
          );
        if (archived) await rename(path.join(trash, item.metadata.id + '.zip'), item.path);
      }
    for (const item of journal.candidates)
      await rm(path.join(trash, item.metadata.id + '.zip'), { force: true });
    await rmdir(trash).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    this.repo.db.prepare('DELETE FROM backup_retention_runs WHERE id=?').run(journal.id);
  }
  async recover(): Promise<void> {
    for (const row of this.repo.db.prepare('SELECT metadata FROM backup_retention_runs').all()) {
      const journal = JSON.parse(String(row.metadata)) as RetentionJournal;
      const operation = this.repo.operations().find((item) => item.id === journal.id);
      try {
        await this.recoverJournal(journal);
        if (operation) {
          operation.status = journal.state === 'committed' ? 'completed' : 'failed';
          operation.recoverable = false;
          operation.error =
            journal.state === 'committed'
              ? undefined
              : 'Interrupted retention was rolled back. All archives were preserved.';
          this.repo.saveOperation(operation);
        }
        this.repo.audit('backup.retention.recovered', journal.state, journal.serverId);
        this.logger?.write('backup.retention.recovered ' + journal.id + ' ' + journal.state);
      } catch (error) {
        if (operation) {
          operation.status = 'attention';
          operation.recoverable = true;
          operation.error = String(error);
          this.repo.saveOperation(operation);
        }
        this.repo.audit('backup.retention.recovery_failed', String(error), journal.serverId, false);
        this.logger?.write(
          'backup.retention.recovery_failed ' + journal.id + ': ' + String(error),
          true,
        );
      }
    }
  }
  async review(id: string): Promise<import('../domain/operations').RecoveryReview> {
    const row = this.repo.db
      .prepare('SELECT metadata FROM backup_retention_runs WHERE id=?')
      .get(id);
    const operation = this.repo.operations().find((item) => item.id === id);
    if (!row || !operation || operation.status !== 'attention')
      throw new DomainError('RECOVERY', 'This retention operation does not need review.');
    const journal = JSON.parse(String(row.metadata)) as RetentionJournal;
    const trash = await this.validateJournal(journal);
    return {
      id,
      label: operation.label,
      copies: [
        { role: 'destination', path: journal.root, exists: true },
        {
          role: 'staging',
          path: trash,
          exists: await lstat(trash).then(
            () => true,
            (error: NodeJS.ErrnoException) => {
              if (error.code === 'ENOENT') return false;
              throw error;
            },
          ),
        },
      ],
      rollbackAvailable: false,
      backups: [],
      preservedCopies: operation.preservedCopies ?? [],
    };
  }
}
