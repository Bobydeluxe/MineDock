import { expect, it, vi, afterEach } from 'vitest';
import { ZipFile } from 'yazl';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fixture } from './helpers';
import { CrossplayService } from '../packages/server-core/crossplay';
import { ManagedContentService } from '../packages/marketplace/content';
import { DownloadManager } from '../packages/minecraft/downloads';
import { Logger } from '../packages/core/logger';
import { OperationService } from '../packages/core/operations';
import { checkPort } from '../packages/networking/network';
import { parse } from 'yaml';
afterEach(() => vi.unstubAllGlobals());
const geyserId = 'wKkoqHrH';
async function jar(config: string, fabricLoader?: string, modern = false): Promise<Buffer> {
  const zip = new ZipFile();
  if (config) zip.addBuffer(Buffer.from(config), 'config.yml');
  if (modern)
    zip.addBuffer(
      Buffer.from('cafebabe00000041', 'hex'),
      'org/geysermc/geyser/configuration/GeyserConfig.class',
    );
  if (fabricLoader)
    zip.addBuffer(
      Buffer.from(JSON.stringify({ depends: { fabricloader: fabricLoader, java: '>=21' } })),
      'fabric.mod.json',
    );
  zip.end();
  const parts: Buffer[] = [];
  for await (const chunk of zip.outputStream) parts.push(chunk as Buffer);
  return Buffer.concat(parts);
}
async function port() {
  for (let value = 30000; value < 31000; value++) if (await checkPort(value, 'udp')) return value;
  throw Error('No test UDP port');
}
function network(data: Buffer, loader = 'paper', versions = ['1.21.11']) {
  const version = {
    id: 'geyser-v',
    project_id: geyserId,
    version_number: '2.11.3',
    version_type: 'beta',
    date_published: '2026-01-01T00:00:00Z',
    game_versions: versions,
    loaders: [loader],
    files: [
      {
        filename: 'Geyser.jar',
        url: 'https://cdn.modrinth.com/Geyser.jar',
        primary: true,
        hashes: { sha512: createHash('sha512').update(data).digest('hex') },
      },
    ],
    dependencies: [],
  };
  const flood = Buffer.from('fixture-floodgate');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/downloads/spigot')) return new Response(flood);
      if (url.startsWith('https://download.geysermc.org'))
        return new Response(
          JSON.stringify({
            version: '2.2.5',
            build: 141,
            time: '2026-01-01T00:00:00Z',
            downloads: {
              spigot: {
                name: 'floodgate-spigot.jar',
                sha256: createHash('sha256').update(flood).digest('hex'),
              },
            },
          }),
        );
      if (url.endsWith('/Geyser.jar')) return new Response(new Uint8Array(data));
      if (url.includes('/version/geyser-v')) return new Response(JSON.stringify(version));
      if (url.includes(`/project/${geyserId}/version?`))
        return new Response(JSON.stringify([version]));
      if (url.includes('/project/bWrNNfkb/version?')) return new Response('[]');
      return new Response(
        JSON.stringify({ id: geyserId, title: 'Geyser', server_side: 'required' }),
      );
    }),
  );
}
it('installs the correct Paper/Floodgate variants and applies UDP/authentication settings atomically while retaining worlds and online-mode', async () => {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    manager = new ManagedContentService(
      f.repo,
      new DownloadManager(f.bus),
      new OperationService(f.repo, f.bus, logger),
    ),
    service = new CrossplayService(f.repo, manager);
  try {
    network(await jar('# default\nbedrock:\n  port: 19132\njava:\n  auth-type: online\n'));
    const udp = await port();
    await service.configure(f.server, {
      port: udp,
      floodgate: true,
      geyserVersion: 'geyser-v',
      floodgateVersion: 'floodgate:2.2.5:141:1.21.11',
      confirmation: f.server.name,
    });
    const status = await service.status(f.repo.server(f.server.id));
    expect(status).toMatchObject({
      geyserInstalled: true,
      floodgateInstalled: true,
      configured: true,
      port: udp,
      authType: 'floodgate',
    });
    const config = parse(
      await readFile(path.join(f.server.path, 'plugins', 'Geyser-Spigot', 'config.yml'), 'utf8'),
    );
    expect(config.java.address).toBe('127.0.0.1');
    expect(config.java.port).toBe(f.server.port);
    expect(config.bedrock['clone-remote-port']).toBe(false);
    expect(await readFile(path.join(f.server.path, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(await readFile(path.join(f.server.path, 'server.properties'), 'utf8')).toContain(
      'online-mode=true',
    );
    expect(f.repo.server(f.server.id).crossplayPort).toBe(udp);
    expect(
      f.repo.content(f.server.id).find((item) => item.projectId === 'floodgate')?.provider,
    ).toBe('geyser');
    await writeFile(path.join(f.server.path, 'plugins', 'Geyser.jar'), 'tampered');
    expect((await service.status(f.repo.server(f.server.id))).geyserInstalled).toBe(false);
  } finally {
    await logger.flush();
    await f.cleanup();
  }
});
it('rolls back the prepared server and metadata when its Geyser configuration is invalid', async () => {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    manager = new ManagedContentService(
      f.repo,
      new DownloadManager(f.bus),
      new OperationService(f.repo, f.bus, logger),
    ),
    service = new CrossplayService(f.repo, manager);
  try {
    await mkdir(path.join(f.server.path, 'plugins', 'Geyser-Spigot'), { recursive: true });
    await writeFile(
      path.join(f.server.path, 'plugins', 'Geyser-Spigot', 'config.yml'),
      'bedrock: [broken',
    );
    network(await jar('bedrock:\n  port: 19132\njava:\n  auth-type: online\n'));
    await expect(
      service.configure(f.server, {
        port: await port(),
        floodgate: false,
        geyserVersion: 'geyser-v',
        confirmation: f.server.name,
      }),
    ).rejects.toThrow('invalid YAML');
    expect(
      await readFile(path.join(f.server.path, 'plugins', 'Geyser-Spigot', 'config.yml'), 'utf8'),
    ).toBe('bedrock: [broken');
    await expect(stat(path.join(f.server.path, 'plugins', 'Geyser.jar'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(f.repo.content(f.server.id)).toHaveLength(0);
    expect(f.repo.server(f.server.id).crossplayPort).toBeUndefined();
    expect(f.repo.operations()[0]?.status).toBe('failed');
    expect(await readFile(path.join(f.server.path, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
  } finally {
    await logger.flush();
    await f.cleanup();
  }
});
it('seeds the current Java configuration format when the official JAR generates its defaults instead of carrying a template', async () => {
  const f = await fixture(),
    manager = new ManagedContentService(f.repo, new DownloadManager(f.bus)),
    service = new CrossplayService(f.repo, manager);
  try {
    network(await jar('', undefined, true));
    await service.configure(f.server, {
      port: await port(),
      floodgate: false,
      geyserVersion: 'geyser-v',
      confirmation: f.server.name,
    });
    const config = parse(
      await readFile(path.join(f.server.path, 'plugins', 'Geyser-Spigot', 'config.yml'), 'utf8'),
    );
    expect(config.java['auth-type']).toBe('online');
    expect(config.remote).toBeUndefined();
    expect((await service.status(f.repo.server(f.server.id))).configured).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('rejects an outdated Fabric target and rolls back an incompatible Fabric loader requirement', async () => {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    manager = new ManagedContentService(
      f.repo,
      new DownloadManager(f.bus),
      new OperationService(f.repo, f.bus, logger),
    ),
    service = new CrossplayService(f.repo, manager);
  f.server.engine = 'fabric';
  f.server.loaderVersion = '0.19.5';
  f.repo.saveServer(f.server);
  try {
    network(
      await jar('bedrock:\n  port: 19132\nremote:\n  auth-type: online\n', '>=0.20.0'),
      'fabric',
      ['26.2'],
    );
    expect((await service.versions(f.server)).geyser).toHaveLength(0);
    network(
      await jar('bedrock:\n  port: 19132\nremote:\n  auth-type: online\n', '>=0.20.0'),
      'fabric',
    );
    await expect(
      service.configure(f.server, {
        port: await port(),
        floodgate: false,
        geyserVersion: 'geyser-v',
        confirmation: f.server.name,
      }),
    ).rejects.toThrow('fabricloader >=0.20.0');
    expect(f.repo.content(f.server.id)).toHaveLength(0);
    await expect(stat(path.join(f.server.path, 'mods', 'Geyser.jar'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readFile(path.join(f.server.path, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
  } finally {
    await logger.flush();
    await f.cleanup();
  }
});
