import { randomUUID } from 'node:crypto';
import { Repository } from '../database/database';
import { readableError } from '../domain/errors';
import { scheduleSchema, type Schedule, type ScheduleInput } from '../domain/types';
export function nextExecution(intervalMinutes: number, from = Date.now()): string {
  return new Date(from + intervalMinutes * 60000).toISOString();
}
export class SchedulerService {
  private readonly timer: NodeJS.Timeout;
  private running: Promise<void> | undefined;
  constructor(
    private readonly repo: Repository,
    private readonly execute: (job: Schedule) => Promise<void>,
  ) {
    this.timer = setInterval(() => {
      if (!this.running) {
        this.running = this.tick().finally(() => {
          this.running = undefined;
        });
        void this.running.catch((e) => console.error('Scheduler:', e));
      }
    }, 15000);
    this.timer.unref();
  }
  add(input: ScheduleInput): Schedule {
    const value = scheduleSchema.parse(input);
    this.repo.server(value.serverId);
    const job: Schedule = {
      ...value,
      id: randomUUID(),
      nextRun: nextExecution(value.intervalMinutes),
    };
    this.repo.saveSchedule(job);
    this.repo.audit('schedule.created', `${job.action} / ${job.intervalMinutes} min`, job.serverId);
    return job;
  }
  async tick(now = Date.now()): Promise<void> {
    for (const job of this.repo.schedules()) {
      if (!job.enabled || Date.parse(job.nextRun) > now) continue;
      // Advance before execution: a crash must not replay a destructive command forever.
      job.nextRun = nextExecution(job.intervalMinutes, now);
      job.lastError = undefined;
      this.repo.saveSchedule(job);
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
