import { expect, it } from 'vitest';
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fixture } from './helpers';
import { worldMetadata } from './fixtures/world-metadata';
import { WorldService } from '../packages/core/worlds';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { BackupService, LocalBackupProvider } from '../packages/backups/service';
import { readLevelMetadata } from '../packages/security/nbt';
import { extractZip, zipDirectory } from '../packages/backups/archive';
import { DomainError } from '../packages/domain/errors';
import { parseProperties } from '../packages/domain/properties';
import type { ServerProcessSupervisor } from '../packages/server-core/supervisor';
async function worlds() {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger);
  const runner = {
    isOrphaned: () => false,
    isRunning: () => false,
  } as unknown as ServerProcessSupervisor;
  const backup = new BackupService(
    f.repo,
    runner,
    f.secrets,
    new LocalBackupProvider(f.repo),
    jobs,
  );
  const service = new WorldService(
    f.repo,
    jobs,
    (id) => {
      const server = f.repo.server(id);
      if (server.status !== 'stopped') throw new DomainError('RUNNING', 'Stop the server.');
      return server;
    },
    (id, reason) => backup.create(id, reason),
  );
  await writeFile(path.join(f.server.path, 'world', 'level.dat'), worldMetadata());
  for (const name of ['world', 'world_nether', 'world_the_end']) {
    await mkdir(path.join(f.server.path, name), { recursive: true });
    await writeFile(path.join(f.server.path, name, 'level.dat'), worldMetadata());
    await writeFile(path.join(f.server.path, name, 'uid.dat'), 'existing uuid');
    await writeFile(path.join(f.server.path, name, 'session.lock'), 'stale lock');
    await mkdir(path.join(f.server.path, name, 'region'));
    await writeFile(path.join(f.server.path, name, 'region', 'r.0.0.mca'), name + ' payload');
  }
  return {
    ...f,
    jobs,
    backup,
    service,
    cleanup: async () => {
      await logger.flush();
      await f.cleanup();
    },
  };
}
it('reads exact signed 64-bit seeds in Java gzip and Bedrock little-endian metadata and rejects corrupt or oversized data', () => {
  expect(readLevelMetadata(worldMetadata())).toMatchObject({
    edition: 'java',
    seed: '9223372036854775806',
    version: '1.21.11',
  });
  expect(readLevelMetadata(worldMetadata('bedrock', '-9007199254740993'))).toMatchObject({
    edition: 'bedrock',
    seed: '-9007199254740993',
  });
  expect(() => readLevelMetadata(Buffer.from('invalid metadata'))).toThrow();
  expect(() => readLevelMetadata(worldMetadata().subarray(0, 20))).toThrow();
  expect(() => readLevelMetadata(gzipSync(Buffer.alloc(17 * 1024 ** 2)))).toThrow();
});
it('duplicates all Java dimensions without reusing Bukkit UUIDs, selects and renames the active world, and deletes only an inactive set after backups', async () => {
  const f = await worlds();
  try {
    const before = await readFile(path.join(f.server.path, 'world', 'region', 'r.0.0.mca'));
    expect(await f.service.list(f.server.id)).toMatchObject([
      {
        name: 'world',
        active: true,
        seed: '9223372036854775806',
        folders: ['world', 'world_nether', 'world_the_end'],
      },
    ]);
    await expect(
      f.service.act(f.server.id, { action: 'delete', name: 'world', confirmation: 'world' }),
    ).rejects.toThrow('another world');
    await f.service.act(f.server.id, {
      action: 'duplicate',
      name: 'world',
      newName: 'copy',
      confirmation: 'world',
    });
    for (const suffix of ['', '_nether', '_the_end']) {
      expect(
        await readFile(path.join(f.server.path, 'copy' + suffix, 'region', 'r.0.0.mca'), 'utf8'),
      ).toBe('world' + suffix + ' payload');
      await expect(
        stat(path.join(f.server.path, 'copy' + suffix, 'uid.dat')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(await readFile(path.join(f.server.path, 'world', 'region', 'r.0.0.mca'))).toEqual(
      before,
    );
    await f.service.act(f.server.id, { action: 'select', name: 'copy', confirmation: 'copy' });
    await f.service.act(f.server.id, {
      action: 'rename',
      name: 'copy',
      newName: 'adventure',
      confirmation: 'copy',
    });
    const props = parseProperties(
      await readFile(path.join(f.server.path, 'server.properties'), 'utf8'),
    );
    expect(props['level-name']).toBe('adventure');
    expect(props['level-seed']).toBe('9223372036854775806');
    await f.service.act(f.server.id, { action: 'delete', name: 'world', confirmation: 'world' });
    expect(await f.service.list(f.server.id)).toMatchObject([
      {
        name: 'adventure',
        active: true,
        folders: ['adventure', 'adventure_nether', 'adventure_the_end'],
      },
    ]);
    expect(f.repo.backups()).toHaveLength(4);
    expect(f.repo.db.prepare('SELECT COUNT(*) AS count FROM world_history').get()?.count).toBe(4);
    const extracted = path.join(f.root, 'old-world');
    await extractZip(f.repo.backup(f.repo.backups()[0]!.id).path, extracted);
    expect(await readFile(path.join(extracted, 'world', 'region', 'r.0.0.mca'))).toEqual(before);
  } finally {
    await f.cleanup();
  }
});
it('exports a complete world set and imports its preview atomically without changing the source or silently activating it', async () => {
  const f = await worlds();
  try {
    const archive = path.join(f.root, 'world-export.zip');
    await f.service.export(f.server.id, 'world', archive);
    const before = await readFile(archive),
      preview = await f.service.preview(f.server.id, archive);
    expect(preview).toMatchObject({
      edition: 'java',
      folders: ['world', 'world_nether', 'world_the_end'],
      seed: '9223372036854775806',
    });
    await f.service.import(f.server.id, {
      token: preview.token,
      name: 'imported',
      confirmation: 'imported',
    });
    expect(await readFile(archive)).toEqual(before);
    expect(await f.service.list(f.server.id)).toMatchObject([
      { name: 'imported', active: false },
      { name: 'world', active: true },
    ]);
    expect(
      await readFile(path.join(f.server.path, 'imported_the_end', 'region', 'r.0.0.mca'), 'utf8'),
    ).toBe('world_the_end payload');
    expect(f.repo.backups().map((backup) => backup.reason)).toContain('before_world_import');
    expect(await readdir(path.join(f.root, 'cache', 'world-imports'))).toEqual([]);
    await expect(
      f.service.import(f.server.id, { token: preview.token, name: 'again', confirmation: 'again' }),
    ).rejects.toThrow('expired');
  } finally {
    await f.cleanup();
  }
});
it('rejects collisions and cancellation without changing a single original world or profile', async () => {
  const f = await worlds();
  try {
    await mkdir(path.join(f.server.path, 'taken'));
    await writeFile(path.join(f.server.path, 'taken', 'sentinel'), 'keep');
    await expect(
      f.service.act(f.server.id, {
        action: 'rename',
        name: 'world',
        newName: 'taken',
        confirmation: 'world',
      }),
    ).rejects.toThrow('already exists');
    const before = await readFile(path.join(f.server.path, 'server.properties'));
    const off = f.bus.subscribe((event) => {
      if (
        event.type === 'progress' &&
        event.progress.label === 'Manage world' &&
        event.progress.phase === 'extracting'
      )
        f.jobs.cancel(event.progress.id);
    });
    await expect(
      f.service.act(f.server.id, {
        action: 'duplicate',
        name: 'world',
        newName: 'cancelled',
        confirmation: 'world',
      }),
    ).rejects.toThrow();
    off();
    expect(await readFile(path.join(f.server.path, 'server.properties'))).toEqual(before);
    expect(await readFile(path.join(f.server.path, 'taken', 'sentinel'), 'utf8')).toBe('keep');
    await expect(stat(path.join(f.server.path, 'cancelled'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      f.repo.operations().find((operation) => operation.kind === 'world.duplicate')?.status,
    ).toBe('cancelled');
    expect(
      (await readdir(path.dirname(f.server.path))).filter((name) => name.endsWith('.staging')),
    ).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('imports and selects Bedrock worlds under worlds/ while refusing cross-edition worlds and running servers', async () => {
  const f = await worlds();
  try {
    f.repo.saveServer({ ...f.server, engine: 'bedrock', javaMajor: 0 });
    const source = path.join(f.root, 'Bedrock World');
    await mkdir(path.join(source, 'db'), { recursive: true });
    await writeFile(path.join(source, 'level.dat'), worldMetadata('bedrock', '42'));
    await writeFile(path.join(source, 'db', '000001.ldb'), 'leveldb payload');
    const preview = await f.service.preview(f.server.id, source);
    await f.service.import(f.server.id, {
      token: preview.token,
      name: 'bedrock',
      confirmation: 'bedrock',
    });
    await f.service.act(f.server.id, {
      action: 'select',
      name: 'bedrock',
      confirmation: 'bedrock',
    });
    expect(
      await readFile(path.join(f.server.path, 'worlds', 'bedrock', 'db', '000001.ldb'), 'utf8'),
    ).toBe('leveldb payload');
    expect((await f.service.list(f.server.id))[0]).toMatchObject({
      name: 'bedrock',
      active: true,
      seed: '42',
    });
    await expect(f.service.preview(f.server.id, path.join(f.server.path, 'world'))).rejects.toThrow(
      'different Minecraft edition',
    );
    f.repo.saveServer({ ...f.repo.server(f.server.id), status: 'running' });
    await expect(
      f.service.export(f.server.id, 'bedrock', path.join(f.root, 'out.zip')),
    ).rejects.toThrow('Stop');
  } finally {
    await f.cleanup();
  }
});
it('previews root-level MCWORLD archives and detects source metadata changes before importing', async () => {
  const f = await worlds();
  try {
    const source = path.join(f.root, 'root-world');
    await mkdir(source);
    await writeFile(path.join(source, 'level.dat'), worldMetadata());
    const archive = path.join(f.root, 'root.zip');
    await zipDirectory(source, archive);
    expect(await f.service.preview(f.server.id, archive)).toMatchObject({
      edition: 'java',
      folders: ['world'],
    });
    const preview = await f.service.preview(f.server.id, source);
    await writeFile(path.join(source, 'level.dat'), worldMetadata('java', '99'));
    await expect(
      f.service.import(f.server.id, {
        token: preview.token,
        name: 'changed',
        confirmation: 'changed',
      }),
    ).rejects.toThrow('changed');
    await f.service.cleanPreviews();
    expect(await readdir(path.join(f.root, 'cache', 'world-imports'))).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
