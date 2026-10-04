import { it, expect, vi, afterEach } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './helpers';
import { DownloadManager } from '../packages/minecraft/downloads';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { migrations } from '../packages/database/migrations';
import { Repository } from '../packages/database/database';
import { EventBus } from '../packages/core/events';
import { scheduleDates, SchedulerService } from '../packages/core/scheduler';
import { zipDirectory, extractZip } from '../packages/backups/archive';
import { engines, engineIds } from '../packages/domain/engines';
import type { Operation, DownloadPartial } from '../packages/domain/operations';
afterEach(() => vi.unstubAllGlobals());
it('migrates a populated schema 1 database without changing profiles, secrets or preferences', async () => {
  const f = await fixture();
  let upgraded: Repository | undefined;
  try {
    const folder = path.join(f.root, 'legacy');
    await mkdir(folder);
    const legacy = new DatabaseSync(path.join(folder, 'app.db'));
    legacy.exec(migrations[0]!.sql + 'PRAGMA user_version=1;');
    legacy
      .prepare('INSERT INTO servers VALUES(?,?,?)')
      .run(f.server.id, JSON.stringify(f.server), 'encrypted-original');
    legacy
      .prepare('INSERT INTO settings VALUES(?,?)')
      .run('general', JSON.stringify({ ...f.repo.settings(), language: 'fr' }));
    legacy.close();
    upgraded = new Repository(folder, new EventBus());
    expect(upgraded.db.prepare('PRAGMA user_version').get()?.user_version).toBe(migrations.length);
    expect(upgraded.server(f.server.id)).toEqual(f.server);
    expect(upgraded.secret(f.server.id)).toBe('encrypted-original');
    expect(upgraded.settings().language).toBe('fr');
    expect(upgraded.operations()).toEqual([]);
    expect((await readdir(folder)).some((name) => name.endsWith('before-v2.bak'))).toBe(true);
  } finally {
    upgraded?.close();
    await f.cleanup();
  }
});
it('resumes a persisted partial only with matching Range, validator, total and official hash', async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from('resume-this-verified-artifact');
    const destination = path.join(f.root, 'artifact.jar');
    const hash = {
      algorithm: 'sha256' as const,
      value: createHash('sha256').update(bytes).digest('hex'),
    };
    const partial: DownloadPartial = {
      destination,
      temporary: destination + '.download.part',
      url: 'https://cdn.modrinth.com/artifact.jar',
      hash,
      expectedSize: bytes.length,
      etag: '"v1"',
      offset: 3,
    };
    await writeFile(partial.temporary, bytes.subarray(0, 8));
    f.repo.savePartial(partial);
    const request = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.headers).toMatchObject({ Range: 'bytes=8-', 'If-Range': '"v1"' });
      return new Response(bytes.subarray(8), {
        status: 206,
        headers: { etag: '"v1"', 'content-range': `bytes 8-${bytes.length - 1}/${bytes.length}` },
      });
    });
    vi.stubGlobal('fetch', request);
    await new DownloadManager(f.bus, f.repo).download(partial.url, destination, 'Artifact', hash);
    expect(await readFile(destination)).toEqual(bytes);
    expect(f.repo.partial(destination)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    await f.cleanup();
  }
});
it('restarts cleanly after an ignored Range or a changed entity and preserves the installed original', async () => {
  const f = await fixture();
  try {
    const destination = path.join(f.root, 'artifact.jar');
    const bytes = Buffer.from('new-good-file');
    const hash = {
      algorithm: 'sha256' as const,
      value: createHash('sha256').update(bytes).digest('hex'),
    };
    const partial: DownloadPartial = {
      destination,
      temporary: destination + '.download.part',
      url: 'https://cdn.modrinth.com/artifact.jar',
      hash,
      expectedSize: bytes.length,
      etag: '"old"',
      offset: 4,
    };
    await writeFile(destination, 'old installed');
    await writeFile(partial.temporary, 'bad!');
    f.repo.savePartial(partial);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(bytes, {
            headers: { etag: '"new"', 'content-length': String(bytes.length) },
          }),
      ),
    );
    await new DownloadManager(f.bus, f.repo).download(partial.url, destination, 'Artifact', hash);
    expect(await readFile(destination)).toEqual(bytes);
    await writeFile(partial.temporary, 'bad!');
    f.repo.savePartial(partial);
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('wrong', {
          status: 206,
          headers: {
            etag: '"other"',
            'content-range': `bytes 4-${bytes.length - 1}/${bytes.length}`,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', request);
    await new DownloadManager(f.bus, f.repo).download(partial.url, destination, 'Artifact', hash);
    expect(request).toHaveBeenCalledTimes(2);
    expect(await readFile(destination)).toEqual(bytes);
  } finally {
    await f.cleanup();
  }
});
it('rolls interrupted directory swaps back and preserves committed replacements after restart', async () => {
  const f = await fixture();
  const logger = new Logger(path.join(f.root, 'logs'));
  try {
    const stage = f.server.path + '.stage';
    const previous = f.server.path + '.previous';
    await mkdir(stage);
    await writeFile(path.join(stage, 'new.txt'), 'new');
    const at = new Date().toISOString();
    const operation: Operation = {
      id: randomUUID(),
      kind: 'import',
      label: 'Import',
      serverId: f.server.id,
      status: 'applying',
      createdAt: at,
      updatedAt: at,
      recoverable: true,
    };
    f.repo.saveOperation(operation, {
      destination: f.server.path,
      staging: stage,
      previous,
      beforeProfile: f.server,
      beforeContent: [],
      hadDestination: true,
    });
    await rename(f.server.path, previous);
    await rename(stage, f.server.path);
    await new OperationService(f.repo, f.bus, logger).recover();
    expect(await readFile(path.join(f.server.path, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(f.repo.operations()[0]?.status).toBe('failed');
    expect(f.repo.operationCheckpoint(operation.id)).toBeUndefined();
    await mkdir(stage);
    await copyFile(path.join(f.server.path, 'server.jar'), path.join(stage, 'new.jar'));
    operation.status = 'completed';
    operation.recoverable = false;
    f.repo.saveOperation(operation, {
      destination: f.server.path,
      staging: stage,
      previous,
      hadDestination: true,
      committed: true,
    });
    await rename(f.server.path, previous);
    await rename(stage, f.server.path);
    await new OperationService(f.repo, f.bus, logger).recover();
    expect(await readFile(path.join(f.server.path, 'new.jar'), 'utf8')).toBe('integration fixture');
    expect(f.repo.operations()[0]?.status).toBe('completed');
  } finally {
    await logger.flush();
    await f.cleanup();
  }
});
it('rejects recovery paths outside registered server data', async () => {
  const f = await fixture();
  const logger = new Logger(path.join(f.root, 'logs'));
  try {
    const protectedFolder = path.join(f.root, 'outside');
    await mkdir(protectedFolder);
    await writeFile(path.join(protectedFolder, 'keep.txt'), 'keep');
    const at = new Date().toISOString();
    const operation: Operation = {
      id: randomUUID(),
      kind: 'restore',
      label: 'Restore',
      status: 'applying',
      createdAt: at,
      updatedAt: at,
      recoverable: true,
    };
    f.repo.saveOperation(operation, {
      destination: protectedFolder,
      staging: protectedFolder + '.stage',
      previous: protectedFolder + '.previous',
    });
    await new OperationService(f.repo, f.bus, logger).recover();
    expect(f.repo.operations()[0]?.status).toBe('attention');
    expect(await readFile(path.join(protectedFolder, 'keep.txt'), 'utf8')).toBe('keep');
  } finally {
    await logger.flush();
    await f.cleanup();
  }
});
it('calculates daily/cron deadlines across timezone DST and skips paused tasks and old warnings', async () => {
  const f = await fixture();
  let executions = 0;
  const warnings: number[] = [];
  const scheduler = new SchedulerService(
    f.repo,
    async () => {
      executions++;
    },
    async (_job, seconds) => {
      warnings.push(seconds);
    },
  );
  try {
    const input = {
      serverId: f.server.id,
      action: 'restart' as const,
      intervalMinutes: 60,
      command: '',
      enabled: true,
      mode: 'daily' as const,
      time: '03:00',
      timezone: 'Europe/Paris',
      warnings: [600, 300, 60, 30, 10],
    };
    expect(scheduleDates(input, Date.parse('2026-03-28T12:00:00Z'), 2)).toEqual([
      '2026-03-29T01:00:00.000Z',
      '2026-03-30T01:00:00.000Z',
    ]);
    expect(() => scheduleDates({ ...input, mode: 'cron', cron: '99 4 * * *' })).toThrow('cron');
    const job = scheduler.add(input);
    const now = Date.now();
    job.nextRun = new Date(now + 600000).toISOString();
    f.repo.saveSchedule(job);
    await scheduler.tick(now);
    await scheduler.tick(now);
    await scheduler.tick(now + 572000);
    expect(warnings).toEqual([600]);
    scheduler.toggle(job.id, false);
    await scheduler.tick(now + 600000);
    expect(executions).toBe(0);
    scheduler.toggle(job.id, true);
    expect(f.repo.schedules()[0]?.enabled).toBe(true);
  } finally {
    await scheduler.close();
    await f.cleanup();
  }
});
it('cancels ZIP operations without writing outside staging and declares edition/runtime capabilities', async () => {
  const f = await fixture();
  try {
    const archive = path.join(f.root, 'test.zip');
    await zipDirectory(f.server.path, archive);
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractZip(archive, path.join(f.root, 'extract'), undefined, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(engineIds).toHaveLength(8);
    expect(engines.bedrock.runtimeType).toBe('native');
    expect(engines.pocketmine.runtimeType).toBe('php');
    expect(engines.bedrock.capabilities.javaMemory).toBe(false);
    expect(engines.fabric.capabilities.mods).toBe(true);
    expect(engines.purpur.capabilities.plugins).toBe(true);
  } finally {
    await f.cleanup();
  }
});
