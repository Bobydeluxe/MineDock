import { resolveSystemPath } from '../security/paths';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { lstat, rm, rename, realpath } from 'node:fs/promises';
import type {
  Operation,
  OperationContext,
  SwapCheckpoint,
  RecoveryReview,
} from '../domain/operations';
import { DomainError, readableError } from '../domain/errors';
import { Repository } from '../database/database';
import { EventBus } from './events';
import { Logger } from './logger';

const terminal = new Set(['completed', 'cancelled', 'failed', 'attention']);
const exists = async (filename: string): Promise<boolean> => {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};
export class OperationService {
  private readonly active = new Map<string, AbortController>();
  constructor(
    private readonly repo: Repository,
    private readonly bus: EventBus,
    private readonly logger: Logger,
  ) {}
  cancel(id: string): void {
    this.active.get(id)?.abort(new DOMException('Operation cancelled.', 'AbortError'));
  }
  cancelAll(): void {
    for (const id of this.active.keys()) this.cancel(id);
  }
  async run<T>(
    kind: string,
    label: string,
    serverId: string | undefined,
    action: (context: OperationContext) => Promise<T>,
    parentSignal?: AbortSignal,
  ): Promise<T> {
    const at = new Date().toISOString();
    const operation: Operation = {
      id: randomUUID(),
      kind,
      label,
      serverId,
      status: 'pending',
      createdAt: at,
      updatedAt: at,
      recoverable: false,
    };
    const controller = new AbortController();
    const cancelFromParent = () =>
      controller.abort(
        parentSignal?.reason ?? new DOMException('Operation cancelled.', 'AbortError'),
      );
    if (parentSignal?.aborted) cancelFromParent();
    else parentSignal?.addEventListener('abort', cancelFromParent, { once: true });
    this.active.set(operation.id, controller);
    let lastProgress = 0;
    const phase = (status: Operation['status'], received = 0, total = 0): void => {
      if (operation.status === status && !terminal.has(status) && Date.now() - lastProgress < 150)
        return;
      lastProgress = Date.now();
      operation.status = status;
      operation.updatedAt = new Date().toISOString();
      this.repo.saveOperation(operation);
      this.bus.emit({
        type: 'progress',
        progress: {
          id: operation.id,
          label,
          phase: status,
          received,
          total,
          speed: 0,
          done: terminal.has(status),
          error: operation.error,
        },
      });
    };
    phase('pending');
    this.repo.audit(kind + '.started', label, serverId);
    this.logger.write(`${kind}.started ${operation.id}`);
    try {
      controller.signal.throwIfAborted();
      const value = await action({
        id: operation.id,
        signal: controller.signal,
        phase,
        checkpoint: (checkpoint) => {
          operation.recoverable = true;
          this.repo.saveOperation(operation, checkpoint);
        },
      });
      operation.recoverable = false;
      phase('completed');
      this.repo.audit(kind + '.completed', label, serverId);
      this.logger.write(`${kind}.completed ${operation.id}`);
      return value;
    } catch (error) {
      operation.error = controller.signal.aborted ? 'Operation cancelled.' : readableError(error);
      // A checkpoint needs recovery even after a handled failure; never hide an uncertain swap.
      if (operation.recoverable) {
        await this.recoverOne(operation);
        if (controller.signal.aborted && !operation.recoverable) phase('cancelled');
      } else phase(controller.signal.aborted ? 'cancelled' : 'failed');
      this.repo.audit(
        kind + (controller.signal.aborted ? '.cancelled' : '.failed'),
        operation.error,
        serverId,
        false,
      );
      this.logger.write(`${kind}.failed ${operation.id}: ${operation.error}`, true);
      throw error;
    } finally {
      parentSignal?.removeEventListener('abort', cancelFromParent);
      this.active.delete(operation.id);
    }
  }
  private async validateCheckpoint(
    checkpoint: SwapCheckpoint,
    operation: Operation,
  ): Promise<void> {
    const registered = operation.serverId ? this.repo.server(operation.serverId).path : undefined;
    const destination = resolveSystemPath(checkpoint.destination);
    const owned = [this.repo.settings().serverRoot, path.join(this.repo.root, 'runtimes')].some(
      (root) => {
        const relative = path.relative(resolveSystemPath(root), destination);
        return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      },
    );
    const child = registered ? path.relative(resolveSystemPath(registered), destination) : '';
    const registeredChild = !!registered && ['plugins', 'mods', 'worlds'].includes(child);
    let approvedImport = false;
    if (
      operation.kind === 'server.import' &&
      checkpoint.importTicket &&
      /^[a-f0-9-]{36}$/i.test(checkpoint.importTicket)
    ) {
      const row = this.repo.db
        .prepare('SELECT metadata FROM import_history WHERE id=?')
        .get(checkpoint.importTicket);
      if (row) {
        const history = JSON.parse(String(row.metadata)) as {
          approvedOriginal?: boolean;
          preview?: { sourcePath?: string };
        };
        approvedImport =
          history.approvedOriginal === true &&
          typeof history.preview?.sourcePath === 'string' &&
          destination === resolveSystemPath(history.preview.sourcePath, 'server.properties');
      }
    }
    let approvedExport = false;
    if (
      checkpoint.exportTicket === operation.id &&
      ['world.export', 'files.export', 'archive.export', 'backup.export'].includes(operation.kind)
    ) {
      const row = this.repo.db
        .prepare('SELECT path FROM authorized_exports WHERE id=?')
        .get(operation.id);
      approvedExport =
        !!row &&
        resolveSystemPath(String(row.path)) === destination &&
        checkpoint.staging === destination + '.minedock-' + operation.id + '.part' &&
        checkpoint.previous === destination + '.minedock-' + operation.id + '.previous';
    }
    if (
      !owned &&
      destination !== registered &&
      !registeredChild &&
      !approvedImport &&
      !approvedExport
    )
      throw new DomainError('RECOVERY_PATH', 'Recovery path is outside managed data.');
    for (const filename of [destination, checkpoint.staging, checkpoint.previous]) {
      if (path.dirname(resolveSystemPath(filename)) !== path.dirname(destination))
        throw new DomainError('RECOVERY_PATH', 'Recovery staging must be beside its destination.');
      const parent = path.dirname(resolveSystemPath(filename));
      if (resolveSystemPath(await realpath(parent)) !== parent)
        throw new DomainError('RECOVERY_PATH', 'Recovery parent contains a symbolic link.');
      if (await exists(filename)) {
        if ((await lstat(filename)).isSymbolicLink())
          throw new DomainError('RECOVERY_PATH', 'Symbolic links are not allowed during recovery.');
        if (resolveSystemPath(await realpath(filename)) !== resolveSystemPath(filename))
          throw new DomainError('RECOVERY_PATH', 'Recovery path resolves outside its destination.');
      }
    }
    if (
      new Set([
        destination,
        resolveSystemPath(checkpoint.staging),
        resolveSystemPath(checkpoint.previous),
      ]).size !== 3
    )
      throw new DomainError('RECOVERY_PATH', 'Recovery paths overlap.');
  }
  /** Destination comes only from a native save dialog; persist its authority before writing. */
  async exportFile(
    context: OperationContext,
    target: string,
    prepare: (staging: string) => Promise<void>,
    commit: () => void = () => {},
  ): Promise<void> {
    const destination = resolveSystemPath(target),
      operation = this.repo.operations().find((item) => item.id === context.id)!;
    const protectedRoots = [
      this.repo.settings().serverRoot,
      this.repo.settings().backupRoot,
      path.join(this.repo.root, 'runtimes'),
      path.join(this.repo.root, 'cache'),
      ...this.repo.servers().map((server) => server.path),
    ];
    if (
      protectedRoots.some((root) => {
        const relative = path.relative(resolveSystemPath(root), destination);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
      }) ||
      ['app.db', 'app.db-wal', 'app.db-shm', '.secret-key'].some(
        (name) => destination === path.join(this.repo.root, name),
      )
    )
      throw new DomainError('PATH', 'Choose an export destination outside active MineDock data.');
    if (
      !['world.export', 'files.export', 'archive.export', 'backup.export'].includes(operation.kind)
    )
      throw new DomainError('RECOVERY_PATH', 'This operation cannot write an external export.');
    if ((await exists(destination)) && !(await lstat(destination)).isFile())
      throw new DomainError('PATH', 'Choose a regular export file.');
    this.repo.db
      .prepare('INSERT INTO authorized_exports VALUES(?,?,?)')
      .run(context.id, destination, new Date().toISOString());
    const checkpoint: SwapCheckpoint = {
      destination,
      staging: destination + '.minedock-' + context.id + '.part',
      previous: destination + '.minedock-' + context.id + '.previous',
      exportTicket: context.id,
      hadDestination: await exists(destination),
    };
    await this.validateCheckpoint(checkpoint, operation);
    context.checkpoint(checkpoint);
    await prepare(checkpoint.staging);
    await this.swap(context, checkpoint, commit);
  }
  async swap(
    context: OperationContext,
    checkpoint: SwapCheckpoint,
    commit: () => void,
  ): Promise<void> {
    const operation = this.repo.operations().find((o) => o.id === context.id)!;
    await this.validateCheckpoint(checkpoint, operation);
    context.signal.throwIfAborted();
    if (await exists(checkpoint.previous))
      throw new DomainError('RECOVERY', 'A previous copy already exists. Resolve recovery first.');
    checkpoint.hadDestination = await exists(checkpoint.destination);
    context.checkpoint(checkpoint);
    context.phase('applying');
    if (checkpoint.hadDestination) await rename(checkpoint.destination, checkpoint.previous);
    await rename(checkpoint.staging, checkpoint.destination);
    // The swap is a short commit boundary: cancellation must not interrupt a DB transaction.
    this.repo.db.exec('BEGIN IMMEDIATE');
    try {
      commit();
      operation.status = 'completed';
      operation.recoverable = false;
      this.repo.saveOperation(operation, { ...checkpoint, committed: true });
      this.repo.db.exec('COMMIT');
    } catch (error) {
      this.repo.db.exec('ROLLBACK');
      throw error;
    }
    await rm(checkpoint.previous, { recursive: true, force: true });
    this.repo.clearOperationCheckpoint(context.id);
  }
  private async recoverOne(operation: Operation): Promise<void> {
    const checkpoint = this.repo.operationCheckpoint(operation.id);
    try {
      if (!checkpoint) {
        const inspection = /\.(?:scan|preview)$/.test(operation.kind);
        operation.status = inspection ? 'cancelled' : 'attention';
        operation.recoverable = false;
        operation.error = inspection
          ? 'The interrupted inspection was cancelled. Run it again when ready.'
          : 'An operation was interrupted. Review its server and retry or restore a safety backup.';
      } else {
        await this.validateCheckpoint(checkpoint, operation);
        if (operation.status === 'completed' || checkpoint.committed) {
          await rm(checkpoint.previous, { recursive: true, force: true });
          await rm(checkpoint.staging, { recursive: true, force: true });
          operation.status = 'completed';
          operation.recoverable = false;
        } else {
          if (await exists(checkpoint.previous)) {
            // A copy aside must never be discarded before the original has been restored.
            if (await exists(checkpoint.destination)) {
              if (await exists(checkpoint.staging))
                throw new Error('Both staging and destination exist. Recovery requires review.');
              await rename(checkpoint.destination, checkpoint.staging);
            }
            await rename(checkpoint.previous, checkpoint.destination);
          } else if (
            checkpoint.hadDestination === false &&
            (await exists(checkpoint.destination))
          ) {
            await rm(checkpoint.destination, { recursive: true, force: true });
          } else if (
            !(await exists(checkpoint.destination)) &&
            checkpoint.hadDestination !== false &&
            (checkpoint.beforeProfile || checkpoint.hadDestination === true)
          ) {
            throw new Error(
              'The original managed copy is missing. Review recovery or restore its safety backup.',
            );
          }
          if (checkpoint.beforeProfile) {
            this.repo.db.exec('BEGIN IMMEDIATE');
            try {
              this.repo.saveServer({
                ...checkpoint.beforeProfile,
                status: 'stopped',
                pid: undefined,
              });
              if (checkpoint.beforeContent) {
                this.repo.db
                  .prepare('DELETE FROM installed_content WHERE server_id=?')
                  .run(checkpoint.beforeProfile.id);
                for (const item of checkpoint.beforeContent) this.repo.saveContent(item);
              }
              this.repo.db.exec('COMMIT');
            } catch (error) {
              this.repo.db.exec('ROLLBACK');
              throw error;
            }
          }
          await rm(checkpoint.staging, { recursive: true, force: true });
          operation.status = 'failed';
          operation.recoverable = false;
          operation.error = 'The interrupted operation was rolled back safely. Retry when ready.';
        }
      }
      if (!operation.recoverable) this.repo.clearOperationCheckpoint(operation.id);
      this.repo.audit(
        'operation.recovered',
        operation.error ?? operation.label,
        operation.serverId,
        operation.status !== 'attention',
      );
    } catch (error) {
      operation.status = 'attention';
      operation.recoverable = true;
      operation.error = readableError(error);
      this.logger.write(`operation.recovery.failed ${operation.id}: ${operation.error}`, true);
    }
    operation.updatedAt = new Date().toISOString();
    this.repo.saveOperation(operation);
  }
  async recover(): Promise<void> {
    for (const operation of this.repo.operations())
      if (
        !terminal.has(operation.status) ||
        operation.recoverable ||
        this.repo.operationCheckpoint(operation.id)
      )
        await this.recoverOne(operation);
  }
  async review(id: string): Promise<RecoveryReview> {
    const operation = this.repo.operations().find((item) => item.id === id);
    if (!operation || this.active.has(id))
      throw new DomainError('BUSY', 'Wait for the operation to finish.');
    const checkpoint = this.repo.operationCheckpoint(id);
    if (!checkpoint || operation.status !== 'attention')
      throw new DomainError('RECOVERY', 'This operation does not need manual recovery.');
    await this.validateCheckpoint(checkpoint, operation);
    const copies = await Promise.all(
      (['destination', 'staging', 'previous'] as const).map(async (role) => ({
        role,
        path: checkpoint[role],
        exists: await exists(checkpoint[role]),
      })),
    );
    const fullServer =
      operation.serverId &&
      resolveSystemPath(checkpoint.destination) ===
        resolveSystemPath(this.repo.server(operation.serverId).path);
    return {
      id,
      label: operation.label,
      copies,
      rollbackAvailable:
        !checkpoint.committed && copies.some((copy) => copy.role === 'previous' && copy.exists),
      backups: fullServer
        ? this.repo.backups().filter((backup) => backup.serverId === operation.serverId)
        : [],
      preservedCopies: operation.preservedCopies ?? [],
    };
  }
  async retryRecovery(id: string): Promise<void> {
    await this.review(id);
    await this.recoverOne(this.repo.operations().find((item) => item.id === id)!);
  }
  private restoreMetadata(checkpoint: SwapCheckpoint): void {
    if (!checkpoint.beforeProfile) return;
    this.repo.saveServer({ ...checkpoint.beforeProfile, status: 'stopped', pid: undefined });
    if (checkpoint.beforeContent) {
      this.repo.db
        .prepare('DELETE FROM installed_content WHERE server_id=?')
        .run(checkpoint.beforeProfile.id);
      for (const item of checkpoint.beforeContent) this.repo.saveContent(item);
    }
  }
  private async preserveCopy(operation: Operation, filename: string, role: string): Promise<void> {
    if (!(await exists(filename))) return;
    const preserved = filename + '.recovery-' + operation.id + '-' + role;
    if (await exists(preserved))
      throw new DomainError(
        'RECOVERY',
        'A preserved recovery copy already exists. Review it before retrying.',
      );
    await rename(filename, preserved);
    operation.preservedCopies = [...(operation.preservedCopies ?? []), preserved];
    this.repo.saveOperation(operation);
  }
  async rollbackReviewed(id: string, confirmation: string): Promise<void> {
    const review = await this.review(id);
    if (confirmation !== review.label) throw new DomainError('CONFIRM', 'Incorrect confirmation.');
    if (!review.rollbackAvailable)
      throw new DomainError(
        'RECOVERY',
        'The original copy is unavailable. Choose a verified safety backup.',
      );
    const operation = this.repo.operations().find((item) => item.id === id)!;
    const checkpoint = this.repo.operationCheckpoint(id)!;
    await this.preserveCopy(operation, checkpoint.staging, 'prepared');
    await this.preserveCopy(operation, checkpoint.destination, 'current');
    await rename(checkpoint.previous, checkpoint.destination);
    this.repo.db.exec('BEGIN IMMEDIATE');
    try {
      this.restoreMetadata(checkpoint);
      operation.status = 'failed';
      operation.recoverable = false;
      operation.error =
        'The original copy was restored. The other copies were preserved for review.';
      operation.updatedAt = new Date().toISOString();
      this.repo.clearOperationCheckpoint(id);
      this.repo.saveOperation(operation);
      this.repo.audit('operation.resolved.rollback', operation.label, operation.serverId);
      this.repo.db.exec('COMMIT');
    } catch (error) {
      this.repo.db.exec('ROLLBACK');
      throw error;
    }
    this.logger.write('operation.resolved.rollback ' + id);
  }
  async resolvedFromBackup(id: string): Promise<void> {
    const operation = this.repo.operations().find((item) => item.id === id)!;
    const checkpoint = this.repo.operationCheckpoint(id)!;
    await this.validateCheckpoint(checkpoint, operation);
    await this.preserveCopy(operation, checkpoint.staging, 'prepared');
    await this.preserveCopy(operation, checkpoint.previous, 'original');
    operation.status = 'failed';
    operation.recoverable = false;
    operation.error =
      'A verified safety backup was restored. Interrupted copies were preserved for review.';
    operation.updatedAt = new Date().toISOString();
    this.repo.clearOperationCheckpoint(id);
    this.repo.saveOperation(operation);
    this.repo.audit('operation.resolved.backup', operation.label, operation.serverId);
    this.logger.write('operation.resolved.backup ' + id);
  }
  dismiss(id: string): void {
    const operation = this.repo.operations().find((o) => o.id === id);
    if (!operation || this.active.has(id)) throw new Error('Wait for the operation to finish.');
    if (this.repo.operationCheckpoint(id) && operation.recoverable)
      throw new Error('Resolve the interrupted swap before dismissing it.');
    if (this.repo.db.prepare('SELECT id FROM backup_retention_runs WHERE id=?').get(id))
      throw new DomainError(
        'RECOVERY',
        'Resolve interrupted backup retention before dismissing it.',
      );
    operation.status = 'cancelled';
    operation.recoverable = false;
    this.repo.saveOperation(operation);
    this.repo.audit('operation.dismissed', operation.label, operation.serverId);
  }
}
