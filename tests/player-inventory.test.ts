import { expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { playerData, playerUuid } from './fixtures/player-data';
import { AppCore } from '../packages/core/app';
import { PlayerInventoryService } from '../packages/core/player-inventory';
import { readPlayerNbt, writePlayerNbt, child, setChild } from '../packages/security/player-nbt';
async function setup() {
  const f = await fixture(),
    file = path.join(f.server.path, 'world/playerdata', playerUuid + '.dat');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, playerData());
  await writeFile(
    path.join(f.server.path, 'usercache.json'),
    JSON.stringify([{ name: 'Friend', uuid: playerUuid }]),
  );
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  return {
    ...f,
    file,
    core,
    cleanup: async () => {
      vi.restoreAllMocks();
      await core.close();
      await f.cleanup();
    },
  };
}
it('creates a verified complete backup and actual player safety copy before an exact-slot edit, then previews and restores the inventory only', async () => {
  const f = await setup();
  try {
    const original = await readFile(f.file),
      report = await f.core.playerInventory.get(f.server.id, 'Friend');
    expect(report).toMatchObject({ source: 'saved', writable: true });
    const changed = await f.core.playerInventory.edit(f.server.id, {
      name: 'Friend',
      uuid: playerUuid,
      sha256: report.sha256!,
      slot: { section: 'inventory', index: 15 },
      action: 'remove',
      count: 4,
      confirmation: 'Friend',
    });
    expect(
      changed.slots.find((s) => s.section === 'inventory' && s.index === 15)?.item?.count,
    ).toBe(60);
    expect(f.core.repo.backups()).toHaveLength(1);
    expect(await f.core.backups.verify(f.core.repo.backups()[0]!.id)).toBe(true);
    const snapshot = f.core.playerInventory.snapshots(f.server.id, playerUuid)[0]!;
    expect(
      await readFile(
        path.join(f.root, 'player-snapshots', f.server.id, playerUuid, snapshot.id + '.dat'),
      ),
    ).toEqual(original);
    const current = readPlayerNbt(await readFile(f.file));
    setChild(current, 'Health', { type: 5, value: 7 });
    await writeFile(f.file, writePlayerNbt(current));
    const preview = await f.core.playerInventory.previewRestore(
      f.server.id,
      'Friend',
      playerUuid,
      snapshot.id,
    );
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0]).toMatchObject({
      slot: { section: 'inventory', index: 15 },
      before: { count: 60 },
      after: { count: 64 },
    });
    await expect(
      f.core.playerInventory.restore(f.server.id, preview.token, 'wrong'),
    ).rejects.toThrow('Confirm');
    const restored = await f.core.playerInventory.restore(f.server.id, preview.token, 'Friend');
    expect(restored.health).toBe(7);
    expect(
      restored.slots.find((s) => s.section === 'inventory' && s.index === 15)?.item?.count,
    ).toBe(64);
    expect(child(readPlayerNbt(await readFile(f.file)), 'unknown_longs')?.raw).toEqual(
      child(readPlayerNbt(original), 'unknown_longs')?.raw,
    );
    await expect(
      f.core.playerInventory.restore(f.server.id, preview.token, 'Friend'),
    ).rejects.toThrow('expired');
    expect((await readdir(path.dirname(f.file))).filter((s) => s.endsWith('.tmp'))).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('rolls back a failed replacement from the preserved bytes and records the real journal outcome', async () => {
  const f = await setup();
  try {
    const original = await readFile(f.file),
      service = new PlayerInventoryService(f.core, async () => {
        throw new Error('Injected disk failure after replacement');
      });
    const report = await service.get(f.server.id, 'Friend');
    await expect(
      service.edit(f.server.id, {
        name: 'Friend',
        uuid: playerUuid,
        sha256: report.sha256!,
        slot: { section: 'inventory', index: 0 },
        action: 'empty',
        confirmation: 'Friend',
      }),
    ).rejects.toThrow('Injected disk');
    expect(await readFile(f.file)).toEqual(original);
    expect(
      JSON.parse(
        String(f.core.repo.db.prepare('SELECT metadata FROM player_data_journal').get()?.metadata),
      ).state,
    ).toBe('rolled_back');
    expect(service.snapshots(f.server.id, playerUuid)).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
it('refuses every file edit on an active server even for offline players, and never labels saved data live', async () => {
  const f = await setup();
  try {
    const original = await readFile(f.file),
      saved = await f.core.playerInventory.get(f.server.id, 'Friend');
    vi.spyOn(f.core.supervisor, 'isRunning').mockReturnValue(true);
    const report = await f.core.playerInventory.get(f.server.id, 'Friend');
    expect(report).toMatchObject({ source: 'saved', writable: false });
    await expect(
      f.core.playerInventory.edit(f.server.id, {
        name: 'Friend',
        uuid: playerUuid,
        sha256: saved.sha256!,
        slot: { section: 'inventory', index: 0 },
        action: 'empty',
        confirmation: 'Friend',
      }),
    ).rejects.toThrow('Stop');
    expect(await readFile(f.file)).toEqual(original);
    expect(f.core.repo.backups()).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});
it('refuses stale data, changed UUID, future schemas and changes made during the backup without overwriting them', async () => {
  const f = await setup();
  try {
    const report = await f.core.playerInventory.get(f.server.id, 'Friend');
    const input = {
      name: 'Friend',
      uuid: playerUuid,
      sha256: report.sha256!,
      slot: { section: 'inventory' as const, index: 0 },
      action: 'empty' as const,
      confirmation: 'Friend',
    };
    await expect(
      f.core.playerInventory.edit(f.server.id, { ...input, sha256: 'a'.repeat(64) }),
    ).rejects.toThrow('changed');
    await expect(
      f.core.playerInventory.edit(f.server.id, {
        ...input,
        uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).rejects.toThrow('identity');
    const real = f.core.backups.create.bind(f.core.backups);
    vi.spyOn(f.core.backups, 'create').mockImplementation(async (...args) => {
      const backup = await real(...args);
      await writeFile(f.file, playerData(99999));
      return backup;
    });
    await expect(f.core.playerInventory.edit(f.server.id, input)).rejects.toThrow('changed during');
    expect(await readFile(f.file)).toEqual(playerData(99999));
    expect((await f.core.playerInventory.get(f.server.id, 'Friend')).writable).toBe(false);
    expect(f.core.playerInventory.snapshots(f.server.id, playerUuid)).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});
it('accepts live data only from an exact native player response with a matching UUID and valid structure', async () => {
  const f = await setup();
  try {
    vi.spyOn(f.core.supervisor, 'isRunning').mockReturnValue(true);
    f.core.repo.saveServer({ ...f.core.repo.server(f.server.id), players: ['Friend'] });
    const uuidInts = [0, 4, 8, 12].map((i) =>
      Buffer.from(playerUuid.replaceAll('-', ''), 'hex').readInt32BE(i),
    );
    const command = vi
      .spyOn(f.core.supervisor, 'command')
      .mockResolvedValue(
        `Friend has the following entity data: {UUID:[I;${uuidInts.join(',')}],Inventory:[{Slot:0b,id:"minecraft:stone",count:3}],EnderItems:[],Health:10.0f}`,
      );
    expect(await f.core.playerInventory.get(f.server.id, 'Friend')).toMatchObject({
      source: 'live',
      writable: false,
      health: 10,
    });
    expect(command).toHaveBeenCalledWith(f.server.id, 'minecraft:data get entity Friend');
    command.mockResolvedValue('Command sent. See the console for its response.');
    expect((await f.core.playerInventory.get(f.server.id, 'Friend')).source).toBe('saved');
    command.mockResolvedValue('Other has the following entity data: {Inventory:[]}');
    expect((await f.core.playerInventory.get(f.server.id, 'Friend')).source).toBe('saved');
  } finally {
    await f.cleanup();
  }
});
it('uses the Java 26.x players/data path and never reads Bedrock files as Java NBT', async () => {
  const f = await setup();
  try {
    f.core.repo.saveServer({ ...f.core.repo.server(f.server.id), version: '26.1' });
    const modern = path.join(f.server.path, 'world/players/data', playerUuid + '.dat');
    await mkdir(path.dirname(modern), { recursive: true });
    await writeFile(modern, playerData(99999));
    expect(await f.core.playerInventory.get(f.server.id, 'Friend')).toMatchObject({
      source: 'saved',
      writable: false,
      dataVersion: 99999,
    });
    for (const engine of ['bedrock', 'pocketmine'] as const) {
      f.core.repo.saveServer({ ...f.core.repo.server(f.server.id), engine });
      expect(await f.core.playerInventory.get(f.server.id, 'Friend')).toMatchObject({
        source: 'unavailable',
        slots: [],
      });
    }
  } finally {
    await f.cleanup();
  }
});
it.skipIf(process.platform === 'win32')(
  'refuses symlinked player files and unsafe world paths',
  async () => {
    const f = await setup();
    try {
      const linked = path.join(
        f.server.path,
        'world/playerdata',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.dat',
      );
      await symlink(f.file, linked);
      await writeFile(
        path.join(f.server.path, 'usercache.json'),
        JSON.stringify([{ name: 'Friend', uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]),
      );
      expect((await f.core.playerInventory.get(f.server.id, 'Friend')).reason).toContain(
        'Symbolic',
      );
      await writeFile(path.join(f.server.path, 'server.properties'), 'level-name=../escape');
      expect((await f.core.playerInventory.get(f.server.id, 'Friend')).reason).toContain('Path');
    } finally {
      await f.cleanup();
    }
  },
);
