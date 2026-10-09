import type { Server } from './types';
import { DomainError } from './errors';
export type PropertyCategory =
  'general' | 'gameplay' | 'world' | 'network' | 'resources' | 'resourcepacks' | 'advanced';
export interface PropertyField {
  key: string;
  category: PropertyCategory;
  type: 'boolean' | 'number' | 'text' | 'mode' | 'difficulty';
  min?: number;
  max?: number;
  risk?: 'identity' | 'world' | 'network' | 'rcon';
  introduced?: string;
  removed?: string;
}
const number = (
  key: string,
  category: PropertyCategory,
  min: number,
  max: number,
): PropertyField => ({ key, category, type: 'number', min, max });
const bool = (key: string, category: PropertyCategory): PropertyField => ({
  key,
  category,
  type: 'boolean',
});
const text = (
  key: string,
  category: PropertyCategory,
  risk?: PropertyField['risk'],
): PropertyField => ({ key, category, type: 'text', risk });
export const javaPropertyFields: PropertyField[] = [
  text('motd', 'general'),
  number('max-players', 'general', 1, 1000),
  { key: 'gamemode', category: 'general', type: 'mode' },
  { key: 'difficulty', category: 'general', type: 'difficulty' },
  bool('hardcore', 'general'),
  { ...bool('pvp', 'gameplay'), removed: '1.21.9' },
  bool('white-list', 'general'),
  bool('enforce-whitelist', 'general'),
  { ...bool('online-mode', 'general'), risk: 'identity' },
  { ...bool('enforce-secure-profile', 'general'), introduced: '1.19.1' },
  text('level-name', 'world', 'world'),
  text('level-seed', 'world', 'world'),
  text('level-type', 'world', 'world'),
  { ...bool('generate-structures', 'world'), risk: 'world' },
  number('spawn-protection', 'world', 0, 29999984),
  { ...bool('allow-nether', 'world'), removed: '1.21.9' },
  number('view-distance', 'world', 2, 32),
  { ...number('simulation-distance', 'world', 2, 32), introduced: '1.18' },
  number('max-world-size', 'world', 1, 29999984),
  { ...bool('spawn-animals', 'world'), removed: '1.21.2' },
  { ...bool('spawn-npcs', 'world'), removed: '1.21.2' },
  { ...bool('spawn-monsters', 'world'), removed: '1.21.9' },
  number('player-idle-timeout', 'gameplay', 0, 2147483647),
  bool('allow-flight', 'gameplay'),
  bool('force-gamemode', 'gameplay'),
  { ...bool('enable-command-block', 'gameplay'), removed: '1.21.9' },
  number('op-permission-level', 'gameplay', 1, 4),
  number('function-permission-level', 'gameplay', 1, 4),
  { ...number('server-port', 'network', 1024, 65535), risk: 'network' },
  text('server-ip', 'network', 'network'),
  { ...bool('enable-query', 'network'), risk: 'network' },
  { ...number('query.port', 'network', 1024, 65535), risk: 'network' },
  { ...bool('enable-rcon', 'network'), risk: 'rcon' },
  { ...number('rcon.port', 'network', 1024, 65535), risk: 'rcon' },
  number('network-compression-threshold', 'network', -1, 2147483647),
  bool('prevent-proxy-connections', 'network'),
  { ...number('entity-broadcast-range-percentage', 'resources', 10, 1000), introduced: '1.16' },
  number('max-tick-time', 'resources', -1, 2147483647),
  { ...bool('sync-chunk-writes', 'resources'), introduced: '1.16' },
  text('resource-pack', 'resourcepacks'),
  text('resource-pack-sha1', 'resourcepacks'),
  { ...bool('require-resource-pack', 'resourcepacks'), introduced: '1.17' },
  { ...text('resource-pack-prompt', 'resourcepacks'), introduced: '1.17' },
];
export const bedrockPropertyFields: PropertyField[] = [
  text('server-name', 'general'),
  number('max-players', 'general', 1, 1000),
  { key: 'gamemode', category: 'general', type: 'mode' },
  { key: 'difficulty', category: 'general', type: 'difficulty' },
  bool('allow-list', 'general'),
  { ...bool('online-mode', 'general'), risk: 'identity' },
  text('level-name', 'world', 'world'),
  text('level-seed', 'world', 'world'),
  number('view-distance', 'world', 5, 96),
  number('tick-distance', 'world', 4, 12),
  { ...number('server-port', 'network', 1024, 65535), risk: 'network' },
  { ...number('server-portv6', 'network', 1024, 65535), risk: 'network' },
  number('player-idle-timeout', 'gameplay', 0, 2147483647),
  bool('allow-cheats', 'gameplay'),
  number('max-threads', 'resources', 0, 1024),
  text('compression-algorithm', 'network'),
];
function compare(a: string, b: string): number {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}
export function supportsJavaProperty(version: string, key: string): boolean {
  const field = javaPropertyFields.find((f) => f.key === key);
  if (!field) return false;
  if (!/^\d+(\.\d+){1,2}$/.test(version)) return !field.introduced && !field.removed;
  return (
    (!field.introduced || compare(version, field.introduced) >= 0) &&
    (!field.removed || compare(version, field.removed) < 0)
  );
}
export function propertyFields(
  server: Pick<Server, 'engine' | 'version'>,
  current: Record<string, string>,
): PropertyField[] {
  if (server.engine === 'bedrock') return bedrockPropertyFields.filter((f) => f.key in current);
  if (server.engine === 'pocketmine')
    return [...javaPropertyFields, ...bedrockPropertyFields].filter(
      (f, i, all) =>
        f.key in current &&
        all.findIndex((v) => v.key === f.key) === i &&
        ![
          'rcon.port',
          'enable-rcon',
          'simulation-distance',
          'server-portv6',
          'tick-distance',
        ].includes(f.key),
    );
  const known = /^\d+(\.\d+){1,2}$/.test(server.version) && compare(server.version, '1.13') >= 0;
  return javaPropertyFields.filter((f) =>
    known ? supportsJavaProperty(server.version, f.key) : f.key in current,
  );
}
export function validatePropertyChanges(
  server: Pick<Server, 'engine' | 'version'>,
  current: Record<string, string>,
  changes: Record<string, string>,
): void {
  const fields = propertyFields(server, current);
  for (const [key, value] of Object.entries(changes)) {
    if (current[key] === value) continue;
    if (/password|secret|token|credential|private.?key/i.test(key))
      throw new DomainError('SECRET', 'Secrets must use the dedicated secure workflow.');
    const field = fields.find((f) => f.key === key);
    if (!field) {
      if (
        !(key in current) ||
        (javaPropertyFields.some((f) => f.key === key) &&
          !['bedrock', 'pocketmine'].includes(server.engine))
      )
        throw new DomainError(
          'CONFIG',
          'This property is not supported by the selected engine/version.',
        );
      continue;
    }
    if (field.type === 'boolean' && !['true', 'false'].includes(value))
      throw new DomainError('CONFIG', 'Expected a boolean property.');
    if (
      field.type === 'number' &&
      (!/^-?\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < field.min! ||
        Number(value) > field.max!)
    )
      throw new DomainError('CONFIG', 'The property value is out of range.');
    if (
      field.type === 'mode' &&
      ![
        'survival',
        'creative',
        'adventure',
        ...(server.engine === 'bedrock' || server.engine === 'pocketmine' ? [] : ['spectator']),
        '0',
        '1',
        '2',
        '3',
      ].includes(value)
    )
      throw new DomainError('CONFIG', 'Unsupported game mode.');
    if (
      field.type === 'difficulty' &&
      !['peaceful', 'easy', 'normal', 'hard', '0', '1', '2', '3'].includes(value)
    )
      throw new DomainError('CONFIG', 'Unsupported difficulty.');
    if (key === 'resource-pack-sha1' && value && !/^[a-f0-9]{40}$/i.test(value))
      throw new DomainError(
        'CONFIG',
        'Resource-pack SHA-1 must contain 40 hexadecimal characters.',
      );
    if (key === 'resource-pack' && value) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new DomainError('CONFIG', 'Invalid resource-pack URL.');
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new DomainError('CONFIG', 'Invalid resource-pack URL.');
    }
    if (key === 'resource-pack-prompt' && value)
      try {
        JSON.parse(value);
      } catch {
        throw new DomainError('CONFIG', 'Resource-pack prompt must be JSON text.');
      }
  }
}
