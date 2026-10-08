import { expect, it } from 'vitest';
import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { IncrementalBackups } from '../packages/backups/incremental';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { DownloadManager } from '../packages/minecraft/downloads';
import { ManagedContentService } from '../packages/marketplace/content';
async function setup() {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger);
  let safety = 0;
  const service = new IncrementalBackups(
    f.repo,
    jobs,
    new ManagedContentService(f.repo, new DownloadManager(f.bus, f.repo), jobs),
    (id) => f.repo.server(id),
    async () => {
      safety++;
    },
  );
  return {
    ...f,
    service,
    safety: () => safety,
    cleanup: async () => {
      await logger.flush();
      await f.cleanup();
    },
  };
}
it('deduplicates unchanged files by hash and exactly restores a selected world with a safety backup', async () => {
  const f = await setup();
  try {
    await writeFile(path.join(f.server.path, 'world/level.dat'), 'world-one');
    const first = await f.service.create(f.server.id),
      second = await f.service.create(f.server.id);
    expect(first.storedBytes).toBeGreaterThan(0);
    expect(second.storedBytes).toBe(0);
    await writeFile(path.join(f.server.path, 'world/level.dat'), 'world-two');
    await writeFile(path.join(f.server.path, 'world/new.txt'), 'new');
    await mkdir(path.join(f.server.path, 'plugins'));
    await writeFile(path.join(f.server.path, 'plugins/manual.jar'), 'keep');
    const preview = await f.service.preview(f.server.id, first.id, 'world');
    expect(preview.replaced).toContain('world');
    await f.service.restore(f.server.id, preview.token, f.server.name);
    expect(f.safety()).toBe(1);
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe('world-one');
    expect(await readdir(path.join(f.server.path, 'world'))).not.toContain('new.txt');
    expect(await readFile(path.join(f.server.path, 'plugins/manual.jar'), 'utf8')).toBe('keep');
  } finally {
    await f.cleanup();
  }
});
it('rejects corrupted objects before modifying the live server and strips managed RCON secrets', async () => {
  const f = await setup();
  try {
    await writeFile(path.join(f.server.path, 'world/level.dat'), 'world');
    const snapshot = await f.service.create(f.server.id),
      root = path.join(f.repo.settings().backupRoot, '.minedock-incremental');
    const manifest = JSON.parse(await readFile(path.join(root, snapshot.id + '.json'), 'utf8'));
    const props = manifest.entries.find((e: { path: string }) => e.path === 'server.properties');
    expect(await readFile(path.join(root, 'objects', props.hash), 'utf8')).not.toContain(
      'test-secret',
    );
    const world = manifest.entries.find((e: { path: string }) => e.path === 'world/level.dat');
    await writeFile(path.join(root, 'objects', world.hash), 'corrupt');
    const preview = await f.service.preview(f.server.id, snapshot.id, 'world');
    await expect(f.service.restore(f.server.id, preview.token, f.server.name)).rejects.toThrow(
      'integrity',
    );
    expect(f.safety()).toBe(0);
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe('world');
  } finally {
    await f.cleanup();
  }
});
it('keeps distinct default-on backup switches and tests writable external storage', async () => {
  const f = await setup();
  try {
    expect(f.service.settings()).toEqual({ beforeContent: true, beforeMinecraft: true });
    f.service.configure({ beforeContent: false, beforeMinecraft: true });
    expect(f.service.settings().beforeContent).toBe(false);
    const report = await f.service.testStorage();
    expect(report.writable).toBe(true);
    expect(report.freeBytes).toBeGreaterThan(0);
  } finally {
    await f.cleanup();
  }
});
