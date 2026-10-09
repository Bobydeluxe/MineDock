import { it, expect } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
it('prepares loopback-only map configs, requires review and preserves existing settings', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    await core.maps.configure(f.server.id, 'bluemap', 8100, false);
    const web = path.join(f.server.path, 'plugins/BlueMap/webserver.conf');
    expect(await readFile(web, 'utf8')).toContain('ip: "127.0.0.1"');
    expect(await readFile(path.join(f.server.path, 'plugins/BlueMap/core.conf'), 'utf8')).toContain(
      'accept-download: false',
    );
    await writeFile(web, (await readFile(web, 'utf8')) + '\n# retained\nmax-connections: 5\n');
    await core.maps.configure(f.server.id, 'bluemap', 8101, true);
    expect(await readFile(web, 'utf8')).toContain('max-connections: 5');
    await core.maps.configure(f.server.id, 'dynmap', 8123, false);
    expect(
      await readFile(path.join(f.server.path, 'plugins/dynmap/configuration.txt'), 'utf8'),
    ).toContain('webserver-bindaddress: 127.0.0.1');
    await expect(
      core.maps.apply(f.server.id, {
        kind: 'dynmap',
        token: crypto.randomUUID(),
        port: 8123,
        acceptAssets: false,
        confirmation: f.server.name,
      }),
    ).rejects.toThrow('Review');
    expect((await core.maps.status(f.server.id)).every((m) => !m.url)).toBe(true);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
