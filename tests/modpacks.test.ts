import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFile, readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ZipFile } from 'yazl';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import * as installation from '../packages/minecraft/process';
import type { ModpackIndex, ModpackPreview } from '../packages/domain/modpacks';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const bytes = new Map([
  ['required.jar', Buffer.from('verified required mod fixture')],
  ['optional.jar', Buffer.from('verified optional mod fixture')],
  ['client.jar', Buffer.from('client-only fixture')],
]);
const hash = (algorithm: string, value: Buffer) =>
  createHash(algorithm).update(value).digest('hex');
function index(): ModpackIndex {
  return {
    formatVersion: 1,
    game: 'minecraft',
    name: 'Fixture pack',
    versionId: 'v1',
    dependencies: { minecraft: '1.21.11', 'fabric-loader': '0.19.5' },
    files: [...bytes].map(([name, value]) => ({
      path: name === 'client.jar' ? 'shaderpacks/client.jar' : 'mods/' + name,
      hashes: { sha1: hash('sha1', value), sha512: hash('sha512', value) },
      downloads: ['https://cdn.modrinth.com/' + name],
      fileSize: value.length,
      env: {
        client: 'required',
        server:
          name === 'client.jar' ? 'unsupported' : name === 'optional.jar' ? 'optional' : 'required',
      },
    })),
  };
}
async function archive(file: string, manifest = index(), extra: Record<string, string> = {}) {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'modrinth.index.json');
  for (const [name, contents] of Object.entries({
    'overrides/config/test.json': '{"layer":"shared"}',
    'server-overrides/config/test.json': '{"layer":"server"}',
    'server-overrides/eula.txt': 'eula=false',
    'client-overrides/config/client.json': '{}',
    ...extra,
  }))
    zip.addBuffer(Buffer.from(contents), name);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  await writeFile(file, Buffer.concat(chunks));
}
async function setup() {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets),
    file = path.join(f.root, 'fixture.mrpack');
  await archive(file);
  const downloads: string[] = [];
  vi.spyOn(core.versions, 'artifact').mockResolvedValue({
    url: 'https://cdn.modrinth.com/installer.jar',
    filename: 'installer.jar',
    java: 21,
    build: '0.19.5@1.1.2',
    loaderVersion: '0.19.5',
    installerVersion: '1.1.2',
    kind: 'installer',
    hash: { algorithm: 'sha256', value: hash('sha256', Buffer.from('engine fixture')) },
  });
  vi.spyOn(core.runtime, 'ensure').mockResolvedValue({
    major: 21,
    path: process.execPath,
    source: 'system',
  });
  vi.spyOn(installation, 'installerProcess').mockImplementation(async (_exe, _args, cwd) => {
    await writeFile(path.join(cwd, 'fabric-server-launch.jar'), 'fixture launcher');
    await writeFile(path.join(cwd, 'server.jar'), 'fixture game — never executed');
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: string) => {
      const url = new URL(raw);
      if (url.hostname === 'cdn.modrinth.com') {
        const name = path.basename(url.pathname);
        downloads.push(name);
        const data = name === 'installer.jar' ? Buffer.from('engine fixture') : bytes.get(name)!;
        return new Response(data, { headers: { 'content-length': String(data.length) } });
      }
      if (url.pathname.includes('/version_file/')) {
        const digest = url.pathname.split('/').at(-1)!;
        const name = [...bytes].find(([, data]) => hash('sha512', data) === digest)?.[0];
        if (!name) return new Response(null, { status: 404 });
        return Response.json({
          id: name,
          project_id: name,
          version_number: '1.0.0',
          version_type: 'release',
          game_versions: ['1.21.11'],
          loaders: ['fabric'],
          date_published: '2026-01-01T00:00:00Z',
          dependencies: [],
          files: [
            {
              filename: name,
              url: 'https://cdn.modrinth.com/' + name,
              hashes: { sha512: digest },
              primary: true,
            },
          ],
        });
      }
      if (url.pathname.includes('/project/'))
        return Response.json({
          id: path.basename(url.pathname),
          title: path.basename(url.pathname),
          server_side: 'required',
          project_type: 'mod',
        });
      throw new Error('Unexpected official fixture endpoint');
    }),
  );
  const input = (preview: ModpackPreview) => ({
    ...f.server,
    name: 'Pack server',
    engine: preview.engine,
    version: preview.minecraft,
    port: f.server.port + 3,
    eula: true as const,
  });
  const selection = (preview: ModpackPreview, optionalFiles: string[] = []) => ({
    token: preview.token,
    confirmation: preview.name,
    optionalFiles,
  });
  return {
    ...f,
    core,
    file,
    downloads,
    input,
    selection,
    cleanup: async () => {
      await core.close();
      await f.cleanup();
    },
  };
}
it('previews server sides and pinned dependencies, then creates the real prepared filesystem with verified managed mods and layered overrides', async () => {
  const f = await setup();
  try {
    const original = await readFile(f.file),
      preview = await f.core.modpacks.preview(f.file);
    expect(preview).toMatchObject({
      engine: 'fabric',
      loader: '0.19.5',
      minecraft: '1.21.11',
      java: 21,
      ignoredOverrides: ['server-overrides/eula.txt'],
    });
    expect(preview.files.find((file) => file.path === 'shaderpacks/client.jar')?.side).toBe(
      'unsupported',
    );
    expect(f.downloads).toEqual([]);
    const server = await f.core.modpacks.create(f.selection(preview), f.input(preview));
    expect(server).toMatchObject({
      installationComplete: true,
      modpack: { name: 'Fixture pack', versionId: 'v1', format: 'mrpack', optionalFiles: [] },
    });
    expect(await readFile(f.file)).toEqual(original);
    expect(await readFile(path.join(server.path, 'config', 'test.json'), 'utf8')).toBe(
      '{"layer":"server"}',
    );
    expect(await readFile(path.join(server.path, 'mods', 'required.jar'))).toEqual(
      bytes.get('required.jar'),
    );
    expect(await readFile(path.join(server.path, 'eula.txt'), 'utf8')).toContain('eula=true');
    expect(f.downloads).toEqual(['installer.jar', 'required.jar']);
    await expect(stat(path.join(server.path, 'config', 'client.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(f.core.repo.content(server.id)).toMatchObject([
      {
        provider: 'modrinth',
        filename: 'required.jar',
        versionId: 'required.jar',
        sha256: hash('sha256', bytes.get('required.jar')!),
      },
    ]);
    expect(
      f.core.repo.operations().find((operation) => operation.kind === 'modpack.install')?.status,
    ).toBe('completed');
    const backup = await f.core.backups.create(server.id);
    await f.core.backups.restore(backup.id, server.name);
    expect(f.core.repo.server(server.id).modpack).toEqual(server.modpack);
  } finally {
    await f.cleanup();
  }
});
it('requires explicit confirmation and EULA and installs optional files only when selected', async () => {
  const f = await setup();
  try {
    const preview = await f.core.modpacks.preview(f.file);
    await expect(
      f.core.modpacks.create({ ...f.selection(preview), confirmation: 'wrong' }, f.input(preview)),
    ).rejects.toThrow('name');
    await expect(
      f.core.modpacks.create(f.selection(preview), { ...f.input(preview), eula: false } as never),
    ).rejects.toThrow();
    await expect(
      f.core.modpacks.create(f.selection(preview, ['shaderpacks/client.jar']), f.input(preview)),
    ).rejects.toThrow('optional');
    const server = await f.core.modpacks.create(
      f.selection(preview, ['mods/optional.jar']),
      f.input(preview),
    );
    expect(f.core.repo.content(server.id)).toHaveLength(2);
    expect(f.downloads).not.toContain('client.jar');
  } finally {
    await f.cleanup();
  }
});
it('rejects a hash mismatch, rolls back the new server folder and retries the approved manifest without silently replacing it with a plain engine', async () => {
  const f = await setup();
  try {
    const manifest = index();
    manifest.files[0]!.hashes.sha1 = '0'.repeat(40);
    await archive(f.file, manifest);
    const preview = await f.core.modpacks.preview(f.file);
    await expect(f.core.modpacks.create(f.selection(preview), f.input(preview))).rejects.toThrow(
      'SHA-1',
    );
    const pending = f.core.repo
      .servers()
      .find((server) => server.modpack?.token === preview.token)!;
    expect(pending.installationComplete).toBe(false);
    expect(pending.status).toBe('stopped');
    await expect(stat(path.join(pending.path, 'mods', 'required.jar'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(f.core.repo.content(pending.id)).toEqual([]);
    await expect(f.core.retryInstallation(pending.id)).rejects.toThrow('SHA-1');
    expect(f.core.repo.server(pending.id).installationComplete).toBe(false);
    expect(
      (await readdir(path.dirname(pending.path))).filter((name) =>
        name.endsWith('install-staging'),
      ),
    ).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('cancels a pack download and subsequently retries the persisted complete pack plan successfully', async () => {
  const f = await setup();
  try {
    const preview = await f.core.modpacks.preview(f.file);
    const off = f.core.bus.subscribe((event) => {
      if (
        event.type === 'progress' &&
        event.progress.label === 'required.jar' &&
        !event.progress.done
      ) {
        const operation = f.core.repo
          .operations()
          .find((operation) => operation.kind === 'modpack.install');
        if (operation) f.core.jobs.cancel(operation.id);
      }
    });
    await expect(f.core.modpacks.create(f.selection(preview), f.input(preview))).rejects.toThrow();
    off();
    const pending = f.core.repo
      .servers()
      .find((server) => server.modpack?.token === preview.token)!;
    expect(pending.installationComplete).toBe(false);
    expect(
      f.core.repo.operations().find((operation) => operation.kind === 'modpack.install')?.status,
    ).toBe('cancelled');
    const server = await f.core.retryInstallation(pending.id);
    expect(server.installationComplete).toBe(true);
    expect(await readFile(path.join(server.path, 'mods', 'required.jar'))).toEqual(
      bytes.get('required.jar'),
    );
    expect(f.core.repo.content(server.id)).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
it('rejects traversal, duplicate paths, unsupported loaders and unauthorized download hosts during preview and removes failed temporary extracts', async () => {
  const f = await setup();
  try {
    const attacks: ModpackIndex[] = [];
    for (const name of ['../outside.jar', 'C:/escape.jar', 'mods/NUL.jar']) {
      const manifest = index();
      manifest.files[0]!.path = name;
      attacks.push(manifest);
    }
    const duplicate = index();
    duplicate.files.push({ ...duplicate.files[0]! });
    attacks.push(duplicate);
    const unknown = index();
    unknown.dependencies = { minecraft: '1.21.11', 'quilt-loader': '0.30.0' };
    attacks.push(unknown);
    const host = index();
    host.files[0]!.downloads = ['https://example.com/untrusted.jar'];
    attacks.push(host);
    for (const manifest of attacks) {
      await archive(f.file, manifest);
      await expect(f.core.modpacks.preview(f.file)).rejects.toThrow();
    }
    expect(await readdir(path.join(f.root, 'modpack-imports'))).toEqual([]);
    expect(f.core.repo.servers()).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
