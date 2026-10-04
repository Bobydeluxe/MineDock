import { z } from 'zod';
import { languageCodes } from './languages';
import { engineIds } from './engines';
import type { Operation, RecoveryAction, RecoveryReview } from './operations';
import type { CrossplayInput, CrossplayStatus, CrossplayVersions } from './crossplay';
import type { ImportServerInput, ImportServerPreview } from './imports';
import type { WorldSummary, WorldAction, WorldImportInput, WorldImportPreview } from './worlds';
import type { ModpackProfile, ModpackPreview, ModpackSelection } from './modpacks';
import type { FileAction, ExtractArchiveInput } from './files';
import type { StorageOverview, StorageReport, StorageLocation } from './storage';
import type { PlayerReport, ModeratePlayerInput } from './players';
import type { RuntimeEntry, RuntimeHealth, RuntimeActionInput } from './runtimes';
import type { RetentionPolicy, RetentionPreview, RetentionPurge } from './retention';
import type { UpdateStatus } from './updates';
import type {
  MarketplaceId,
  MarketplaceSettings,
  ContentKind,
  ContentVersion,
  ContentUpdate,
  ContentHistory,
  ManualContent,
} from './content';

export const PRODUCT = { name: 'MineDock', version: '0.3.0' } as const;
export const engineSchema = z.enum(engineIds);
export type Engine = z.infer<typeof engineSchema>;
export type ServerStatus =
  | 'installing'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'backing_up'
  | 'restoring';
export const createServerSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    engine: engineSchema,
    version: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
    memoryMin: z.number().int().min(256).max(131072),
    memoryMax: z.number().int().min(512).max(131072),
    port: z.number().int().min(1024).max(65535),
    difficulty: z.enum(['peaceful', 'easy', 'normal', 'hard']),
    gamemode: z.enum(['survival', 'creative', 'adventure', 'spectator']),
    maxPlayers: z.number().int().min(1).max(1000),
    viewDistance: z.number().int().min(2).max(32),
    simulationDistance: z.number().int().min(2).max(32),
    pvp: z.boolean(),
    whitelist: z.boolean(),
    onlineMode: z.boolean(),
    seed: z.string().max(100),
    motd: z.string().max(200),
    autoStart: z.boolean(),
    autoRestart: z.boolean(),
    loaderVersion: z
      .string()
      .regex(/^[a-zA-Z0-9._+-]{1,80}$/)
      .optional(),
    installerVersion: z
      .string()
      .regex(/^[a-zA-Z0-9._+-]{1,80}$/)
      .optional(),
    ipv6Port: z.number().int().min(1024).max(65535).optional(),
    eula: z.literal(true),
  })
  .refine((v) => v.memoryMin <= v.memoryMax, {
    message: 'Minimum memory exceeds maximum memory.',
  });
export type CreateServerInput = z.infer<typeof createServerSchema>;
export const serverOptionsSchema = z
  .object({
    memoryMin: z.number().int().min(256).max(131072),
    memoryMax: z.number().int().min(512).max(131072),
    autoStart: z.boolean(),
    autoRestart: z.boolean(),
    javaPath: z.string(),
  })
  .refine((v) => v.memoryMin <= v.memoryMax, { message: 'Invalid minimum memory.' });
export type ServerOptions = z.infer<typeof serverOptionsSchema>;
export interface Server extends Omit<CreateServerInput, 'eula'> {
  modpack?: ModpackProfile;
  id: string;
  path: string;
  javaMajor: number;
  javaPath: string;
  build: string;
  status: ServerStatus;
  createdAt: string;
  updatedAt: string;
  pid?: number;
  startedAt?: string;
  exitCode?: number;
  error?: string;
  cpu: number;
  memory: number;
  players: string[];
  diskBytes: number;
  installationComplete?: boolean;
  entrypoint?: string;
  launchArgsFile?: string;
  runtimePath?: string;
  imported?: boolean;
  externalFolder?: boolean;
  crossplayPort?: number;
  minecraftVersion?: string;
}
export interface LogLine {
  seq: number;
  at: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'CHAT';
  text: string;
}
export interface Metric {
  at: string;
  cpu: number;
  memory: number;
  players: number;
}
export interface Backup {
  id: string;
  serverId: string;
  name: string;
  createdAt: string;
  size: number;
  sha256: string;
  version: string;
  reason: string;
}
export const scheduleSchema = z
  .object({
    serverId: z.string().uuid(),
    action: z.enum(['backup', 'restart', 'start', 'stop', 'command']),
    intervalMinutes: z.number().int().min(5).max(525600),
    command: z.string().max(500).default(''),
    enabled: z.boolean().default(true),
    mode: z.enum(['interval', 'daily', 'cron']).optional(),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    cron: z.string().trim().max(120).optional(),
    timezone: z.string().max(80).optional(),
    warnings: z.array(z.number().int().min(1).max(86400)).max(10).optional(),
    warningMessage: z.string().max(300).optional(),
  })
  .refine(
    (v) => v.action !== 'command' || (v.command.trim().length > 0 && !/[\r\n\0]/.test(v.command)),
    { message: 'Invalid command.' },
  );
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export interface Schedule extends ScheduleInput {
  id: string;
  nextRun: string;
  lastError?: string;
  warningsSent?: string[];
}
export interface Activity {
  id: number;
  at: string;
  action: string;
  serverId?: string;
  detail: string;
  success: boolean;
}
export const settingsSchema = z.object({
  language: z.enum(languageCodes),
  theme: z.enum(['dark', 'light', 'system']),
  serverRoot: z.string().min(1),
  backupRoot: z.string().min(1),
  preventSleep: z.boolean(),
  onboarded: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export interface Diagnostic {
  platform: string;
  arch: string;
  totalMemory: number;
  freeMemory: number;
  freeDisk: number;
  java: { path: string; major: number }[];
  docker: boolean;
  lanIp: string;
  port: number;
  dataRoot: string;
}
export interface Runtime {
  major: number;
  path: string;
  source: 'managed' | 'system';
  type?: 'java' | 'php';
  arch?: string;
  version?: string;
  requiredVersion?: string;
  release?: string;
}
export interface FileEntry {
  name: string;
  directory: boolean;
  size: number;
  modified: string;
}
export interface Project {
  id: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl?: string;
  categories: string[];
  provider?: MarketplaceId;
  kind?: ContentKind;
}
export interface InstalledContent {
  id: string;
  serverId: string;
  projectId: string;
  title: string;
  versionId: string;
  filename: string;
  enabled: boolean;
  provider?: MarketplaceId;
  kind?: ContentKind;
  folder?: 'plugins' | 'mods';
  sha256?: string;
  versionName?: string;
  gameVersion?: string;
  loader?: string;
  dependencies?: string[];
  installedAt?: string;
}
export const installedContentSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  projectId: z.string(),
  title: z.string(),
  versionId: z.string(),
  filename: z.string(),
  enabled: z.boolean(),
  provider: z.enum(['modrinth', 'curseforge', 'hangar', 'geyser']).optional(),
  kind: z.enum(['plugin', 'mod', 'datapack', 'resourcepack']).optional(),
  folder: z.enum(['plugins', 'mods']).optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  versionName: z.string().optional(),
  gameVersion: z.string().optional(),
  loader: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  installedAt: z.string().optional(),
});
export interface Progress {
  id: string;
  label: string;
  received: number;
  total: number;
  speed: number;
  phase: string;
  done?: boolean;
  error?: string;
}
export type AppEvent =
  | { type: 'server'; server: Server }
  | { type: 'log'; serverId: string; line: LogLine }
  | { type: 'logs'; serverId: string; lines: LogLine[] }
  | { type: 'metric'; serverId: string; metric: Metric }
  | { type: 'progress'; progress: Progress }
  | { type: 'activity'; activity: Activity }
  | { type: 'changed' };
export interface Snapshot {
  servers: Server[];
  backups: Backup[];
  schedules: Schedule[];
  settings: Settings;
  activity: Activity[];
  mock: boolean;
  operations?: Operation[];
}

/** Closed IPC contract. The renderer has no filesystem, process or network capabilities. */
export interface Api {
  snapshot(): Promise<Snapshot>;
  diagnostic(): Promise<Diagnostic>;
  settings(value: Settings): Promise<Settings>;
  selectFolder(): Promise<string | null>;
  openFolder(serverId?: string): Promise<void>;
  versions(engine: Engine): Promise<string[]>;
  builds(engine: Engine, version: string): Promise<string[]>;
  installers(engine: Engine): Promise<string[]>;
  create(input: CreateServerInput): Promise<Server>;
  previewServerImport(): Promise<ImportServerPreview | null>;
  importServer(input: ImportServerInput): Promise<Server>;
  previewModpack(): Promise<ModpackPreview | null>;
  createModpack(selection: ModpackSelection, input: CreateServerInput): Promise<Server>;
  worlds(id: string): Promise<WorldSummary[]>;
  worldAction(id: string, input: WorldAction): Promise<void>;
  previewWorldImport(id: string, archive: boolean): Promise<WorldImportPreview | null>;
  importWorld(id: string, input: WorldImportInput): Promise<void>;
  exportWorld(id: string, name: string): Promise<void>;
  retryInstallation(id: string): Promise<Server>;
  cancelDownload(id: string): Promise<void>;
  operations(): Promise<Operation[]>;
  cancelOperation(id: string): Promise<void>;
  dismissOperation(id: string): Promise<void>;
  recoveryReview(id: string): Promise<RecoveryReview>;
  resolveOperation(id: string, input: RecoveryAction): Promise<void>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  restart(id: string): Promise<void>;
  remove(id: string, confirmation: string): Promise<void>;
  logs(id: string): Promise<LogLine[]>;
  command(id: string, command: string): Promise<string>;
  players(id: string): Promise<string[]>;
  playerReport(id: string): Promise<PlayerReport>;
  moderatePlayer(id: string, input: ModeratePlayerInput): Promise<string>;
  properties(id: string): Promise<Record<string, string>>;
  saveProperties(id: string, properties: Record<string, string>): Promise<void>;
  configureServer(id: string, options: ServerOptions): Promise<Server>;
  files(id: string, path: string): Promise<FileEntry[]>;
  readFile(id: string, path: string): Promise<string>;
  writeFile(id: string, path: string, content: string): Promise<void>;
  mkdir(id: string, path: string): Promise<void>;
  deleteFile(id: string, path: string, confirmation: string): Promise<void>;
  uploadFile(id: string, path: string): Promise<void>;
  exportFile(id: string, path: string): Promise<void>;
  fileAction(id: string, input: FileAction): Promise<void>;
  compressArchive(id: string, path: string): Promise<void>;
  extractArchive(id: string, input: ExtractArchiveInput): Promise<void>;
  backup(id: string): Promise<Backup>;
  verifyBackup(id: string): Promise<boolean>;
  restore(id: string, confirmation: string): Promise<void>;
  exportBackup(id: string): Promise<void>;
  deleteBackup(id: string, confirmation: string): Promise<void>;
  retentionPolicy(id: string): Promise<RetentionPolicy>;
  configureRetention(id: string, input: RetentionPolicy): Promise<RetentionPolicy>;
  previewRetention(id: string): Promise<RetentionPreview>;
  purgeRetention(id: string, input: RetentionPurge): Promise<void>;
  updateStatus(): Promise<UpdateStatus>;
  configureUpdates(automaticChecks: boolean): Promise<UpdateStatus>;
  checkUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  installUpdate(confirmation: string): Promise<void>;
  schedules(input: ScheduleInput): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;
  toggleSchedule(id: string, enabled: boolean): Promise<void>;
  schedulePreview(input: ScheduleInput): Promise<string[]>;
  metrics(id: string, hours: number): Promise<Metric[]>;
  storageOverview(id: string): Promise<StorageOverview>;
  scanStorage(id: string): Promise<StorageReport>;
  revealStorageFile(id: string, input: StorageLocation): Promise<void>;
  runtimes(): Promise<Runtime[]>;
  installRuntime(major: number): Promise<Runtime>;
  runtimeEntries(): Promise<RuntimeEntry[]>;
  runtimeHealth(id: string): Promise<RuntimeHealth>;
  repairRuntime(input: RuntimeActionInput): Promise<void>;
  deleteRuntime(input: RuntimeActionInput): Promise<void>;
  search(id: string, query: string, provider?: MarketplaceId): Promise<Project[]>;
  installContent(
    id: string,
    projectId: string,
    provider?: MarketplaceId,
    versionId?: string,
  ): Promise<InstalledContent[]>;
  marketplaceSettings(): Promise<MarketplaceSettings>;
  contentIcon(url: string): Promise<string | null>;
  crossplayStatus(id: string): Promise<CrossplayStatus>;
  crossplayVersions(id: string): Promise<CrossplayVersions>;
  configureCrossplay(id: string, input: CrossplayInput): Promise<void>;
  clearIconCache(): Promise<void>;
  configureMarketplace(input: {
    curseforgeKey?: string;
    historyLimit: number;
  }): Promise<MarketplaceSettings>;
  content(id: string): Promise<InstalledContent[]>;
  toggleContent(id: string, contentId: string): Promise<void>;
  contentVersions(
    id: string,
    projectId: string,
    provider: MarketplaceId,
  ): Promise<ContentVersion[]>;
  contentVersion(provider: MarketplaceId, versionId: string): Promise<ContentVersion>;
  contentUpdates(id: string): Promise<ContentUpdate[]>;
  contentHistory(id: string, contentId: string): Promise<ContentHistory[]>;
  manualContent(id: string): Promise<ManualContent[]>;
  changeContentVersion(
    id: string,
    contentId: string,
    versionId: string,
    confirmation: string,
  ): Promise<InstalledContent[]>;
  uninstallContent(id: string, contentId: string, confirmation: string): Promise<void>;
  rollbackContent(
    id: string,
    contentId: string,
    historyId: string,
    confirmation: string,
  ): Promise<void>;
  onEvent(listener: (event: AppEvent) => void): () => void;
}
