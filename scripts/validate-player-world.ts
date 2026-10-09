import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { AppCore } from '../packages/core/app';
import { LocalSecretStore } from '../packages/security/secrets';
import { findAvailablePort } from '../packages/networking/network';
import { serializeProperties } from '../packages/domain/properties';
import { PRODUCT, type Server } from '../packages/domain/types';
import type { WorldControl } from '../packages/domain/administration';

// This explicit flag records personal EULA acceptance; the script never accepts it implicitly.
async function main() {
  if (!process.argv.includes('--eula-accepted'))
    throw new Error('Personal EULA acceptance is required: --eula-accepted');
  const source = path.resolve(process.argv[process.argv.indexOf('--paper-folder') + 1] ?? '');
  const javaPath = path.resolve(process.argv[process.argv.indexOf('--java') + 1] ?? '');
  if (!process.argv.includes('--paper-folder') || !process.argv.includes('--java'))
    throw new Error('Supply a verified Paper 1.21.11 folder and Java 21 executable.');
  const root = path.resolve(
    'data/player-world-validation',
    new Date().toISOString().replaceAll(':', '-'),
  );
  await mkdir(root, { recursive: true });
  const secrets = await LocalSecretStore.open(root),
    core = await AppCore.open(root, secrets),
    id = randomUUID();
  const folder = path.join(root, 'servers', id),
    now = new Date().toISOString();
  const results: Record<string, unknown>[] = [];
  try {
    await mkdir(folder, { recursive: true });
    for (const name of ['server.jar', 'cache', 'libraries'])
      await cp(path.join(source, name), path.join(folder, name), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    const jarHash = createHash('sha256')
      .update(await readFile(path.join(folder, 'server.jar')))
      .digest('hex');
    const port = await findAvailablePort(29000),
      rconPort = await findAvailablePort(port + 10),
      password = randomBytes(24).toString('hex');
    await writeFile(
      path.join(folder, 'eula.txt'),
      '# EULA already personally accepted; isolated test explicitly authorized.\neula=true\n',
    );
    await writeFile(
      path.join(folder, 'server.properties'),
      serializeProperties({
        'server-ip': '127.0.0.1',
        'server-port': String(port),
        'rcon.port': String(rconPort),
        'rcon.password': password,
        'enable-rcon': 'true',
        'online-mode': 'true',
        'level-name': 'world',
        'view-distance': '2',
        'simulation-distance': '2',
        'spawn-protection': '0',
        'max-players': '2',
        'level-seed': '123456789',
        difficulty: 'normal',
        gamemode: 'survival',
        motd: 'MineDock isolated native command validation',
      }),
    );
    const server: Server = {
      id,
      name: 'Native world QA',
      engine: 'paper',
      version: '1.21.11',
      minecraftVersion: '1.21.11',
      build: '132',
      javaMajor: 21,
      javaPath,
      path: folder,
      memoryMin: 512,
      memoryMax: 1024,
      port,
      difficulty: 'normal',
      gamemode: 'survival',
      maxPlayers: 2,
      viewDistance: 2,
      simulationDistance: 2,
      pvp: true,
      whitelist: false,
      onlineMode: true,
      seed: '123456789',
      motd: 'Isolated QA',
      autoStart: false,
      autoRestart: false,
      status: 'stopped',
      createdAt: now,
      updatedAt: now,
      cpu: 0,
      memory: 0,
      players: [],
      diskBytes: 0,
      installationComplete: true,
    };
    core.repo.addServer(server, secrets.encrypt(password));
    await core.supervisor.start(id);
    for (let i = 0; core.repo.server(id).status !== 'running'; i++) {
      if (i > 180 || core.repo.server(id).status === 'crashed')
        throw new Error('Isolated server failed to become ready. Inspect its local console.');
      if (i % 15 === 0) console.log('Waiting for the isolated Paper 1.21.11 server…');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    for (let i = 0; ; i++) {
      try {
        await core.supervisor.command(id, 'minecraft:list');
        break;
      } catch (error) {
        if (i >= 10) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    console.log(
      'Native help response:',
      JSON.stringify(await core.supervisor.command(id, 'minecraft:help minecraft:list')),
    );
    console.log('Real Paper server ready. Testing native world commands.');
    const inputs: WorldControl[] = [
      { action: 'time', value: 'noon' },
      { action: 'weather', value: 'clear', seconds: 60 },
      { action: 'difficulty', value: 'hard' },
      { action: 'gamerule', id: 'minecraft:keep_inventory', value: true },
      { action: 'worldborder', diameter: 1000, center: { x: 0, z: 0 } },
      { action: 'worldspawn', coordinates: { x: 0, y: 90, z: 0 } },
      { action: 'list' },
      { action: 'seed' },
      { action: 'tick', mode: 'rate', rate: 20 },
      { action: 'save' },
      { action: 'reload' },
    ];
    for (const input of inputs) {
      const actual = await core.administration.world(id, input, server.name);
      assert(
        actual.length > 0 && actual.every((r) => r.state !== 'failed'),
        input.action + ': ' + JSON.stringify(actual),
      );
      results.push({ input, results: actual });
      console.log(input.action, JSON.stringify(actual));
      if (input.action === 'reload') await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    const state = await core.administration.worldState(id, true);
    assert.equal(state.source, 'live');
    assert.equal(state.difficulty, 'hard');
    assert.equal(state.rules.find((r) => r.id === 'minecraft:keep_inventory')?.value, true);
    assert.equal((await core.supervisor.players(id)).length, 0);
    const backups = core.repo.backups();
    assert.equal(backups.length, 1);
    assert.equal(await core.backups.verify(backups[0]!.id), true);
    await core.supervisor.stop(id);
    assert.equal(core.repo.server(id).status, 'stopped');
    const record = {
      at: new Date().toISOString(),
      application: PRODUCT.version,
      engine: 'paper',
      minecraft: '1.21.11',
      paperBuild: '132',
      jarSha256: jarHash,
      java: 21,
      eulaPersonallyAccepted: true,
      isolated: true,
      pluginsAdded: false,
      nativeWorldCommands: results,
      queriedWorldState: state,
      backupVerified: true,
      stoppedGracefully: true,
      onlinePlayers: 0,
      gameplayPlayerActionsTested: false,
      livePlayerInventoryTested: false,
    };
    await writeFile(path.join(root, 'result.json'), JSON.stringify(record, null, 2) + '\n');
    console.log(
      'Native validation passed. Evidence:',
      path.relative(process.cwd(), path.join(root, 'result.json')),
    );
  } finally {
    await core.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
