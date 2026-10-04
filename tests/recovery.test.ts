import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, rename, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import type { Operation } from '../packages/domain/operations';
const interrupted = (serverId: string): Operation => ({
  id: randomUUID(),
  serverId,
  kind: 'backup.restore',
  label: 'Interrupted restore',
  status: 'applying',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  recoverable: true,
});
it('lets the user restore an ambiguous original while preserving both discarded copies and database metadata', async () => {
  const f = await fixture();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    const operation = interrupted(f.server.id),
      destination = f.server.path,
      staging = destination + '.stage',
      previous = destination + '.previous';
    await rename(destination, previous);
    await mkdir(destination);
    await writeFile(path.join(destination, 'current.txt'), 'uncertain current');
    await mkdir(staging);
    await writeFile(path.join(staging, 'prepared.txt'), 'uncertain prepared');
    core.repo.saveServer({ ...f.server, memoryMax: 8192 });
    core.repo.saveOperation(operation, {
      destination,
      staging,
      previous,
      hadDestination: true,
      beforeProfile: f.server,
      beforeContent: [],
    });
    await core.jobs.recover();
    expect(core.repo.operations().find((item) => item.id === operation.id)?.status).toBe(
      'attention',
    );
    expect(() => core.assertStopped(f.server.id)).toThrow('interrupted');
    const review = await core.jobs.review(operation.id);
    expect(review.rollbackAvailable).toBe(true);
    await expect(
      core.resolveOperation(operation.id, { action: 'rollback', confirmation: 'wrong' }),
    ).rejects.toThrow('confirmation');
    await core.resolveOperation(operation.id, {
      action: 'rollback',
      confirmation: operation.label,
    });
    expect(core.repo.server(f.server.id).memoryMax).toBe(f.server.memoryMax);
    expect(await readFile(path.join(destination, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
    const resolved = core.repo.operations().find((item) => item.id === operation.id)!;
    expect(resolved.recoverable).toBe(false);
    expect(resolved.preservedCopies).toHaveLength(2);
    expect(await readFile(path.join(resolved.preservedCopies![0]!, 'prepared.txt'), 'utf8')).toBe(
      'uncertain prepared',
    );
    expect(await readFile(path.join(resolved.preservedCopies![1]!, 'current.txt'), 'utf8')).toBe(
      'uncertain current',
    );
    await core.jobs.recover();
    expect(core.repo.operationCheckpoint(operation.id)).toBeUndefined();
    expect(() => core.assertStopped(f.server.id)).not.toThrow();
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('restores a missing original from a verified server backup and preserves the interrupted preparation', async () => {
  const f = await fixture();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    const backup = await core.backups.create(f.server.id);
    const operation = interrupted(f.server.id),
      destination = f.server.path,
      staging = destination + '.stage',
      previous = destination + '.previous';
    await rm(destination, { recursive: true });
    await mkdir(staging);
    await writeFile(path.join(staging, 'partial.txt'), 'keep this for review');
    core.repo.saveOperation(operation, {
      destination,
      staging,
      previous,
      hadDestination: true,
      beforeProfile: f.server,
      beforeContent: [],
    });
    await core.jobs.recover();
    const review = await core.jobs.review(operation.id);
    expect(review.rollbackAvailable).toBe(false);
    expect(review.backups.map((item) => item.id)).toContain(backup.id);
    await expect(
      core.resolveOperation(operation.id, {
        action: 'backup',
        confirmation: operation.label,
        backupId: randomUUID(),
      }),
    ).rejects.toThrow('safety backup');
    await core.resolveOperation(operation.id, {
      action: 'backup',
      confirmation: operation.label,
      backupId: backup.id,
    });
    expect(await readFile(path.join(destination, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
    const resolved = core.repo.operations().find((item) => item.id === operation.id)!;
    expect(resolved.preservedCopies).toHaveLength(1);
    expect(await readFile(path.join(resolved.preservedCopies![0]!, 'partial.txt'), 'utf8')).toBe(
      'keep this for review',
    );
    expect(core.repo.operationCheckpoint(operation.id)).toBeUndefined();
    expect(await lstat(destination)).toBeDefined();
  } finally {
    await core.close();
    await f.cleanup();
  }
});
