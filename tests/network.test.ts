import { it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { DownloadManager } from '../packages/minecraft/downloads';
import { MinecraftVersionService } from '../packages/minecraft/versions';
import { ModrinthProvider } from '../packages/marketplace/modrinth';
import { extractZip } from '../packages/backups/archive';
import { ZipFile } from 'yazl';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
afterEach(() => vi.unstubAllGlobals());
it('streams downloads, verifies integrity, preserves originals on mismatch and validates redirect hosts', async () => {
  const f = await fixture();
  const manager = new DownloadManager(f.bus);
  const filename = path.join(f.root, 'download.jar');
  try {
    const data = Buffer.from('verified artifact');
    const hash = {
      algorithm: 'sha256' as const,
      value: createHash('sha256').update(data).digest('hex'),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(data, { headers: { 'content-length': String(data.length) } })),
    );
    await manager.download('https://cdn.modrinth.com/test.jar', filename, 'test', hash);
    expect(await readFile(filename, 'utf8')).toBe('verified artifact');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('corrupted')),
    );
    await expect(
      manager.download('https://cdn.modrinth.com/test.jar', filename, 'test', hash),
    ).rejects.toThrow('corrupted');
    expect(await readFile(filename, 'utf8')).toBe('verified artifact');
    expect((await readdir(f.root)).some((n) => n.endsWith('.part'))).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: 'https://evil.test/artifact' } }),
      ),
    );
    await expect(
      manager.download('https://cdn.modrinth.com/test.jar', filename, 'test', hash),
    ).rejects.toThrow('allowed');
  } finally {
    await f.cleanup();
  }
});
it('resolves Paper stable builds with its Java requirement and rejects malformed catalog responses', async () => {
  const versions = new MinecraftVersionService();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (value: string) =>
        new Response(
          JSON.stringify(
            value.includes('version_manifest')
              ? {
                  versions: [
                    {
                      id: '1.20.4',
                      type: 'release',
                      url: 'https://piston-meta.mojang.com/version.json',
                    },
                  ],
                }
              : value.includes('version.json')
                ? { downloads: {}, javaVersion: { majorVersion: 17 } }
                : [
                    { id: 3, channel: 'EXPERIMENTAL', downloads: {} },
                    {
                      id: 2,
                      channel: 'STABLE',
                      downloads: {
                        'server:default': {
                          name: 'paper.jar',
                          url: 'https://fill-data.papermc.io/test.jar',
                          checksums: { sha256: 'abcd' },
                        },
                      },
                    },
                  ],
          ),
        ),
    ),
  );
  expect(await versions.artifact('paper', '1.20.4')).toMatchObject({ build: '2', java: 21 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
  await expect(versions.versions('vanilla')).rejects.toThrow();
});
it('Modrinth installs required server dependencies transactionally and toggles a plugin', async () => {
  const f = await fixture();
  const downloads = new DownloadManager(f.bus);
  const provider = new ModrinthProvider(f.repo, downloads);
  const data = Buffer.from('test plugin bytes');
  const hash = createHash('sha512').update(data).digest('hex');
  const version = (id: string) => ({
    id: id + '-v',
    project_id: id,
    game_versions: ['1.21.11'],
    loaders: ['paper'],
    files: [
      {
        primary: true,
        filename: id + '.jar',
        url: `https://cdn.modrinth.com/${id}.jar`,
        hashes: { sha512: hash },
      },
    ],
    dependencies:
      id === 'main'
        ? [{ dependency_type: 'required', project_id: 'dep', version_id: 'dep-v' }]
        : [],
  });
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('.jar')) return new Response(data);
        if (url.includes('/version/dep-v')) return new Response(JSON.stringify(version('dep')));
        const id = url.includes('/project/main') ? 'main' : 'dep';
        if (url.includes('/version?')) return new Response(JSON.stringify([version(id)]));
        return new Response(JSON.stringify({ id, title: id, server_side: 'required' }));
      }),
    );
    const installed = await provider.install(f.server, 'main');
    expect(installed.map((i) => i.projectId)).toEqual(['dep', 'main']);
    expect(await readFile(path.join(f.server.path, 'plugins', 'dep.jar'), 'utf8')).toBe(
      data.toString(),
    );
    await provider.toggle(f.server, installed[1]!.id);
    expect((await stat(path.join(f.server.path, 'plugins', 'main.jar.disabled'))).isFile()).toBe(
      true,
    );
    expect(f.repo.content(f.server.id).find((c) => c.projectId === 'main')?.enabled).toBe(false);
  } finally {
    await f.cleanup();
  }
});
it('rejects ZIP traversal before writing outside the extraction directory', async () => {
  const f = await fixture();
  try {
    const archive = path.join(f.root, 'bad.zip');
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from('evil'), 'safe.txt');
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(archive));
    // Equal byte lengths keep the ZIP headers intact while simulating an attacker-controlled name.
    const source = await readFile(archive);
    const modified = Buffer.from(
      source.toString('latin1').replaceAll('safe.txt', '../x.txt'),
      'latin1',
    );
    await writeFile(archive, modified);
    const output = path.join(f.root, 'extract');
    await mkdir(output);
    await expect(extractZip(archive, output)).rejects.toThrow();
    await expect(stat(path.join(f.root, 'x.txt'))).rejects.toThrow();
    expect(await readdir(output)).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});
