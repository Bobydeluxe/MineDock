import { gzipSync } from 'node:zlib';
/** Independent NBT fixture encoder: known Minecraft Java and Bedrock level.dat fields. */
export function worldMetadata(
  edition: 'java' | 'bedrock' = 'java',
  seed = '9223372036854775806',
): Buffer {
  const little = edition === 'bedrock';
  const name = (text: string) => {
    const bytes = Buffer.from(text),
      length = Buffer.alloc(2);
    if (little) length.writeUInt16LE(bytes.length);
    else length.writeUInt16BE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const compound = (key: string) => Buffer.concat([Buffer.from([10]), name(key)]);
  const long = (key: string, value: string) => {
    const bytes = Buffer.alloc(8);
    if (little) bytes.writeBigInt64LE(BigInt(value));
    else bytes.writeBigInt64BE(BigInt(value));
    return Buffer.concat([Buffer.from([4]), name(key), bytes]);
  };
  const string = (key: string, value: string) =>
    Buffer.concat([Buffer.from([8]), name(key), name(value)]);
  const end = Buffer.from([0]);
  const payload = little
    ? Buffer.concat([
        compound(''),
        long('RandomSeed', seed),
        string('LevelName', 'Fixture world'),
        end,
      ])
    : Buffer.concat([
        compound(''),
        compound('Data'),
        compound('WorldGenSettings'),
        long('seed', seed),
        end,
        compound('Version'),
        string('Name', '1.21.11'),
        end,
        string('LevelName', 'Fixture world'),
        end,
        end,
      ]);
  if (!little) return gzipSync(payload);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(10);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
