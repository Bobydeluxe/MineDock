export const engineIds = [
  'vanilla',
  'paper',
  'purpur',
  'fabric',
  'forge',
  'neoforge',
  'bedrock',
  'pocketmine',
] as const;
export type EngineId = (typeof engineIds)[number];
export type Edition = 'java' | 'bedrock';
export type RuntimeType = 'java' | 'php' | 'native';
export interface EngineCapabilities {
  plugins: boolean;
  mods: boolean;
  rcon: boolean;
  javaMemory: boolean;
  crossplay: boolean;
  worlds: boolean;
  marketplace: boolean;
  playerAdministration: boolean;
  properties: boolean;
  liveBackup: boolean;
}
export interface EngineDefinition {
  id: EngineId;
  displayName: string;
  edition: Edition;
  runtimeType: RuntimeType;
  capabilities: EngineCapabilities;
  contentFolder?: 'plugins' | 'mods';
  contentLoaders: readonly string[];
  worldFolder: '' | 'worlds';
  protocol: 'tcp' | 'udp';
  readyPattern: RegExp;
  platforms: readonly NodeJS.Platform[];
}
const java: EngineCapabilities = {
  plugins: false,
  mods: false,
  rcon: true,
  javaMemory: true,
  crossplay: false,
  worlds: true,
  marketplace: false,
  playerAdministration: true,
  properties: true,
  liveBackup: true,
};
const native: EngineCapabilities = { ...java, rcon: false, javaMemory: false, liveBackup: false };
const platforms = ['win32', 'linux', 'darwin'] as const;
const base = {
  edition: 'java',
  runtimeType: 'java',
  worldFolder: '',
  protocol: 'tcp',
  readyPattern: /Done \([\d.,]+s\)!/,
  platforms,
} as const;
/** The renderer and services share capabilities; installation adapters own engine-specific details. */
export const engines: Record<EngineId, EngineDefinition> = {
  vanilla: {
    ...base,
    id: 'vanilla',
    displayName: 'Vanilla',
    capabilities: java,
    contentLoaders: [],
  },
  paper: {
    ...base,
    id: 'paper',
    displayName: 'Paper',
    capabilities: { ...java, plugins: true, crossplay: true, marketplace: true },
    contentFolder: 'plugins',
    contentLoaders: ['paper', 'spigot', 'bukkit'],
  },
  purpur: {
    ...base,
    id: 'purpur',
    displayName: 'Purpur',
    capabilities: { ...java, plugins: true, crossplay: true, marketplace: true },
    contentFolder: 'plugins',
    contentLoaders: ['purpur', 'paper', 'spigot', 'bukkit'],
  },
  fabric: {
    ...base,
    id: 'fabric',
    displayName: 'Fabric',
    capabilities: { ...java, mods: true, crossplay: true, marketplace: true },
    contentFolder: 'mods',
    contentLoaders: ['fabric'],
  },
  forge: {
    ...base,
    id: 'forge',
    displayName: 'Forge',
    capabilities: { ...java, mods: true, marketplace: true },
    contentFolder: 'mods',
    contentLoaders: ['forge'],
  },
  neoforge: {
    ...base,
    id: 'neoforge',
    displayName: 'NeoForge',
    capabilities: { ...java, mods: true, crossplay: true, marketplace: true },
    contentFolder: 'mods',
    contentLoaders: ['neoforge'],
  },
  bedrock: {
    id: 'bedrock',
    displayName: 'Bedrock Dedicated Server',
    edition: 'bedrock',
    runtimeType: 'native',
    capabilities: native,
    contentLoaders: [],
    worldFolder: 'worlds',
    protocol: 'udp',
    readyPattern: /Server started\./,
    platforms: ['win32', 'linux'],
  },
  pocketmine: {
    id: 'pocketmine',
    displayName: 'PocketMine-MP',
    edition: 'bedrock',
    runtimeType: 'php',
    capabilities: { ...native, plugins: true },
    contentFolder: 'plugins',
    contentLoaders: ['pocketmine'],
    worldFolder: 'worlds',
    protocol: 'udp',
    readyPattern: /Done \([\d.,]+s\)!/,
    platforms,
  },
};
export function engineDefinition(id: EngineId): EngineDefinition {
  return engines[id];
}
