import type { Server } from './types';
import { engineDefinition } from './engines';
import { DomainError } from './errors';
import {
  playerActionSchema,
  playerNameSchema,
  worldControlSchema,
  type PlayerAction,
  type WorldControl,
  type AdministrationCapabilities,
  type GameRule,
  type PlayerSlot,
} from './administration';
export function versionAtLeast(
  server: Pick<Server, 'version' | 'minecraftVersion'>,
  javaMinor: number,
  patch = 0,
): boolean {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(server.minecraftVersion ?? server.version);
  if (!match) return false;
  const major = Number(match[1]),
    minor = Number(match[2]),
    revision = Number(match[3] ?? 0);
  return (
    major >= 26 ||
    (major === 1 && (minor > javaMinor || (minor === javaMinor && revision >= patch)))
  );
}
export function target(server: Server, raw: string): string {
  const name = playerNameSchema.parse(raw);
  if (engineDefinition(server.engine).edition === 'java') {
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name))
      throw new DomainError(
        'IDENTITY',
        'Native Java actions require a valid Minecraft player name.',
      );
    return name;
  }
  return '"' + name + '"';
}
export function nativeCommand(server: Server, command: string): string {
  return ['paper', 'purpur'].includes(server.engine) ? 'minecraft:' + command : command;
}
export function administrationCapabilities(server: Server): AdministrationCapabilities {
  const edition = engineDefinition(server.engine).edition,
    version = server.minecraftVersion ?? server.version;
  const basic: PlayerAction['action'][] = [
    'message',
    'teleport',
    'gamemode',
    'kick',
    'op',
    'deop',
    'whitelistAdd',
    'whitelistRemove',
    'give',
    'kill',
  ];
  const actions = [...basic];
  if (server.engine === 'pocketmine') actions.push('ban', 'pardon');
  else if (edition === 'bedrock')
    actions.push('clear', 'replace', 'effect', 'effectClear', 'experience', 'spawnpoint', 'title');
  else {
    actions.push('ban', 'pardon');
    if (versionAtLeast(server, 13))
      actions.push(
        'clear',
        'replace',
        'effect',
        'effectClear',
        'experience',
        'spawnpoint',
        'title',
      );
    else actions.splice(actions.indexOf('give'), 1);
  }
  return {
    actions,
    edition,
    version,
    nativeReads: edition === 'java' && versionAtLeast(server, 13),
    warnings:
      server.engine === 'vanilla'
        ? []
        : [
            'Plugins or mods may alter native commands. A sent command is not proof that its effect was applied.',
          ],
  };
}
export function nativeSlot(slot: PlayerSlot): string {
  if (slot.section === 'armor') return 'armor.' + ['feet', 'legs', 'chest', 'head'][slot.index];
  if (slot.section === 'offhand') return 'weapon.offhand';
  if (slot.section === 'ender') return 'enderchest.' + slot.index;
  return slot.index < 9 ? 'hotbar.' + slot.index : 'inventory.' + (slot.index - 9);
}
function coordinateCommand(
  server: Server,
  coordinates: { x: number; y: number; z: number; dimension?: string },
  command: string,
): string {
  if (!coordinates.dimension) return nativeCommand(server, command);
  if (engineDefinition(server.engine).edition !== 'java' || !versionAtLeast(server, 13))
    throw new DomainError(
      'CAPABILITY',
      'Dimension-qualified controls are unavailable for this engine and version.',
    );
  return nativeCommand(
    server,
    `execute in ${coordinates.dimension} run ${nativeCommand(server, command)}`,
  );
}
export function buildPlayerCommand(server: Server, rawName: string, raw: PlayerAction): string {
  const input = playerActionSchema.parse(raw),
    name = target(server, rawName),
    java = engineDefinition(server.engine).edition === 'java';
  if (!administrationCapabilities(server).actions.includes(input.action))
    throw new DomainError('CAPABILITY', 'This action is unavailable for this engine and version.');
  const command = (s: string) => nativeCommand(server, s);
  switch (input.action) {
    case 'give':
      return command(`give ${name} ${input.item} ${input.count}`);
    case 'clear':
      return command(`clear ${name} ${input.item}${java ? '' : ' 0'} ${input.count}`);
    case 'replace': {
      const slot = nativeSlot(input.slot);
      if (java)
        return command(
          versionAtLeast(server, 17)
            ? `item replace entity ${name} ${slot} with ${input.item} ${input.count}`
            : `replaceitem entity ${name} ${slot} ${input.item} ${input.count}`,
        );
      const type =
        input.slot.section === 'armor'
          ? 'slot.armor.' + ['feet', 'legs', 'chest', 'head'][input.slot.index]
          : input.slot.section === 'offhand'
            ? 'slot.weapon.offhand'
            : input.slot.section === 'ender'
              ? 'slot.enderchest'
              : input.slot.index < 9
                ? 'slot.hotbar'
                : 'slot.inventory';
      const index = ['armor', 'offhand'].includes(input.slot.section)
        ? 0
        : input.slot.section === 'inventory' && input.slot.index >= 9
          ? input.slot.index - 9
          : input.slot.index;
      return command(`replaceitem entity ${name} ${type} ${index} ${input.item} ${input.count}`);
    }
    case 'message':
      return command(`${java ? 'msg' : 'tell'} ${name} ${input.text}`);
    case 'teleport': {
      if (input.destination) return command(`tp ${name} ${target(server, input.destination)}`);
      const c = input.coordinates!;
      return coordinateCommand(server, c, `tp ${name} ${c.x} ${c.y} ${c.z}`);
    }
    case 'gamemode':
      if (
        input.mode === 'spectator' &&
        (server.engine === 'pocketmine' ||
          (!java && !versionAtLeast(server, 19, 50)) ||
          (java && !versionAtLeast(server, 8)))
      )
        throw new DomainError(
          'CAPABILITY',
          'Spectator mode is unavailable for this engine and version.',
        );
      return command(`gamemode ${input.mode} ${name}`);
    case 'kick':
    case 'ban':
      return command(`${input.action} ${name}${input.reason ? ' ' + input.reason : ''}`);
    case 'pardon':
    case 'op':
    case 'deop':
    case 'kill':
      return command(`${input.action} ${name}`);
    case 'whitelistAdd':
    case 'whitelistRemove':
      return command(
        `${server.engine === 'bedrock' ? 'allowlist' : 'whitelist'} ${input.action === 'whitelistAdd' ? 'add' : 'remove'} ${name}`,
      );
    case 'effect':
      return command(
        `effect ${java ? 'give ' : ''}${name} ${input.effect} ${input.seconds} ${input.amplifier}`,
      );
    case 'effectClear':
      if (!java && input.effect)
        throw new DomainError('CAPABILITY', 'Selective effect removal is unavailable for Bedrock.');
      return command(
        java
          ? `effect clear ${name}${input.effect ? ' ' + input.effect : ''}`
          : `effect ${name} clear`,
      );
    case 'experience':
      if (!java && input.amount < 0 && input.unit === 'points')
        throw new DomainError('CAPABILITY', 'Removing Bedrock experience points is unavailable.');
      return command(
        java
          ? `experience add ${name} ${input.amount} ${input.unit}`
          : `xp ${input.amount}${input.unit === 'levels' ? 'L' : ''} ${name}`,
      );
    case 'spawnpoint': {
      const c = input.coordinates;
      return coordinateCommand(server, c, `spawnpoint ${name} ${c.x} ${c.y} ${c.z}`);
    }
    case 'title':
      return command(
        `${java ? 'title' : 'titleraw'} ${name} ${input.channel} ${JSON.stringify(java ? { text: input.text } : { rawtext: [{ text: input.text }] })}`,
      );
  }
}
const ruleSpecs = [
  ['keepInventory', 'keep_inventory', 'players', 'boolean', 4],
  ['doDaylightCycle', 'advance_time', 'world', 'boolean', 6],
  ['doWeatherCycle', 'advance_weather', 'world', 'boolean', 11],
  ['mobGriefing', 'mob_griefing', 'mobs', 'boolean', 4],
  ['doMobSpawning', 'spawn_mobs', 'mobs', 'boolean', 4],
  ['doMobLoot', 'mob_drops', 'mobs', 'boolean', 4],
  ['showDeathMessages', 'show_death_messages', 'messages', 'boolean', 8],
  ['naturalRegeneration', 'natural_health_regeneration', 'players', 'boolean', 6],
  ['playersSleepingPercentage', 'players_sleeping_percentage', 'players', 'integer', 17],
  ['doInsomnia', 'spawn_phantoms', 'mobs', 'boolean', 13],
] as const;
export function gameRules(server: Server): GameRule[] {
  if (server.engine === 'pocketmine') return [];
  const java = engineDefinition(server.engine).edition === 'java',
    modern = java && versionAtLeast(server, 21, 11);
  if (java && !versionAtLeast(server, 4)) return [];
  const rules: GameRule[] = ruleSpecs
    .filter((s) =>
      java
        ? versionAtLeast(server, s[4])
        : s[0] !== 'playersSleepingPercentage' || versionAtLeast(server, 20, 30),
    )
    .map(([key, renamed, category, type]) => ({
      id: modern ? 'minecraft:' + renamed : java ? key : key.toLowerCase(),
      key,
      category,
      type,
      ...(type === 'integer' ? { min: 0, max: 1000000 } : {}),
    }));
  rules.push(
    modern
      ? {
          id: 'minecraft:fire_spread_radius_around_player',
          key: 'fireSpread',
          category: 'world',
          type: 'integer',
          min: -1,
          max: 1000000,
        }
      : {
          id: java ? 'doFireTick' : 'dofiretick',
          key: 'doFireTick',
          category: 'world',
          type: 'boolean',
        },
  );
  return rules;
}
export function worldActions(server: Server): WorldControl['action'][] {
  const java = engineDefinition(server.engine).edition === 'java';
  const actions: WorldControl['action'][] = ['time', 'difficulty', 'announce', 'list'];
  if (server.engine === 'pocketmine') return actions;
  actions.push('weather', 'gamerule', 'worldspawn', 'summon', 'setblock');
  if (java) {
    actions.push('save', 'seed', 'worldborder');
    if (versionAtLeast(server, 13)) actions.push('reload', 'team', 'scoreboard');
    if (versionAtLeast(server, 19)) actions.push('locate');
    if (versionAtLeast(server, 20, 3)) actions.push('tick');
  } else if (versionAtLeast(server, 19, 10)) actions.push('locate');
  return actions;
}
export function buildWorldCommands(server: Server, raw: WorldControl): string[] {
  const input = worldControlSchema.parse(raw),
    java = engineDefinition(server.engine).edition === 'java';
  if (!worldActions(server).includes(input.action))
    throw new DomainError(
      'CAPABILITY',
      'This world control is unavailable for this engine and version.',
    );
  const command = (s: string) => [nativeCommand(server, s)];
  switch (input.action) {
    case 'time':
      return command(
        `time set ${server.engine === 'pocketmine' && typeof input.value === 'string' ? { day: 1000, noon: 6000, night: 13000, midnight: 18000 }[input.value] : input.value}`,
      );
    case 'weather':
      return command(
        `weather ${input.value}${input.seconds ? ' ' + input.seconds + (java && versionAtLeast(server, 19, 4) ? 's' : '') : ''}`,
      );
    case 'difficulty':
      return command(`difficulty ${input.value}`);
    case 'gamerule': {
      const rule = gameRules(server).find((r) => r.id === input.id);
      if (
        !rule ||
        (rule.type === 'boolean'
          ? typeof input.value !== 'boolean'
          : typeof input.value !== 'number' ||
            input.value < (rule.min ?? 0) ||
            input.value > (rule.max ?? 1000000))
      )
        throw new DomainError('GAMERULE', 'Invalid or unsupported game rule value.');
      return command(`gamerule ${rule.id} ${input.value}`);
    }
    case 'announce':
      return command(`say ${input.text}`);
    case 'save':
      return []; // Routed exclusively through the existing consistent backup/save service.
    case 'list':
    case 'seed':
    case 'reload':
      return command(input.action);
    case 'worldborder':
      return [
        ...(input.center ? command(`worldborder center ${input.center.x} ${input.center.z}`) : []),
        ...command(`worldborder set ${input.diameter}`),
      ];
    case 'worldspawn':
    case 'summon':
    case 'setblock': {
      const c = input.coordinates;
      if (input.action !== 'summon' && ![c.x, c.y, c.z].every(Number.isInteger))
        throw new DomainError('COORDINATES', 'Block coordinates must be whole numbers.');
      const cmd =
        input.action === 'worldspawn'
          ? `setworldspawn ${c.x} ${c.y} ${c.z}`
          : input.action === 'summon'
            ? `summon ${input.id} ${c.x} ${c.y} ${c.z}`
            : `setblock ${c.x} ${c.y} ${c.z} ${input.id} ${input.mode}`;
      return [coordinateCommand(server, c, cmd)];
    }
    case 'locate':
      if (!java && input.kind === 'poi')
        throw new DomainError(
          'CAPABILITY',
          'Point-of-interest location is unavailable for this engine and version.',
        );
      return command(`locate ${input.kind} ${input.id}`);
    case 'tick':
      if (input.mode === 'rate' && !input.rate) throw new DomainError('TICK', 'Enter a tick rate.');
      return command(`tick ${input.mode}${input.mode === 'rate' ? ' ' + input.rate : ''}`);
    case 'team': {
      if (['join', 'leave'].includes(input.mode) && !input.player)
        throw new DomainError('IDENTITY', 'Choose one exact player.');
      return command(
        input.mode === 'leave'
          ? `team leave ${target(server, input.player!)}`
          : `team ${input.mode} ${input.team}${input.mode === 'join' ? ' ' + target(server, input.player!) : ''}`,
      );
    }
    case 'scoreboard': {
      if (input.mode === 'set' && (!input.player || input.value === undefined))
        throw new DomainError('SCOREBOARD', 'Choose an exact player and score.');
      return command(
        input.mode === 'set'
          ? `scoreboard players set ${target(server, input.player!)} ${input.objective} ${input.value}`
          : `scoreboard objectives ${input.mode} ${input.objective}${input.mode === 'add' ? ' dummy' : ''}`,
      );
    }
  }
}
