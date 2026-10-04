import type {
  Api,
  Snapshot,
  Server,
  AppEvent,
  Backup,
  InstalledContent,
} from '../../../../packages/domain/types';
import type { WorldSummary } from '../../../../packages/domain/worlds';
export function createMockApi(): Api {
  const listeners = new Set<(event: AppEvent) => void>();
  const emit = (event: AppEvent): void => {
    listeners.forEach((fn) => fn(event));
  };
  const server = (
    name: string,
    engine: Server['engine'],
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
      server('Our friends', 'paper', 'running', 25565),
      server('Creative workshop', 'vanilla', 'stopped', 25566),
      server('New adventure', 'paper', 'stopped', 25567),
    ],
    backups: [],
    schedules: [],
    activity: [],
    settings: {
      language: 'en',
      theme: 'dark',
      serverRoot: 'C:/MineDock/servers',
      backupRoot: 'C:/MineDock/backups',
      preventSleep: false,
      onboarded: true,
    },
    mock: true,
  };
  const content: InstalledContent[] = [];
  const demoWorlds = new Map<string, WorldSummary[]>();
  const worlds = (id: string): WorldSummary[] => {
    if (!demoWorlds.has(id))
      demoWorlds.set(id, [
        {
          name: 'world',
          active: true,
          folders: ['world', 'world_nether', 'world_the_end'],
          bytes: 1024,
          files: 3,
          modified: new Date().toISOString(),
          seed: '123456',
        },
      ]);
    return demoWorlds.get(id)!;
  };
  const demoVersion = () => ({
    id: 'demo',
    projectId: 'demo',
    name: 'Demo version',
    publishedAt: '2026-01-01T00:00:00Z',
    changelog: 'This is an explicit demo fixture.',
    gameVersions: data.servers.map((server) => server.version),
    loaders: ['paper', 'fabric', 'forge', 'neoforge'],
    files: [{ url: 'https://cdn.modrinth.com/demo.jar', filename: 'luckperms.jar', primary: true }],
    dependencies: [],
  });
  const texts = new Map<string, string>();
  const get = (id: string): Server => {
    const value = data.servers.find((s) => s.id === id);
    if (!value) throw new Error('Server not found.');
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
      name: `${s.name} · demo`,
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
        text: '[Server thread/INFO]: Demo: world saved.',
      };
      const lines = logs.get(s.id) ?? [];
      lines.push(line);
      logs.set(s.id, lines.slice(-1000));
      emit({ type: 'log', serverId: s.id, line });
    }
  }, 5000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
  return {
    worlds: async (id) => structuredClone(worlds(id)),
    worldAction: async (id, input) => {
      const entries = worlds(id),
        world = entries.find((entry) => entry.name === input.name);
      if (!world || input.confirmation !== input.name)
        throw new Error('Incorrect world confirmation.');
      if (input.action === 'duplicate')
        entries.push({
          ...world,
          name: input.newName!,
          active: false,
          folders: world.folders.map((folder) => input.newName! + folder.slice(world.name.length)),
        });
      else if (input.action === 'rename') {
        world.folders = world.folders.map(
          (folder) => input.newName! + folder.slice(world.name.length),
        );
        world.name = input.newName!;
      } else if (input.action === 'select')
        for (const entry of entries) entry.active = entry === world;
      else {
        if (world.active) throw new Error('Select another world first.');
        entries.splice(entries.indexOf(world), 1);
      }
      audit('demo.world.' + input.action, input.name, id);
      emit({ type: 'changed' });
    },
    previewWorldImport: async () => ({
      token: crypto.randomUUID(),
      name: 'demo_import',
      edition: 'java',
      folders: ['demo_import'],
      bytes: 1024,
      files: 1,
      warnings: [],
    }),
    importWorld: async (id, input) => {
      if (input.confirmation !== input.name) throw new Error('Incorrect confirmation.');
      worlds(id).push({
        name: input.name,
        folders: [input.name],
        bytes: 1024,
        files: 1,
        modified: new Date().toISOString(),
        active: false,
      });
      emit({ type: 'changed' });
    },
    exportWorld: async (id, name) => {
      audit('demo.world.export', name, id);
    },
    snapshot: async () => structuredClone(data),
    previewModpack: async () => ({
      token: crypto.randomUUID(),
      name: 'Explicit demo modpack',
      versionId: 'demo',
      minecraft: '1.21.11',
      engine: 'fabric',
      loader: 'demo',
      java: 21,
      files: [
        { path: 'mods/required.jar', size: 1024, side: 'required', available: true },
        { path: 'mods/client.jar', size: 512, side: 'unsupported', available: true },
      ],
      overrides: ['server-overrides/config/demo.json'],
      ignoredOverrides: [],
      bytes: 1024,
      warnings: [],
    }),
    createModpack: async (selection, input) => {
      if (selection.confirmation !== 'Explicit demo modpack')
        throw new Error('Incorrect confirmation.');
      const item = { ...server(input.name, input.engine, 'stopped', input.port), ...input };
      data.servers.push(item);
      emit({ type: 'changed' });
      return item;
    },
    previewServerImport: async () => ({
      token: crypto.randomUUID(),
      sourcePath: 'C:/Demo/existing-server',
      name: 'Existing demo server',
      engine: 'paper',
      version: '1.21.11',
      entrypoint: 'server.jar',
      entrypoints: ['server.jar'],
      properties: { 'server-port': '25568', 'level-name': 'world' },
      worlds: ['world'],
      plugins: 0,
      mods: 0,
      confidence: 'detected',
      warnings: [],
      eulaAccepted: true,
    }),
    importServer: async (input) => {
      const item = server(input.name, input.engine, 'stopped', input.port);
      item.imported = true;
      item.externalFolder = !input.copy;
      data.servers.push(item);
      emit({ type: 'changed' });
      return item;
    },
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
      audit('demo.folder', 'Simulated folder.');
    },
    versions: async () => ['1.21.11', '1.21.10', '1.21.8', '1.21.4', '1.20.6'],
    builds: async () => ['demo'],
    installers: async () => ['demo'],
    create: async (input) => {
      const s = { ...server(input.name, input.engine, 'stopped', input.port), ...input };
      data.servers.push(s);
      audit('server.created', s.name, s.id);
      emit({ type: 'server', server: s });
      return s;
    },
    cancelDownload: async () => {
      audit('demo.download', 'Simulated cancellation.');
    },
    operations: async () => [],
    updateStatus: async () => ({
      currentVersion: '0.3.1',
      automaticChecks: false,
      trustedKeyConfigured: false,
      packaged: false,
    }),
    configureUpdates: async (automaticChecks) => ({
      currentVersion: '0.3.1',
      automaticChecks,
      trustedKeyConfigured: false,
      packaged: false,
    }),
    checkUpdates: async () => ({
      currentVersion: '0.3.1',
      automaticChecks: false,
      trustedKeyConfigured: false,
      packaged: false,
      error: 'Application updates are unavailable in demo mode.',
    }),
    downloadUpdate: async () => {
      throw new Error('Application updates are unavailable in demo mode.');
    },
    installUpdate: async () => {
      throw new Error('Application updates are unavailable in demo mode.');
    },
    retentionPolicy: async () => ({
      mode: 'disabled',
      count: 10,
      days: 7,
      hourly: 24,
      daily: 7,
      weekly: 4,
      monthly: 12,
      includeManual: false,
      timezone: 'UTC',
    }),
    configureRetention: async (_id, input) => {
      audit('demo.retention', 'Demo retention policy');
      return input;
    },
    previewRetention: async (id) => ({
      token: crypto.randomUUID(),
      serverId: id,
      createdAt: new Date().toISOString(),
      policy: {
        mode: 'disabled',
        count: 10,
        days: 7,
        hourly: 24,
        daily: 7,
        weekly: 4,
        monthly: 12,
        includeManual: false,
        timezone: 'UTC',
      },
      archives: [],
      bytes: 0,
      protectedCount: 0,
      unavailableCount: 0,
    }),
    purgeRetention: async () => {
      audit('demo.retention', 'Demo retention preview purge');
    },
    cancelOperation: async () => {
      audit('demo.cancel', 'Simulated cancellation.');
    },
    dismissOperation: async () => {
      audit('demo.dismiss', 'Simulated dismissal.');
    },
    recoveryReview: async (id) => ({
      id,
      label: 'Demo operation',
      copies: [],
      rollbackAvailable: false,
      backups: [],
      preservedCopies: [],
    }),
    resolveOperation: async () => {
      audit('operation.resolved', 'Demo recovery');
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
      if (get(id).name !== confirmation) throw new Error('Incorrect confirmation.');
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
      audit('console.command', 'Simulated command.', id);
      return command === 'list'
        ? 'There are 2 of a max of 20 players online: Alex, Steve'
        : '[Demo] Command executed.';
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
    readFile: async (id, file) => texts.get(id + ':' + file) ?? '# Demo file\n',
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
      audit('demo.upload', 'Simulated import', id);
    },
    exportFile: async (id) => {
      audit('demo.export', 'Simulated export', id);
    },
    fileAction: async (id, input) => {
      const value = texts.get(id + ':' + input.source) ?? '# Demo file\n';
      texts.set(id + ':' + input.destination, value);
      if (input.action !== 'copy') texts.delete(id + ':' + input.source);
      audit('demo.files.' + input.action, input.destination, id);
    },
    compressArchive: async (id, folder) => {
      audit('demo.archive.export', folder, id);
    },
    extractArchive: async (id, input) => {
      audit('demo.archive.extract', input.destination, id);
    },
    runtimeEntries: async () => [],
    runtimeHealth: async (id) => ({
      id,
      status: 'unavailable',
      checkedAt: new Date().toISOString(),
    }),
    repairRuntime: async (input) => {
      audit('demo.runtime.repair', input.id);
    },
    deleteRuntime: async (input) => {
      audit('demo.runtime.delete', input.id);
    },
    playerReport: async (id) => ({
      players: get(id).players.map((name) => ({
        name,
        joins: 1,
        observedMs: 0,
        online: true,
        operator: false,
        whitelisted: false,
        banned: false,
      })),
      actions: ['whitelistAdd', 'whitelistRemove', 'op', 'deop', 'kick', 'ban', 'pardon'],
      warnings: [],
    }),
    moderatePlayer: async (id, input) => {
      audit('demo.player.' + input.action, input.name, id);
      return 'Demo command sent.';
    },
    storageOverview: async () => ({ history: [] }),
    scanStorage: async () => ({
      at: new Date().toISOString(),
      serverBytes: 0,
      totalBytes: 0,
      files: 0,
      excludedEntries: 0,
      largest: [],
      categories: {
        worlds: 0,
        plugins: 0,
        mods: 0,
        logs: 0,
        backups: 0,
        config: 0,
        cache: 0,
        other: 0,
      },
    }),
    revealStorageFile: async (id, input) => {
      audit('demo.storage.reveal', input.relativePath, id);
    },
    backup,
    verifyBackup: async () => true,
    restore: async (id, confirmation) => {
      const item = data.backups.find((b) => b.id === id);
      if (!item || get(item.serverId).name !== confirmation)
        throw new Error('Incorrect confirmation.');
      await backup(item.serverId);
      audit('backup.restored', item.name, item.serverId);
    },
    exportBackup: async () => {
      audit('demo.export', 'Simulated export');
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
    toggleSchedule: async (id, enabled) => {
      const job = data.schedules.find((value) => value.id === id);
      if (job) job.enabled = enabled;
      emit({ type: 'changed' });
    },
    schedulePreview: async (input) =>
      Array.from({ length: 5 }, (_, i) =>
        new Date(Date.now() + (i + 1) * input.intervalMinutes * 60000).toISOString(),
      ),
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
        description: 'A permissions system for your server.',
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
    marketplaceSettings: async () => ({ curseforgeConfigured: false, historyLimit: 5 }),
    contentIcon: async () => null,
    crossplayStatus: async (id) => ({
      supported: ['paper', 'purpur', 'fabric', 'neoforge'].includes(get(id).engine),
      geyserInstalled: false,
      floodgateInstalled: false,
      configured: false,
    }),
    crossplayVersions: async () => ({ geyser: [], floodgate: [] }),
    configureCrossplay: async () => {
      throw new Error('Crossplay configuration is unavailable in this demo.');
    },
    clearIconCache: async () => {},
    configureMarketplace: async (input) => ({
      curseforgeConfigured: false,
      historyLimit: input.historyLimit,
    }),
    contentVersions: async () => [demoVersion()],
    contentUpdates: async () => [],
    contentHistory: async () => [],
    manualContent: async () => [],
    contentVersion: async () => demoVersion(),
    changeContentVersion: async () => {
      throw new Error('Version changes are unavailable in this demo.');
    },
    uninstallContent: async (_id, contentId) => {
      const index = content.findIndex((item) => item.id === contentId);
      if (index >= 0) content.splice(index, 1);
      emit({ type: 'changed' });
    },
    rollbackContent: async () => {
      throw new Error('Rollback is unavailable in this demo.');
    },
  };
}
