import { lstat, readFile, mkdir, writeFile, rename, rm, open } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { z } from 'zod';
import type { AppCore } from './app';
import { containedPath, atomicWrite } from '../security/paths';
import { readPlayerNbt, writePlayerNbt, readSnbt, type NbtTag } from '../security/player-nbt';
import { parseProperties } from '../domain/properties';
import { engineDefinition } from '../domain/engines';
import { DomainError } from '../domain/errors';
import {
  inventoryEditSchema,
  type InventoryEdit,
  type PlayerInventory,
  type PlayerSnapshot,
  type InventoryRestorePreview,
} from '../domain/administration';
import {
  inventoryReport,
  fileUuid,
  editInventory,
  restoreInventory,
  slotKey,
} from './player-inventory-format';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const uuidSchema = z
  .string()
  .uuid()
  .transform((s) => s.toLowerCase())
  .refine((s) => s !== '00000000-0000-0000-0000-000000000000');
interface Journal {
  file: string;
  snapshot: string;
  before: string;
  after: string;
  state: 'prepared' | 'applied' | 'rolled_back' | 'aborted' | 'attention';
  at: string;
}
export class PlayerInventoryService {
  private readonly previews = new Map<
    string,
    {
      id: string;
      name: string;
      uuid: string;
      hash: string;
      snapshot: string;
      snapshotHash: string;
      expires: number;
    }
  >();
  constructor(
    private readonly core: AppCore,
    private readonly afterReplace?: () => Promise<void>,
  ) {}
  assertSafe(id: string): void {
    if (
      this.core.repo.db
        .prepare('SELECT metadata FROM player_data_journal WHERE server_id=?')
        .all(id)
        .some((r) =>
          ['prepared', 'attention'].includes((JSON.parse(String(r.metadata)) as Journal).state),
        )
    )
      throw new DomainError(
        'RECOVERY',
        'An interrupted player transaction needs review. Restore the preserved backup and restart MineDock before starting this server.',
      );
  }
  private stopped(id: string) {
    const server = this.core.assertStopped(id);
    if (server.pid || !['stopped', 'crashed'].includes(server.status))
      throw new DomainError('RUNNING', 'Stop the server completely before changing player data.');
    return server;
  }
  private async identity(id: string, name: string, uuid?: string) {
    const player = (await this.core.players.report(id)).players.find((p) => p.name === name);
    if (!player?.uuid || player.identityConflict || (uuid && player.uuid.toLowerCase() !== uuid))
      throw new DomainError('IDENTITY', 'A unique, matching Java player identity is required.');
    return player;
  }
  private async dataFile(id: string, uuid: string): Promise<string> {
    const server = this.core.repo.server(id);
    if (engineDefinition(server.engine).edition !== 'java')
      throw new DomainError(
        'CAPABILITY',
        'Bedrock and PocketMine player storage is not Java playerdata.',
      );
    const properties = await containedPath(server.path, 'server.properties');
    const info = await lstat(properties);
    if (!info.isFile() || info.size > 2 * 1024 ** 2)
      throw new DomainError('SIZE', 'Invalid server properties.');
    const world = parseProperties(await readFile(properties, 'utf8'))['level-name'] ?? 'world';
    const modern = /^26\.\d+(?:\.\d+)?$/.test(server.minecraftVersion ?? server.version);
    return containedPath(
      server.path,
      path.join(world, modern ? 'players/data' : 'playerdata', uuid + '.dat'),
    );
  }
  private async read(file: string, uuid: string) {
    const before = await lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 16 * 1024 ** 2)
      throw new DomainError('SIZE', 'Invalid or oversized player data.');
    const handle = await open(
      file,
      constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW),
    );
    let bytes: Buffer;
    try {
      const actual = await handle.stat();
      if (actual.ino !== before.ino || actual.dev !== before.dev || actual.size !== before.size)
        throw new DomainError('CONFLICT', 'Player data changed while opening it.');
      bytes = await handle.readFile();
      const after = await handle.stat();
      if (after.size !== actual.size || after.mtimeMs !== actual.mtimeMs)
        throw new DomainError('CONFLICT', 'Player data changed while reading it.');
    } finally {
      await handle.close();
    }
    const root = readPlayerNbt(bytes),
      recordedUuid = fileUuid(root);
    if (recordedUuid && recordedUuid !== uuid)
      throw new DomainError('IDENTITY', 'The saved player UUID does not match its filename.');
    return { bytes, root, sha256: hash(bytes), at: before.mtime.toISOString() };
  }
  async get(id: string, name: string, preferLive = true): Promise<PlayerInventory> {
    const server = this.core.repo.server(id);
    if (engineDefinition(server.engine).edition !== 'java')
      return {
        source: 'unavailable',
        writable: false,
        slots: [],
        reason:
          'Native inventory reading is unavailable for Bedrock and PocketMine without an extension.',
      };
    const player = await this.identity(id, name).catch(() => undefined);
    if (!player)
      return {
        source: 'unavailable',
        writable: false,
        slots: [],
        reason: 'A unique, matching Java player identity is required.',
      };
    if (
      preferLive &&
      player.online &&
      this.core.supervisor.isRunning(id) &&
      /^[A-Za-z0-9_]{1,16}$/.test(player.name)
    ) {
      try {
        const prefix = ['paper', 'purpur'].includes(server.engine) ? 'minecraft:' : '';
        const reply = await this.core.supervisor.command(
          id,
          `${prefix}data get entity ${player.name}`,
        );
        const marker = player.name + ' has the following entity data: ';
        if (reply.startsWith(marker)) {
          const root = readSnbt(reply.slice(marker.length).trim()),
            actualUuid = fileUuid(root);
          if (actualUuid && actualUuid === player.uuid)
            return inventoryReport(root, 'live', new Date().toISOString());
        }
      } catch {
        /* Missing, localized, intercepted or oversized native responses fall back to saved data. */
      }
    }
    try {
      const data = await this.read(
        await this.dataFile(id, uuidSchema.parse(player.uuid)),
        player.uuid!,
      );
      const report = inventoryReport(data.root, 'saved', data.at, data.sha256);
      try {
        this.assertSafe(id);
      } catch (error) {
        report.writable = false;
        report.reason = (error as Error).message;
      }
      if (
        this.core.supervisor.isRunning(id) ||
        this.core.supervisor.isOrphaned(id) ||
        server.pid ||
        !['stopped', 'crashed'].includes(server.status)
      ) {
        report.writable = false;
        report.reason =
          'Saved inventory may be out of date. Stop the server before editing this file.';
      }
      return report;
    } catch (error) {
      return {
        source: 'unavailable',
        writable: false,
        slots: [],
        reason:
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'No saved Java player data was found.'
            : (error as Error).message,
      };
    }
  }
  snapshots(id: string, rawUuid: string): PlayerSnapshot[] {
    this.core.repo.server(id);
    const uuid = uuidSchema.parse(rawUuid);
    return this.core.repo.db
      .prepare(
        'SELECT metadata FROM player_data_snapshots WHERE server_id=? AND uuid=? ORDER BY at DESC LIMIT 100',
      )
      .all(id, uuid)
      .map((r) => JSON.parse(String(r.metadata)) as PlayerSnapshot);
  }
  private async snapshotFile(id: string, uuid: string, snapshot: string): Promise<string> {
    return containedPath(
      this.core.repo.root,
      path.join('player-snapshots', id, uuid, z.string().uuid().parse(snapshot) + '.dat'),
    );
  }
  private saveJournal(id: string, uuid: string, journalId: string, journal: Journal) {
    this.core.repo.db
      .prepare(
        'INSERT INTO player_data_journal VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(journalId, id, uuid, JSON.stringify(journal));
  }
  async reconcile(): Promise<void> {
    for (const row of this.core.repo.db.prepare('SELECT * FROM player_data_journal').all()) {
      const journal = JSON.parse(String(row.metadata)) as Journal;
      if (!['prepared', 'attention'].includes(journal.state)) continue;
      try {
        const file = await this.dataFile(String(row.server_id), uuidSchema.parse(row.uuid));
        if (file !== journal.file) throw new Error('World changed.');
        const data = await this.read(file, String(row.uuid));
        journal.state =
          data.sha256 === journal.after
            ? 'applied'
            : data.sha256 === journal.before
              ? 'aborted'
              : 'attention';
      } catch {
        journal.state = 'attention';
      }
      this.saveJournal(String(row.server_id), String(row.uuid), String(row.id), journal);
    }
  }
  private async transaction(
    id: string,
    name: string,
    uuid: string,
    expected: string,
    reason: string,
    mutate: (root: NbtTag) => void,
  ): Promise<PlayerInventory> {
    this.stopped(id);
    await this.identity(id, name, uuid);
    const pending = this.core.repo.db
      .prepare('SELECT metadata FROM player_data_journal WHERE server_id=? AND uuid=?')
      .all(id, uuid)
      .some((r) =>
        ['prepared', 'attention'].includes((JSON.parse(String(r.metadata)) as Journal).state),
      );
    if (pending)
      throw new DomainError(
        'RECOVERY',
        'An interrupted player transaction needs review. Use the preserved backup before making another edit.',
      );
    const file = await this.dataFile(id, uuid),
      previous = await this.read(file, uuid);
    if (previous.sha256 !== expected)
      throw new DomainError(
        'CONFLICT',
        'Player data changed. Refresh the inventory before editing.',
      );
    mutate(previous.root);
    const bytes = writePlayerNbt(previous.root),
      after = hash(bytes);
    if (after === previous.sha256)
      return inventoryReport(previous.root, 'saved', previous.at, previous.sha256);
    const safetyBackup = await this.core.backups.create(id, 'before_player_inventory_' + reason);
    if (!(await this.core.backups.verify(safetyBackup.id)))
      throw new DomainError('INTEGRITY', 'The full player safety backup did not verify.');
    this.stopped(id);
    if ((await this.read(await this.dataFile(id, uuid), uuid)).sha256 !== expected)
      throw new DomainError('CONFLICT', 'Player data changed during the safety backup.');
    const snapshot: PlayerSnapshot = {
      id: randomUUID(),
      at: new Date().toISOString(),
      sha256: previous.sha256,
      reason,
    };
    const copy = await this.snapshotFile(id, uuid, snapshot.id);
    await mkdir(path.dirname(copy), { recursive: true });
    await writeFile(copy, previous.bytes, { flag: 'wx', mode: 0o600 });
    const copyHandle = await open(copy, 'r+');
    try {
      await copyHandle.sync();
    } finally {
      await copyHandle.close();
    }
    if ((await this.read(copy, uuid)).sha256 !== snapshot.sha256)
      throw new DomainError('INTEGRITY', 'The player safety copy did not verify.');
    this.core.repo.db
      .prepare('INSERT INTO player_data_snapshots VALUES(?,?,?,?,?)')
      .run(snapshot.id, id, uuid, snapshot.at, JSON.stringify(snapshot));
    const journalId = randomUUID(),
      journal: Journal = {
        file,
        snapshot: snapshot.id,
        before: expected,
        after,
        state: 'prepared',
        at: snapshot.at,
      };
    this.saveJournal(id, uuid, journalId, journal);
    const temporary = file + '.' + journalId + '.tmp';
    let replaced = false;
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      const handle = await open(temporary, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      if ((await this.read(temporary, uuid)).sha256 !== after)
        throw new DomainError('INTEGRITY', 'Staged player data did not verify.');
      this.stopped(id);
      const latestFile = await this.dataFile(id, uuid);
      if (latestFile !== file || (await this.read(latestFile, uuid)).sha256 !== expected)
        throw new DomainError('CONFLICT', 'Player data changed before replacement.');
      await containedPath(
        this.core.repo.server(id).path,
        path.relative(this.core.repo.server(id).path, temporary),
      );
      await rename(temporary, file);
      replaced = true;
      await this.afterReplace?.();
      const verified = await this.read(file, uuid);
      if (verified.sha256 !== after)
        throw new DomainError('INTEGRITY', 'Written player data did not verify.');
      journal.state = 'applied';
      this.saveJournal(id, uuid, journalId, journal);
      this.core.repo.audit(
        'player.inventory.' + reason,
        name + ' · safety copy ' + snapshot.id,
        id,
      );
      this.core.administration?.record(
        id,
        'inventory.' + reason,
        { state: 'confirmed', response: '', at: new Date().toISOString() },
        { snapshot: snapshot.id },
        name,
        uuid,
      );
      return inventoryReport(verified.root, 'saved', verified.at, verified.sha256);
    } catch (error) {
      journal.state = 'aborted';
      if (replaced) {
        try {
          this.stopped(id);
          if ((await this.read(await this.dataFile(id, uuid), uuid)).sha256 !== after)
            throw new Error('Concurrent player data change.');
          await atomicWrite(file, previous.bytes);
          if ((await this.read(file, uuid)).sha256 !== expected)
            throw new Error('Rollback integrity failure.');
          journal.state = 'rolled_back';
        } catch {
          journal.state = 'attention';
        }
      }
      this.saveJournal(id, uuid, journalId, journal);
      throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async edit(id: string, raw: InventoryEdit): Promise<PlayerInventory> {
    const input = inventoryEditSchema.parse(raw),
      uuid = uuidSchema.parse(input.uuid);
    if (input.confirmation !== input.name)
      throw new DomainError('CONFIRM', 'Confirm the exact player name.');
    return this.core.exclusive(id, () =>
      this.transaction(id, input.name, uuid, input.sha256, input.action, (root) =>
        editInventory(root, input),
      ),
    );
  }
  async previewRestore(
    id: string,
    name: string,
    rawUuid: string,
    snapshot: string,
  ): Promise<InventoryRestorePreview> {
    this.stopped(id);
    const uuid = uuidSchema.parse(rawUuid);
    await this.identity(id, name, uuid);
    const record = this.snapshots(id, uuid).find((s) => s.id === snapshot);
    if (!record) throw new DomainError('SNAPSHOT', 'Player safety copy was not found.');
    const previous = await this.read(await this.snapshotFile(id, uuid, record.id), uuid);
    if (previous.sha256 !== record.sha256)
      throw new DomainError('INTEGRITY', 'Player safety copy is damaged.');
    const current = await this.read(await this.dataFile(id, uuid), uuid);
    const before = inventoryReport(current.root, 'saved', current.at, current.sha256);
    restoreInventory(current.root, previous.root);
    const restored = inventoryReport(current.root, 'saved', previous.at);
    const changes = before.slots.flatMap((slot) => {
      const after = restored.slots.find((s) => slotKey(s) === slotKey(slot))!.item;
      return JSON.stringify(slot.item) === JSON.stringify(after)
        ? []
        : [{ slot: { section: slot.section, index: slot.index }, before: slot.item, after }];
    });
    const token = randomUUID();
    for (const [key, preview] of this.previews)
      if (preview.expires < Date.now()) this.previews.delete(key);
    if (this.previews.size >= 100) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(token, {
      id,
      name,
      uuid,
      hash: current.sha256,
      snapshot: record.id,
      snapshotHash: record.sha256,
      expires: Date.now() + 300000,
    });
    return { token, snapshot: record, changes };
  }
  async restore(id: string, token: string, confirmation: string): Promise<PlayerInventory> {
    const preview = this.previews.get(z.string().uuid().parse(token));
    if (!preview || preview.id !== id || preview.expires < Date.now())
      throw new DomainError('PREVIEW', 'Inventory restoration preview expired.');
    if (confirmation !== preview.name)
      throw new DomainError('CONFIRM', 'Confirm the exact player name.');
    return this.core.exclusive(id, async () => {
      this.previews.delete(token);
      const previous = await this.read(
        await this.snapshotFile(id, preview.uuid, preview.snapshot),
        preview.uuid,
      );
      if (previous.sha256 !== preview.snapshotHash)
        throw new DomainError('INTEGRITY', 'Player safety copy changed.');
      return this.transaction(id, preview.name, preview.uuid, preview.hash, 'restore', (root) =>
        restoreInventory(root, previous.root),
      );
    });
  }
}
