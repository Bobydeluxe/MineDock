import { gunzipSync, gzipSync } from 'node:zlib';
import { DomainError } from '../domain/errors';

/** Lossless Java NBT. Original leaf payloads and tag names survive edits byte for byte. */
export interface NbtTag {
  type: number;
  name?: string;
  nameBytes?: Buffer;
  value: number | bigint | string | Buffer | NbtTag[];
  subtype?: number;
  raw?: Buffer;
}
const maximum = 16 * 1024 ** 2;
const invalid = (message: string): never => {
  throw new DomainError('PLAYER_DATA', message);
};
export function readPlayerNbt(input: Buffer): NbtTag {
  if (input.length > maximum) invalid('Player data exceeds 16 MB.');
  if (input[0] !== 0x1f || input[1] !== 0x8b) invalid('Expected gzip-compressed Java player data.');
  let data: Buffer;
  try {
    data = gunzipSync(input, { maxOutputLength: maximum });
  } catch {
    return invalid('Player data is truncated, damaged or too large.');
  }
  let offset = 0,
    tags = 0;
  const take = (n: number): Buffer => {
    if (!Number.isSafeInteger(n) || n < 0 || offset + n > data.length)
      invalid('Truncated player data.');
    const result = data.subarray(offset, offset + n);
    offset += n;
    return result;
  };
  const byte = () => take(1).readUInt8();
  const length = () => {
    const n = take(4).readInt32BE();
    if (n < 0 || n > 200000) invalid('Player data contains too many entries.');
    return n;
  };
  const text = () => {
    const size = take(2).readUInt16BE(),
      bytes = take(size);
    return { text: bytes.toString('utf8'), bytes };
  };
  const payload = (type: number, depth: number): NbtTag => {
    if (++tags > 200000 || depth > 64) invalid('Player data is too complex.');
    const start = offset;
    let value: NbtTag['value'], subtype: number | undefined;
    switch (type) {
      case 1:
        value = take(1).readInt8();
        break;
      case 2:
        value = take(2).readInt16BE();
        break;
      case 3:
        value = take(4).readInt32BE();
        break;
      case 4:
        value = take(8).readBigInt64BE();
        break;
      case 5:
        value = take(4).readFloatBE();
        break;
      case 6:
        value = take(8).readDoubleBE();
        break;
      case 7:
        value = take(length());
        break;
      case 8:
        value = text().text;
        break;
      case 9: {
        subtype = byte();
        const size = length();
        if (subtype > 12 || (subtype === 0 && size !== 0)) invalid('Invalid player data list.');
        value = Array.from({ length: size }, () => payload(subtype!, depth + 1));
        break;
      }
      case 10: {
        value = [];
        const names = new Set<string>();
        for (;;) {
          const childType = byte();
          if (!childType) break;
          const name = text();
          if (names.has(name.text)) invalid('Duplicate player data tag.');
          names.add(name.text);
          value.push({ ...payload(childType, depth + 1), name: name.text, nameBytes: name.bytes });
        }
        break;
      }
      case 11:
        value = take(length() * 4);
        break;
      case 12:
        value = take(length() * 8);
        break;
      default:
        return invalid('Unknown player data tag type.');
    }
    return { type, value, subtype, raw: data.subarray(start, offset) };
  };
  if (byte() !== 10) invalid('Expected a Java player compound.');
  const name = text(),
    root = { ...payload(10, 0), name: name.text, nameBytes: name.bytes };
  if (offset !== data.length) invalid('Unexpected data after player compound.');
  return root;
}
export function child(tag: NbtTag | undefined, name: string): NbtTag | undefined {
  return tag?.type === 10 && Array.isArray(tag.value)
    ? tag.value.find((entry) => entry.name === name)
    : undefined;
}
export function children(tag: NbtTag | undefined): NbtTag[] {
  return tag && [9, 10].includes(tag.type) && Array.isArray(tag.value) ? tag.value : [];
}
export function scalar(tag: NbtTag | undefined): number | string | undefined {
  return tag && (typeof tag.value === 'number' || typeof tag.value === 'string')
    ? tag.value
    : undefined;
}
export function setChild(tag: NbtTag, name: string, value?: NbtTag): void {
  if (tag.type !== 10 || !Array.isArray(tag.value)) invalid('Expected a compound.');
  const entries = tag.value as NbtTag[],
    at = entries.findIndex((entry) => entry.name === name);
  if (value) {
    const entry = { ...value, name, nameBytes: entries[at]?.nameBytes };
    if (at < 0) entries.push(entry);
    else entries[at] = entry;
  } else if (at >= 0) entries.splice(at, 1);
  tag.raw = undefined;
}
export function writePlayerNbt(root: NbtTag): Buffer {
  let tags = 0;
  const number = (size: number, write: (buffer: Buffer) => void) => {
    const buffer = Buffer.alloc(size);
    write(buffer);
    return buffer;
  };
  const int = (n: number) => number(4, (b) => b.writeInt32BE(n));
  const string = (name: string, raw?: Buffer) => {
    const bytes = raw ?? Buffer.from(name, 'utf8');
    if (bytes.length > 65535) invalid('Player data string is too large.');
    return Buffer.concat([number(2, (b) => b.writeUInt16BE(bytes.length)), bytes]);
  };
  const payload = (tag: NbtTag, depth: number): Buffer => {
    if (++tags > 200000 || depth > 64) invalid('Player data is too complex.');
    // Containers are always traversed: a changed descendant cannot be hidden by stale raw bytes.
    if (tag.raw && ![9, 10].includes(tag.type)) return tag.raw;
    const n = Number(tag.value);
    switch (tag.type) {
      case 1:
        return number(1, (b) => b.writeInt8(n));
      case 2:
        return number(2, (b) => b.writeInt16BE(n));
      case 3:
        return int(n);
      case 4:
        return number(8, (b) => b.writeBigInt64BE(BigInt(tag.value as bigint)));
      case 5:
        return number(4, (b) => b.writeFloatBE(n));
      case 6:
        return number(8, (b) => b.writeDoubleBE(n));
      case 8:
        return string(String(tag.value));
      case 7:
      case 11:
      case 12: {
        if (!Buffer.isBuffer(tag.value)) return invalid('Invalid NBT array.');
        return Buffer.concat([
          int(tag.value.length / (tag.type === 11 ? 4 : tag.type === 12 ? 8 : 1)),
          tag.value,
        ]);
      }
      case 9:
        return Buffer.concat([
          Buffer.from([tag.subtype ?? 0]),
          int(children(tag).length),
          ...children(tag).map((t) => payload(t, depth + 1)),
        ]);
      case 10:
        return Buffer.concat([
          ...children(tag).map((t) =>
            Buffer.concat([
              Buffer.from([t.type]),
              string(t.name ?? '', t.nameBytes),
              payload(t, depth + 1),
            ]),
          ),
          Buffer.from([0]),
        ]);
      default:
        return invalid('Unknown player data tag type.');
    }
  };
  if (root.type !== 10) invalid('Expected a Java player compound.');
  const data = Buffer.concat([
    Buffer.from([10]),
    string(root.name ?? '', root.nameBytes),
    payload(root, 0),
  ]);
  if (data.length > maximum) invalid('Player data exceeds 16 MB.');
  const result = gzipSync(data);
  readPlayerNbt(result);
  return result;
}
/** Bounded SNBT response parser. No eval, selectors, executable syntax or implicit live provenance. */
export function readSnbt(input: string): NbtTag {
  if (Buffer.byteLength(input) > 2 * 1024 ** 2) invalid('Native player response is too large.');
  let at = 0,
    nodes = 0;
  const space = () => {
    while (/\s/.test(input[at] ?? '') && at < input.length) at++;
  };
  const quoted = (): string => {
    const quote = input[at++]!;
    let result = '';
    while (at < input.length) {
      const c = input[at++]!;
      if (c === quote) return result;
      if (c === '\\') {
        const escaped = input[at++];
        if (escaped !== quote && escaped !== '\\') invalid('Invalid SNBT escape.');
        result += escaped;
      } else result += c;
    }
    return invalid('Truncated SNBT string.');
  };
  const token = (key = false) => {
    space();
    if (input[at] === '"' || input[at] === "'") return quoted();
    const start = at;
    while (at < input.length && !(key ? /[\s:,{}[\]]/ : /[\s,{}[\]]/).test(input[at]!)) at++;
    if (at === start) invalid('Invalid SNBT token.');
    return input.slice(start, at);
  };
  const expect = (character: string) => {
    space();
    if (input[at++] !== character) invalid('Malformed native player data.');
  };
  const value = (depth: number): NbtTag => {
    if (depth > 64 || ++nodes > 100000) invalid('Native player data is too complex.');
    space();
    if (input[at] === '{') {
      at++;
      space();
      const entries: NbtTag[] = [],
        names = new Set<string>();
      while (input[at] !== '}') {
        const name = token(true);
        expect(':');
        if (names.has(name)) invalid('Duplicate SNBT tag.');
        names.add(name);
        entries.push({ ...value(depth + 1), name });
        space();
        if (input[at] === '}') break;
        expect(',');
      }
      expect('}');
      return { type: 10, value: entries };
    }
    if (input[at] === '[') {
      at++;
      space();
      const arrayType = /^[BIL];/.exec(input.slice(at))?.[0];
      if (arrayType) at += 2;
      const entries: NbtTag[] = [];
      while (input[at] !== ']') {
        entries.push(value(depth + 1));
        space();
        if (input[at] === ']') break;
        expect(',');
      }
      expect(']');
      if (entries.some((entry) => entry.type !== entries[0]?.type))
        invalid('Mixed SNBT list types.');
      if (arrayType) {
        const type = arrayType[0] === 'B' ? 7 : arrayType[0] === 'I' ? 11 : 12,
          width = type === 7 ? 1 : type === 11 ? 4 : 8;
        const buffer = Buffer.alloc(entries.length * width);
        entries.forEach((entry, i) => {
          if (type === 12 && entry.type === 4)
            buffer.writeBigInt64BE(entry.value as bigint, i * width);
          else if (type === 11 && entry.type === 3)
            buffer.writeInt32BE(Number(entry.value), i * width);
          else if (type === 7 && entry.type === 1) buffer.writeInt8(Number(entry.value), i);
          else invalid('Invalid SNBT array element.');
        });
        return { type, value: buffer };
      }
      return { type: 9, subtype: entries[0]?.type ?? 0, value: entries };
    }
    if (input[at] === '"' || input[at] === "'") return { type: 8, value: quoted() };
    const raw = token(),
      match = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)([bBsSlLfFdD]?)$/.exec(raw);
    if (raw === 'true' || raw === 'false') return { type: 1, value: raw === 'true' ? 1 : 0 };
    if (!match) return { type: 8, value: raw };
    const suffix = match[2]!.toLowerCase(),
      numeric = match[1]!;
    if (suffix === 'l') {
      if (!/^[-+]?\d+$/.test(numeric)) invalid('Invalid SNBT long.');
      const n = BigInt(numeric);
      if (n < -9223372036854775808n || n > 9223372036854775807n) invalid('Invalid SNBT long.');
      return { type: 4, value: n };
    }
    const n = Number(numeric),
      type =
        suffix === 'b'
          ? 1
          : suffix === 's'
            ? 2
            : suffix === 'f'
              ? 5
              : suffix === 'd' || /[.eE]/.test(numeric)
                ? 6
                : 3;
    if (
      !Number.isFinite(n) ||
      (type <= 3 &&
        (!Number.isSafeInteger(n) ||
          n < -(2 ** (type === 1 ? 7 : type === 2 ? 15 : 31)) ||
          n >= 2 ** (type === 1 ? 7 : type === 2 ? 15 : 31)))
    )
      invalid('Invalid SNBT number.');
    return { type, value: n };
  };
  const root = value(0);
  space();
  if (at !== input.length || root.type !== 10) invalid('Invalid native player compound.');
  return root;
}
