import { it, expect, vi, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { PlayerService } from '../packages/core/players';
const uuid = '123e4567-e89b-12d3-a456-426614174000';
afterEach(() => vi.useRealTimers());
it('persists observed joins, local UUIDs and session time and never counts an application interruption as gameplay', async () => {
  const f = await fixture(),
    command = vi.fn(async () => 'sent'),
    service = new PlayerService(f.repo, command, () => true);
  vi.useFakeTimers({ toFake: ['Date'] });
  const start = Date.parse('2026-10-04T10:00:00Z');
  vi.setSystemTime(start);
  try {
    service.observeLog(f.server.id, `UUID of player Steve is ${uuid}`);
    service.observeLog(f.server.id, 'Steve joined the game');
    f.repo.saveServer({ ...f.server, players: ['Steve'] });
    service.observeLog(f.server.id, 'Steve joined the game');
    vi.setSystemTime(start + 60000);
    service.observeOnline(f.server.id, ['Steve']);
    vi.setSystemTime(start + 120000);
    service.observeLog(f.server.id, 'Steve left the game');
    f.repo.saveServer({ ...f.server, players: [] });
    let player = (await service.report(f.server.id)).players[0]!;
    expect(player).toMatchObject({
      name: 'Steve',
      uuid,
      joins: 1,
      observedMs: 120000,
      online: false,
      identityMode: 'online',
      identitySource: 'server log',
      firstSeen: '2026-10-04T10:00:00.000Z',
      lastSeen: '2026-10-04T10:02:00.000Z',
    });
    expect(player.pingMs).toBeUndefined();
    expect(player.minecraftPlaySeconds).toBeUndefined();
    vi.setSystemTime(start + 130000);
    service.observeOnline(f.server.id, ['Steve']);
    vi.setSystemTime(start + 150000);
    service.observeOnline(f.server.id, ['Steve']);
    vi.setSystemTime(start + 3600000);
    const recovered = new PlayerService(f.repo, command, () => false);
    recovered.endSessions(f.server.id, true);
    player = (await recovered.report(f.server.id)).players[0]!;
    expect(player.observedMs).toBe(140000);
    expect(player.joins).toBe(2);
    expect(player.sessionStartedAt).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
it('reads real operator, whitelist and ban lists plus Minecraft statistics and detects conflicting UUIDs without exposing banned IP addresses', async () => {
  const f = await fixture(),
    service = new PlayerService(
      f.repo,
      async () => 'sent',
      () => false,
    );
  try {
    await writeFile(
      path.join(f.server.path, 'usercache.json'),
      JSON.stringify([{ name: 'Steve', uuid }, { name: 'Unknown' }]),
    );
    await writeFile(
      path.join(f.server.path, 'whitelist.json'),
      JSON.stringify([{ name: 'Steve', uuid }]),
    );
    await writeFile(
      path.join(f.server.path, 'ops.json'),
      JSON.stringify([{ name: 'Steve', uuid, level: 4 }]),
    );
    await writeFile(
      path.join(f.server.path, 'banned-players.json'),
      JSON.stringify([
        {
          name: 'Alex',
          uuid: '123e4567-e89b-12d3-a456-426614174001',
          expires: 'forever',
          reason: 'Observed moderation',
        },
        { name: 'Expired', expires: '2000-01-01T00:00:00Z' },
      ]),
    );
    await writeFile(
      path.join(f.server.path, 'banned-ips.json'),
      JSON.stringify([{ ip: '203.0.113.45' }]),
    );
    await mkdir(path.join(f.server.path, 'world/stats'));
    await writeFile(
      path.join(f.server.path, 'world/stats', uuid + '.json'),
      JSON.stringify({ stats: { 'minecraft:custom': { 'minecraft:play_time': 144000 } } }),
    );
    const raw = await readFile(path.join(f.server.path, 'ops.json'));
    const report = await service.report(f.server.id);
    expect(report.players.find((player) => player.name === 'Steve')).toMatchObject({
      uuid,
      operator: true,
      operatorLevel: 4,
      whitelisted: true,
      minecraftPlaySeconds: 7200,
      joins: 0,
    });
    expect(report.players.find((player) => player.name === 'Unknown')?.uuid).toBeUndefined();
    expect(report.players.find((player) => player.name === 'Alex')?.banned).toBe(true);
    expect(report.players.find((player) => player.name === 'Expired')?.banned).toBe(false);
    expect(report.bannedIpCount).toBe(1);
    expect(JSON.stringify(report)).not.toContain('203.0.113.45');
    expect(await readFile(path.join(f.server.path, 'ops.json'))).toEqual(raw);
    await writeFile(
      path.join(f.server.path, 'ops.json'),
      JSON.stringify([{ name: 'Steve', uuid: '123e4567-e89b-12d3-a456-426614174002' }]),
    );
    const conflicting = await service.report(f.server.id);
    expect(conflicting.players.find((player) => player.name === 'Steve')).toMatchObject({
      identityConflict: true,
    });
    expect(conflicting.players.find((player) => player.name === 'Steve')?.uuid).toBeUndefined();
    expect(conflicting.warnings).toContain('Conflicting local identities for player: Steve');
    await writeFile(path.join(f.server.path, 'banned-ips.json'), 'not JSON');
    expect((await service.report(f.server.id)).bannedIpCount).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
it('labels offline identities from local data, preserves legacy connection dates and does not invent account UUIDs', async () => {
  const f = await fixture(),
    service = new PlayerService(
      f.repo,
      async () => 'sent',
      () => false,
    );
  try {
    f.repo.saveServer({ ...f.server, onlineMode: false });
    f.repo.db
      .prepare('INSERT INTO player_history VALUES(?,?,?,?)')
      .run(f.server.id, 'Steve', '2020-01-01T00:00:00Z', '2021-01-01T00:00:00Z');
    await writeFile(
      path.join(f.server.path, 'usercache.json'),
      JSON.stringify([{ name: 'Steve', uuid }]),
    );
    service.observeOnline(f.server.id, ['Steve']);
    service.endSessions(f.server.id);
    const player = (await service.report(f.server.id)).players[0]!;
    expect(player.identityMode).toBe('offline');
    expect(player.uuid).toBe(uuid);
    expect(player.firstSeen).toBe('2020-01-01T00:00:00.000Z');
    expect(player.pingMs).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
it('reads Bedrock XUID permissions and PocketMine text lists using their actual formats', async () => {
  const f = await fixture(),
    service = new PlayerService(
      f.repo,
      async () => 'sent',
      () => true,
    );
  try {
    f.repo.saveServer({ ...f.server, engine: 'bedrock' });
    service.observeLog(f.server.id, 'Player connected: Bedrock Name, xuid: 123456');
    await writeFile(
      path.join(f.server.path, 'allowlist.json'),
      JSON.stringify([{ name: 'Bedrock Name', xuid: '123456' }]),
    );
    await writeFile(
      path.join(f.server.path, 'permissions.json'),
      JSON.stringify([
        { xuid: '123456', permission: 'operator' },
        { xuid: '987654', permission: 'operator' },
      ]),
    );
    const bedrock = await service.report(f.server.id);
    expect(bedrock.players.find((player) => player.name === 'Bedrock Name')).toMatchObject({
      xuid: '123456',
      whitelisted: true,
      operator: true,
    });
    expect(bedrock.players.find((player) => player.xuid === '987654')).toMatchObject({
      name: 'XUID:987654',
      operator: true,
    });
    expect(bedrock.actions).not.toContain('ban');
    f.repo.saveServer({ ...f.server, engine: 'pocketmine' });
    await writeFile(path.join(f.server.path, 'ops.txt'), '# operators\nPocketPlayer\n');
    await writeFile(path.join(f.server.path, 'white-list.txt'), 'PocketPlayer\n');
    await writeFile(
      path.join(f.server.path, 'banned-players.txt'),
      '# victim|created|source|expiration|reason\nBannedPlayer|2026-01-01 10:00:00 +0000|console|Forever|test ban\nExpiredPlayer|2020-01-01 10:00:00 +0000|console|2021-01-01 10:00:00 +0000|expired\n',
    );
    const pocketmine = await service.report(f.server.id);
    expect(pocketmine.players.find((player) => player.name === 'PocketPlayer')).toMatchObject({
      operator: true,
      whitelisted: true,
    });
    expect(pocketmine.players.find((player) => player.name === 'BannedPlayer')).toMatchObject({
      banned: true,
      banReason: 'test ban',
    });
    expect(pocketmine.players.find((player) => player.name === 'ExpiredPlayer')?.banned).toBe(
      false,
    );
  } finally {
    await f.cleanup();
  }
});
it('sends only validated and explicitly confirmed moderation commands with engine-specific names and no invented success status', async () => {
  const f = await fixture(),
    command = vi.fn(async () => 'Command sent. See the console for its response.'),
    service = new PlayerService(f.repo, command, () => true);
  try {
    await service.moderate(f.server.id, {
      action: 'whitelistRemove',
      name: 'Steve',
      confirmation: 'Steve',
    });
    expect(command).toHaveBeenLastCalledWith(f.server.id, 'whitelist remove Steve');
    await expect(
      service.moderate(f.server.id, { action: 'op', name: 'Steve', confirmation: 'wrong' }),
    ).rejects.toThrow('exact');
    for (const name of ['@a', 'Steve\nstop', 'Steve;stop', '"Name"'])
      await expect(
        service.moderate(f.server.id, { action: 'ban', name, confirmation: name }),
      ).rejects.toThrow();
    f.repo.saveServer({ ...f.server, engine: 'bedrock' });
    const response = await service.moderate(f.server.id, {
      action: 'whitelistAdd',
      name: 'Bedrock Name',
      confirmation: 'Bedrock Name',
    });
    expect(command).toHaveBeenLastCalledWith(f.server.id, 'allowlist add "Bedrock Name"');
    expect(response).toContain('See the console');
    await expect(
      service.moderate(f.server.id, {
        action: 'ban',
        name: 'Bedrock Name',
        confirmation: 'Bedrock Name',
      }),
    ).rejects.toThrow('does not provide');
    expect(
      f.repo.activity().some((event) => event.action === 'player.whitelistAdd.requested'),
    ).toBe(true);
  } finally {
    await f.cleanup();
  }
});
