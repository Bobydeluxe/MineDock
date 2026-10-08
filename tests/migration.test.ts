import { expect, it, vi } from 'vitest';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import { findAvailablePort } from '../packages/networking/network';
it('reviews Paper/Purpur transitions, refuses unsafe downgrades and stale confirmations', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    vi.spyOn(core.versions, 'versions').mockResolvedValue(['1.21.11', '1.20.1']);
    vi.spyOn(core.versions, 'artifact').mockResolvedValue({
      filename: 'purpur.jar',
      url: 'https://api.purpurmc.org/fixture.jar',
      kind: 'jar',
      java: 21,
      build: '1',
    });
    const review = await core.migration.review(f.server.id, {
      engine: 'purpur',
      version: f.server.version,
    });
    expect(review.blocked).toBe(false);
    expect(review.items.find((i) => i.category === 'world')?.status).toBe('compatible');
    await expect(
      core.migration.review(f.server.id, { engine: 'purpur', version: '1.20.1' }),
    ).rejects.toThrow('downgrade');
    await expect(core.migration.apply(f.server.id, review.token, 'wrong')).rejects.toThrow(
      'Confirm',
    );
    core.repo.saveServer({ ...core.repo.server(f.server.id), memoryMax: 2048 });
    await expect(core.migration.apply(f.server.id, review.token, f.server.name)).rejects.toThrow(
      'changed',
    );
  } finally {
    vi.restoreAllMocks();
    await core.close();
    await f.cleanup();
  }
});
it('copies a complete stopped profile to separate ports and preserves the original world', async () => {
  const f = await fixture();
  await writeFile(path.join(f.server.path, 'eula.txt'), 'eula=true\n');
  await writeFile(path.join(f.server.path, 'server.jar'), 'fixture jar');
  await writeFile(path.join(f.server.path, 'world/level.dat'), 'fixture world');
  await mkdir(path.join(f.server.path, 'plugins'));
  await writeFile(path.join(f.server.path, 'plugins/manual.jar'), 'manual');
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    vi.spyOn(core.runtime, 'ensure').mockResolvedValue({
      major: 21,
      path: process.execPath,
      version: 'fixture',
      source: 'system',
    });
    const port = await findAvailablePort(f.server.port + 40),
      copy = await core.migration.clone(f.server.id, {
        name: 'Copy',
        port,
        mode: 'complete',
        confirmation: f.server.name,
      });
    expect(copy.id).not.toBe(f.server.id);
    expect(copy.port).toBe(port);
    expect(await readFile(path.join(copy.path, 'world/level.dat'), 'utf8')).toBe('fixture world');
    expect(await readFile(path.join(copy.path, 'plugins/manual.jar'), 'utf8')).toBe('manual');
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe(
      'fixture world',
    );
    await writeFile(path.join(f.server.path, 'world/session.lock'), 'lock');
    await mkdir(path.join(f.server.path, 'world/datapacks'));
    await writeFile(path.join(f.server.path, 'world/datapacks/manual.zip'), 'pack');
    const fresh = await core.migration.clone(f.server.id, {
      name: 'New survival',
      port: await findAvailablePort(port + 20),
      mode: 'newWorld',
      confirmation: f.server.name,
    });
    await expect(readFile(path.join(fresh.path, 'world/level.dat'))).rejects.toThrow();
    await expect(readFile(path.join(fresh.path, 'world/session.lock'))).rejects.toThrow();
    expect(await readFile(path.join(fresh.path, 'world/datapacks/manual.zip'), 'utf8')).toBe(
      'pack',
    );
  } finally {
    vi.restoreAllMocks();
    await core.close();
    await f.cleanup();
  }
});
