import { it, expect, vi } from 'vitest';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import { extractZip, sha256, zipDirectory } from '../packages/backups/archive';
it('exports verified data with default secret exclusions and imports through the real engine transaction', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    await mkdir(path.join(f.server.path, 'plugins/Example'), { recursive: true });
    await writeFile(
      path.join(f.server.path, 'plugins/Example/config.yml'),
      'password: private-value\n',
    );
    await writeFile(path.join(f.server.path, 'plugins/Example.jar'), 'plugin bytes');
    await writeFile(path.join(f.server.path, 'world/session.lock'), 'locked');
    const archive = path.join(f.root, 'survival.minedock');
    await core.packages.export(f.server.id, archive, false, f.server.name);
    const checksum = await sha256(archive),
      expanded = path.join(f.root, 'inspect');
    await extractZip(archive, expanded);
    expect(await readFile(path.join(expanded, 'server/server.properties'), 'utf8')).not.toContain(
      'test-secret',
    );
    await expect(stat(path.join(expanded, 'server/plugins/Example/config.yml'))).rejects.toThrow();
    await expect(stat(path.join(expanded, 'server/world/session.lock'))).rejects.toThrow();
    expect(await readFile(path.join(expanded, 'manifest.json'), 'utf8')).not.toContain(
      f.server.path,
    );
    const preview = await core.packages.preview(archive);
    expect(preview.port).not.toBe(f.server.port);
    vi.spyOn(core.versions, 'artifact').mockResolvedValue({
      filename: 'paper.jar',
      url: 'https://api.papermc.io/fixture.jar',
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
      await writeFile(destination, 'new platform engine');
    });
    const imported = await core.packages.import({
      token: preview.token,
      name: 'Transferred survival',
      confirmation: 'Transferred survival',
      acceptEula: true,
    });
    expect(imported.id).not.toBe(f.server.id);
    expect(await readFile(path.join(imported.path, 'world/level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(await readFile(path.join(imported.path, 'plugins/Example.jar'), 'utf8')).toBe(
      'plugin bytes',
    );
    expect(await readFile(path.join(imported.path, 'server.properties'), 'utf8')).not.toContain(
      'test-secret',
    );
    expect(await sha256(archive)).toBe(checksum);
  } finally {
    vi.restoreAllMocks();
    await core.close();
    await f.cleanup();
  }
});
it('rejects checksum tampering before creating a server and requires sensitive-export confirmation', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    await expect(
      core.packages.export(f.server.id, path.join(f.root, 'bad.minedock'), true, 'wrong'),
    ).rejects.toThrow('confirmation');
    const archive = path.join(f.root, 'good.minedock');
    await core.packages.export(f.server.id, archive, false, f.server.name);
    const expanded = path.join(f.root, 'tampered');
    await extractZip(archive, expanded);
    await writeFile(path.join(expanded, 'server/world/level.dat'), 'tampered world');
    const bad = path.join(f.root, 'tampered.minedock');
    await zipDirectory(expanded, bad);
    await expect(core.packages.preview(bad)).rejects.toThrow('checksum');
    expect(core.repo.servers()).toHaveLength(1);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
