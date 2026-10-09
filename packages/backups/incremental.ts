import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  stat,
  lstat,
  statfs,
  readFile,
  writeFile,
  copyFile,
  rename,
  rm,
  chmod,
} from 'node:fs/promises';
import { z } from 'zod';
import type { Repository } from '../database/database';
import type { Server, InstalledContent } from '../domain/types';
import { installedContentSchema, engineSchema } from '../domain/types';
import {
  restoreScopeSchema,
  backupSafetySchema,
  type RestoreScope,
  type IncrementalSnapshot,
  type PartialPreview,
  type BackupSafety,
} from '../domain/snapshots';
import { containedPath, validateRelative, atomicWrite, resolveSystemPath } from '../security/paths';
import { sha256 } from './archive';
import { parseProperties, serializeProperties } from '../domain/properties';
import { DomainError } from '../domain/errors';
import type { ManagedContentService } from '../marketplace/content';
import type { OperationService } from '../core/operations';
import { engineDefinition } from '../domain/engines';
const manifestSchema = z
  .object({
    format: z.literal(1),
    server: z
      .object({
        id: z.string().uuid(),
        engine: engineSchema,
        path: z.string(),
        version: z.string().max(40),
      })
      .passthrough(),
    content: z.array(installedContentSchema).max(1000),
    world: z.string().max(120),
    entries: z
      .array(
        z
          .object({
            path: z.string().max(1024),
            hash: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
            size: z
              .number()
              .int()
              .min(0)
              .max(64 * 1024 ** 3),
            mode: z.number().int().min(0).max(511),
            directory: z.boolean(),
          })
          .strict(),
      )
      .max(200000),
  })
  .strict();
type Manifest = z.infer<typeof manifestSchema>;
function fail(message: string): never {
  throw new DomainError('SNAPSHOT', message);
}
export class IncrementalBackups {
  private previews = new Map<
    string,
    { value: PartialPreview; serverKey: string; expires: number }
  >();
  constructor(
    private repo: Repository,
    private jobs: OperationService,
    private content: ManagedContentService,
    private stopped: (id: string) => Server,
    private backup: (id: string, reason: string) => Promise<unknown>,
  ) {}
  settings(): BackupSafety {
    const row = this.repo.db.prepare("SELECT value FROM settings WHERE key='backup-safety'").get();
    return backupSafetySchema.parse(row ? JSON.parse(String(row.value)) : {});
  }
  configure(raw: BackupSafety) {
    const settings = backupSafetySchema.parse(raw);
    this.repo.db
      .prepare(
        "INSERT INTO settings VALUES('backup-safety',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(settings));
    this.repo.audit('backup.safety.configured', 'Backup safety preferences updated.');
    return settings;
  }
  list(id: string): IncrementalSnapshot[] {
    this.repo.server(id);
    return this.repo.db
      .prepare('SELECT metadata FROM incremental_snapshots WHERE server_id=? ORDER BY rowid DESC')
      .all(id)
      .map((r) => JSON.parse(String(r.metadata)) as IncrementalSnapshot);
  }
  private row(id: string) {
    const row = this.repo.db.prepare('SELECT * FROM incremental_snapshots WHERE id=?').get(id);
    if (!row) fail('Snapshot not found.');
    return {
      metadata: JSON.parse(String(row.metadata)) as IncrementalSnapshot,
      path: String(row.path),
    };
  }
  async testStorage() {
    const root = resolveSystemPath(this.repo.settings().backupRoot);
    await mkdir(root, { recursive: true });
    if ((await lstat(root)).isSymbolicLink()) fail('Choose a storage folder without links.');
    const file = await containedPath(root, '.minedock-write-test-' + randomUUID());
    try {
      await writeFile(file, 'test', { flag: 'wx', mode: 0o600 });
      const disk = await statfs(root);
      return { freeBytes: Number(disk.bavail) * Number(disk.bsize), writable: true };
    } finally {
      await rm(file, { force: true });
    }
  }
  async create(id: string): Promise<IncrementalSnapshot> {
    const server = this.stopped(id);
    await this.testStorage();
    return this.jobs.run('backup.incremental', 'Incremental backup', id, async (context) => {
      const root = path.join(this.repo.settings().backupRoot, '.minedock-incremental');
      await mkdir(root, { recursive: true });
      const objects = await containedPath(root, 'objects');
      await mkdir(objects, { recursive: true });
      const props = parseProperties(
        await readFile(await containedPath(server.path, 'server.properties'), 'utf8'),
      );
      const manifest: Manifest = {
        format: 1,
        server: { ...server },
        content: this.repo.content(id),
        world: validateRelative(props['level-name'] ?? 'world'),
        entries: [],
      };
      let logicalBytes = 0,
        storedBytes = 0,
        count = 0;
      const walk = async (relative: string): Promise<void> => {
        for (const entry of await readdir(await containedPath(server.path, relative, true), {
          withFileTypes: true,
        })) {
          context.signal.throwIfAborted();
          const child = validateRelative(path.join(relative, entry.name));
          if (++count > 200000) fail('Too many files for a snapshot.');
          if (entry.isSymbolicLink()) fail('A symbolic link prevents a safe snapshot.');
          if (entry.name === 'session.lock' || entry.name.endsWith('.lck')) continue;
          const file = await containedPath(server.path, child),
            info = await lstat(file);
          if (entry.isDirectory()) {
            manifest.entries.push({
              path: child.replaceAll('\\', '/'),
              directory: true,
              size: 0,
              mode: info.mode & 0o777,
            });
            await walk(child);
          } else if (entry.isFile()) {
            logicalBytes += info.size;
            if (logicalBytes > 64 * 1024 ** 3) fail('Snapshot exceeds 64 GiB.');
            let sanitized: Buffer | undefined;
            if (path.basename(child).toLowerCase() === 'server.properties') {
              const values = parseProperties(await readFile(file, 'utf8'));
              delete values['rcon.password'];
              sanitized = Buffer.from(serializeProperties(values));
            }
            const storedSize = sanitized?.length ?? info.size;
            const hash = sanitized
                ? createHash('sha256').update(sanitized).digest('hex')
                : await sha256(file, context.signal),
              object = await containedPath(objects, hash);
            const existing = await stat(object).catch((e: NodeJS.ErrnoException) => {
              if (e.code === 'ENOENT') return undefined;
              throw e;
            });
            if (existing) {
              if (existing.size !== storedSize || (await sha256(object, context.signal)) !== hash)
                fail('An existing snapshot object is corrupted.');
            } else {
              const disk = await statfs(objects);
              if (Number(disk.bavail) * Number(disk.bsize) < info.size + 128 * 1024 ** 2)
                fail('Storage has insufficient free space.');
              const part = await containedPath(objects, hash + '.' + randomUUID() + '.part');
              try {
                if (sanitized) await writeFile(part, sanitized, { flag: 'wx', mode: 0o600 });
                else await copyFile(file, part, 1);
                await chmod(part, 0o600);
                if ((await sha256(part, context.signal)) !== hash)
                  fail('A server file changed while copying.');
                await rename(part, object);
                storedBytes += storedSize;
              } finally {
                await rm(part, { force: true });
              }
            }
            const after = await stat(file);
            if (after.mtimeMs !== info.mtimeMs || after.size !== info.size)
              fail('A server file changed while copying.');
            manifest.entries.push({
              path: child.replaceAll('\\', '/'),
              hash,
              size: storedSize,
              mode: info.mode & 0o777,
              directory: false,
            });
          }
          context.phase('applying', logicalBytes);
        }
      };
      await walk('');
      const snapshotId = randomUUID(),
        filename = await containedPath(root, snapshotId + '.json'),
        text = JSON.stringify(manifest);
      if (Buffer.byteLength(text) > 32 * 1024 ** 2) fail('Snapshot manifest exceeds 32 MB.');
      await atomicWrite(filename, text);
      const meta: IncrementalSnapshot = {
        id: snapshotId,
        serverId: id,
        at: new Date().toISOString(),
        logicalBytes,
        storedBytes,
        files: manifest.entries.filter((e) => !e.directory).length,
        sha256: await sha256(filename),
      };
      this.repo.db
        .prepare('INSERT INTO incremental_snapshots VALUES(?,?,?,?)')
        .run(snapshotId, id, JSON.stringify(meta), filename);
      this.repo.audit('backup.incremental.completed', 'Incremental snapshot saved.', id);
      return meta;
    });
  }
  private async manifest(snapshotId: string, serverId: string) {
    const row = this.row(snapshotId);
    if (row.metadata.serverId !== serverId) fail('This snapshot belongs to another server.');
    if (
      (await lstat(row.path)).isSymbolicLink() ||
      (await stat(row.path)).size > 32 * 1024 ** 2 ||
      (await sha256(row.path)) !== row.metadata.sha256
    )
      fail('Snapshot manifest integrity failed.');
    const manifest = manifestSchema.parse(JSON.parse(await readFile(row.path, 'utf8')));
    if (manifest.server.id !== serverId) fail('Snapshot server identity changed.');
    const names = new Set<string>();
    for (const e of manifest.entries) {
      const name = validateRelative(e.path).toLowerCase();
      if (!name || names.has(name)) fail('Snapshot contains duplicate or invalid paths.');
      names.add(name);
      if (!e.directory && !e.hash) fail('Snapshot file lacks a hash.');
    }
    return { row, manifest, objects: path.join(path.dirname(row.path), 'objects') };
  }
  private selected(manifest: Manifest, scope: RestoreScope) {
    const world = validateRelative(manifest.world).replaceAll('\\', '/');
    if (!world || world.includes('/')) fail('Invalid snapshot world.');
    return manifest.entries.filter(
      (e) =>
        scope === 'all' ||
        (scope === 'world'
          ? [world, world + '_nether', world + '_the_end'].some(
              (w) => e.path === w || e.path.startsWith(w + '/'),
            )
          : scope === 'datapacks'
            ? e.path.startsWith(world + '/datapacks/') || e.path === world + '/datapacks'
            : scope === 'config'
              ? e.path === 'config' ||
                e.path.startsWith('config/') ||
                (!e.path.includes('/') && /\.(properties|yml|yaml)$/.test(e.path))
              : e.path === scope || e.path.startsWith(scope + '/')),
    );
  }
  async preview(
    serverId: string,
    snapshotId: string,
    rawScope: RestoreScope,
  ): Promise<PartialPreview> {
    const server = this.repo.server(serverId),
      scope = restoreScopeSchema.parse(rawScope),
      { row, manifest } = await this.manifest(snapshotId, serverId),
      entries = this.selected(manifest, scope);
    if (!entries.length) fail('The snapshot has no files in this selection.');
    if (scope !== 'all' && manifest.server.version !== server.version)
      fail('Partial restoration across Minecraft versions requires a full restore first.');
    const paths = entries.map((e) => e.path),
      replaced =
        scope === 'all'
          ? ['Entire server folder']
          : [
              ...new Set(
                paths.map((p) =>
                  scope === 'datapacks'
                    ? validateRelative(manifest.world).replaceAll('\\', '/') + '/datapacks'
                    : p.split('/')[0]!,
                ),
              ),
            ];
    if (scope === 'config') {
      for (const name of await readdir(server.path))
        if (/\.(properties|yml|yaml)$/.test(name) && !replaced.includes(name)) replaced.push(name);
      if (!replaced.includes('config')) replaced.push('config');
    }
    const value: PartialPreview = {
      token: randomUUID(),
      snapshot: row.metadata,
      scope,
      paths: paths.slice(0, 1000),
      replaced,
    };
    if (this.previews.size >= 100) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(value.token, {
      value,
      serverKey: JSON.stringify(server),
      expires: Date.now() + 600000,
    });
    return value;
  }
  async restore(serverId: string, token: string, confirmation: string) {
    const server = this.stopped(serverId),
      ticket = this.previews.get(token);
    if (
      !ticket ||
      ticket.value.snapshot.serverId !== serverId ||
      ticket.expires < Date.now() ||
      ticket.serverKey !== JSON.stringify(server)
    )
      fail('Restore preview expired or the server changed.');
    if (confirmation !== server.name) fail('Confirm the server name.');
    this.previews.delete(token);
    const { manifest, objects } = await this.manifest(ticket.value.snapshot.id, serverId),
      entries = this.selected(manifest, ticket.value.scope);
    // Verify all objects before any live folder is modified.
    for (const e of entries.filter((e) => !e.directory)) {
      const object = await containedPath(objects, e.hash!);
      if ((await sha256(object)) !== e.hash) fail('Snapshot object integrity failed.');
    }
    await this.backup(serverId, 'before_partial_restore');
    await this.content.transaction(
      server,
      async (stage, context) => {
        const current = parseProperties(
          await readFile(await containedPath(stage, 'server.properties'), 'utf8'),
        );
        if (ticket.value.scope === 'all')
          for (const name of await readdir(stage))
            await rm(await containedPath(stage, name), { recursive: true, force: true });
        else
          for (const root of ticket.value.replaced)
            await rm(await containedPath(stage, root), { recursive: true, force: true });
        for (const e of entries) {
          context?.signal.throwIfAborted();
          const target = await containedPath(stage, e.path);
          if (e.directory) await mkdir(target, { recursive: true });
          else {
            await mkdir(path.dirname(target), { recursive: true });
            await copyFile(await containedPath(objects, e.hash!), target, 1);
            await chmod(target, e.mode);
            if ((await sha256(target)) !== e.hash) fail('Restored file integrity failed.');
          }
        }
        if (ticket.value.scope === 'all' || ticket.value.scope === 'config') {
          const filename = await containedPath(stage, 'server.properties'),
            props = parseProperties(await readFile(filename, 'utf8'));
          for (const key of [
            'server-port',
            'server-portv6',
            'rcon.port',
            'rcon.password',
            'enable-rcon',
          ])
            if (current[key] !== undefined) props[key] = current[key]!;
          await atomicWrite(filename, serializeProperties(props));
        }
        const profile =
          ticket.value.scope === 'all'
            ? {
                ...(manifest.server as unknown as Server),
                id: server.id,
                path: server.path,
                port: server.port,
                status: 'stopped' as const,
                pid: undefined,
                players: [],
                cpu: 0,
                memory: 0,
                error: undefined,
              }
            : { ...server };
        if (ticket.value.scope === 'all' || ticket.value.scope === 'config') {
          const props = parseProperties(
            await readFile(await containedPath(stage, 'server.properties'), 'utf8'),
          );
          if (engineDefinition(profile.engine).edition === 'java') {
            if (props.difficulty)
              profile.difficulty = z
                .enum(['peaceful', 'easy', 'normal', 'hard'])
                .parse(props.difficulty);
            if (props.gamemode)
              profile.gamemode = z
                .enum(['survival', 'creative', 'adventure', 'spectator'])
                .parse(props.gamemode);
            if (props['max-players'])
              profile.maxPlayers = z.coerce
                .number()
                .int()
                .min(1)
                .max(1000)
                .parse(props['max-players']);
            if (props['view-distance'])
              profile.viewDistance = z.coerce
                .number()
                .int()
                .min(2)
                .max(32)
                .parse(props['view-distance']);
            if (props['simulation-distance'])
              profile.simulationDistance = z.coerce
                .number()
                .int()
                .min(2)
                .max(32)
                .parse(props['simulation-distance']);
            profile.whitelist = props['white-list'] === 'true';
            profile.onlineMode = props['online-mode'] === 'true';
            profile.pvp = props.pvp === 'true';
            profile.motd = props.motd ?? profile.motd;
          }
          if (ticket.value.scope === 'all')
            await stat(
              await containedPath(
                stage,
                profile.launchArgsFile ??
                  profile.entrypoint ??
                  (profile.engine === 'bedrock' ? 'bedrock_server' : 'server.jar'),
              ),
            );
        }
        let content: InstalledContent[] = this.repo.content(serverId);
        if (ticket.value.scope === 'all') content = manifest.content;
        else if (ticket.value.scope === 'mods' || ticket.value.scope === 'plugins')
          content = manifest.content;
        if (ticket.value.scope === 'datapacks' || ticket.value.scope === 'world')
          profile.packs = [
            ...(server.packs ?? []).filter(
              (p) => p.kind !== 'datapack' || p.world !== manifest.world,
            ),
            ...((manifest.server as unknown as Server).packs ?? []).filter(
              (p) => p.kind === 'datapack' && p.world === manifest.world,
            ),
          ];
        return { value: undefined, items: content, profile };
      },
      'Restore incremental snapshot',
      true,
    );
    this.repo.audit(
      'backup.partial.restored',
      'Snapshot restored: ' + ticket.value.scope,
      serverId,
    );
  }
}
