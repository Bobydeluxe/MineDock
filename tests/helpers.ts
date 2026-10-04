import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../packages/core/events';
import { Repository } from '../packages/database/database';
import { LocalSecretStore } from '../packages/security/secrets';
import { serializeProperties } from '../packages/domain/properties';
import { findAvailablePort } from '../packages/networking/network';
import type { Server } from '../packages/domain/types';
export async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'minedock-test-')));
  const bus = new EventBus();
  const repo = new Repository(root, bus);
  const secrets = await LocalSecretStore.open(root);
  const id = randomUUID();
  const folder = path.join(root, 'servers', id);
  await mkdir(path.join(folder, 'world'), { recursive: true });
  const port = await findAvailablePort(28000);
  const rconPort = await findAvailablePort(port + 10);
  const s: Server = {
    id,
    name: 'Integration',
    engine: 'paper',
    version: '1.21.11',
    memoryMin: 512,
    memoryMax: 1024,
    port,
    difficulty: 'normal',
    gamemode: 'survival',
    maxPlayers: 20,
    viewDistance: 10,
    simulationDistance: 8,
    pvp: true,
    whitelist: false,
    onlineMode: true,
    seed: '',
    motd: 'Test',
    autoStart: false,
    autoRestart: false,
    path: folder,
    javaMajor: 21,
    javaPath: process.execPath,
    build: 'fixture',
    status: 'stopped',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cpu: 0,
    memory: 0,
    players: [],
    diskBytes: 0,
  };
  const props = {
    'server-port': String(port),
    'rcon.port': String(rconPort),
    'rcon.password': 'test-secret',
    'enable-rcon': 'true',
    'online-mode': 'true',
    gamemode: 'survival',
    difficulty: 'normal',
    'max-players': '20',
    'view-distance': '10',
    'simulation-distance': '8',
    'level-name': 'world',
  };
  await writeFile(path.join(folder, 'server.properties'), serializeProperties(props));
  await writeFile(path.join(folder, 'eula.txt'), 'eula=true');
  await writeFile(path.join(folder, 'server.jar'), 'integration fixture');
  await writeFile(path.join(folder, 'world', 'level.dat'), 'original world');
  repo.addServer(s, secrets.encrypt('test-secret'));
  return {
    root,
    bus,
    repo,
    secrets,
    server: s,
    rconPort,
    cleanup: async () => {
      repo.close();
      if (!root.startsWith(path.join(os.tmpdir(), 'minedock-test-')))
        throw new Error('Unsafe fixture cleanup');
      await rm(root, { recursive: true, force: true });
    },
  };
}
