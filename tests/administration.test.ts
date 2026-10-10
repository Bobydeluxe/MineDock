import { expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
import {
  buildPlayerCommand,
  buildWorldCommands,
  gameRules,
  administrationCapabilities,
  worldActions,
} from '../packages/domain/admin-commands';
import { commandResult } from '../packages/core/administration';
import { playerUuid } from './fixtures/player-data';
import type { PlayerAction } from '../packages/domain/administration';
import { parseNativePlayerList } from '../packages/server-core/supervisor';
async function setup() {
  const f = await fixture();
  await writeFile(
    path.join(f.server.path, 'usercache.json'),
    JSON.stringify([
      { name: 'Friend', uuid: playerUuid },
      { name: 'Alex', uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ]),
  );
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  core.repo.saveServer({
    ...core.repo.server(f.server.id),
    status: 'running',
    players: ['Friend', 'Alex'],
  });
  vi.spyOn(core.supervisor, 'isRunning').mockReturnValue(true);
  return {
    ...f,
    core,
    cleanup: async () => {
      vi.restoreAllMocks();
      core.repo.saveServer({ ...core.repo.server(f.server.id), status: 'stopped', players: [] });
      await core.close();
      await f.cleanup();
    },
  };
}
it('builds exact native player commands without selectors or arbitrary command fragments', async () => {
  const f = await fixture();
  try {
    const examples: [PlayerAction, string][] = [
      [{ action: 'give', item: 'example:gem', count: 3 }, 'give Friend example:gem 3'],
      [{ action: 'clear', item: 'minecraft:stone', count: 2 }, 'clear Friend minecraft:stone 2'],
      [
        {
          action: 'replace',
          slot: { section: 'inventory', index: 9 },
          item: 'minecraft:air',
          count: 1,
        },
        'item replace entity Friend inventory.0 with minecraft:air 1',
      ],
      [{ action: 'message', text: 'Meet near the village' }, 'msg Friend Meet near the village'],
      [{ action: 'teleport', coordinates: { x: 12, y: 64, z: -5 } }, 'tp Friend 12 64 -5'],
      [{ action: 'teleport', destination: 'Alex' }, 'tp Friend Alex'],
      [{ action: 'gamemode', mode: 'creative' }, 'gamemode creative Friend'],
      [
        { action: 'effect', effect: 'minecraft:speed', seconds: 60, amplifier: 1 },
        'effect give Friend minecraft:speed 60 1',
      ],
      [{ action: 'experience', amount: -2, unit: 'levels' }, 'experience add Friend -2 levels'],
      [{ action: 'whitelistAdd' }, 'whitelist add Friend'],
    ];
    for (const [input, expected] of examples)
      expect(buildPlayerCommand(f.server, 'Friend', input)).toBe('minecraft:' + expected);
    expect(
      buildPlayerCommand({ ...f.server, version: '1.16.5' }, 'Friend', {
        action: 'replace',
        slot: { section: 'offhand', index: 0 },
        item: 'minecraft:shield',
        count: 1,
      }),
    ).toBe('minecraft:replaceitem entity Friend weapon.offhand minecraft:shield 1');
    for (const name of ['@a', 'Friend\nstop', 'Friend;stop', 'Friend"', 'a'.repeat(17)])
      expect(() =>
        buildPlayerCommand(f.server, name, { action: 'message', text: 'Hello' }),
      ).toThrow();
    for (const input of [
      { action: 'give', item: 'minecraft:stone\nstop', count: 1 },
      { action: 'give', item: 'minecraft:stone', count: 65 },
      { action: 'message', text: 'hi\nstop' },
      { action: 'teleport', coordinates: { x: Infinity, y: 64, z: 0 } },
    ])
      expect(() => buildPlayerCommand(f.server, 'Friend', input as PlayerAction)).toThrow();
  } finally {
    await f.cleanup();
  }
});
it('adapts Java, Bedrock and PocketMine capabilities and does not expose a guessed native storage format', async () => {
  const f = await fixture();
  try {
    const bedrock = { ...f.server, engine: 'bedrock' as const, version: '1.21.120' };
    expect(
      buildPlayerCommand(bedrock, 'Bedrock Friend', {
        action: 'clear',
        item: 'minecraft:stone',
        count: 4,
      }),
    ).toBe('clear "Bedrock Friend" minecraft:stone 0 4');
    expect(
      buildPlayerCommand(bedrock, 'Bedrock Friend', {
        action: 'replace',
        slot: { section: 'inventory', index: 10 },
        item: 'minecraft:stone',
        count: 1,
      }),
    ).toBe('replaceitem entity "Bedrock Friend" slot.inventory 1 minecraft:stone 1');
    expect(() => buildPlayerCommand(bedrock, 'Friend', { action: 'ban' })).toThrow('unavailable');
    expect(() =>
      buildPlayerCommand(bedrock, 'Friend', { action: 'experience', amount: -3, unit: 'points' }),
    ).toThrow('unavailable');
    expect(() =>
      buildPlayerCommand(bedrock, 'Friend', {
        action: 'teleport',
        coordinates: { x: 1, y: 2, z: 3, dimension: 'minecraft:the_nether' },
      }),
    ).toThrow('unavailable');
    const pocket = { ...bedrock, engine: 'pocketmine' as const };
    expect(administrationCapabilities(pocket).actions).not.toContain('replace');
    expect(administrationCapabilities(pocket).actions).not.toContain('effect');
    expect(worldActions(pocket)).not.toContain('weather');
    expect(gameRules(pocket)).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('distinguishes actual confirmations from sent, failed and unverifiable replies', () => {
  expect(commandResult('give', 'Gave 3 [Stone] to Friend').state).toBe('confirmed');
  expect(commandResult('give', '').state).toBe('unverifiable');
  expect(commandResult('give', 'OK').state).toBe('unverifiable');
  expect(commandResult('give', 'Command sent. See the console for its response.').state).toBe(
    'sent',
  );
  expect(commandResult('give', 'Unknown or incomplete command').state).toBe('failed');
  expect(commandResult('difficulty', 'The difficulty has been set to Hard').state).toBe(
    'confirmed',
  );
  expect(commandResult('reload', 'Reloading!').state).toBe('sent');
});
it('does not infer an empty player list from an unrecognized or intercepted reply', () => {
  expect(parseNativePlayerList('There are 0 of a max of 20 players online:')).toEqual([]);
  expect(parseNativePlayerList('There are 2 of a max of 20 players online: Friend, Alex')).toEqual([
    'Friend',
    'Alex',
  ]);
  for (const value of [
    'OK',
    'Unknown command',
    'There are 2 of a max of 20 players online: Friend',
    'There are 1 of a max of 20 players online: @a',
  ])
    expect(() => parseNativePlayerList(value)).toThrow('verified');
});
it('uses non-destructive native help to suppress a command explicitly missing on a modded server', async () => {
  const f = await setup();
  try {
    const command = vi
      .spyOn(f.core.supervisor, 'command')
      .mockImplementation(async (_id, input) =>
        input === 'minecraft:help minecraft:list'
          ? '/minecraft:list [uuids]'
          : input === 'minecraft:help minecraft:give'
            ? 'Unknown command'
            : '/minecraft:command <arguments>',
      );
    expect((await f.core.administration.capabilities(f.server.id)).actions).not.toContain('give');
    await expect(
      f.core.administration.player(f.server.id, {
        name: 'Friend',
        confirmation: 'Friend',
        input: { action: 'give', item: 'minecraft:stone', count: 1 },
      }),
    ).rejects.toThrow('unavailable');
    expect(command.mock.calls.every((call) => call[1].startsWith('minecraft:help '))).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('requires known online identities and exact confirmation, and keeps private message text out of all audit entries', async () => {
  const f = await setup();
  try {
    const command = vi.spyOn(f.core.supervisor, 'command').mockResolvedValue('OK');
    await expect(
      f.core.administration.player(f.server.id, {
        name: 'Friend',
        confirmation: 'wrong',
        input: { action: 'give', item: 'minecraft:stone', count: 1 },
      }),
    ).rejects.toThrow('Confirm');
    await expect(
      f.core.administration.player(f.server.id, {
        name: 'Unknown',
        confirmation: 'Unknown',
        input: { action: 'message', text: 'secret private conversation' },
      }),
    ).rejects.toThrow('known');
    await expect(
      f.core.administration.player(f.server.id, {
        name: 'Friend',
        uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        confirmation: 'Friend',
        input: { action: 'message', text: 'secret private conversation' },
      }),
    ).rejects.toThrow('identity');
    const result = await f.core.administration.player(f.server.id, {
      name: 'Friend',
      confirmation: 'Friend',
      input: { action: 'message', text: 'secret private conversation' },
    });
    expect(result.state).toBe('unverifiable');
    expect(command).toHaveBeenCalledWith(
      f.server.id,
      'minecraft:msg Friend secret private conversation',
    );
    expect(JSON.stringify(f.core.administration.history(f.server.id))).not.toContain(
      'secret private conversation',
    );
    expect(JSON.stringify(f.core.repo.activity())).not.toContain('secret private conversation');
    f.core.repo.saveServer({ ...f.core.repo.server(f.server.id), players: ['Alex'] });
    await expect(
      f.core.administration.player(f.server.id, {
        name: 'Friend',
        confirmation: 'Friend',
        input: { action: 'give', item: 'minecraft:stone', count: 1 },
      }),
    ).rejects.toThrow('online');
  } finally {
    await f.cleanup();
  }
});
it('runs exact selected group targets, returns partial failures and cancels between commands without ever using @a', async () => {
  const f = await setup();
  try {
    const command = vi
      .spyOn(f.core.supervisor, 'command')
      .mockImplementation(async (_id, text) =>
        text.includes('Alex') ? 'No player was found' : 'Gave 2 [Stone] to Friend',
      );
    const input = {
      names: ['Friend', 'Alex'],
      confirmation: 'Friend, Alex',
      input: { action: 'give' as const, item: 'minecraft:stone', count: 2 },
    };
    const result = await f.core.administration.batch(f.server.id, input);
    expect(result.results.map((r) => r.state)).toEqual(['confirmed', 'failed']);
    expect(
      command.mock.calls.map((c) => c[1]).filter((c) => !c.startsWith('minecraft:help ')),
    ).toEqual(['minecraft:give Friend minecraft:stone 2', 'minecraft:give Alex minecraft:stone 2']);
    expect(f.core.administration.history(f.server.id)).toHaveLength(2);
    await expect(
      f.core.administration.batch(f.server.id, { ...input, confirmation: 'everyone' }),
    ).rejects.toThrow('Confirm');
    await expect(
      f.core.administration.batch(f.server.id, { ...input, input: { action: 'op' } }),
    ).rejects.toThrow('groups');
    command.mockClear();
    command.mockImplementation(async () => {
      const operation = f.core.repo
        .operations()
        .find((o) => o.kind === 'players.batch' && o.status === 'applying')!;
      f.core.jobs.cancel(operation.id);
      return 'Gave 2 [Stone] to Friend';
    });
    const cancelled = await f.core.administration.batch(f.server.id, input);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.results).toHaveLength(1);
    expect(command).toHaveBeenCalledTimes(1);
    expect(
      f.core.repo.operations().some((o) => o.kind === 'players.batch' && o.status === 'cancelled'),
    ).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it('builds version-correct game rules and safe world controls with bounds and previews', async () => {
  const f = await fixture();
  try {
    expect(buildWorldCommands(f.server, { action: 'time', value: 'noon' })).toEqual([
      'minecraft:time set noon',
    ]);
    expect(buildWorldCommands(f.server, { action: 'weather', value: 'rain', seconds: 60 })).toEqual(
      ['minecraft:weather rain 60s'],
    );
    expect(
      buildWorldCommands(
        { ...f.server, version: '1.19.3' },
        { action: 'weather', value: 'rain', seconds: 60 },
      ),
    ).toEqual(['minecraft:weather rain 60']);
    expect(gameRules(f.server).find((r) => r.key === 'keepInventory')?.id).toBe(
      'minecraft:keep_inventory',
    );
    expect(
      gameRules({ ...f.server, version: '1.21.10' }).find((r) => r.key === 'keepInventory')?.id,
    ).toBe('keepInventory');
    expect(
      buildWorldCommands(f.server, {
        action: 'gamerule',
        id: 'minecraft:keep_inventory',
        value: true,
      }),
    ).toEqual(['minecraft:gamerule minecraft:keep_inventory true']);
    expect(() =>
      buildWorldCommands(f.server, { action: 'gamerule', id: 'keepInventory', value: true }),
    ).toThrow('unsupported');
    expect(
      buildWorldCommands(f.server, {
        action: 'worldborder',
        diameter: 1000,
        center: { x: 5, z: -8 },
      }),
    ).toEqual(['minecraft:worldborder center 5 -8', 'minecraft:worldborder set 1000']);
    expect(
      buildWorldCommands(f.server, { action: 'worldspawn', coordinates: { x: 1, y: 65, z: 2 } }),
    ).toEqual(['minecraft:setworldspawn 1 65 2']);
    expect(() =>
      buildWorldCommands(f.server, { action: 'worldspawn', coordinates: { x: 1.5, y: 65, z: 2 } }),
    ).toThrow('whole numbers');
    expect(buildWorldCommands(f.server, { action: 'save' })).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('requires advanced world confirmations and uses the existing backup/save service, leaving unreadable current values unknown', async () => {
  const f = await setup();
  try {
    const command = vi
      .spyOn(f.core.supervisor, 'command')
      .mockImplementation(async (_id, text) =>
        text.includes('time query')
          ? 'The time is 6000'
          : text.endsWith('difficulty')
            ? 'The difficulty is normal'
            : text.includes('gamerule')
              ? 'Unrecognized response'
              : 'OK',
      );
    const state = await f.core.administration.worldState(f.server.id, true);
    expect(state).toMatchObject({ source: 'live', time: 6000, difficulty: 'normal' });
    expect(state.rules.every((r) => r.value === undefined)).toBe(true);
    await expect(
      f.core.administration.world(f.server.id, { action: 'worldborder', diameter: 1000 }, ''),
    ).rejects.toThrow('Confirm');
    const backup = vi.spyOn(f.core.backups, 'create').mockResolvedValue({
      id: 'real-backup-test',
      serverId: f.server.id,
      name: 'Safety',
      size: 10,
      sha256: 'a'.repeat(64),
      version: f.server.version,
      reason: 'test',
      createdAt: new Date().toISOString(),
    });
    vi.spyOn(f.core.backups, 'verify').mockResolvedValue(true);
    await f.core.administration.world(f.server.id, { action: 'save' });
    expect(backup).toHaveBeenCalledWith(f.server.id, 'world_controls_save');
    command.mockClear();
    const result = await f.core.administration.ip(f.server.id, {
      action: 'ban-ip',
      ip: '192.0.2.42',
      confirmation: '192.0.2.42',
    });
    expect(result.state).toBe('unverifiable');
    expect(JSON.stringify(f.core.administration.history(f.server.id))).not.toContain('192.0.2.42');
    await expect(
      f.core.administration.ip(f.server.id, {
        action: 'ban-ip',
        ip: 'Friend',
        confirmation: 'Friend',
      }),
    ).rejects.toThrow('IP');
  } finally {
    await f.cleanup();
  }
});
