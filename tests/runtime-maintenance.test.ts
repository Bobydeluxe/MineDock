import { it, expect, vi, afterEach } from 'vitest';
import { writeFile, mkdir, readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as tar from 'tar';
import { fixture } from './helpers';
import {
  executableArchitectures,
  normalizeArchitecture,
} from '../packages/runtime-manager/architecture';
import { RuntimeManager } from '../packages/runtime-manager/runtime';
import { PhpRuntimeManager } from '../packages/runtime-manager/php';
import { RuntimeMaintenance } from '../packages/runtime-manager/maintenance';
import { DownloadManager } from '../packages/minecraft/downloads';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { zipDirectory } from '../packages/backups/archive';
import { DomainError } from '../packages/domain/errors';
import * as runtimeProbe from '../packages/runtime-manager/runtime';
import type { Runtime } from '../packages/domain/types';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function managedRuntime() {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger),
    downloads = new DownloadManager(f.bus, f.repo);
  const folder = path.join(f.root, 'runtimes/java-21'),
    executable = path.join(
      folder,
      'fixture-jre/bin',
      process.platform === 'win32' ? 'java.exe' : 'java',
    );
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, 'previous working runtime');
  const registered: Runtime = {
    major: 21,
    path: executable,
    source: 'managed',
    type: 'java',
    arch: process.arch,
    version: '21.0.1',
  };
  f.repo.saveRuntime(registered);
  const probe = vi.fn(async (file: string): Promise<Runtime> => ({
    major: 21,
    path: file,
    source: 'system',
    type: 'java',
    arch: process.arch,
    version: '21.0.2',
  }));
  const java = new RuntimeManager(f.repo, downloads, jobs, undefined, probe),
    php = new PhpRuntimeManager(f.repo, downloads, jobs);
  vi.spyOn(java, 'list').mockResolvedValue([]);
  const service = new RuntimeMaintenance(
    f.repo,
    jobs,
    java,
    php,
    (id) => {
      if (f.repo.server(id).status !== 'stopped')
        throw new DomainError('RUNNING', 'Stop the server.');
    },
    (id) => f.repo.server(id).status !== 'stopped',
  );
  return {
    ...f,
    logger,
    jobs,
    downloads,
    folder,
    executable,
    registered,
    java,
    php,
    probe,
    service,
    cleanup: async () => {
      await logger.flush();
      await f.cleanup();
    },
  };
}
async function repairArchive(f: Awaited<ReturnType<typeof managedRuntime>>) {
  const source = path.join(f.root, 'archive-source'),
    archive = path.join(f.root, process.platform === 'win32' ? 'runtime.zip' : 'runtime.tar.gz');
  await mkdir(path.join(source, 'fixture-jre/bin'), { recursive: true });
  await writeFile(
    path.join(source, 'fixture-jre/bin', process.platform === 'win32' ? 'java.exe' : 'java'),
    'verified replacement fixture',
    { mode: 0o755 },
  );
  if (process.platform === 'win32') await zipDirectory(source, archive);
  else await tar.c({ file: archive, cwd: source, gzip: true }, ['fixture-jre']);
  const data = await readFile(archive),
    checksum = createHash('sha256').update(data).digest('hex'),
    link =
      'https://github.com/adoptium/temurin21-binaries/releases/download/fixture/' +
      path.basename(archive);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith('https://api.adoptium.net/')
        ? Response.json([{ binary: { package: { link, checksum } } }])
        : new Response(new Uint8Array(data), {
            headers: { 'content-length': String(data.length) },
          }),
    ),
  );
}
it('repairs a registered Java runtime with verified staging and preserves the previous executable on verification failure or cancellation', async () => {
  const f = await managedRuntime();
  try {
    await repairArchive(f);
    await f.service.repair({ id: 'java:21', confirmation: 'java:21' });
    expect(await readFile(f.executable, 'utf8')).toBe('verified replacement fixture');
    expect(f.repo.runtimes()[0]?.version).toBe('21.0.2');
    expect(f.probe.mock.calls[0]?.[0]).toContain('java-21.staging');
    expect(
      f.repo.operations().find((operation) => operation.kind === 'runtime.repair')?.status,
    ).toBe('completed');
    f.probe.mockResolvedValue({
      major: 17,
      path: f.executable,
      source: 'system',
      arch: process.arch,
    });
    await expect(f.service.repair({ id: 'java:21', confirmation: 'java:21' })).rejects.toThrow(
      'Incorrect downloaded Java',
    );
    expect(await readFile(f.executable, 'utf8')).toBe('verified replacement fixture');
    f.probe.mockResolvedValue({
      major: 21,
      path: f.executable,
      source: 'system',
      arch: process.arch,
    });
    const unsubscribe = f.bus.subscribe((event) => {
      if (
        event.type === 'progress' &&
        event.progress.label === 'Temurin Java 21' &&
        event.progress.phase === 'extracting'
      )
        f.jobs.cancel(event.progress.id);
    });
    try {
      await expect(f.service.repair({ id: 'java:21', confirmation: 'java:21' })).rejects.toThrow();
    } finally {
      unsubscribe();
    }
    expect(await readFile(f.executable, 'utf8')).toBe('verified replacement fixture');
    expect(
      (await readdir(path.dirname(f.folder))).filter(
        (name) => name.includes('.staging') || name.includes('.previous'),
      ),
    ).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('reports missing and incompatible runtimes and deletes only a confirmed unused managed installation', async () => {
  const f = await managedRuntime();
  try {
    vi.spyOn(runtimeProbe, 'inspectJava').mockResolvedValue({
      major: 21,
      path: f.executable,
      source: 'system',
      arch: process.arch,
      version: '21.0.1',
    });
    expect((await f.service.health('java:21')).status).toBe('healthy');
    vi.mocked(runtimeProbe.inspectJava).mockResolvedValue({
      major: 17,
      path: f.executable,
      source: 'system',
      arch: process.arch,
    });
    expect((await f.service.health('java:21')).status).toBe('wrongVersion');
    vi.mocked(runtimeProbe.inspectJava).mockResolvedValue({
      major: 21,
      path: f.executable,
      source: 'system',
      arch: process.arch === 'arm64' ? 'x64' : 'arm64',
    });
    expect((await f.service.health('java:21')).status).toBe('wrongArchitecture');
    await expect(f.service.delete({ id: 'java:21', confirmation: 'wrong' })).rejects.toThrow(
      'identifier',
    );
    await f.service.delete({ id: 'java:21', confirmation: 'java:21' });
    expect(f.repo.runtimes()).toEqual([]);
    await expect(stat(f.folder)).rejects.toMatchObject({ code: 'ENOENT' });
    f.repo.saveRuntime(f.registered);
    expect((await f.service.health('java:21')).status).toBe('missing');
    await repairArchive(f);
    await f.service.repair({ id: 'java:21', confirmation: 'java:21' });
    expect(await readFile(f.executable, 'utf8')).toBe('verified replacement fixture');
    expect(f.repo.runtimes()).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
it('blocks changes while a runtime is in use and requires an explicit verified replacement for stopped server references', async () => {
  const f = await managedRuntime();
  try {
    f.repo.saveServer({
      ...f.server,
      javaPath: f.executable,
      runtimePath: f.executable,
      status: 'running',
    });
    await expect(f.service.delete({ id: 'java:21', confirmation: 'java:21' })).rejects.toThrow(
      'Stop',
    );
    await expect(f.service.repair({ id: 'java:21', confirmation: 'java:21' })).rejects.toThrow(
      'Stop',
    );
    await repairArchive(f);
    await expect(f.java.repair(21)).rejects.toThrow('Stop every server');
    f.repo.saveServer({
      ...f.server,
      javaPath: f.executable,
      runtimePath: f.executable,
      status: 'stopped',
    });
    await expect(f.service.delete({ id: 'java:21', confirmation: 'java:21' })).rejects.toThrow(
      'explicit',
    );
    const replacement = path.join(f.root, 'system-java'),
      detected: Runtime = {
        major: 21,
        path: replacement,
        source: 'system',
        type: 'java',
        arch: process.arch,
        version: '21.0.3',
      };
    await writeFile(replacement, 'system runtime fixture');
    vi.mocked(f.java.list).mockResolvedValue([detected]);
    vi.spyOn(runtimeProbe, 'inspectJava').mockResolvedValue(detected);
    const replacementId = (await f.service.list()).find(
      (runtime) => runtime.source === 'system',
    )!.id;
    await expect(
      f.service.delete({ id: replacementId, confirmation: replacementId }),
    ).rejects.toThrow('System runtimes');
    await f.service.delete({ id: 'java:21', confirmation: 'java:21', replacementId });
    expect(f.repo.server(f.server.id)).toMatchObject({
      javaPath: replacement,
      runtimePath: replacement,
    });
    expect(await readFile(replacement, 'utf8')).toBe('system runtime fixture');
    expect(f.repo.runtimes()).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('reads actual PE, ELF, Mach-O and universal headers without using the host architecture as a fallback', async () => {
  const f = await fixture();
  try {
    const pe = Buffer.alloc(256);
    pe.write('MZ');
    pe.writeUInt32LE(128, 0x3c);
    pe.writeUInt32LE(0x00004550, 128);
    pe.writeUInt16LE(0xaa64, 132);
    const elf = Buffer.alloc(64);
    elf.writeUInt32BE(0x7f454c46, 0);
    elf[4] = 2;
    elf[5] = 1;
    elf.writeUInt16LE(62, 18);
    const mach = Buffer.alloc(32);
    mach.writeUInt32LE(0xfeedfacf, 0);
    mach.writeUInt32LE(0x0100000c, 4);
    const fat = Buffer.alloc(64);
    fat.writeUInt32BE(0xcafebabe, 0);
    fat.writeUInt32BE(2, 4);
    fat.writeUInt32BE(0x01000007, 8);
    fat.writeUInt32BE(0x0100000c, 28);
    for (const [name, data, expected] of [
      ['pe', pe, ['arm64']],
      ['elf', elf, ['x64']],
      ['mach', mach, ['arm64']],
      ['fat', fat, ['x64', 'arm64']],
    ] as const) {
      const file = path.join(f.root, name);
      await writeFile(file, data);
      expect(await executableArchitectures(file)).toEqual(expected);
    }
    const file = path.join(f.root, 'unknown');
    await writeFile(file, Buffer.alloc(64));
    expect(await executableArchitectures(file)).toEqual([]);
    expect(normalizeArchitecture('AMD64')).toBe('x64');
    expect(normalizeArchitecture('aarch64')).toBe('arm64');
    expect(normalizeArchitecture('unknown')).toBeUndefined();
    expect(normalizeArchitecture('')).toBeUndefined();
    fat.writeUInt32BE(1000, 4);
    await writeFile(file, fat);
    expect(await executableArchitectures(file)).toEqual([]);
    pe.writeUInt32LE(0xffffffff, 0x3c);
    await writeFile(file, pe);
    expect(await executableArchitectures(file)).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
