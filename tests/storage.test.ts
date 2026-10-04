import { it, expect } from 'vitest';
import { mkdir, writeFile, stat, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fixture } from './helpers';
import { StorageService } from '../packages/core/storage';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
async function storage() {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger),
    service = new StorageService(f.repo, jobs);
  return {
    ...f,
    logger,
    jobs,
    service,
    cleanup: async () => {
      await logger.flush();
      await f.cleanup();
    },
  };
}
it('measures real categories, backup archives, largest relative paths and persistent scan trends without opening file contents', async () => {
  const f = await storage();
  try {
    for (const folder of ['plugins', 'mods', 'logs', 'config', 'cache']) {
      await mkdir(path.join(f.server.path, folder));
      await writeFile(path.join(f.server.path, folder, 'payload.bin'), Buffer.alloc(1024));
    }
    const backupId = randomUUID(),
      backupFile = path.join(f.repo.settings().backupRoot, backupId + '.zip'),
      payload = Buffer.from('actual archive bytes');
    await mkdir(path.dirname(backupFile), { recursive: true });
    await writeFile(backupFile, payload);
    f.repo.addBackup(
      {
        id: backupId,
        serverId: f.server.id,
        name: 'Archive',
        createdAt: new Date().toISOString(),
        size: payload.length,
        sha256: createHash('sha256').update(payload).digest('hex'),
        version: f.server.version,
        reason: 'manual',
      },
      backupFile,
    );
    const report = await f.service.scan(f.server.id);
    expect(report.categories).toMatchObject({
      plugins: 1024,
      mods: 1024,
      logs: 1024,
      cache: 1024,
      backups: payload.length,
      worlds: (await stat(path.join(f.server.path, 'world/level.dat'))).size,
    });
    expect(report.totalBytes).toBe(
      Object.values(report.categories).reduce((total, bytes) => total + bytes, 0),
    );
    expect(report.serverBytes + payload.length).toBe(report.totalBytes);
    expect(report.largest[0]?.relativePath).toBe('cache/payload.bin');
    expect(
      report.largest.every(
        (file) => !path.isAbsolute(file.relativePath) && !file.relativePath.includes('..'),
      ),
    ).toBe(true);
    expect(
      await f.service.location(f.server.id, { relativePath: backupId + '.zip', backupId }),
    ).toBe(backupFile);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await writeFile(path.join(f.server.path, 'mods/payload.bin'), Buffer.alloc(2048));
    await f.service.scan(f.server.id);
    expect(new StorageService(f.repo, f.jobs).overview(f.server.id).history).toMatchObject([
      { totalBytes: report.totalBytes },
      { totalBytes: report.totalBytes + 1024 },
    ]);
    expect(f.repo.server(f.server.id).diskBytes).toBe(report.serverBytes + 1024);
    expect(await readFile(path.join(f.server.path, 'mods/payload.bin'))).toEqual(
      Buffer.alloc(2048),
    );
  } finally {
    await f.cleanup();
  }
});
it('uses Bedrock worlds folders, excludes directory junctions and prevents reveal paths escaping the selected server', async () => {
  const f = await storage();
  try {
    f.repo.saveServer({ ...f.server, engine: 'bedrock' });
    await mkdir(path.join(f.server.path, 'worlds/Bedrock/db'), { recursive: true });
    await writeFile(path.join(f.server.path, 'worlds/Bedrock/db/0001.ldb'), Buffer.alloc(128));
    const outside = path.join(f.root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'must-not-count.bin'), Buffer.alloc(8192));
    await symlink(
      outside,
      path.join(f.server.path, 'linked-world'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const report = await f.service.scan(f.server.id);
    expect(report.categories.worlds).toBe(128);
    expect(report.excludedEntries).toBe(1);
    expect(report.largest.some((file) => file.relativePath.includes('must-not-count'))).toBe(false);
    await expect(
      f.service.location(f.server.id, { relativePath: '../outside/must-not-count.bin' }),
    ).rejects.toThrow();
    await expect(
      f.service.location(f.server.id, { relativePath: 'linked-world/must-not-count.bin' }),
    ).rejects.toThrow();
    await expect(
      f.service.location(f.server.id, { relativePath: 'config.bin', backupId: randomUUID() }),
    ).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});
it('cancels an on-demand scan without storing a misleading partial report or changing files', async () => {
  const f = await storage();
  const unsubscribe = f.bus.subscribe((event) => {
    if (event.type === 'progress' && event.progress.label === 'Analyze storage')
      f.jobs.cancel(event.progress.id);
  });
  try {
    await expect(f.service.scan(f.server.id)).rejects.toThrow();
    expect(f.service.overview(f.server.id).history).toEqual([]);
    expect(f.repo.operations()[0]?.status).toBe('cancelled');
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
  } finally {
    unsubscribe();
    await f.cleanup();
  }
});
