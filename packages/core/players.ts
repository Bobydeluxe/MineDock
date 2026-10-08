import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Repository } from '../database/database';
import { containedPath } from '../security/paths';
import { engineDefinition } from '../domain/engines';
import { parseProperties } from '../domain/properties';
import { DomainError } from '../domain/errors';
import {
  moderatePlayerSchema,
  moderationActions,
  type ModeratePlayerInput,
  type PlayerObservation,
  type KnownPlayer,
  type PlayerReport,
  type PlayerDetails,
} from '../domain/players';
const validUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value) &&
  value !== '00000000-0000-0000-0000-000000000000';
const validXuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[1-9]\d{0,19}$/.test(value) &&
  BigInt(value) <= 18446744073709551615n;
const validName = (name: unknown): name is string =>
  typeof name === 'string' && /^[A-Za-z\d_. -]{1,32}$/.test(name) && name.trim() === name;
const mode = (engine: Parameters<typeof engineDefinition>[0], online: boolean) =>
  engineDefinition(engine).edition === 'bedrock'
    ? ('bedrock' as const)
    : online
      ? ('online' as const)
      : ('offline' as const);
const isoDate = (value: unknown): string | undefined =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : undefined;
export class PlayerService {
  constructor(
    private readonly repo: Repository,
    private readonly command: (id: string, command: string) => Promise<string>,
    private readonly running: (id: string) => boolean,
  ) {}
  observations(id: string): PlayerObservation[] {
    return this.repo.db
      .prepare('SELECT metadata FROM player_observations WHERE server_id=?')
      .all(id)
      .map((row) => JSON.parse(String(row.metadata)) as PlayerObservation);
  }
  private save(id: string, player: PlayerObservation): void {
    this.repo.db
      .prepare(
        'INSERT INTO player_observations VALUES(?,?,?) ON CONFLICT(server_id,name) DO UPDATE SET metadata=excluded.metadata',
      )
      .run(id, player.name.toLowerCase(), JSON.stringify(player));
    if (player.sessionStartedAt && player.lastObservedAt && player.sessionId)
      this.repo.db
        .prepare(
          'INSERT INTO player_sessions VALUES(?,?,?,?,?,NULL,0) ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at',
        )
        .run(
          player.sessionId,
          id,
          player.name.toLowerCase(),
          player.sessionStartedAt,
          player.lastObservedAt,
        );
  }
  private get(id: string, name: string): PlayerObservation {
    const row = this.repo.db
      .prepare('SELECT metadata FROM player_observations WHERE server_id=? AND name=?')
      .get(id, name.toLowerCase());
    if (row) return JSON.parse(String(row.metadata)) as PlayerObservation;
    const legacy = this.repo.db
      .prepare(
        'SELECT MIN(first_seen) AS first_seen,MAX(last_seen) AS last_seen FROM player_history WHERE server_id=? AND LOWER(name)=LOWER(?)',
      )
      .get(id, name);
    return {
      name,
      joins: 0,
      observedMs: 0,
      firstSeen: isoDate(legacy?.first_seen),
      lastSeen: isoDate(legacy?.last_seen),
    };
  }
  private advance(player: PlayerObservation, at: string): void {
    if (player.sessionStartedAt && player.lastObservedAt)
      player.observedMs += Math.max(0, Date.parse(at) - Date.parse(player.lastObservedAt));
    player.lastObservedAt = at;
    player.lastSeen = at;
  }
  observeOnline(id: string, names: string[], at = new Date().toISOString()): void {
    const incoming = new Set(names.filter(validName).map((name) => name.toLowerCase()));
    for (const player of this.observations(id))
      if (player.sessionStartedAt && !incoming.has(player.name.toLowerCase()))
        this.leave(id, player.name, at);
    for (const name of names.filter(validName)) {
      const player = this.get(id, name);
      player.name = name;
      if (!player.sessionStartedAt) {
        player.joins++;
        player.sessionStartedAt = at;
        player.sessionId = randomUUID();
        player.firstSeen ??= at;
        player.lastObservedAt = at;
      }
      this.advance(player, at);
      this.save(id, player);
      this.repo.seenPlayer(id, name);
    }
  }
  leave(id: string, name: string, at = new Date().toISOString()): void {
    const player = this.get(id, name);
    if (!player.sessionStartedAt) return;
    this.advance(player, at);
    if (player.sessionId)
      this.repo.db
        .prepare('UPDATE player_sessions SET last_at=?,ended_at=? WHERE id=?')
        .run(at, at, player.sessionId);
    player.sessionStartedAt = undefined;
    player.sessionId = undefined;
    this.save(id, player);
  }
  endSessions(id: string, interrupted = false): void {
    if (interrupted)
      this.repo.db
        .prepare('UPDATE player_sessions SET interrupted=1 WHERE server_id=? AND ended_at IS NULL')
        .run(id);
    for (const player of this.observations(id))
      if (player.sessionStartedAt)
        this.leave(
          id,
          player.name,
          interrupted
            ? (player.lastObservedAt ?? player.sessionStartedAt)
            : new Date().toISOString(),
        );
  }
  details(id: string, rawName: string): PlayerDetails {
    this.repo.server(id);
    const name = z
      .string()
      .regex(/^[A-Za-z\d_. -]{1,32}$/)
      .parse(rawName)
      .toLowerCase();
    const since = new Date(Date.now() - 180 * 86400000).toISOString();
    this.repo.db
      .prepare(
        'DELETE FROM player_sessions WHERE server_id=? AND ended_at IS NOT NULL AND ended_at<?',
      )
      .run(id, since);
    this.repo.db
      .prepare(
        'DELETE FROM player_sessions WHERE id IN (SELECT id FROM player_sessions WHERE server_id=? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT -1 OFFSET 20000)',
      )
      .run(id);
    const rows = this.repo.db
      .prepare(
        'SELECT * FROM player_sessions WHERE server_id=? AND name=? ORDER BY started_at DESC LIMIT 200',
      )
      .all(id, name);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const sum = (from: number) =>
      Number(
        this.repo.db
          .prepare(
            'SELECT COALESCE(SUM(MAX(0,unixepoch(last_at)*1000-MAX(unixepoch(started_at)*1000,?))),0) total FROM player_sessions WHERE server_id=? AND name=? AND last_at>=?',
          )
          .get(from, id, name, new Date(from).toISOString())?.total ?? 0,
      );
    return {
      note: String(
        this.repo.db
          .prepare('SELECT note FROM player_notes WHERE server_id=? AND name=?')
          .get(id, name)?.note ?? '',
      ),
      sessions: rows.map((r) => ({
        id: String(r.id),
        startedAt: String(r.started_at),
        lastAt: String(r.last_at),
        endedAt: r.ended_at ? String(r.ended_at) : undefined,
        interrupted: !!r.interrupted,
      })),
      observedMs: {
        today: sum(midnight.getTime()),
        week: sum(Date.now() - 7 * 86400000),
        month: sum(Date.now() - 30 * 86400000),
      },
    };
  }
  note(id: string, rawName: string, rawNote: string) {
    this.repo.server(id);
    const name = z
        .string()
        .regex(/^[A-Za-z\d_. -]{1,32}$/)
        .parse(rawName)
        .toLowerCase(),
      note = z.string().max(4000).parse(rawNote);
    this.repo.db
      .prepare(
        'INSERT INTO player_notes VALUES(?,?,?) ON CONFLICT(server_id,name) DO UPDATE SET note=excluded.note',
      )
      .run(id, name, note);
  }
  observeLog(id: string, line: string): void {
    const identity = /UUID of player ([A-Za-z\d_.]{1,32}) is ([a-f\d-]{36})/i.exec(line);
    if (identity && validUuid(identity[2])) {
      const player = this.get(id, identity[1]!),
        server = this.repo.server(id);
      player.uuid = identity[2]!.toLowerCase();
      player.identitySource = 'server log';
      player.identityMode = mode(server.engine, server.onlineMode);
      this.save(id, player);
    }
    const connected = /Player connected: (.{1,32}?), xuid:\s*(\d{1,20})(?:\b|$)/.exec(line);
    const joined =
      connected?.[1] ?? /(?:^|[\s:])([A-Za-z\d_.]{1,32}) joined the game/.exec(line)?.[1];
    const left =
      /Player disconnected: (.{1,32}?), xuid:/.exec(line)?.[1] ??
      /(?:^|[\s:])([A-Za-z\d_.]{1,32}) left the game/.exec(line)?.[1];
    if (joined && validName(joined)) {
      const server = this.repo.server(id);
      this.observeOnline(id, [...new Set([...server.players, joined])]);
      if (connected && validXuid(connected[2])) {
        const player = this.get(id, joined);
        player.xuid = connected[2];
        player.identitySource = 'server log';
        player.identityMode = 'bedrock';
        this.save(id, player);
      }
    }
    if (left && validName(left)) this.leave(id, left);
  }
  private async localText(root: string, relative: string): Promise<string | undefined> {
    try {
      const file = await containedPath(root, relative),
        info = await lstat(file);
      if (!info.isFile() || info.size > 2 * 1024 ** 2)
        throw new DomainError('PLAYERS', 'A player data file is invalid or exceeds 2 MB.');
      return readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async report(id: string): Promise<PlayerReport> {
    const server = this.repo.server(id),
      definition = engineDefinition(server.engine),
      identityMode = mode(server.engine, server.onlineMode);
    const report: PlayerReport = {
      players: [],
      actions:
        server.engine === 'bedrock'
          ? ['whitelistAdd', 'whitelistRemove', 'op', 'deop', 'kick']
          : [...moderationActions],
      warnings: [],
    };
    const known = new Map<string, KnownPlayer>();
    const add = (name: string): KnownPlayer => {
      const key = name.toLowerCase();
      let player = known.get(key);
      if (!player) {
        player = {
          ...this.get(id, name),
          online: server.players.some((online) => online.toLowerCase() === key),
          operator: false,
          whitelisted: false,
          banned: false,
        };
        known.set(key, player);
      }
      return player;
    };
    for (const player of this.observations(id)) {
      const entry = add(player.name);
      if (player.sessionStartedAt && player.lastObservedAt && entry.online)
        entry.observedMs += Math.max(0, Date.now() - Date.parse(player.lastObservedAt));
    }
    for (const row of this.repo.db
      .prepare('SELECT name,first_seen,last_seen FROM player_history WHERE server_id=?')
      .all(id)) {
      if (!validName(row.name)) continue;
      const player = add(row.name);
      player.firstSeen ??= isoDate(row.first_seen);
      player.lastSeen ??= isoDate(row.last_seen);
    }
    server.players.filter(validName).forEach(add);
    const identities = new Map<string, Set<string>>();
    const identity = (player: KnownPlayer, uuid: unknown, source: string) => {
      if (!validUuid(uuid)) return;
      const key = player.name.toLowerCase(),
        candidates = identities.get(key) ?? new Set<string>();
      if (player.uuid && player.identityMode === identityMode) candidates.add(player.uuid);
      candidates.add(uuid.toLowerCase());
      identities.set(key, candidates);
      if (candidates.size > 1) {
        player.uuid = undefined;
        player.identityConflict = true;
      } else {
        player.uuid = uuid.toLowerCase();
        player.identitySource = source;
        player.identityMode = identityMode;
      }
    };
    const failedLists = new Set<string>();
    const jsonList = async (file: string): Promise<Record<string, unknown>[]> => {
      try {
        const text = await this.localText(server.path, file);
        if (text === undefined) return [];
        const data: unknown = JSON.parse(text);
        if (!Array.isArray(data) || data.length > 20000) throw new Error();
        return data.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object' && !Array.isArray(item),
        );
      } catch {
        failedLists.add(file);
        report.warnings.push('Unable to read player list: ' + file);
        return [];
      }
    };
    if (definition.edition === 'java') {
      for (const file of ['usercache.json', 'whitelist.json', 'ops.json', 'banned-players.json'])
        for (const item of await jsonList(file)) {
          if (!validName(item.name)) continue;
          const player = add(item.name);
          identity(player, item.uuid, file);
          if (file === 'whitelist.json') player.whitelisted = true;
          if (file === 'ops.json') {
            player.operator = true;
            if (typeof item.level === 'number') player.operatorLevel = item.level;
          }
          if (file === 'banned-players.json') {
            const expires = isoDate(item.expires);
            player.banned = !expires || Date.parse(expires) > Date.now();
            player.banExpires = expires;
            if (typeof item.reason === 'string') player.banReason = item.reason.slice(0, 200);
          }
        }
      const ipBans = await jsonList('banned-ips.json');
      report.bannedIpCount = failedLists.has('banned-ips.json') ? undefined : ipBans.length;
      let world = 'world';
      try {
        world =
          parseProperties((await this.localText(server.path, 'server.properties')) ?? '')[
            'level-name'
          ] ?? 'world';
      } catch {
        report.warnings.push('Unable to read the active world for player statistics.');
      }
      for (const player of known.values())
        if (player.uuid && !player.identityConflict) {
          try {
            const text = await this.localText(
              server.path,
              path.join(world, 'stats', player.uuid + '.json'),
            );
            if (!text) continue;
            const statistics = JSON.parse(text) as {
                stats?: { 'minecraft:custom'?: Record<string, unknown> };
              },
              custom = statistics.stats?.['minecraft:custom'];
            const ticks = custom?.['minecraft:play_time'] ?? custom?.['minecraft:play_one_minute'];
            if (typeof ticks === 'number' && Number.isSafeInteger(ticks) && ticks >= 0)
              player.minecraftPlaySeconds = ticks / 20;
          } catch {
            report.warnings.push('Unable to read Minecraft statistics for player: ' + player.name);
          }
        }
    } else if (server.engine === 'bedrock') {
      for (const item of await jsonList('allowlist.json'))
        if (validName(item.name)) {
          const player = add(item.name);
          player.whitelisted = true;
          if (validXuid(item.xuid)) {
            player.xuid = item.xuid;
            player.identitySource = 'allowlist.json';
            player.identityMode = 'bedrock';
          }
        }
      for (const item of await jsonList('permissions.json'))
        if (validXuid(item.xuid)) {
          const player =
            [...known.values()].find((entry) => entry.xuid === item.xuid) ??
            add('XUID:' + item.xuid);
          player.xuid = item.xuid;
          player.identitySource = 'permissions.json';
          player.identityMode = 'bedrock';
          if (['operator', 'member', 'visitor'].includes(String(item.permission))) {
            player.permission = String(item.permission);
            player.operator = item.permission === 'operator';
          }
        }
    } else {
      for (const file of ['ops.txt', 'white-list.txt', 'banned-players.txt', 'banned-ips.txt']) {
        try {
          const text = await this.localText(server.path, file),
            lines = (text ?? '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter((line) => line && !line.startsWith('#'));
          if (file === 'banned-ips.txt') {
            report.bannedIpCount = lines.length;
            continue;
          }
          for (const line of lines) {
            const [name, , , expiration, reason] = line.split('|');
            if (!validName(name)) continue;
            const player = add(name);
            if (file === 'ops.txt') player.operator = true;
            if (file === 'white-list.txt') player.whitelisted = true;
            if (file === 'banned-players.txt') {
              const expires = isoDate(expiration);
              player.banned = !expires || Date.parse(expires) > Date.now();
              player.banExpires = expires;
              player.banReason = reason?.slice(0, 200);
            }
          }
        } catch {
          report.warnings.push('Unable to read player list: ' + file);
        }
      }
    }
    for (const player of known.values()) {
      const stored = this.get(id, player.name);
      if (player.identityConflict) {
        stored.uuid = undefined;
        report.warnings.push('Conflicting local identities for player: ' + player.name);
      } else if (player.uuid) {
        stored.uuid = player.uuid;
        stored.identityMode = player.identityMode;
        stored.identitySource = player.identitySource;
      }
      if (player.xuid) {
        stored.xuid = player.xuid;
        stored.identityMode = 'bedrock';
        stored.identitySource = player.identitySource;
      }
      this.save(id, stored);
    }
    report.players = [...known.values()].sort(
      (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name),
    );
    return report;
  }
  async moderate(id: string, raw: ModeratePlayerInput): Promise<string> {
    const input = moderatePlayerSchema.parse(raw),
      server = this.repo.server(id);
    if (!this.running(id))
      throw new DomainError('RUNNING', 'Start the server before sending moderation commands.');
    if (input.confirmation !== input.name)
      throw new DomainError('CONFIRM', 'Confirm the exact player name.');
    if (
      !validName(input.name) ||
      (engineDefinition(server.engine).edition === 'java' &&
        !/^[A-Za-z\d_.]{1,32}$/.test(input.name)) ||
      /[\r\n\0]/.test(input.reason ?? '')
    )
      throw new DomainError('COMMAND', 'Invalid player name or moderation reason.');
    if (server.engine === 'bedrock' && ['ban', 'pardon'].includes(input.action))
      throw new DomainError(
        'CAPABILITY',
        'This engine does not provide a persistent player ban command.',
      );
    const action =
      input.action === 'whitelistAdd'
        ? server.engine === 'bedrock'
          ? 'allowlist add'
          : 'whitelist add'
        : input.action === 'whitelistRemove'
          ? server.engine === 'bedrock'
            ? 'allowlist remove'
            : 'whitelist remove'
          : input.action;
    const name =
      engineDefinition(server.engine).edition === 'bedrock' ? '"' + input.name + '"' : input.name;
    const reason = ['ban', 'kick'].includes(input.action) && input.reason ? ' ' + input.reason : '';
    const response = await this.command(id, action + ' ' + name + reason);
    this.repo.audit('player.' + input.action + '.requested', input.name, id);
    return response;
  }
}
