import { expect, it, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
it('applies a reviewed Paper to Purpur transition through real file and database transactions', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    const original = await readFile(path.join(f.server.path, 'server.properties'));
    vi.spyOn(core.versions, 'versions').mockResolvedValue([f.server.version]);
    vi.spyOn(core.versions, 'artifact').mockResolvedValue({
      filename: 'purpur.jar',
      url: 'https://api.purpurmc.org/fixture.jar',
      kind: 'jar',
      java: 21,
      build: '1',
    });
    vi.spyOn(core.runtime, 'ensure').mockResolvedValue({
      major: 21,
      path: process.execPath,
      version: 'fixture',
      source: 'system',
    });
    vi.spyOn(core.downloads, 'download').mockImplementation(async (_url, destination) => {
      await writeFile(destination, 'fixture engine');
    });
    const review = await core.migration.review(f.server.id, {
      engine: 'purpur',
      version: f.server.version,
    });
    await core.migration.apply(f.server.id, review.token, f.server.name);
    expect(core.repo.server(f.server.id).engine).toBe('purpur');
    expect(core.repo.server(f.server.id).status).toBe('stopped');
    expect(await readFile(path.join(f.server.path, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(await readFile(path.join(f.server.path, 'server.properties'))).toEqual(original);
    expect(core.repo.backups()).toHaveLength(1);
    expect(await core.backups.verify(core.repo.backups()[0]!.id)).toBe(true);
  } finally {
    vi.restoreAllMocks();
    await core.close();
    await f.cleanup();
  }
});
