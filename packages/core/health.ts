import { randomUUID } from 'node:crypto';
import { freemem } from 'node:os';
import { readdir, stat, statfs, open } from 'node:fs/promises';
import type { Repository } from '../database/database';
import type { EventBus } from './events';
import {
  healthSettingsSchema,
  type HealthSettings,
  type NoticeCode,
  type Notice,
  type HealthReport,
  type CrashReport,
} from '../domain/health';
import { containedPath } from '../security/paths';
import { redact } from '../security/secrets';
import { analyzeCrash } from './crash';
export class HealthService {
  private off: () => void;
  private sustained = new Map<string, number>();
  private statuses = new Map<string, string>();
  constructor(
    private repo: Repository,
    private bus: EventBus,
  ) {
    for (const server of repo.servers()) this.statuses.set(server.id, server.status);
    this.off = bus.subscribe((event) => {
      if (event.type === 'server') {
        if (event.server.status === 'stopped' && this.statuses.get(event.server.id) === 'running')
          this.push(event.server.id, 'offline');
        this.statuses.set(event.server.id, event.server.status);
      }
      if (event.type === 'activity' && event.activity.action === 'update.available')
        this.push(undefined, 'update');
      if (event.type === 'server' && event.server.status === 'crashed')
        this.push(event.server.id, 'crash');
      if (
        event.type === 'activity' &&
        /backup\.failed|operation\.failed/.test(event.activity.action)
      ) {
        if (event.activity.action === 'backup.failed')
          this.push(event.activity.serverId, 'backupFailed', event.activity.detail);
      }
      if (event.type === 'metric') {
        const server = repo.server(event.serverId),
          settings = this.settings();
        this.threshold(server.id, 'highCpu', event.metric.cpu >= settings.cpuPercent);
        this.threshold(
          server.id,
          'highMemory',
          event.metric.memory >= (server.memoryMax * 1024 ** 2 * settings.memoryPercent) / 100,
        );
      }
      if (event.type === 'log') {
        if (/joined the game|Player connected:/.test(event.line.text))
          this.push(event.serverId, 'playerJoin');
        if (/left the game|Player disconnected:/.test(event.line.text))
          this.push(event.serverId, 'playerLeave');
      }
    });
  }
  close() {
    this.off();
  }
  settings(): HealthSettings {
    const value = this.repo.db
      .prepare("SELECT value FROM settings WHERE key='survival-health'")
      .get()?.value;
    return healthSettingsSchema.parse(value ? JSON.parse(String(value)) : {});
  }
  configure(input: HealthSettings) {
    const settings = healthSettingsSchema.parse(input);
    this.repo.db
      .prepare(
        "INSERT INTO settings VALUES('survival-health',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(settings));
    this.repo.audit('health.configured', 'Notification preferences updated.');
    return settings;
  }
  private threshold(id: string, code: 'highCpu' | 'highMemory', crossed: boolean) {
    const key = id + code;
    if (!crossed) {
      this.sustained.delete(key);
      return;
    }
    const since = this.sustained.get(key) ?? Date.now();
    this.sustained.set(key, since);
    if (Date.now() - since >= 30000) this.push(id, code);
    if (this.sustained.size > 1000) this.sustained.delete(this.sustained.keys().next().value!);
  }
  push(serverId: string | undefined, code: NoticeCode, detail?: string) {
    const settings = this.settings();
    if (code in settings && settings[code as keyof HealthSettings] === false) return;
    const row = this.repo.db
      .prepare(
        'SELECT metadata FROM survival_notices WHERE server_id IS ? AND code=? ORDER BY rowid DESC LIMIT 1',
      )
      .get(serverId ?? null, code);
    const previous = row ? (JSON.parse(String(row.metadata)) as Notice) : undefined;
    // One grouped alert in a fifteen minute window; native delivery only on a new group.
    if (previous && Date.now() - Date.parse(previous.at) < 900000) return;
    const notice: Notice = {
      id: previous && !previous.read ? previous.id : randomUUID(),
      serverId,
      code,
      at: new Date().toISOString(),
      read: false,
      count: (previous && !previous.read ? previous.count : 0) + 1,
      detail: detail ? redact(detail).slice(0, 500) : undefined,
    };
    this.repo.db
      .prepare(
        'INSERT INTO survival_notices VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(notice.id, serverId ?? null, code, JSON.stringify(notice));
    this.repo.db
      .prepare(
        'DELETE FROM survival_notices WHERE id IN (SELECT id FROM survival_notices ORDER BY rowid DESC LIMIT -1 OFFSET 400)',
      )
      .run();
    this.bus.emit({ type: 'notice', notice });
    this.bus.emit({ type: 'changed' });
  }
  notices(): Notice[] {
    return this.repo.db
      .prepare(
        "SELECT metadata FROM survival_notices ORDER BY json_extract(metadata,'$.at') DESC LIMIT 400",
      )
      .all()
      .map((row) => JSON.parse(String(row.metadata)) as Notice);
  }
  read(id?: string) {
    if (id)
      this.repo.db
        .prepare(
          "UPDATE survival_notices SET metadata=json_set(metadata,'$.read',json('true')) WHERE id=?",
        )
        .run(id);
    else
      this.repo.db
        .prepare("UPDATE survival_notices SET metadata=json_set(metadata,'$.read',json('true'))")
        .run();
    this.bus.emit({ type: 'changed' });
  }
  async report(id: string): Promise<HealthReport> {
    const server = this.repo.server(id),
      settings = this.settings();
    const report: HealthReport = {
      state: 'healthy',
      issues: [],
      hostFreeBytes: freemem(),
      memorySource: 'process-working-set',
    };
    if (server.status === 'crashed') report.issues.push({ code: 'crash', severity: 'problem' });
    if (server.installationComplete === false)
      report.issues.push({ code: 'installation', severity: 'problem' });
    const last = this.repo
      .backups()
      .filter((b) => b.serverId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const incremental = this.repo.db
      .prepare(
        "SELECT MAX(json_extract(metadata,'$.at')) AS at FROM incremental_snapshots WHERE server_id=?",
      )
      .get(id)?.at;
    const latestAt = [last?.createdAt, incremental ? String(incremental) : undefined]
      .filter((at): at is string => !!at)
      .sort()
      .at(-1);
    if (!latestAt || Date.now() - Date.parse(latestAt) > settings.backupAgeHours * 3600000)
      report.issues.push({ code: 'backupOld', severity: 'warning' });
    try {
      const disk = await statfs(server.path);
      report.diskFreeBytes = Number(disk.bavail) * Number(disk.bsize);
      if (report.diskFreeBytes < settings.diskFreeGiB * 1024 ** 3) {
        report.issues.push({ code: 'lowDisk', severity: 'problem' });
        this.push(id, 'lowDisk');
      }
    } catch {
      report.issues.push({ code: 'lowDisk', severity: 'warning', detail: 'Storage unavailable' });
    }
    if (server.pid && server.memory > (server.memoryMax * 1024 ** 2 * settings.memoryPercent) / 100)
      report.issues.push({ code: 'highMemory', severity: 'warning' });
    if (server.cpu > settings.cpuPercent)
      report.issues.push({ code: 'highCpu', severity: 'warning' });
    report.state = report.issues.some((i) => i.severity === 'problem')
      ? 'problem'
      : report.issues.length
        ? 'attention'
        : 'healthy';
    return report;
  }
  async crash(id: string): Promise<CrashReport> {
    const server = this.repo.server(id);
    const files: { relative: string; at: number }[] = [];
    const names = await readdir(await containedPath(server.path, 'crash-reports')).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return [] as string[];
        throw e;
      },
    );
    for (const name of names.filter((n) => /^crash-.*\.txt$/.test(n)).slice(-200)) {
      const relative = 'crash-reports/' + name,
        info = await stat(await containedPath(server.path, relative));
      if (info.isFile()) files.push({ relative, at: info.mtimeMs });
    }
    files.sort((a, b) => b.at - a.at);
    const relative = files[0]?.relative ?? 'logs/latest.log';
    let text = '';
    try {
      const file = await open(await containedPath(server.path, relative), 'r');
      try {
        const size = (await file.stat()).size,
          buffer = Buffer.alloc(Math.min(size, 2 * 1024 ** 2));
        const { bytesRead } = await file.read(
          buffer,
          0,
          buffer.length,
          Math.max(0, size - buffer.length),
        );
        text = redact(buffer.subarray(0, bytesRead).toString('utf8'));
      } finally {
        await file.close();
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const evidence = text
      .split('\n')
      .filter((line) =>
        /Exception|Error|Caused by:|requires|Could not load|incompatible/i.test(line),
      )
      .slice(-40)
      .map((s) => s.slice(0, 500));
    const candidates: CrashReport['candidates'] = [];
    for (const item of this.repo.content(id)) {
      const needles = [item.filename.replace(/\.jar$/, ''), item.title].filter(
        (n) => n.length >= 4,
      );
      if (needles.some((n) => evidence.some((e) => e.toLowerCase().includes(n.toLowerCase()))))
        candidates.push({
          id: item.id,
          title: item.title,
          filename: item.filename,
          confidence: 'possible',
        });
    }
    return {
      path: text ? relative : undefined,
      text,
      diagnosis: analyzeCrash(text, server.javaMajor),
      evidence,
      candidates,
    };
  }
}
