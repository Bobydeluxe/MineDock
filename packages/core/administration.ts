import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { AppCore } from './app';
import { DomainError } from '../domain/errors';
import { engineDefinition } from '../domain/engines';
import {
  administrationCapabilities,
  buildPlayerCommand,
  buildWorldCommands,
  gameRules,
  nativeCommand,
  worldActions,
} from '../domain/admin-commands';
import {
  playerActionInputSchema,
  playerBatchSchema,
  worldControlSchema,
  ipActionSchema,
  type PlayerActionInput,
  type PlayerBatchInput,
  type PlayerActionResult,
  type CommandResult,
  type AdminEvent,
  type WorldControl,
  type WorldControlsState,
  type ItemCatalog,
  type IpAction,
} from '../domain/administration';
import type { Server } from '../domain/types';
const groupActions = new Set([
  'message',
  'teleport',
  'gamemode',
  'give',
  'effect',
  'effectClear',
  'whitelistAdd',
  'whitelistRemove',
  'kick',
]);
const offlineActions = new Set(['ban', 'pardon', 'op', 'deop', 'whitelistAdd', 'whitelistRemove']);
const dangerousWorld = new Set([
  'worldborder',
  'worldspawn',
  'summon',
  'setblock',
  'tick',
  'reload',
  'team',
  'scoreboard',
]);
const negativeResponse =
  /unknown (?:or incomplete )?command|unknown (?:item|entity|block|biome|effect|structure)|incorrect argument|invalid |syntax error|no (?:player|entit(?:y|ies)|item|targets)|not found|could not|cannot |failed|does not exist|permission|not allowed|nothing changed|no items were found/i;
export function commandResult(action: string, response: string): CommandResult {
  const at = new Date().toISOString(),
    text = response.trim().slice(0, 32768);
  if (response === 'Command sent. See the console for its response.')
    return { state: 'sent', response: text, at };
  if (negativeResponse.test(response)) return { state: 'failed', response: text, at };
  if (action === 'reload' && text === 'Reloading!') return { state: 'sent', response: text, at };
  const confirmed: Record<string, RegExp> = {
    give: /^Gave \d+|^Given /,
    clear: /^Removed \d+|^Cleared (?:the inventory|\d+)/,
    replace: /^Replaced (?:a slot|slot|\d+)/,
    teleport: /^Teleported /,
    gamemode: /^Set .* game mode to |^Set game mode /,
    kick: /^Kicked /,
    ban: /^Banned /,
    pardon: /^Unbanned |^Pardoned /,
    op: /^Made .* a server operator/,
    deop: /^Made .* no longer a server operator/,
    whitelistAdd: /^Added .* to the (?:white|allow)list/,
    whitelistRemove: /^Removed .* from the (?:white|allow)list/,
    effect: /^Applied effect /,
    effectClear: /^Removed (?:effect|all effects)/,
    experience: /^Added .* (?:experience|levels)|^Given /,
    spawnpoint: /^Set spawn point /,
    title: /^Showing new (?:title|subtitle|actionbar)/,
    kill: /^Killed /,
    time: /^Set the time to |^Set time /,
    weather: /^Set the weather to /,
    difficulty: /^(?:Set the difficulty to |The difficulty has been set to )/,
    gamerule: /^Gamerule .* is now set to: |^Game rule .* has been updated/,
    worldborder: /^Set (?:the world border|world border|the center of the world border)/,
    worldspawn: /^Set the world spawn /,
    summon: /^Summoned new /,
    setblock: /^Changed the block /,
    seed: /^Seed: \[-?\d+\]$/,
    list: /^There are \d+ of a max of \d+ players online:/,
    tick: /^(?:Set the target tick rate to \d+(?:\.\d+)? per second|The game is (?:frozen|running normally))$/,
  };
  return {
    state: confirmed[action]?.test(text) ? 'confirmed' : 'unverifiable',
    response: text || 'No verifiable server response was received.',
    at,
  };
}
export class AdministrationService {
  private readonly discovery = new Map<
    string,
    { key: string; expires: number; unsupported: Set<string> }
  >();
  constructor(private readonly core: AppCore) {}
  private root(server: Server, action: string): string {
    return (
      (
        {
          message: 'msg',
          teleport: 'tp',
          replace: /^(?:1\.(?:1[3-6]))(?:\.|$)/.test(server.minecraftVersion ?? server.version)
            ? 'replaceitem'
            : 'item',
          effectClear: 'effect',
          whitelistAdd: 'whitelist',
          whitelistRemove: 'whitelist',
          save: 'save-all',
          worldspawn: 'setworldspawn',
          announce: 'say',
        } as Record<string, string>
      )[action] ?? action
    );
  }
  private async discover(id: string): Promise<Set<string>> {
    const server = this.core.repo.server(id);
    if (
      !this.core.supervisor.isRunning(id) ||
      server.status !== 'running' ||
      !engineDefinition(server.engine).capabilities.rcon
    )
      return new Set();
    const key = `${server.pid}/${server.startedAt}/${server.engine}/${server.version}`,
      cached = this.discovery.get(id);
    if (cached?.key === key && cached.expires > Date.now()) return cached.unsupported;
    const unsupported = new Set<string>();
    try {
      // First prove that native help itself supplies usage, then trust only explicit absence.
      const list = nativeCommand(server, 'list');
      const help = await this.core.supervisor.command(id, nativeCommand(server, 'help ' + list));
      if (new RegExp('^/?' + list + '(?:\\s|$)').test(help.trim())) {
        const roots = new Set(
          [...administrationCapabilities(server).actions, ...worldActions(server), 'data'].map(
            (action) => this.root(server, action),
          ),
        );
        for (const root of roots) {
          const reply = await this.core.supervisor.command(
            id,
            nativeCommand(server, 'help ' + nativeCommand(server, root)),
          );
          if (
            /^(?:Unknown (?:or incomplete )?command|No commands found)(?:[.!\s]|$)/i.test(
              reply.trim(),
            )
          )
            unsupported.add(root);
        }
      }
    } catch {
      /* Unreadable help cannot establish absence; execution still requires a real response. */
    }
    this.discovery.set(id, { key, expires: Date.now() + 30000, unsupported });
    if (this.discovery.size > 100) this.discovery.delete(this.discovery.keys().next().value!);
    return unsupported;
  }
  async capabilities(id: string) {
    const server = this.core.repo.server(id),
      capabilities = administrationCapabilities(server),
      unsupported = await this.discover(id);
    capabilities.actions = capabilities.actions.filter(
      (action) => !unsupported.has(this.root(server, action)),
    );
    capabilities.nativeReads &&= !unsupported.has('data');
    return capabilities;
  }
  history(id: string, name?: string): AdminEvent[] {
    this.core.repo.server(id);
    const rows = name
      ? this.core.repo.db
          .prepare(
            'SELECT metadata FROM administration_events WHERE server_id=? AND name=? ORDER BY at DESC LIMIT 200',
          )
          .all(id, name.toLowerCase())
      : this.core.repo.db
          .prepare(
            'SELECT metadata FROM administration_events WHERE server_id=? ORDER BY at DESC LIMIT 200',
          )
          .all(id);
    return rows.map((r) => JSON.parse(String(r.metadata)) as AdminEvent);
  }
  record(
    id: string,
    action: string,
    result: CommandResult,
    input: unknown,
    name?: string,
    uuid?: string,
  ) {
    const parameters: AdminEvent['parameters'] = {};
    if (input && typeof input === 'object')
      for (const [key, value] of Object.entries(input)) {
        if (
          [
            'item',
            'count',
            'mode',
            'effect',
            'seconds',
            'amplifier',
            'amount',
            'unit',
            'channel',
            'diameter',
            'id',
            'rate',
          ].includes(key) &&
          ['number', 'string', 'boolean'].includes(typeof value)
        )
          parameters[key] = value as string | number | boolean;
        if (key === 'text' && typeof value === 'string') parameters.textLength = value.length;
      }
    const event: AdminEvent = {
      id: randomUUID(),
      at: result.at,
      name,
      uuid,
      action,
      state: result.state,
      parameters,
    };
    this.core.repo.db
      .prepare('INSERT INTO administration_events VALUES(?,?,?,?,?)')
      .run(event.id, id, name?.toLowerCase() ?? null, event.at, JSON.stringify(event));
    // Never persist private messages, reasons, IPs, raw commands or server replies in the audit.
    this.core.repo.audit(
      'administration.' + action + '.' + result.state,
      name ?? 'World control',
      id,
      result.state !== 'failed',
    );
    this.core.repo.db
      .prepare(
        'DELETE FROM administration_events WHERE server_id=? AND id NOT IN (SELECT id FROM administration_events WHERE server_id=? ORDER BY at DESC LIMIT 20000)',
      )
      .run(id, id);
  }
  private active(id: string): Server {
    const server = this.core.repo.server(id);
    if (!this.core.supervisor.isRunning(id) || server.status !== 'running')
      throw new DomainError(
        'RUNNING',
        'Start the server and wait until it is ready before using native controls.',
      );
    return server;
  }
  private async execute(id: string, input: PlayerActionInput): Promise<PlayerActionResult> {
    const server = this.active(id);
    if (!(await this.capabilities(id)).actions.includes(input.input.action))
      throw new DomainError('CAPABILITY', 'This native action is unavailable on this server.');
    const player = (await this.core.players.report(id)).players.find((p) => p.name === input.name);
    if (
      player?.identityConflict ||
      (input.uuid && player?.uuid !== input.uuid) ||
      (!player && !offlineActions.has(input.input.action))
    )
      throw new DomainError('IDENTITY', 'Choose a known player with a matching identity.');
    if (!offlineActions.has(input.input.action) && !player?.online)
      throw new DomainError('OFFLINE', 'This native action requires an online player.');
    if (input.input.action === 'teleport' && input.input.destination) {
      const destinationName = input.input.destination;
      const chosen = (await this.core.players.report(id)).players.find(
        (p) => p.name === destinationName && p.online && !p.identityConflict,
      );
      if (!chosen)
        throw new DomainError('OFFLINE', 'The destination player must be known and online.');
    }
    const command = buildPlayerCommand(server, input.name, input.input);
    let result: CommandResult;
    try {
      result = commandResult(input.input.action, await this.core.supervisor.command(id, command));
    } catch {
      result = {
        state: 'unverifiable',
        response: 'The native command transport failed. Check the server console.',
        at: new Date().toISOString(),
      };
    }
    this.record(id, input.input.action, result, input.input, input.name, player?.uuid);
    return { ...result, name: input.name };
  }
  async player(id: string, raw: PlayerActionInput): Promise<PlayerActionResult> {
    const input = playerActionInputSchema.parse(raw);
    if (input.confirmation !== input.name)
      throw new DomainError('CONFIRM', 'Confirm the exact player name.');
    return this.core.exclusive(id, () => this.execute(id, input));
  }
  async batch(
    id: string,
    raw: PlayerBatchInput,
  ): Promise<{ results: PlayerActionResult[]; cancelled: boolean }> {
    const input = playerBatchSchema.parse(raw);
    if (!groupActions.has(input.input.action))
      throw new DomainError('CAPABILITY', 'This action is unavailable for groups.');
    if (input.confirmation !== input.names.join(', '))
      throw new DomainError('CONFIRM', 'Confirm the exact selected player names.');
    return this.core.exclusive(id, async () => {
      this.active(id);
      return this.core.jobs.run('players.batch', 'Selected player actions', id, async (context) => {
        const results: PlayerActionResult[] = [];
        for (const name of input.names) {
          if (context.signal.aborted) return { results, cancelled: true };
          context.phase('applying', results.length, input.names.length);
          try {
            results.push(await this.execute(id, { name, input: input.input, confirmation: name }));
          } catch (error) {
            const result: PlayerActionResult = {
              name,
              state: 'failed',
              response: (error as Error).message,
              at: new Date().toISOString(),
            };
            this.record(id, input.input.action, result, input.input, name);
            results.push(result);
          }
        }
        return { results, cancelled: false };
      });
    });
  }
  async ip(id: string, raw: IpAction): Promise<CommandResult> {
    const input = ipActionSchema.parse(raw);
    if (!isIP(input.ip) || input.confirmation !== input.ip)
      throw new DomainError('CONFIRM', 'Enter and confirm one exact IP address.');
    return this.core.exclusive(id, async () => {
      const server = this.active(id);
      if (server.engine === 'bedrock')
        throw new DomainError('CAPABILITY', 'Bedrock does not provide native persistent IP bans.');
      const command = nativeCommand(
        server,
        `${input.action} ${input.ip}${input.action === 'ban-ip' && input.reason ? ' ' + input.reason : ''}`,
      );
      let result: CommandResult;
      try {
        result = commandResult(input.action, await this.core.supervisor.command(id, command));
      } catch {
        result = {
          state: 'unverifiable',
          response: 'The native command transport failed.',
          at: new Date().toISOString(),
        };
      }
      this.record(id, input.action, result, {});
      return result;
    });
  }
  async items(id: string): Promise<ItemCatalog> {
    const server = this.core.repo.server(id),
      ids = new Set<string>();
    if (engineDefinition(server.engine).edition !== 'java')
      return {
        source: 'unavailable',
        version: server.minecraftVersion ?? server.version,
        complete: false,
        entries: [],
      };
    for (const player of (await this.core.players.report(id)).players.slice(0, 200)) {
      const report = await this.core.playerInventory.get(id, player.name, false);
      for (const slot of report.slots) if (slot.item) ids.add(slot.item.id);
    }
    return this.core.itemAssets.catalog(
      server.minecraftVersion ?? server.version,
      this.core.repo.settings().language,
      ids,
    );
  }
  async worldState(id: string, query = false): Promise<WorldControlsState> {
    const server = this.core.repo.server(id),
      state: WorldControlsState = {
        actions: worldActions(server),
        rules: gameRules(server),
        source: 'unavailable',
        warnings: [],
      };
    const unsupported = await this.discover(id);
    state.actions = state.actions.filter((action) => !unsupported.has(this.root(server, action)));
    if (unsupported.has('gamerule')) state.rules = [];
    if (
      !query ||
      !this.core.supervisor.isRunning(id) ||
      !engineDefinition(server.engine).capabilities.rcon
    )
      return state;
    for (const [key, command] of [
      ['time', 'time query daytime'],
      ['difficulty', 'difficulty'],
    ] as const) {
      try {
        const reply = await this.core.supervisor.command(id, nativeCommand(server, command));
        const time = /^The time is (\d+)$/.exec(reply.trim()),
          difficulty = /^The difficulty is (peaceful|easy|normal|hard)$/i.exec(reply.trim());
        if (key === 'time' && time) state.time = Number(time[1]);
        if (key === 'difficulty' && difficulty) state.difficulty = difficulty[1]!.toLowerCase();
      } catch {
        state.warnings.push('A native world value could not be read.');
      }
    }
    for (const rule of state.rules)
      try {
        const reply = await this.core.supervisor.command(
          id,
          nativeCommand(server, 'gamerule ' + rule.id),
        );
        const escaped = rule.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const short = escaped.replace(/^minecraft:/, '');
        const match = new RegExp(
          `^(?:Gamerule )?(?:${escaped}|${short})(?: = | is currently set to: )((?:true|false)|-?\\d+)$`,
        ).exec(reply.trim());
        if (match) rule.value = rule.type === 'boolean' ? match[1] === 'true' : Number(match[1]);
      } catch {
        /* An unavailable rule keeps an explicit unknown value. */
      }
    if (
      state.time !== undefined ||
      state.difficulty ||
      state.rules.some((r) => r.value !== undefined)
    ) {
      state.source = 'live';
      state.at = new Date().toISOString();
    }
    return state;
  }
  async world(id: string, raw: WorldControl, confirmation = ''): Promise<CommandResult[]> {
    const input = worldControlSchema.parse(raw);
    return this.core.exclusive(id, async () => {
      const server = this.active(id);
      if ((await this.discover(id)).has(this.root(server, input.action)))
        throw new DomainError('CAPABILITY', 'This native action is unavailable on this server.');
      if (dangerousWorld.has(input.action) && confirmation !== server.name)
        throw new DomainError(
          'CONFIRM',
          'Confirm the exact server name for this advanced world change.',
        );
      const commands = buildWorldCommands(server, input);
      if (input.action === 'list' && engineDefinition(server.engine).capabilities.rcon) {
        const current = await this.core.supervisor.playerList(id);
        const result = commandResult('list', current.response);
        this.record(id, 'list', result, {});
        return [result];
      }
      if (input.action === 'save') {
        const backup = await this.core.backups.create(id, 'world_controls_save');
        if (!(await this.core.backups.verify(backup.id)))
          throw new DomainError('INTEGRITY', 'The new world backup did not pass verification.');
        const result: CommandResult = {
          state: 'confirmed',
          response: 'World saved and a verified backup created: ' + backup.id,
          at: new Date().toISOString(),
        };
        this.record(id, input.action, result, {});
        return [result];
      }
      const results: CommandResult[] = [];
      for (const command of commands) {
        let result: CommandResult;
        try {
          result = commandResult(input.action, await this.core.supervisor.command(id, command));
        } catch {
          result = {
            state: 'unverifiable',
            response: 'The native command transport failed.',
            at: new Date().toISOString(),
          };
        }
        this.record(id, input.action, result, input);
        results.push(result);
        if (result.state === 'failed') break;
      }
      return results;
    });
  }
}
