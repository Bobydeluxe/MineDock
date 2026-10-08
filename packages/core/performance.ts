import type { AppCore } from './app';
import type { Metric } from '../domain/types';
import { parseTickMetrics, type PerformanceReport, type LagEvent } from '../domain/performance';
import { z } from 'zod';
export class PerformanceService {
  private off: () => void;
  private pending = new Map<string, Promise<void>>();
  private latest = new Map<string, number>();
  private closed = false;
  constructor(private core: AppCore) {
    this.off = core.bus.subscribe((event) => {
      if (
        event.type === 'metric' &&
        !this.closed &&
        !this.pending.has(event.serverId) &&
        Date.now() - (this.latest.get(event.serverId) ?? 0) >= 30000
      ) {
        this.latest.set(event.serverId, Date.now());
        const work = this.sample(event.serverId, event.metric)
          .catch((error) => core.logger.write('Performance: ' + String(error), true))
          .finally(() => this.pending.delete(event.serverId));
        this.pending.set(event.serverId, work);
      }
    });
  }
  private async sample(id: string, metric: Metric) {
    const server = this.core.repo.server(id);
    let tick: { tps?: number; mspt?: number; maxMspt?: number } = {};
    if (['paper', 'purpur'].includes(server.engine) && server.status === 'running') {
      const responses = await Promise.allSettled([
        this.core.supervisor.command(id, 'tps'),
        this.core.supervisor.command(id, 'mspt'),
      ]);
      tick = parseTickMetrics(
        responses[0].status === 'fulfilled' ? responses[0].value : '',
        responses[1].status === 'fulfilled' ? responses[1].value : '',
      );
    }
    if (this.closed) return;
    this.core.repo.db
      .prepare('INSERT OR REPLACE INTO performance_samples VALUES(?,?,?,?,?,?,?,?)')
      .run(
        id,
        metric.at,
        metric.cpu,
        metric.memory,
        metric.players,
        tick.tps ?? null,
        tick.mspt ?? null,
        tick.maxMspt ?? null,
      );
    const before = new Date(Date.now() - 7 * 86400000).toISOString();
    this.core.repo.db.prepare('DELETE FROM performance_samples WHERE at<?').run(before);
    if ((tick.tps !== undefined && tick.tps < 18) || (tick.mspt !== undefined && tick.mspt > 50)) {
      const last = this.core.repo.db
        .prepare('SELECT at FROM lag_events WHERE server_id=? ORDER BY id DESC LIMIT 1')
        .get(id);
      if (!last || Date.now() - Date.parse(String(last.at)) >= 60000) {
        const event: LagEvent = {
          at: metric.at,
          tps: tick.tps,
          mspt: tick.mspt,
          logs: this.core.supervisor
            .logs(id)
            .slice(-20)
            .map((l) => l.text.slice(0, 4096)),
        };
        this.core.repo.db
          .prepare('INSERT INTO lag_events(server_id,at,metadata) VALUES(?,?,?)')
          .run(id, event.at, JSON.stringify(event));
        this.core.health.push(id, 'lag');
      }
    }
    this.core.repo.db.prepare('DELETE FROM lag_events WHERE at<?').run(before);
    this.core.repo.db
      .prepare(
        'DELETE FROM lag_events WHERE id IN (SELECT id FROM lag_events WHERE server_id=? ORDER BY id DESC LIMIT -1 OFFSET 200)',
      )
      .run(id);
  }
  report(id: string, rawHours: number): PerformanceReport {
    this.core.repo.server(id);
    const hours = z.number().int().min(1).max(168).parse(rawHours),
      since = new Date(Date.now() - hours * 3600000).toISOString(),
      bucket = Math.max(1, Math.ceil((hours * 3600) / 840));
    const rows = this.core.repo.db
      .prepare(
        'SELECT MIN(at) at,AVG(cpu) cpu,AVG(memory) memory,MAX(players) players,AVG(tps) tps,AVG(mspt) mspt,MAX(max_mspt) max_mspt FROM performance_samples WHERE server_id=? AND at>=? GROUP BY CAST(unixepoch(at)/? AS INTEGER) ORDER BY at',
      )
      .all(id, since, bucket);
    return {
      samples: rows.map((r) => ({
        at: String(r.at),
        cpu: Number(r.cpu),
        memory: Number(r.memory),
        players: Number(r.players),
        tps: r.tps === null ? undefined : Number(r.tps),
        mspt: r.mspt === null ? undefined : Number(r.mspt),
        maxMspt: r.max_mspt === null ? undefined : Number(r.max_mspt),
      })),
      lags: this.core.repo.db
        .prepare(
          'SELECT metadata FROM lag_events WHERE server_id=? AND at>=? ORDER BY id DESC LIMIT 200',
        )
        .all(id, since)
        .map((r) => JSON.parse(String(r.metadata)) as LagEvent),
    };
  }
  async close() {
    this.closed = true;
    this.off();
    await Promise.allSettled(this.pending.values());
  }
}
