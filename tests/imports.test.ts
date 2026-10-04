import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ZipFile } from 'yazl';
import { fixture } from './helpers';
import { ServerImportService } from '../packages/core/imports';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { DownloadManager } from '../packages/minecraft/downloads';
import { RuntimeManager } from '../packages/runtime-manager/runtime';
import { PhpRuntimeManager } from '../packages/runtime-manager/php';
import { parseProperties } from '../packages/domain/properties';
import { extractZip } from '../packages/backups/archive';
import type { ImportServerPreview } from '../packages/domain/imports';
import type { Operation } from '../packages/domain/operations';
afterEach(() => vi.restoreAllMocks());
async function importer() {
  const f = await fixture(),
    logger = new Logger(path.join(f.root, 'logs')),
    jobs = new OperationService(f.repo, f.bus, logger),
    downloads = new DownloadManager(f.bus),
    runtime = new RuntimeManager(f.repo, downloads, jobs),
    php = new PhpRuntimeManager(f.repo, downloads, jobs);
  vi.spyOn(runtime, 'ensure').mockResolvedValue({
    major: 21,
    path: process.execPath,
    source: 'system',
  });
  const service = new ServerImportService(
    f.repo,
    jobs,
    runtime,
    php,
    f.secrets,
    async () => new Set<number>(),
  );
  f.repo.removeServer(f.server.id);
  return {
    ...f,
    logger,
    jobs,
    service,
    cleanup: async () => {
      await logger.flush();
      await f.cleanup();
    },
  };
}
function input(preview: ImportServerPreview, copy = true) {
  return {
    token: preview.token,
    name: 'Imported',
    engine: preview.engine ?? 'paper',
    version: preview.version ?? '1.21.11',
    entrypoint: preview.entrypoint ?? 'server.jar',
    launchArgsFile: preview.launchArgsFile,
    loaderVersion: preview.loaderVersion,
    copy,
    acceptEula: false,
    port: Number(preview.properties['server-port']),
    memoryMin: 1024,
    memoryMax: 4096,
    confirmation: 'Imported',
  };
}
async function paperJar(filename: string) {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from('Main-Class: io.papermc.paperclip.Main\n'), 'META-INF/MANIFEST.MF');
  zip.addBuffer(Buffer.from('sha\t1.21.11\tserver.jar\n'), 'META-INF/versions.list');
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  await writeFile(filename, Buffer.concat(chunks));
}
it('previews metadata without RCON secrets and imports a staged copy while leaving all original files unchanged', async () => {
  const f = await importer();
  try {
    await paperJar(path.join(f.server.path, 'server.jar'));
    await mkdir(path.join(f.server.path, 'plugins'));
    await writeFile(path.join(f.server.path, 'plugins', 'manual.jar'), 'manual');
    const before = await readFile(path.join(f.server.path, 'server.properties'), 'utf8');
    const preview = await f.service.preview(f.server.path);
    expect(preview).toMatchObject({
      engine: 'paper',
      version: '1.21.11',
      eulaAccepted: true,
      plugins: 1,
      worlds: ['world'],
    });
    expect(preview.properties['rcon.password']).toBeUndefined();
    expect(JSON.stringify(preview)).not.toContain('test-secret');
    const imported = await f.service.import(input(preview));
    expect(imported.path).not.toBe(f.server.path);
    expect(imported).toMatchObject({
      imported: true,
      externalFolder: false,
      status: 'stopped',
      engine: 'paper',
    });
    expect(await readFile(path.join(f.server.path, 'server.properties'), 'utf8')).toBe(before);
    expect(await readFile(path.join(imported.path, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
    expect(await readFile(path.join(imported.path, 'plugins', 'manual.jar'), 'utf8')).toBe(
      'manual',
    );
    const properties = parseProperties(
      await readFile(path.join(imported.path, 'server.properties'), 'utf8'),
    );
    expect(properties['rcon.password']).toBe(f.secrets.decrypt(f.repo.secret(imported.id)));
    expect(f.repo.content(imported.id)).toHaveLength(0);
    await expect(f.service.import(input(preview))).rejects.toThrow('expired');
  } finally {
    await f.cleanup();
  }
});
it('archives an original folder before updating RCON and records its explicit recovery authority', async () => {
  const f = await importer();
  try {
    const before = await readFile(path.join(f.server.path, 'server.properties'), 'utf8'),
      preview = await f.service.preview(f.server.path);
    const imported = await f.service.import(input(preview, false));
    expect(imported.path).toBe(f.server.path);
    expect(imported.externalFolder).toBe(true);
    const safety = path.join(f.root, 'import-safety'),
      archives = await readdir(safety);
    expect(archives).toHaveLength(1);
    const extracted = path.join(f.root, 'safety-check');
    await extractZip(path.join(safety, archives[0]!), extracted);
    expect(await readFile(path.join(extracted, 'server.properties'), 'utf8')).toBe(before);
    expect(await readFile(path.join(extracted, 'world', 'level.dat'), 'utf8')).toBe(
      'original world',
    );
    const history = JSON.parse(
      String(
        f.repo.db.prepare('SELECT metadata FROM import_history WHERE id=?').get(preview.token)
          ?.metadata,
      ),
    );
    expect(history.approvedOriginal).toBe(true);
    expect(f.repo.operations()[0]?.status).toBe('completed');
  } finally {
    await f.cleanup();
  }
});
it('rejects changed or unapproved sources and never infers EULA consent', async () => {
  const f = await importer();
  try {
    const preview = await f.service.preview(f.server.path);
    await writeFile(path.join(f.server.path, 'server.properties'), 'changed=true');
    await expect(f.service.import(input(preview))).rejects.toThrow('changed');
    await writeFile(path.join(f.server.path, 'eula.txt'), 'eula=false');
    const current = await f.service.preview(f.server.path);
    await expect(f.service.import({ ...input(current), port: f.server.port })).rejects.toThrow(
      'EULA',
    );
    await expect(
      f.service.import({ ...input(current, false), port: f.server.port, acceptEula: true }),
    ).rejects.toThrow('original folder');
    await expect(
      f.service.import({ ...input(current), port: f.server.port, token: randomUUID() }),
    ).rejects.toThrow('expired');
    expect(await readFile(path.join(f.server.path, 'eula.txt'), 'utf8')).toBe('eula=false');
    expect(f.repo.servers()).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});
it('rolls back a cancelled import without registering a partially copied server', async () => {
  const f = await importer();
  try {
    const preview = await f.service.preview(f.server.path),
      before = await readFile(path.join(f.server.path, 'server.properties'), 'utf8');
    const off = f.bus.subscribe((event) => {
      if (event.type === 'progress' && event.progress.phase === 'extracting')
        f.jobs.cancel(event.progress.id);
    });
    await expect(f.service.import(input(preview))).rejects.toThrow();
    off();
    expect(f.repo.servers()).toHaveLength(0);
    expect(f.repo.operations()[0]?.status).toBe('cancelled');
    expect(await readFile(path.join(f.server.path, 'server.properties'), 'utf8')).toBe(before);
    expect(
      (await readdir(path.dirname(f.server.path))).filter((name) =>
        name.endsWith('.import-staging'),
      ),
    ).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});
it('detects platform-specific Forge and NeoForge arguments and Bedrock/PocketMine layouts', async () => {
  const f = await importer();
  try {
    const argsName = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
    await mkdir(path.join(f.server.path, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.219'), {
      recursive: true,
    });
    await writeFile(
      path.join(f.server.path, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.219', argsName),
      'classpath',
    );
    const neo = await f.service.preview(f.server.path);
    expect(neo).toMatchObject({ engine: 'neoforge', version: '1.21.1', loaderVersion: '21.1.219' });
    expect(neo.launchArgsFile).toContain(argsName);
    const bedrock = path.join(f.root, 'bedrock-source');
    await mkdir(path.join(bedrock, 'worlds', 'BedrockWorld'), { recursive: true });
    await writeFile(path.join(bedrock, 'worlds', 'BedrockWorld', 'level.dat'), 'fixture');
    await writeFile(
      path.join(bedrock, process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server'),
      'fixture',
    );
    expect(await f.service.preview(bedrock)).toMatchObject({
      engine: 'bedrock',
      worlds: ['BedrockWorld'],
    });
    const pocket = path.join(f.root, 'pocket');
    await mkdir(pocket);
    await writeFile(path.join(pocket, 'PocketMine-MP-5.44.3.phar'), 'fixture');
    expect(await f.service.preview(pocket)).toMatchObject({
      engine: 'pocketmine',
      version: '5.44.3',
    });
  } finally {
    await f.cleanup();
  }
});
it('requires explicit loader selection for ambiguous installs and invalidates previews when nested launch metadata changes', async () => {
  const f = await importer();
  try {
    const argsName = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
    const files = [
      `libraries/net/neoforged/neoforge/21.1.219/${argsName}`,
      `libraries/net/minecraftforge/forge/1.20.1-47.4.0/${argsName}`,
    ];
    for (const filename of files) {
      await mkdir(path.dirname(path.join(f.server.path, filename)), { recursive: true });
      await writeFile(path.join(f.server.path, filename), '--verified-fixture-args');
    }
    const preview = await f.service.preview(f.server.path);
    expect(preview).toMatchObject({
      confidence: 'uncertain',
      engine: undefined,
      launchArgsFile: undefined,
    });
    expect(preview.launchOptions).toHaveLength(2);
    await writeFile(
      path.join(f.server.path, process.platform === 'win32' ? 'run.bat' : 'run.sh'),
      `java @${files[0]}\n`,
    );
    const selected = await f.service.preview(f.server.path);
    expect(selected).toMatchObject({
      engine: 'neoforge',
      version: '1.21.1',
      launchArgsFile: files[0],
      confidence: 'detected',
    });
    await writeFile(path.join(f.server.path, files[0]!), '--changed-fixture-args');
    await expect(f.service.import(input(selected))).rejects.toThrow('changed');
  } finally {
    await f.cleanup();
  }
});
it('detects a renamed Purpur archive from its actual manifest rather than treating it as Paper', async () => {
  const f = await importer();
  try {
    const zip = new ZipFile();
    zip.addBuffer(
      Buffer.from('Main-Class: io.papermc.paperclip.Main\nImplementation-Title: Purpur\n'),
      'META-INF/MANIFEST.MF',
    );
    zip.addBuffer(Buffer.from('sha\t1.21.11\tserver.jar\n'), 'META-INF/versions.list');
    zip.end();
    const chunks: Buffer[] = [];
    for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
    await writeFile(path.join(f.server.path, 'server.jar'), Buffer.concat(chunks));
    expect(await f.service.preview(f.server.path)).toMatchObject({
      engine: 'purpur',
      version: '1.21.11',
    });
  } finally {
    await f.cleanup();
  }
});
it('recovers only an explicitly approved original server.properties swap and rejects a forged external path', async () => {
  const f = await importer();
  try {
    const source = path.join(f.root, 'external-original');
    await mkdir(source);
    const destination = path.join(source, 'server.properties');
    await writeFile(destination, 'new');
    const previous = destination + '.previous';
    await writeFile(previous, 'original');
    const ticket = randomUUID(),
      at = new Date().toISOString();
    f.repo.db
      .prepare('INSERT INTO import_history VALUES(?,NULL,?)')
      .run(ticket, JSON.stringify({ approvedOriginal: true, preview: { sourcePath: source } }));
    const operation: Operation = {
      id: randomUUID(),
      kind: 'server.import',
      label: 'Import original',
      status: 'applying',
      createdAt: at,
      updatedAt: at,
      recoverable: true,
    };
    f.repo.saveOperation(operation, {
      destination,
      previous,
      staging: destination + '.stage',
      importTicket: ticket,
      hadDestination: true,
    });
    await f.jobs.recover();
    expect(await readFile(destination, 'utf8')).toBe('original');
    expect(f.repo.operations().find((value) => value.id === operation.id)?.status).toBe('failed');
    const forbidden = path.join(source, 'unrelated.txt');
    await writeFile(forbidden, 'keep');
    f.repo.saveOperation(
      { ...operation, id: randomUUID() },
      {
        destination: forbidden,
        previous: forbidden + '.previous',
        staging: forbidden + '.stage',
        importTicket: ticket,
      },
    );
    await f.jobs.recover();
    expect(await readFile(forbidden, 'utf8')).toBe('keep');
    expect(f.repo.operations()[0]?.status).toBe('attention');
    await expect(stat(previous)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await f.cleanup();
  }
});
