import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { Repository } from '../database/database';
import { DomainError, readableError } from '../domain/errors';
import { scheduleSchema, type Schedule, type ScheduleInput } from '../domain/types';
export function nextExecution(intervalMinutes: number, from = Date.now()): string {
  return new Date(from + intervalMinutes * 60000).toISOString();
}
export function scheduleDates(input: ScheduleInput, from = Date.now(), count = 5): string[] {
  const mode = input.mode ?? 'interval';
  if (mode === 'interval')
    return Array.from({ length: count }, (_, i) =>
      nextExecution(input.intervalMinutes * (i + 1), from),
    );
  const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new DomainError('TIMEZONE', 'Invalid timezone.');
  }
  let expression = input.cron ?? '';
  if (mode === 'daily') {
    if (!input.time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time))
      throw new DomainError('SCHEDULE', 'Choose a valid daily time.');
    const [hour, minute] = input.time.split(':').map(Number);
    expression = `${minute} ${hour} * * *`;
  }
  if (expression.trim().split(/\s+/).length !== 5 || /\bH/.test(expression))
    throw new DomainError(
      'CRON',
      'Enter a cron expression with five fields (minute, hour, day, month, weekday).',
    );
  try {
    return CronExpressionParser.parse(expression, { currentDate: from, tz: timezone })
      .take(count)
      .map((date) => date.toISOString()!);
  } catch {
    throw new DomainError('CRON', 'Invalid cron expression.');
  }
}
export class SchedulerService {
  private readonly timer: NodeJS.Timeout;
  private running: Promise<void> | undefined;
  constructor(
    private readonly repo: Repository,
    private readonly execute: (job: Schedule) => Promise<void>,
    private readonly warn?: (job: Schedule, seconds: number) => Promise<void>,
  ) {
    this.timer = setInterval(() => {
      if (!this.running) {
        this.running = this.tick().finally(() => {
          this.running = undefined;
        });
        void this.running.catch((e) => console.error('Scheduler:', e));
      }
    }, 1000);
    this.timer.unref();
  }
  add(input: ScheduleInput): Schedule {
    const value = scheduleSchema.parse(input);
    this.repo.server(value.serverId);
    const job: Schedule = {
      ...value,
      id: randomUUID(),
      nextRun: scheduleDates(value, Date.now(), 1)[0]!,
      timezone: value.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      warningsSent: [],
    };
    this.repo.saveSchedule(job);
    this.repo.audit('schedule.created', `${job.action} / ${job.intervalMinutes} min`, job.serverId);
    return job;
  }
  preview(input: ScheduleInput): string[] {
    return scheduleDates(scheduleSchema.parse(input));
  }
  toggle(id: string, enabled: boolean): void {
    const job = this.repo.schedules().find((job) => job.id === id);
    if (!job) throw new DomainError('SCHEDULE', 'Scheduled task not found.');
    job.enabled = enabled;
    job.warningsSent = [];
    if (enabled) job.nextRun = scheduleDates(job, Date.now(), 1)[0]!;
    this.repo.saveSchedule(job);
    this.repo.audit(enabled ? 'schedule.resumed' : 'schedule.paused', job.action, job.serverId);
  }
  async tick(now = Date.now()): Promise<void> {
    for (const job of this.repo.schedules()) {
      if (!job.enabled) continue;
      const due = Date.parse(job.nextRun);
      if (!Number.isFinite(due)) continue;
      if (due > now) {
        if (job.action !== 'restart' || !this.warn) continue;
        for (const seconds of [...new Set(job.warnings ?? [10])].sort((a, b) => b - a)) {
          const key = `${job.nextRun}:${seconds}`;
          const at = due - seconds * 1000;
          // Late startup and suspension must not replay warnings whose deadlines passed.
          if (now < at || now - at > 1500 || job.warningsSent?.includes(key)) continue;
          job.warningsSent = [...(job.warningsSent ?? []), key];
          this.repo.saveSchedule(job);
          if (!this.repo.schedules().find((value) => value.id === job.id)?.enabled) break;
          try {
            await this.warn(job, seconds);
          } catch (error) {
            this.repo.audit('schedule.warning_failed', readableError(error), job.serverId, false);
          }
        }
        continue;
      }
      // Advance before execution: a crash must not replay a destructive command forever.
      job.nextRun = scheduleDates(job, now, 1)[0]!;
      job.warningsSent = [];
      job.lastError = undefined;
      this.repo.saveSchedule(job);
      if (!this.repo.schedules().find((value) => value.id === job.id)?.enabled) continue;
      try {
        await this.execute(job);
        this.repo.audit('schedule.completed', job.action, job.serverId);
      } catch (e) {
        job.lastError = readableError(e);
        this.repo.saveSchedule(job);
        this.repo.audit('schedule.failed', `${job.action}: ${job.lastError}`, job.serverId, false);
      }
    }
  }
  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }
}
