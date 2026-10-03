import type {
  Api,
  Snapshot,
  Server,
  AppEvent,
  Backup,
  InstalledContent,
} from '../../../../packages/domain/types';
export function createMockApi(): Api {
  const listeners = new Set<(event: AppEvent) => void>();
  const emit = (event: AppEvent): void => {
    listeners.forEach((fn) => fn(event));
  };
  const server = (
    name: string,
    engine: 'paper' | 'vanilla',
    status: Server['status'],
    port: number,
  ): Server => ({
    id: crypto.randomUUID(),
    name,
    engine,
    version: '1.21.11',
    memoryMin: 1024,
    memoryMax: 4096,
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
    motd: 'A MineDock server',
    autoStart: false,
    autoRestart: false,
    path: 'C:/MineDock/servers/' + name,
    javaMajor: 21,
    javaPath: 'C:/MineDock/runtimes/java21/bin/java.exe',
    build: 'demo',
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cpu: status === 'running' ? 12.4 : 0,
    memory: status === 'running' ? 2.6 * 1024 ** 3 : 0,
    players: status === 'running' ? ['Alex', 'Steve'] : [],
    diskBytes: 1024 ** 3 * 1.2,
    startedAt: status === 'running' ? new Date(Date.now() - 7400000).toISOString() : undefined,
  });
  const data: Snapshot = {
    servers: [
      server('Les copains', 'paper', 'running', 25565),
      server('Atelier créatif', 'vanilla', 'stopped', 25566),
      server('Nouvelle aventure', 'paper', 'stopped', 25567),
    ],
    backups: [],
    schedules: [],
    activity: [],
    settings: {
      language: 'fr',
      theme: 'dark',
      serverRoot: 'C:/MineDock/servers',
      backupRoot: 'C:/MineDock/backups',
      preventSleep: false,
      onboarded: true,
    },
    mock: true,
  };
  const content: InstalledContent[] = [];
  const texts = new Map<string, string>();
  const get = (id: string): Server => {
    const value = data.servers.find((s) => s.id === id);
    if (!value) throw new Error('Serveur introuvable.');
    return value;
  };
  const change = (id: string, status: Server['status']): void => {
    const s = get(id);
    s.status = status;
    s.startedAt = status === 'running' ? new Date().toISOString() : undefined;
    s.cpu = status === 'running' ? 8 : 0;
    s.memory = status === 'running' ? 1024 ** 3 : 0;
    if (status === 'stopped') s.players = [];
    emit({ type: 'server', server: structuredClone(s) });
  };
  const audit = (action: string, detail: string, serverId?: string): void => {
    const activity = {
      id: Date.now(),
      at: new Date().toISOString(),
      action,
      detail,
      serverId,
      success: true,
    };
    data.activity.unshift(activity);
    emit({ type: 'activity', activity });
  };
  const backup = async (id: string): Promise<Backup> => {
    const s = get(id);
    const meta = {
      id: crypto.randomUUID(),
      serverId: id,
      name: `${s.name} · démo`,
      createdAt: new Date().toISOString(),
      size: 1024 ** 2 * 256,
      sha256: 'demo',
      version: s.version,
      reason: 'manual',
    };
    data.backups.unshift(meta);
    audit('backup.completed', meta.name, id);
    emit({ type: 'changed' });
    return meta;
  };
  const logs = new Map<string, import('../../../../packages/domain/types').LogLine[]>();
  let seq = 0;
  const timer = setInterval(() => {
    for (const s of data.servers.filter((s) => s.status === 'running')) {
      const line = {
        seq: ++seq,
        at: new Date().toISOString(),
        level: 'INFO' as const,
        text: '[Server thread/INFO]: Démo : sauvegarde du monde terminée.',
      };
      const lines = logs.get(s.id) ?? [];
      lines.push(line);
      logs.set(s.id, lines.slice(-1000));
      emit({ type: 'log', serverId: s.id, line });
    }
  }, 5000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
  return {
    snapshot: async () => structuredClone(data),
    diagnostic: async () => ({
      platform: 'win32',
      arch: 'x64',
      totalMemory: 16 * 1024 ** 3,
      freeMemory: 9 * 1024 ** 3,
      freeDisk: 128 * 1024 ** 3,
      java: [],
      docker: false,
      lanIp: '192.168.1.24',
      port: 25568,
      dataRoot: 'C:/MineDock',
    }),
    settings: async (value) => {
      data.settings = value;
      emit({ type: 'changed' });
      return value;
    },
    selectFolder: async () => 'C:/MineDock',
    openFolder: async () => {
      audit('demo.folder', 'Dossier simulé.');
    },
    versions: async () => ['1.21.11', '1.21.10', '1.21.8', '1.21.4', '1.20.6'],
    create: async (input) => {
      const s = { ...server(input.name, input.engine, 'stopped', input.port), ...input };
      data.servers.push(s);
      audit('server.created', s.name, s.id);
      emit({ type: 'server', server: s });
      return s;
    },
    cancelDownload: async () => {
      audit('demo.download', 'Annulation simulée.');
    },
    retryInstallation: async (id) => {
      change(id, 'stopped');
      const s = get(id);
      s.installationComplete = true;
      return s;
    },
    start: async (id) => {
      change(id, 'running');
      audit('server.started', get(id).name, id);
    },
    stop: async (id) => {
      change(id, 'stopped');
      audit('server.stopped', get(id).name, id);
    },
    restart: async (id) => {
      change(id, 'running');
      audit('server.restarted', get(id).name, id);
    },
    remove: async (id, confirmation) => {
      if (get(id).name !== confirmation) throw new Error('Confirmation incorrecte.');
      data.servers = data.servers.filter((s) => s.id !== id);
      emit({ type: 'changed' });
    },
    logs: async (id) =>
      logs.get(id) ?? [
        {
          seq: ++seq,
          at: new Date().toISOString(),
          level: 'INFO',
          text: '[Server thread/INFO]: Done (3.24s)! For help, type "help"',
        },
      ],
    command: async (id, command) => {
      audit('console.command', 'Commande simulée.', id);
      return command === 'list'
        ? 'There are 2 of a max of 20 players online: Alex, Steve'
        : '[Démo] Commande exécutée.';
    },
    players: async (id) => get(id).players,
    properties: async (id) => {
      const s = get(id);
      const values = {
        'server-port': String(s.port),
        'max-players': String(s.maxPlayers),
        'view-distance': String(s.viewDistance),
        'simulation-distance': String(s.simulationDistance),
        gamemode: s.gamemode,
        difficulty: s.difficulty,
        pvp: String(s.pvp),
        'white-list': String(s.whitelist),
        'online-mode': String(s.onlineMode),
        'level-name': 'world',
        'level-seed': s.seed,
        motd: s.motd,
        'enable-command-block': 'false',
        hardcore: 'false',
        'generate-structures': 'true',
        'spawn-protection': '16',
        'server-ip': '',
      };
      const saved = texts.get(id + ':props');
      return saved ? (JSON.parse(saved) as Record<string, string>) : values;
    },
    saveProperties: async (id, props) => {
      texts.set(id + ':props', JSON.stringify(props));
      const s = get(id);
      s.port = Number(props['server-port']);
      s.motd = props.motd ?? s.motd;
      audit('server.configured', s.name, id);
      emit({ type: 'changed' });
    },
    configureServer: async (id, options) => {
      const s = get(id);
      Object.assign(s, options);
      emit({ type: 'server', server: s });
      return s;
    },
    files: async (_id, folder) =>
      folder
        ? [
            {
              name: 'settings.json',
              directory: false,
              size: 100,
              modified: new Date().toISOString(),
            },
          ]
        : [
            { name: 'world', directory: true, size: 0, modified: new Date().toISOString() },
            { name: 'plugins', directory: true, size: 0, modified: new Date().toISOString() },
            {
              name: 'server.properties',
              directory: false,
              size: 512,
              modified: new Date().toISOString(),
            },
            { name: 'notes.txt', directory: false, size: 128, modified: new Date().toISOString() },
          ],
    readFile: async (id, file) => texts.get(id + ':' + file) ?? '# Fichier de démonstration\n',
    writeFile: async (id, file, text) => {
      texts.set(id + ':' + file, text);
      audit('file.saved', file, id);
    },
    mkdir: async (id, file) => {
      audit('demo.mkdir', file, id);
    },
    deleteFile: async (id, file) => {
      texts.delete(id + ':' + file);
      audit('demo.delete', file, id);
    },
    uploadFile: async (id) => {
      audit('demo.upload', 'Import simulé', id);
    },
    exportFile: async (id) => {
      audit('demo.export', 'Export simulé', id);
    },
    backup,
    verifyBackup: async () => true,
    restore: async (id, confirmation) => {
      const item = data.backups.find((b) => b.id === id);
      if (!item || get(item.serverId).name !== confirmation)
        throw new Error('Confirmation incorrecte.');
      await backup(item.serverId);
      audit('backup.restored', item.name, item.serverId);
    },
    exportBackup: async () => {
      audit('demo.export', 'Export simulé');
    },
    deleteBackup: async (id) => {
      data.backups = data.backups.filter((b) => b.id !== id);
      emit({ type: 'changed' });
    },
    schedules: async (input) => {
      const job = {
        ...input,
        id: crypto.randomUUID(),
        nextRun: new Date(Date.now() + input.intervalMinutes * 60000).toISOString(),
      };
      data.schedules.push(job);
      emit({ type: 'changed' });
      return job;
    },
    deleteSchedule: async (id) => {
      data.schedules = data.schedules.filter((s) => s.id !== id);
      emit({ type: 'changed' });
    },
    metrics: async () =>
      Array.from({ length: 30 }, (_, i) => ({
        at: new Date(Date.now() - (30 - i) * 15000).toISOString(),
        cpu: 12 + Math.sin(i) * 5,
        memory: (2.5 + Math.sin(i / 5) * 0.2) * 1024 ** 3,
        players: 2,
      })),
    runtimes: async () => [{ major: 21, path: 'C:/MineDock/runtimes/java21', source: 'managed' }],
    installRuntime: async (major) => ({
      major,
      path: 'C:/MineDock/runtimes/java' + major,
      source: 'managed',
    }),
    search: async () => [
      {
        id: 'demo',
        title: 'LuckPerms',
        description: 'Un système de permissions pour votre serveur.',
        author: 'lucko',
        downloads: 9000000,
        categories: ['paper'],
      },
    ],
    installContent: async (id, projectId) => {
      const item = {
        id: crypto.randomUUID(),
        serverId: id,
        projectId,
        title: 'LuckPerms',
        versionId: 'demo',
        filename: 'luckperms.jar',
        enabled: true,
      };
      content.push(item);
      emit({ type: 'changed' });
      return [item];
    },
    content: async (id) => content.filter((c) => c.serverId === id),
    toggleContent: async (_id, contentId) => {
      const item = content.find((c) => c.id === contentId);
      if (item) item.enabled = !item.enabled;
      emit({ type: 'changed' });
    },
    onEvent: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
