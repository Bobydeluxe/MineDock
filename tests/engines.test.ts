import { it, expect, vi, afterEach } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PurpurCatalog,
  FabricCatalog,
  ForgeCatalog,
  PocketMineCatalog,
  neoforgeMinecraftVersion,
} from '../packages/minecraft/catalogs';
import { AppCore } from '../packages/core/app';
import { fixture } from './helpers';
import { startCommand } from '../packages/server-core/supervisor';
import * as installation from '../packages/minecraft/process';
import type { Engine } from '../packages/domain/types';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('distinguishes PocketMine release versions from the supported Bedrock protocol version', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('build_info.json')
              ? { mcpe_version: '1.26.30' }
              : {
                  tag_name: '5.44.3',
                  prerelease: false,
                  draft: false,
                  assets: [
                    {
                      name: 'PocketMine-MP.phar',
                      browser_download_url:
                        'https://github.com/pmmp/PocketMine-MP/releases/download/5.44.3/PocketMine-MP.phar',
                      digest: 'sha256:' + 'a'.repeat(64),
                    },
                  ],
                },
          ),
        ),
    ),
  );
  expect(await new PocketMineCatalog().artifact('5.44.3')).toMatchObject({
    build: '5.44.3',
    minecraftVersion: '1.26.30',
    kind: 'phar',
    java: 0,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
  await expect(new PocketMineCatalog().artifact('5.44.3')).rejects.toThrow();
});
it('pins distinct Purpur and Fabric artifacts and rejects incompatible selections', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('.sha256')
            ? 'a'.repeat(64)
            : JSON.stringify(
                url.includes('purpur')
                  ? { build: '2568', result: 'SUCCESS', md5: 'b'.repeat(32) }
                  : url.includes('installer')
                    ? [
                        {
                          version: '1.1.2',
                          url: 'https://maven.fabricmc.net/installer.jar',
                          stable: true,
                        },
                      ]
                    : [{ loader: { version: '0.19.5', stable: true } }],
              ),
        ),
    ),
  );
  expect(await new PurpurCatalog().artifact('1.21.11', '2568')).toMatchObject({
    build: '2568',
    kind: 'jar',
    filename: 'purpur-1.21.11-2568.jar',
    hash: { algorithm: 'md5' },
  });
  expect(
    await new FabricCatalog().artifact('1.21.11', undefined, {
      loaderVersion: '0.19.5',
      installerVersion: '1.1.2',
    }),
  ).toMatchObject({ build: '0.19.5@1.1.2', kind: 'installer', java: 21 });
  await expect(
    new FabricCatalog().artifact('1.21.11', undefined, { loaderVersion: 'unknown' }),
  ).rejects.toThrow('compatible');
});
it('uses separate Forge and NeoForge catalogs, coordinate paths and version mappings', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('.sha1')
            ? 'a'.repeat(40)
            : url.endsWith('.sha256')
              ? 'b'.repeat(64)
              : url.includes('maven-metadata')
                ? '<metadata><version>1.20.1-47.4.0</version></metadata>'
                : JSON.stringify({ versions: ['21.1.219', '21.4.111-beta', '26.1.0.5'] }),
        ),
    ),
  );
  expect(await new ForgeCatalog('forge').artifact('1.20.1')).toMatchObject({
    build: '1.20.1-47.4.0',
    java: 17,
    url: 'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.4.0/forge-1.20.1-47.4.0-installer.jar',
  });
  expect(await new ForgeCatalog('neoforge').artifact('1.21.1')).toMatchObject({
    build: '21.1.219',
    java: 21,
    url: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.219/neoforge-21.1.219-installer.jar',
  });
  expect(await new ForgeCatalog('neoforge').versions()).not.toContain('1.21.4');
  expect(neoforgeMinecraftVersion('20.2.93')).toBe('1.20.2');
  expect(neoforgeMinecraftVersion('26.1.0.5')).toBe('26.1');
});
it.each(['purpur', 'fabric', 'forge', 'neoforge'] as Engine[])(
  'installs %s into staging, verifies its launch structure and restores a complete backup',
  async (engine) => {
    const f = await fixture();
    const core = await AppCore.open(f.root, f.secrets);
    try {
      const build =
        engine === 'forge'
          ? '1.21.11-60.0.0'
          : engine === 'neoforge'
            ? '21.11.0'
            : engine === 'fabric'
              ? '0.19.5@1.1.2'
              : '2568';
      const filename = engine === 'purpur' ? 'purpur.jar' : 'installer.jar';
      vi.spyOn(core.versions, 'artifact').mockResolvedValue({
        url: 'https://cdn.modrinth.com/fixture.jar',
        filename,
        java: 21,
        build,
        kind: engine === 'purpur' ? 'jar' : 'installer',
        loaderVersion: engine === 'fabric' ? '0.19.5' : build,
        installerVersion: engine === 'fabric' ? '1.1.2' : undefined,
      });
      vi.spyOn(core.runtime, 'ensure').mockResolvedValue({
        major: 21,
        path: process.execPath,
        source: 'system',
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('verified-test-artifact')),
      );
      const processSpy = vi
        .spyOn(installation, 'installerProcess')
        .mockImplementation(async (_file, args, cwd) => {
          if (engine === 'fabric') {
            expect(args).toContain('-downloadMinecraft');
            await writeFile(path.join(cwd, 'fabric-server-launch.jar'), 'launcher');
            await writeFile(path.join(cwd, 'server.jar'), 'game');
          } else {
            expect(args).toContain('--installServer');
            const coordinate =
              engine === 'forge'
                ? `net/minecraftforge/forge/${build}`
                : `net/neoforged/neoforge/${build}`;
            const folder = path.join(cwd, 'libraries', coordinate);
            await mkdir(folder, { recursive: true });
            await writeFile(
              path.join(folder, process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'),
              '--fixture',
            );
          }
        });
      const server = await core.create({
        ...f.server,
        name: 'Engine test',
        engine,
        port: f.server.port + 3,
        eula: true,
      });
      expect(server.installationComplete).toBe(true);
      expect(
        core.repo
          .operations()
          .some(
            (operation) => operation.kind === 'engine.install' && operation.status === 'completed',
          ),
      ).toBe(true);
      const command = await startCommand(server);
      expect(command.executable).toBe(process.execPath);
      if (engine === 'purpur') expect(command.args).toContain('purpur.jar');
      else expect(processSpy).toHaveBeenCalledTimes(1);
      if (engine === 'forge' || engine === 'neoforge')
        expect(command.args.some((arg) => arg.startsWith('@libraries/'))).toBe(true);
      const backup = await core.backups.create(server.id);
      await writeFile(path.join(server.path, 'marker.txt'), 'change');
      await core.backups.restore(backup.id, server.name);
      expect((await startCommand(core.repo.server(server.id))).args).toEqual(command.args);
      expect(
        core.repo
          .operations()
          .some(
            (operation) => operation.kind === 'backup.restore' && operation.status === 'completed',
          ),
      ).toBe(true);
      expect(await readFile(path.join(server.path, 'eula.txt'), 'utf8')).toContain(
        server.createdAt,
      );
    } finally {
      await core.close();
      await f.cleanup();
    }
  },
);
