import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { migrations } from './migrations';
import type {
  Server,
  Settings,
  Backup,
  Schedule,
  Activity,
  Metric,
  InstalledContent,
  Runtime,
} from '../domain/types';
import { EventBus } from '../core/events';
import { redact } from '../security/secrets';
import type { Operation, DownloadPartial, SwapCheckpoint } from '../domain/operations';

export class Repository {
  readonly db: DatabaseSync;
  constructor(
    readonly root: string,
    private readonly bus: EventBus,
  ) {
    mkdirSync(root, { recursive: true });
    const filename = path.join(root, 'app.db');
    const existed = existsSync(filename);
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const integrity = this.db.prepare('PRAGMA quick_check').get();
    if (integrity?.quick_check !== 'ok')
      throw new Error('The database is corrupted. Your copy has been preserved.');
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > migrations.length)
      throw new Error('This database requires a newer version of MineDock.');
    if (existed && version < migrations.length) {
      const checkpoint = this.db.prepare('PRAGMA wal_checkpoint(FULL)').get();
      if (checkpoint?.busy)
        throw new Error('The database is busy. Close the other MineDock process before upgrading.');
      copyFileSync(filename, filename + `.before-v${version + 1}.bak`);
    }
    for (const migration of migrations.filter((m) => m.version > version)) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(migration.sql);
        this.db.exec(`PRAGMA user_version=${migration.version}; COMMIT`);
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    this.db.exec('PRAGMA journal_mode=WAL;');
  }
  servers(): Server[] {
    return this.db
      .prepare('SELECT profile FROM servers')
      .all()
      .map((r) => JSON.parse(String(r.profile)) as Server);
  }
  server(id: string): Server {
    const row = this.db.prepare('SELECT profile FROM servers WHERE id=?').get(id);
    if (!row) throw new Error('Server not found.');
    return JSON.parse(String(row.profile)) as Server;
  }
  addServer(server: Server, secret: string): void {
    this.db
      .prepare('INSERT INTO servers VALUES(?,?,?)')
      .run(server.id, JSON.stringify(server), secret);
    this.bus.emit({ type: 'server', server });
  }
  saveServer(server: Server): void {
    server.updatedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE servers SET profile=? WHERE id=?')
      .run(JSON.stringify(server), server.id);
    this.bus.emit({ type: 'server', server });
  }
  secret(id: string): string {
    return String(this.db.prepare('SELECT secret FROM servers WHERE id=?').get(id)?.secret ?? '');
  }
  removeServer(id: string): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM backups WHERE server_id=?').run(id);
      this.db.prepare('DELETE FROM schedules WHERE server_id=?').run(id);
      this.db.prepare('DELETE FROM servers WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.bus.emit({ type: 'changed' });
  }
  settings(): Settings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='general'").get();
    return row
      ? (JSON.parse(String(row.value)) as Settings)
      : {
          language: 'en',
          theme: 'system',
          serverRoot: path.join(this.root, 'servers'),
          backupRoot: path.join(this.root, 'backups'),
          preventSleep: false,
          onboarded: false,
        };
  }
  saveSettings(settings: Settings): void {
    this.db
      .prepare(
        "INSERT INTO settings VALUES('general',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(settings));
    this.bus.emit({ type: 'changed' });
  }
  backups(): Backup[] {
    return this.db
      .prepare('SELECT metadata FROM backups ORDER BY rowid DESC')
      .all()
      .map((r) => JSON.parse(String(r.metadata)) as Backup);
  }
  backup(id: string): { metadata: Backup; path: string } {
    const row = this.db.prepare('SELECT * FROM backups WHERE id=?').get(id);
    if (!row) throw new Error('Backup not found.');
    return { metadata: JSON.parse(String(row.metadata)) as Backup, path: String(row.path) };
  }
  addBackup(meta: Backup, filename: string): void {
    this.db
      .prepare('INSERT INTO backups VALUES(?,?,?,?)')
      .run(meta.id, meta.serverId, JSON.stringify(meta), filename);
    this.bus.emit({ type: 'changed' });
  }
  deleteBackup(id: string): void {
    this.db.prepare('DELETE FROM backups WHERE id=?').run(id);
    this.bus.emit({ type: 'changed' });
  }
  schedules(): Schedule[] {
    return this.db
      .prepare('SELECT metadata FROM schedules')
      .all()
      .map((r) => JSON.parse(String(r.metadata)) as Schedule);
  }
  saveSchedule(schedule: Schedule): void {
    this.db
      .prepare(
        'INSERT INTO schedules VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(schedule.id, schedule.serverId, JSON.stringify(schedule));
    this.bus.emit({ type: 'changed' });
  }
  deleteSchedule(id: string): void {
    this.db.prepare('DELETE FROM schedules WHERE id=?').run(id);
    this.bus.emit({ type: 'changed' });
  }
  activity(): Activity[] {
    return this.db
      .prepare('SELECT * FROM events ORDER BY id DESC LIMIT 200')
      .all()
      .map((r) => ({
        id: Number(r.id),
        at: String(r.at),
        action: String(r.action),
        serverId: r.server_id ? String(r.server_id) : undefined,
        detail: String(r.detail),
        success: !!r.success,
      }));
  }
  audit(action: string, detail: string, serverId?: string, success = true): void {
    const at = new Date().toISOString();
    const cleaned = redact(detail);
    const result = this.db
      .prepare('INSERT INTO events(at,action,server_id,detail,success) VALUES(?,?,?,?,?)')
      .run(at, action, serverId ?? null, cleaned, success ? 1 : 0);
    this.bus.emit({
      type: 'activity',
      activity: {
        id: Number(result.lastInsertRowid),
        at,
        action,
        serverId,
        detail: cleaned,
        success,
      },
    });
  }
  addMetric(id: string, metric: Metric): void {
    this.db
      .prepare('INSERT INTO metrics VALUES(?,?,?,?,?)')
      .run(id, metric.at, metric.cpu, metric.memory, metric.players);
  }
  metrics(id: string, hours: number): Metric[] {
    // Bounded to 840 samples even for a seven-day window.
    const since = new Date(Date.now() - Math.min(hours, 168) * 3600000).toISOString();
    const bucket = Math.max(1, Math.ceil((hours * 3600) / 840));
    return this.db
      .prepare(
        'SELECT MIN(at) at, AVG(cpu) cpu, AVG(memory) memory, MAX(players) players FROM metrics WHERE server_id=? AND at>=? GROUP BY CAST(unixepoch(at)/? AS INTEGER) ORDER BY at',
      )
      .all(id, since, bucket)
      .map((r) => ({
        at: String(r.at),
        cpu: Number(r.cpu),
        memory: Number(r.memory),
        players: Number(r.players),
      }));
  }
  retainMetrics(): void {
    this.db
      .prepare('DELETE FROM metrics WHERE at<?')
      .run(new Date(Date.now() - 7 * 86400000).toISOString());
  }
  content(id: string): InstalledContent[] {
    return this.db
      .prepare('SELECT metadata FROM installed_content WHERE server_id=?')
      .all(id)
      .map((r) => JSON.parse(String(r.metadata)) as InstalledContent);
  }
  saveContent(item: InstalledContent): void {
    this.db
      .prepare(
        'INSERT INTO installed_content VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(item.id, item.serverId, JSON.stringify(item));
    this.bus.emit({ type: 'changed' });
  }
  runtimes(): Runtime[] {
    return this.db
      .prepare('SELECT metadata FROM runtime_versions')
      .all()
      .map((r) => JSON.parse(String(r.metadata)) as Runtime);
  }
  saveRuntime(runtime: Runtime): void {
    this.db
      .prepare(
        'INSERT INTO runtime_versions VALUES(?,?) ON CONFLICT(major) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(runtime.major, JSON.stringify(runtime));
  }
  seenPlayer(id: string, name: string): void {
    const at = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO player_history VALUES(?,?,?,?) ON CONFLICT(server_id,name) DO UPDATE SET last_seen=excluded.last_seen',
      )
      .run(id, name, at, at);
  }
  operations(): Operation[] {
    return this.db
      .prepare(
        "SELECT metadata FROM operations WHERE rowid IN (SELECT rowid FROM operations ORDER BY rowid DESC LIMIT 200) OR checkpoint IS NOT NULL OR json_extract(metadata,'$.status') NOT IN ('completed','cancelled','failed') OR json_extract(metadata,'$.recoverable')=1 ORDER BY rowid DESC",
      )
      .all()
      .map((r) => JSON.parse(String(r.metadata)) as Operation);
  }
  saveOperation(operation: Operation, checkpoint?: SwapCheckpoint): void {
    this.db
      .prepare(
        'INSERT INTO operations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata, checkpoint=COALESCE(excluded.checkpoint, operations.checkpoint)',
      )
      .run(
        operation.id,
        operation.serverId ?? null,
        JSON.stringify(operation),
        checkpoint ? JSON.stringify(checkpoint) : null,
      );
    this.bus.emit({ type: 'changed' });
  }
  operationCheckpoint(id: string): SwapCheckpoint | undefined {
    const value = this.db
      .prepare('SELECT checkpoint FROM operations WHERE id=?')
      .get(id)?.checkpoint;
    return value ? (JSON.parse(String(value)) as SwapCheckpoint) : undefined;
  }
  clearOperationCheckpoint(id: string): void {
    this.db.prepare('UPDATE operations SET checkpoint=NULL WHERE id=?').run(id);
  }
  partial(destination: string): DownloadPartial | undefined {
    const value = this.db
      .prepare('SELECT metadata FROM download_partials WHERE destination=?')
      .get(destination)?.metadata;
    return value ? (JSON.parse(String(value)) as DownloadPartial) : undefined;
  }
  savePartial(value: DownloadPartial): void {
    this.db
      .prepare(
        'INSERT INTO download_partials VALUES(?,?) ON CONFLICT(destination) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(value.destination, JSON.stringify(value));
  }
  deletePartial(destination: string): void {
    this.db.prepare('DELETE FROM download_partials WHERE destination=?').run(destination);
  }
  async snapshotDatabase(): Promise<void> {
    await backup(this.db, path.join(this.root, 'app.db.daily.bak'));
  }
  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}
