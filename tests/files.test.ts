import { it, expect, vi, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers';
import { FileService } from '../packages/core/files';
import { FileOperations } from '../packages/core/file-operations';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { BackupService, LocalBackupProvider } from '../packages/backups/service';
import type { ServerProcessSupervisor } from '../packages/server-core/supervisor';
import { DomainError } from '../packages/domain/errors';
import { copyRegularFile } from '../packages/security/copy';
import { extractZip, zipDirectory } from '../packages/backups/archive';
afterEach(() => vi.restoreAllMocks());
it('journals native file exports, protects application data and secret files, and keeps overwritten targets on cancellation', async () => {
  const f = await files();
  try {
    const destination = path.join(f.root, 'selected-export.yml');
    await writeFile(destination, 'previous export');
    await f.service.export(f.server.id, 'config/settings.yml', destination);
    expect(await readFile(destination, 'utf8')).toContain('message: hello');
    expect(
      f.repo
        .operations()
        .some((item) => item.kind === 'files.export' && item.status === 'completed'),
    ).toBe(true);
    await expect(
      f.service.export(f.server.id, 'config/settings.yml', path.join(f.root, 'app.db')),
    ).rejects.toThrow('active MineDock');
    await expect(f.service.export(f.server.id, 'server.properties', destination)).rejects.toThrow(
      'Secret',
    );
    await writeFile(path.join(f.server.path, 'credentials.json'), '{"private":"fixture-only"}');
    await expect(f.service.export(f.server.id, 'credentials.json', destination)).rejects.toThrow(
      'Secret',
    );
    await writeFile(destination, 'keep existing export');
    const run = f.jobs.run.bind(f.jobs);
    vi.spyOn(f.jobs, 'run').mockImplementationOnce((kind, label, serverId, action, signal) =>
      run(
        kind,
        label,
        serverId,
        (context) =>
          action({
            ...context,
            phase: (phase, received, total) => {
              context.phase(phase, received, total);
              if (phase === 'applying') f.jobs.cancel(context.id);
            },
          }),
        signal,
      ),
    );
    await expect(
      f.service.export(f.server.id, 'config/settings.yml', destination),
    ).rejects.toThrow();
    expect(await readFile(destination, 'utf8')).toBe('keep existing export');
    expect((await readdir(f.root)).filter((name) => name.includes('.minedock-'))).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
async function files() {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger);
  const backups = new BackupService(
    f.repo,
    { isRunning: () => false, isOrphaned: () => false } as unknown as ServerProcessSupervisor,
    f.secrets,
    new LocalBackupProvider(f.repo),
    jobs,
  );
  const service = new FileOperations(
    f.repo,
    jobs,
    (id) => {
      const server = f.repo.server(id);
      if (server.status !== 'stopped') throw new DomainError('RUNNING', 'Stop the server.');
      return server;
    },
    (id, reason) => backups.create(id, reason),
  );
  await mkdir(path.join(f.server.path, 'config'));
  await writeFile(
    path.join(f.server.path, 'config', 'settings.yml'),
    '# retained comment\nmessage: hello\n',
  );
  return {
    ...f,
    jobs,
    backups,
    service,
    cleanup: async () => {
      await logger.flush();
      await f.cleanup();
    },
  };
}
it('copies, renames, moves and explicitly overwrites real files atomically with restorable safety backups', async () => {
  const f = await files();
  try {
    await f.service.act(f.server.id, {
      action: 'copy',
      source: 'config/settings.yml',
      destination: 'config/copy.yml',
      confirmation: 'settings.yml',
      overwrite: false,
    });
    await f.service.act(f.server.id, {
      action: 'rename',
      source: 'config/copy.yml',
      destination: 'config/renamed.yml',
      confirmation: 'copy.yml',
      overwrite: false,
    });
    await f.service.act(f.server.id, {
      action: 'move',
      source: 'config/renamed.yml',
      destination: 'other/settings.yml',
      confirmation: 'renamed.yml',
      overwrite: false,
    });
    expect(await readFile(path.join(f.server.path, 'other/settings.yml'), 'utf8')).toContain(
      '# retained comment',
    );
    await expect(stat(path.join(f.server.path, 'config/renamed.yml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await writeFile(path.join(f.server.path, 'config/settings.yml'), 'message: newer\n');
    await expect(
      f.service.act(f.server.id, {
        action: 'copy',
        source: 'config/settings.yml',
        destination: 'other/settings.yml',
        confirmation: 'settings.yml',
        overwrite: false,
      }),
    ).rejects.toThrow('already exists');
    expect(await readFile(path.join(f.server.path, 'other/settings.yml'), 'utf8')).toContain(
      'hello',
    );
    await f.service.act(f.server.id, {
      action: 'copy',
      source: 'config/settings.yml',
      destination: 'other/settings.yml',
      confirmation: 'settings.yml',
      overwrite: true,
      overwriteConfirmation: 'settings.yml',
    });
    expect(await readFile(path.join(f.server.path, 'other/settings.yml'), 'utf8')).toContain(
      'newer',
    );
    await f.backups.restore(f.repo.backups()[0]!.id, f.server.name);
    expect(await readFile(path.join(f.server.path, 'other/settings.yml'), 'utf8')).toContain(
      'hello',
    );
    expect(f.repo.activity().some((event) => event.action === 'files.move')).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('rejects escapes, recursive destinations, unconfirmed overwrites, launch paths and managed content while stopped', async () => {
  const f = await files();
  try {
    await mkdir(path.join(f.server.path, 'plugins'));
    f.repo.saveContent({
      id: randomUUID(),
      serverId: f.server.id,
      projectId: 'project',
      title: 'Tracked',
      filename: 'managed.jar',
      versionId: 'version',
      enabled: true,
      folder: 'plugins',
    });
    await writeFile(path.join(f.server.path, 'plugins/managed.jar'), 'verified payload');
    for (const [source, destination] of [
      ['config', 'config/nested'],
      ['config', '../escape'],
      ['server.jar', 'other.jar'],
      ['config/settings.yml', 'server.properties'],
      ['plugins', 'other-plugins'],
      ['config/settings.yml', 'plugins/managed.jar'],
    ])
      await expect(
        f.service.act(f.server.id, {
          action: 'move',
          source: source!,
          destination: destination!,
          confirmation: path.basename(source!),
          overwrite: false,
        }),
      ).rejects.toThrow();
    await expect(
      f.service.act(f.server.id, {
        action: 'copy',
        source: 'config/settings.yml',
        destination: 'config/other.yml',
        confirmation: 'settings.yml',
        overwrite: true,
        overwriteConfirmation: 'wrong',
      }),
    ).rejects.toThrow('destination');
    f.repo.saveServer({ ...f.server, status: 'running' });
    await expect(
      f.service.act(f.server.id, {
        action: 'copy',
        source: 'config/settings.yml',
        destination: 'copy.yml',
        confirmation: 'settings.yml',
        overwrite: false,
      }),
    ).rejects.toThrow('Stop');
    expect(await readFile(path.join(f.server.path, 'plugins/managed.jar'), 'utf8')).toBe(
      'verified payload',
    );
    expect(f.repo.backups()).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});
it('validates YAML and JSON before saving, preserves comments, identifies YAML positions and hides authentication secrets', async () => {
  const f = await files(),
    editor = new FileService();
  try {
    const previous = await readFile(path.join(f.server.path, 'config/settings.yml'), 'utf8');
    await expect(
      editor.write(f.server.path, 'config/settings.yml', 'message: [unterminated\n'),
    ).rejects.toThrow(/line \d+, column \d+/);
    expect(await readFile(path.join(f.server.path, 'config/settings.yml'), 'utf8')).toBe(previous);
    await editor.write(
      f.server.path,
      'config/settings.yml',
      '# new comment\nmessage: [hello, world]\n',
    );
    expect(await editor.read(f.server.path, 'config/settings.yml')).toContain('# new comment');
    await expect(editor.write(f.server.path, 'invalid.JSON', '{bad')).rejects.toThrow(
      'Invalid JSON',
    );
    await editor.write(f.server.path, 'settings.toml', 'message = "hello"\n');
    await editor.write(f.server.path, 'settings.xml', '<settings/>');
    await writeFile(
      path.join(f.server.path, 'saved-refresh-tokens.json'),
      '{"token":"must not show"}',
    );
    await expect(editor.read(f.server.path, 'saved-refresh-tokens.json')).rejects.toThrow('secret');
    expect(await editor.read(f.server.path, 'server.properties')).not.toContain('test-secret');
  } finally {
    await f.cleanup();
  }
});
it('extracts a bounded ZIP into a prepared server, rejects collisions, and exports nested properties without RCON secrets', async () => {
  const f = await files();
  try {
    const source = path.join(f.root, 'zip-source'),
      archive = path.join(f.root, 'source.zip');
    await mkdir(path.join(source, 'nested'), { recursive: true });
    await writeFile(path.join(source, 'nested/settings.txt'), 'archive payload');
    await writeFile(
      path.join(source, 'server.properties'),
      'rcon.password=do-not-export\nmotd=Allowed\n',
    );
    await zipDirectory(source, archive);
    await f.service.extract(f.server.id, archive, {
      destination: 'imported',
      overwrite: false,
      confirmation: 'imported',
    });
    expect(await readFile(path.join(f.server.path, 'imported/nested/settings.txt'), 'utf8')).toBe(
      'archive payload',
    );
    await expect(
      f.service.extract(f.server.id, archive, {
        destination: 'imported',
        overwrite: false,
        confirmation: 'imported',
      }),
    ).rejects.toThrow('already exists');
    await writeFile(
      path.join(f.server.path, 'imported/server.properties'),
      'rcon.password=never-export\nmotd=Exported\n',
    );
    const output = path.join(f.root, 'export.zip'),
      unpacked = path.join(f.root, 'unpacked');
    await writeFile(output, 'existing output');
    await f.service.compress(f.server.id, 'imported', output);
    await extractZip(output, unpacked);
    expect(await readFile(path.join(unpacked, 'imported/server.properties'), 'utf8')).not.toContain(
      'never-export',
    );
    expect(await readFile(path.join(unpacked, 'imported/nested/settings.txt'), 'utf8')).toBe(
      'archive payload',
    );
    expect((await readdir(f.root)).filter((name) => name.includes('.minedock-'))).toHaveLength(0);
    const completed = f.repo.operations().find((operation) => operation.kind === 'archive.export')!;
    expect(completed.status).toBe('completed');
    expect(f.repo.operationCheckpoint(completed.id)).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
it('cancels a file transaction before mutation and interrupts a large file copy during streaming', async () => {
  const f = await files();
  const unsubscribe = f.bus.subscribe((event) => {
    if (
      event.type === 'progress' &&
      event.progress.label === 'Manage files' &&
      event.progress.phase === 'extracting'
    )
      f.jobs.cancel(event.progress.id);
  });
  try {
    await expect(
      f.service.act(f.server.id, {
        action: 'copy',
        source: 'config/settings.yml',
        destination: 'copy.yml',
        confirmation: 'settings.yml',
        overwrite: false,
      }),
    ).rejects.toThrow();
    expect(await readFile(path.join(f.server.path, 'config/settings.yml'), 'utf8')).toContain(
      'hello',
    );
    await expect(stat(path.join(f.server.path, 'copy.yml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(f.repo.operations().find((operation) => operation.kind === 'files.copy')?.status).toBe(
      'cancelled',
    );
    expect(
      (await readdir(path.dirname(f.server.path))).filter(
        (name) => name.includes('.staging') || name.includes('.previous'),
      ),
    ).toHaveLength(0);
    const source = path.join(f.root, 'large.bin'),
      destination = path.join(f.root, 'partial.bin'),
      controller = new AbortController();
    await writeFile(source, Buffer.alloc(8 * 1024 ** 2, 1));
    await expect(
      copyRegularFile(source, destination, {
        signal: controller.signal,
        progress: (received) => {
          if (received >= 128 * 1024) controller.abort();
        },
      }),
    ).rejects.toThrow();
    expect((await stat(destination)).size).toBeLessThan(8 * 1024 ** 2);
  } finally {
    unsubscribe();
    await f.cleanup();
  }
});
