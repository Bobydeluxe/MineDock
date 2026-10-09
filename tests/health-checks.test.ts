import { it, expect, vi } from 'vitest';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
it('reports missing runtime and an occupied stopped-server port using real local checks', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(f.server.port, '0.0.0.0', resolve));
  await mkdir(path.join(f.server.path, 'plugins'), { recursive: true });
  await writeFile(path.join(f.server.path, 'plugins/Broken.jar'), 'not a jar');
  try {
    core.repo.saveServer({ ...f.server, javaPath: f.root + '/missing-java.exe' });
    const report = await core.health.report(f.server.id);
    expect(report.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['runtime', 'port', 'content']),
    );
    expect(report.state).toBe('problem');
    expect(core.health.notices().map((n) => n.code)).toContain('runtime');
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await core.close();
    await f.cleanup();
  }
});
it('uses the official release response to notify newer stable Minecraft versions without migrating', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ latest: { release: '1.22.1' } }))),
  );
  try {
    expect(await core.migration.latest(f.server.id)).toBe('1.22.1');
    expect(core.health.notices().find((n) => n.code === 'minecraftUpdate')?.detail).toBe('1.22.1');
    expect(core.repo.server(f.server.id).version).toBe(f.server.version);
  } finally {
    vi.unstubAllGlobals();
    await core.close();
    await f.cleanup();
  }
});
