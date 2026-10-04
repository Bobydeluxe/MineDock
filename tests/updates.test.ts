import { it, expect, vi, afterEach } from 'vitest';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import { UpdateService } from '../packages/updates/service';
import {
  verifyUpdateMetadata,
  updateKeyId,
  type UpdatePayload,
} from '../packages/updates/metadata';
import { prepareUpdateLaunch, launchUpdate } from '../packages/updates/install';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function signed() {
  const keys = generateKeyPairSync('ed25519'),
    publicKey = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    bytes = Buffer.from('inert verified installer fixture');
  const payload: UpdatePayload = {
    format: 1,
    product: 'app.minedock.desktop',
    channel: 'stable',
    version: '0.3.0',
    notes: 'Test release notes',
    publishedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    artifacts: [
      {
        platform: 'win32',
        arch: 'x64',
        target: 'portable',
        filename: 'MineDock-0.3.0-Portable-x64.exe',
        url: 'https://github.com/Bobydeluxe/MineDock/releases/download/v0.3.0/MineDock-0.3.0-Portable-x64.exe',
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  };
  const wrap = (value = payload) => {
    const raw = Buffer.from(JSON.stringify(value));
    return {
      keyId: updateKeyId(publicKey),
      payload: raw.toString('base64'),
      signature: sign(null, raw, keys.privateKey).toString('base64'),
    };
  };
  return { publicKey, bytes, payload, wrap };
}
it('requires a pinned publisher signature, stable version, valid dates, exact release URLs and matching architecture', () => {
  const f = signed(),
    wrapper = f.wrap();
  expect(
    verifyUpdateMetadata(wrapper, f.publicKey, '0.2.0', 'win32', 'x64', 'portable'),
  ).toMatchObject({ version: '0.3.0', artifact: { target: 'portable', arch: 'x64' } });
  expect(
    verifyUpdateMetadata(wrapper, f.publicKey, '0.3.0', 'win32', 'x64', 'portable'),
  ).toBeNull();
  const changed = {
    ...wrapper,
    payload: Buffer.from(JSON.stringify({ ...f.payload, notes: 'tampered' })).toString('base64'),
  };
  expect(() =>
    verifyUpdateMetadata(changed, f.publicKey, '0.2.0', 'win32', 'x64', 'portable'),
  ).toThrow('signature');
  expect(() =>
    verifyUpdateMetadata(wrapper, signed().publicKey, '0.2.0', 'win32', 'x64', 'portable'),
  ).toThrow('signature');
  expect(() =>
    verifyUpdateMetadata(wrapper, f.publicKey, '0.2.0', 'win32', 'arm64', 'portable'),
  ).toThrow('architecture');
  expect(() =>
    verifyUpdateMetadata(
      f.wrap({ ...f.payload, expiresAt: new Date(Date.now() - 5000).toISOString() }),
      f.publicKey,
      '0.2.0',
      'win32',
      'x64',
      'portable',
    ),
  ).toThrow('expired');
  expect(() =>
    verifyUpdateMetadata(
      f.wrap({
        ...f.payload,
        artifacts: [
          {
            ...f.payload.artifacts[0]!,
            url: 'https://github.com/other/owner/releases/download/v0.3.0/file.exe',
          },
        ],
      }),
      f.publicKey,
      '0.2.0',
      'win32',
      'x64',
      'portable',
    ),
  ).toThrow('outside');
  expect(() =>
    verifyUpdateMetadata(
      f.wrap({ ...f.payload, artifacts: [...f.payload.artifacts, ...f.payload.artifacts] }),
      f.publicKey,
      '0.2.0',
      'win32',
      'x64',
      'portable',
    ),
  ).toThrow('invalid');
});
it('persists optional checking and verifies actual downloaded bytes again before installation without modifying Minecraft profiles', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets),
    release = signed(),
    updater = new UpdateService(
      core.repo,
      core.jobs,
      core.downloads,
      { version: '0.2.0', packaged: true, platform: 'win32', arch: 'x64', target: 'portable' },
      release.publicKey,
    );
  const serverBefore = core.repo.server(f.server.id);
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            url.endsWith('.exe')
              ? release.bytes
              : JSON.stringify(
                  url.endsWith('/latest')
                    ? {
                        tag_name: 'v0.3.0',
                        draft: false,
                        prerelease: false,
                        assets: [
                          {
                            name: 'update-win32-x64.json',
                            browser_download_url:
                              'https://github.com/Bobydeluxe/MineDock/releases/download/v0.3.0/update-win32-x64.json',
                          },
                        ],
                      }
                    : release.wrap(),
                ),
          ),
      ),
    );
    expect(updater.status().automaticChecks).toBe(false);
    updater.startAutomaticChecks();
    expect(fetch).not.toHaveBeenCalled();
    expect((await updater.check()).available?.version).toBe('0.3.0');
    expect((await updater.download()).downloaded).toBe(true);
    const installation = await updater.installationFile();
    expect(await readFile(installation.file)).toEqual(release.bytes);
    expect(updater.configure(true).automaticChecks).toBe(true);
    expect(core.repo.server(f.server.id)).toEqual(serverBefore);
    await writeFile(installation.file, 'tampered installer');
    await expect(updater.installationFile()).rejects.toThrow('changed');
    const reopened = new UpdateService(
      core.repo,
      core.jobs,
      core.downloads,
      { version: '0.2.0', packaged: true, platform: 'win32', arch: 'x64', target: 'portable' },
      release.publicKey,
    );
    expect(reopened.status().automaticChecks).toBe(true);
    await reopened.close();
  } finally {
    await updater.close();
    await core.close();
    await f.cleanup();
  }
});
it('never trusts an unsigned legacy release and cancels an in-flight check before database shutdown', async () => {
  const f = await fixture(),
    core = await AppCore.open(f.root, f.secrets),
    release = signed(),
    updater = new UpdateService(
      core.repo,
      core.jobs,
      core.downloads,
      { version: '0.2.0', packaged: true, platform: 'win32', arch: 'x64', target: 'portable' },
      release.publicKey,
    );
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ tag_name: 'v0.3.0', draft: false, prerelease: false, assets: [] }),
          ),
      ),
    );
    await expect(updater.check()).rejects.toThrow('verified update metadata');
    expect(updater.status().available).toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
              once: true,
            });
          }),
      ),
    );
    const pending = updater.check();
    const rejected = expect(pending).rejects.toThrow();
    const closing = updater.close();
    core.jobs.cancelAll();
    await closing;
    await rejected;
    expect(updater.status().error).toContain('cancelled');
  } finally {
    await updater.close();
    await core.close();
    await f.cleanup();
  }
});
it.skipIf(process.platform !== 'win32')(
  'uses native literal-path PowerShell operations to replace a portable fixture and preserves its previous copy',
  async () => {
    const f = await fixture(),
      release = signed();
    try {
      const root = path.join(f.root, 'updates'),
        destination = path.join(f.root, 'portable space $literal.exe'),
        source = path.join(f.root, 'download.exe');
      await mkdir(root);
      await writeFile(destination, 'previous portable');
      await writeFile(source, release.bytes);
      const update = verifyUpdateMetadata(
        release.wrap(),
        release.publicKey,
        '0.2.0',
        'win32',
        'x64',
        'portable',
      )!;
      const plan = await prepareUpdateLaunch(root, source, update, destination, 2147483647);
      const helper = plan.args[plan.args.indexOf('-File') + 1]!,
        script = await readFile(helper, 'utf8');
      // The file transaction runs natively. Only starting the inert new executable is stubbed.
      await writeFile(
        helper,
        script.replace(
          "$ErrorActionPreference = 'Stop'",
          "$ErrorActionPreference = 'Stop'\nfunction Start-Process { param($FilePath,$WindowStyle) }",
        ),
      );
      await promisify(execFile)(plan.command, plan.args, { windowsHide: true, timeout: 15000 });
      const result = JSON.parse((await readFile(plan.resultFile!, 'utf8')).replace(/^\uFEFF/, ''));
      expect(result, JSON.stringify(result)).toMatchObject({ status: 'completed' });
      expect(await readFile(destination)).toEqual(release.bytes);
      expect(await readFile(plan.previous!, 'utf8')).toBe('previous portable');
      expect(
        JSON.parse((await readFile(plan.resultFile!, 'utf8')).replace(/^\uFEFF/, '')),
      ).toMatchObject({ status: 'completed' });
      expect(await stat(plan.requestFile!)).toBeDefined();
      const failedDestination = path.join(f.root, 'failed restart.exe');
      await writeFile(failedDestination, 'original after failed restart');
      const failedPlan = await prepareUpdateLaunch(
          root,
          source,
          update,
          failedDestination,
          2147483647,
        ),
        failedHelper = failedPlan.args[failedPlan.args.indexOf('-File') + 1]!;
      await writeFile(
        failedHelper,
        (await readFile(failedHelper, 'utf8')).replace(
          "$ErrorActionPreference = 'Stop'",
          "$ErrorActionPreference = 'Stop'\nfunction Start-Process { param($FilePath,$WindowStyle) throw 'Fixture restart rejected.' }",
        ),
      );
      await promisify(execFile)(failedPlan.command, failedPlan.args, {
        windowsHide: true,
        timeout: 15000,
      });
      expect(
        JSON.parse((await readFile(failedPlan.resultFile!, 'utf8')).replace(/^\uFEFF/, '')),
      ).toMatchObject({ status: 'failed' });
      expect(await readFile(failedDestination, 'utf8')).toBe('original after failed restart');
    } finally {
      await f.cleanup();
    }
  },
);
it.skipIf(process.platform !== 'darwin')(
  'uses native ditto to stage and replace a macOS bundle, retaining its previous contents',
  async () => {
    const f = await fixture(),
      release = signed();
    try {
      const root = path.join(f.root, 'updates'),
        destination = path.join(f.root, 'bundle space $literal', 'MineDock.app'),
        prepared = path.join(f.root, 'archive', 'MineDock.app'),
        source = path.join(f.root, 'fixture.zip');
      await mkdir(root);
      await mkdir(destination, { recursive: true });
      await mkdir(prepared, { recursive: true });
      await writeFile(path.join(destination, 'marker.txt'), 'previous bundle');
      await writeFile(path.join(prepared, 'marker.txt'), 'new bundle');
      await promisify(execFile)('/usr/bin/ditto', [
        '-c',
        '-k',
        '--sequesterRsrc',
        '--keepParent',
        prepared,
        source,
      ]);
      const bytes = await readFile(source),
        filename = `MineDock-0.3.0-${process.arch}.zip`;
      const payload = {
        ...release.payload,
        artifacts: [
          {
            platform: 'darwin' as const,
            arch: process.arch as 'x64' | 'arm64',
            target: 'maczip' as const,
            filename,
            url: `https://github.com/Bobydeluxe/MineDock/releases/download/v0.3.0/${filename}`,
            size: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      };
      const update = verifyUpdateMetadata(
        release.wrap(payload),
        release.publicKey,
        '0.2.0',
        'darwin',
        process.arch,
        'maczip',
      )!;
      const plan = await prepareUpdateLaunch(root, source, update, destination, 2147483647),
        helper = plan.args[0]!;
      // Native archive extraction and directory replacement are real; the inert bundle cannot be launched.
      await writeFile(
        helper,
        (await readFile(helper, 'utf8')).replace('/usr/bin/open -n "$destination"', 'true'),
      );
      await promisify(execFile)(plan.command, plan.args, { timeout: 15000 });
      expect(await readFile(path.join(destination, 'marker.txt'), 'utf8')).toBe('new bundle');
      expect(await readFile(path.join(plan.previous!, 'marker.txt'), 'utf8')).toBe(
        'previous bundle',
      );
      expect(JSON.parse(await readFile(plan.resultFile!, 'utf8'))).toMatchObject({
        status: 'completed',
      });
    } finally {
      await f.cleanup();
    }
  },
);
it.skipIf(process.platform !== 'linux')(
  'runs the native Unix replacement with an inert executable and preserves the original',
  async () => {
    const f = await fixture(),
      release = signed();
    try {
      const root = path.join(f.root, 'updates'),
        destination = path.join(f.root, 'portable space $literal.AppImage'),
        source = path.join(f.root, 'fixture.AppImage'),
        marker = path.join(f.root, 'restarted.txt');
      await mkdir(root);
      await writeFile(destination, 'previous executable', { mode: 0o700 });
      const quotedMarker = "'" + marker.replaceAll("'", "'\\''") + "'",
        bytes = Buffer.from('#!/bin/sh\nprintf fixture > ' + quotedMarker + '\n');
      await writeFile(source, bytes, { mode: 0o600 });
      const payload = {
        ...release.payload,
        artifacts: [
          {
            platform: 'linux' as const,
            arch: process.arch as 'x64' | 'arm64',
            target: 'appimage' as const,
            filename: `MineDock-0.3.0-${process.arch}.AppImage`,
            url: `https://github.com/Bobydeluxe/MineDock/releases/download/v0.3.0/MineDock-0.3.0-${process.arch}.AppImage`,
            size: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      };
      const update = verifyUpdateMetadata(
        release.wrap(payload),
        release.publicKey,
        '0.2.0',
        'linux',
        process.arch,
        'appimage',
      )!;
      const plan = await prepareUpdateLaunch(root, source, update, destination, 2147483647);
      await launchUpdate(plan);
      await expect.poll(async () => readFile(marker, 'utf8')).toBe('fixture');
      expect(await readFile(destination)).toEqual(bytes);
      expect(await readFile(plan.previous!, 'utf8')).toBe('previous executable');
      expect(JSON.parse(await readFile(plan.resultFile!, 'utf8'))).toMatchObject({
        status: 'completed',
      });
    } finally {
      await f.cleanup();
    }
  },
);
