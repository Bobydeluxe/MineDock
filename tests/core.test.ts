import { it, expect, vi, afterEach } from 'vitest';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
afterEach(() => vi.unstubAllGlobals());
it('exports a verified backup through an atomic cancellable transaction without exposing application database targets', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets);
  try {
    const backup = await core.backups.create(f.server.id),
      destination = path.join(f.root, 'selected-backup.zip');
    await core.exportBackup(backup.id, destination);
    const bytes = await readFile(destination);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(backup.sha256);
    expect(
      core.repo
        .operations()
        .some((item) => item.kind === 'backup.export' && item.status === 'completed'),
    ).toBe(true);
    await expect(core.exportBackup(backup.id, path.join(f.root, 'app.db'))).rejects.toThrow(
      'active MineDock',
    );
    expect(core.repo.server(f.server.id).name).toBe(f.server.name);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('creates a server through the application service, persists settings and rolls a world back', async () => {
  const f = await fixture();
  const core = await AppCore.open(f.root, f.secrets);
  const jar = Buffer.from('fake integration jar, never executed');
  const sha1 = createHash('sha1').update(jar).digest('hex');
  try {
    vi.spyOn(core.runtime, 'ensure').mockResolvedValue({
      major: 21,
      path: process.execPath,
      source: 'system',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            url.endsWith('.jar')
              ? jar
              : JSON.stringify(
                  url.includes('version_manifest')
                    ? {
                        versions: [
                          {
                            id: '1.21.11',
                            type: 'release',
                            url: 'https://piston-meta.mojang.com/test.json',
                          },
                        ],
                      }
                    : {
                        downloads: {
                          server: { url: 'https://piston-data.mojang.com/server.jar', sha1 },
                        },
                        javaVersion: { majorVersion: 21 },
                      },
                ),
          ),
      ),
    );
    const server = await core.create({
      name: 'Created',
      engine: 'vanilla',
      version: '1.21.11',
      memoryMin: 1024,
      memoryMax: 4096,
      port: f.server.port + 2,
      difficulty: 'normal',
      gamemode: 'survival',
      maxPlayers: 20,
      viewDistance: 10,
      simulationDistance: 8,
      pvp: true,
      whitelist: false,
      onlineMode: true,
      seed: '',
      motd: 'Hello',
      autoStart: false,
      autoRestart: false,
      eula: true,
    });
    expect(server.status).toBe('stopped');
    await expect(core.create({ ...server, port: f.rconPort, eula: true })).rejects.toThrow(/Port/i);
    expect((await stat(path.join(server.path, 'server.jar'))).size).toBe(jar.length);
    expect(await readFile(path.join(server.path, 'eula.txt'), 'utf8')).toContain('eula=true');
    const props = await core.properties(server.id);
    expect(props['rcon.password']).toBeUndefined();
    expect(props['rcon.port']).not.toBe(String(server.port));
    const original = await core.backups.create(server.id);
    await core.saveProperties(server.id, { ...props, motd: 'Updated', 'max-players': '30' });
    expect(core.repo.server(server.id).maxPlayers).toBe(30);
    expect(core.repo.backups().some((b) => b.reason === 'before_settings')).toBe(true);
    await core.backups.restore(original.id, server.name);
    expect((await core.properties(server.id)).motd).toBe('Hello');
    await expect(
      core.saveProperties(server.id, { ...props, 'level-name': '../../outside' }),
    ).rejects.toThrow();
    const settings = { ...core.repo.settings(), language: 'en' as const, onboarded: true };
    await core.settings(settings);
    expect(core.snapshot().settings.language).toBe('en');
    await expect(
      core.exclusive(server.id, async () => {
        await core.exclusive(server.id, async () => undefined);
      }),
    ).rejects.toThrow('operation');
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('retries an interrupted installation using its pinned profile and retains explicit consent', async () => {
  const f = await fixture();
  const core = await AppCore.open(f.root, f.secrets);
  const jar = Buffer.from('fake retry artifact');
  const sha1 = createHash('sha1').update(jar).digest('hex');
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            url.endsWith('.jar')
              ? jar
              : JSON.stringify(
                  url.includes('version_manifest')
                    ? {
                        versions: [
                          {
                            id: '1.21.11',
                            type: 'release',
                            url: 'https://piston-meta.mojang.com/test.json',
                          },
                        ],
                      }
                    : {
                        downloads: {
                          server: { url: 'https://piston-data.mojang.com/server.jar', sha1 },
                        },
                        javaVersion: { majorVersion: 21 },
                      },
                ),
          ),
      ),
    );
    vi.spyOn(core.runtime, 'ensure')
      .mockRejectedValueOnce(new Error('Interrupted download'))
      .mockResolvedValue({ major: 21, path: process.execPath, source: 'system' });
    await expect(
      core.create({
        name: 'Retry',
        engine: 'vanilla',
        version: '1.21.11',
        memoryMin: 1024,
        memoryMax: 4096,
        port: f.server.port + 3,
        difficulty: 'normal',
        gamemode: 'survival',
        maxPlayers: 20,
        viewDistance: 10,
        simulationDistance: 8,
        pvp: true,
        whitelist: false,
        onlineMode: true,
        seed: '',
        motd: 'Retry',
        autoStart: false,
        autoRestart: false,
        eula: true,
      }),
    ).rejects.toThrow('Interrupted');
    const incomplete = core.repo.servers().find((s) => s.name === 'Retry')!;
    expect(incomplete.installationComplete).toBe(false);
    await expect(core.supervisor.start(incomplete.id)).rejects.toThrow('installation');
    const complete = await core.retryInstallation(incomplete.id);
    expect(complete.installationComplete).toBe(true);
    expect(complete.build).toBe(incomplete.build);
    expect(await readFile(path.join(complete.path, 'eula.txt'), 'utf8')).toContain(
      incomplete.createdAt,
    );
    await expect(core.retryInstallation(complete.id)).rejects.toThrow('already');
  } finally {
    await core.close();
    await f.cleanup();
  }
});
