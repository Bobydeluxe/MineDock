import { gunzipSync } from 'node:zlib';
import { DomainError } from '../domain/errors';

export type NbtValue = number | string | NbtCompound | NbtValue[] | null;
export interface NbtCompound {
  [name: string]: NbtValue;
}
export interface LevelMetadata {
  edition: 'java' | 'bedrock';
  seed?: string;
  name?: string;
  lastPlayed?: string;
  version?: string;
}
/** Read-only NBT, with explicit byte, allocation, nesting and tag limits. Longs stay decimal strings. */
export function readLevelMetadata(input: Buffer): LevelMetadata {
  const maximum = 16 * 1024 ** 2;
  if (input.length > maximum) throw new DomainError('SIZE', 'World metadata exceeds 16 MB.');
  let data = input,
    little = false;
  if (input[0] === 0x1f && input[1] === 0x8b)
    data = gunzipSync(input, { maxOutputLength: maximum });
  else if (input.length > 8 && input[1] === 0 && input[2] === 0 && input[3] === 0) {
    if (input.readUInt32LE(4) !== input.length - 8)
      throw new DomainError('WORLD', 'Invalid Bedrock world metadata header.');
    data = input.subarray(8);
    little = true;
  }
  let offset = 0,
    tags = 0;
  const take = (size: number): number => {
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > data.length)
      throw new DomainError('WORLD', 'Truncated world metadata.');
    const start = offset;
    offset += size;
    return start;
  };
  const byte = () => data.readUInt8(take(1));
  const int = () => (little ? data.readInt32LE(take(4)) : data.readInt32BE(take(4)));
  const length = () => {
    const value = int();
    if (value < 0 || value > 200000)
      throw new DomainError('SIZE', 'World metadata contains too many entries.');
    return value;
  };
  const text = () => {
    const size = little ? data.readUInt16LE(take(2)) : data.readUInt16BE(take(2));
    return data.subarray(take(size), offset).toString('utf8');
  };
  const value = (type: number, depth: number): NbtValue => {
    if (depth > 64 || ++tags > 200000)
      throw new DomainError('SIZE', 'World metadata is too complex.');
    switch (type) {
      case 1:
        return data.readInt8(take(1));
      case 2:
        return little ? data.readInt16LE(take(2)) : data.readInt16BE(take(2));
      case 3:
        return int();
      case 4:
        return (little ? data.readBigInt64LE(take(8)) : data.readBigInt64BE(take(8))).toString();
      case 5:
        return little ? data.readFloatLE(take(4)) : data.readFloatBE(take(4));
      case 6:
        return little ? data.readDoubleLE(take(8)) : data.readDoubleBE(take(8));
      case 7:
        take(length());
        return null;
      case 8:
        return text();
      case 9: {
        const subtype = byte(),
          size = length();
        if (subtype === 0 && size !== 0)
          throw new DomainError('WORLD', 'Invalid world metadata list.');
        const result: NbtValue[] = [];
        for (let i = 0; i < size; i++) result.push(value(subtype, depth + 1));
        return result;
      }
      case 10: {
        const result: NbtCompound = Object.create(null) as NbtCompound;
        for (;;) {
          const subtype = byte();
          if (!subtype) return result;
          const name = text();
          if (Object.hasOwn(result, name))
            throw new DomainError('WORLD', 'Duplicate world metadata tag.');
          result[name] = value(subtype, depth + 1);
        }
      }
      case 11:
        take(length() * 4);
        return null;
      case 12:
        take(length() * 8);
        return null;
      default:
        throw new DomainError('WORLD', 'Invalid world metadata tag.');
    }
  };
  if (byte() !== 10)
    throw new DomainError('WORLD', 'Expected a Minecraft world metadata compound.');
  text();
  const root = value(10, 0) as NbtCompound;
  if (offset !== data.length)
    throw new DomainError('WORLD', 'Unexpected data after world metadata.');
  const compound = (input: NbtValue | undefined): NbtCompound =>
    input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : (Object.create(null) as NbtCompound);
  const details = little ? root : compound(root.Data),
    generator = compound(details.WorldGenSettings),
    version = compound(details.Version);
  if (!little && (!root.Data || typeof root.Data !== 'object' || Array.isArray(root.Data)))
    throw new DomainError('WORLD', 'Missing Java world metadata.');
  const scalar = (input: NbtValue | undefined) =>
    typeof input === 'string' || typeof input === 'number' ? String(input) : undefined;
  const played = Number(details.LastPlayed ?? details.lastPlayed);
  const millis = little ? played * 1000 : played;
  return {
    edition: little ? 'bedrock' : 'java',
    seed: scalar(generator.seed ?? details.RandomSeed),
    name: scalar(details.LevelName),
    version: scalar(version.Name),
    lastPlayed:
      Number.isFinite(millis) && millis > 0 && millis <= Date.now() + 86400000
        ? new Date(millis).toISOString()
        : undefined,
  };
}
