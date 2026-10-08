import { expect, it } from 'vitest';
import { fixture } from './helpers';
import { PlayerService } from '../packages/core/players';
it('records sessions and statistics, keeps notes local and closes interrupted sessions at the last observation', async () => {
  const f = await fixture(),
    players = new PlayerService(
      f.repo,
      async () => '',
      () => false,
    );
  try {
    const start = new Date(Date.now() - 10000).toISOString(),
      last = new Date(Date.now() - 5000).toISOString();
    players.observeOnline(f.server.id, ['Alex'], start);
    players.observeOnline(f.server.id, ['Alex'], last);
    players.endSessions(f.server.id, true);
    players.note(f.server.id, 'Alex', 'Private reminder');
    const detail = players.details(f.server.id, 'Alex');
    expect(detail.sessions).toHaveLength(1);
    expect(detail.sessions[0]?.endedAt).toBe(last);
    expect(detail.sessions[0]?.interrupted).toBe(true);
    expect(detail.observedMs.week).toBe(5000);
    expect(detail.note).toBe('Private reminder');
    expect(() => players.note(f.server.id, '../Alex', 'x')).toThrow();
    expect(() => players.note(f.server.id, 'Alex', 'x'.repeat(4001))).toThrow();
  } finally {
    await f.cleanup();
  }
});
