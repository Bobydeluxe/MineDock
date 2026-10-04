import { open, realpath } from 'node:fs/promises';
export type ExecutableArchitecture = 'x64' | 'arm64' | 'ia32' | 'arm';
export function normalizeArchitecture(value?: string): ExecutableArchitecture | undefined {
  return value
    ? (
        {
          amd64: 'x64',
          x86_64: 'x64',
          x64: 'x64',
          aarch64: 'arm64',
          arm64: 'arm64',
          x86: 'ia32',
          i386: 'ia32',
          i686: 'ia32',
          arm: 'arm',
          armv7l: 'arm',
        } as Record<string, ExecutableArchitecture>
      )[value.toLowerCase()]
    : undefined;
}
/** Read PE, ELF and Mach-O headers, including universal Mach-O, without executing the binary. */
export async function executableArchitectures(filename: string): Promise<ExecutableArchitecture[]> {
  const file = await open(await realpath(filename), 'r');
  try {
    const header = Buffer.alloc(4096),
      { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead < 20) return [];
    const result: ExecutableArchitecture[] = [];
    const add = (value: ExecutableArchitecture | undefined) => {
      if (value && !result.includes(value)) result.push(value);
    };
    if (header[0] === 0x4d && header[1] === 0x5a && bytesRead >= 64) {
      const offset = header.readUInt32LE(0x3c);
      if (offset < 64 || offset > 1024 ** 2) return [];
      const pe = Buffer.alloc(6),
        info = await file.read(pe, 0, pe.length, offset);
      if (info.bytesRead !== 6 || pe.readUInt32LE(0) !== 0x00004550) return [];
      add(
        (
          { 0x8664: 'x64', 0xaa64: 'arm64', 0x014c: 'ia32', 0x01c4: 'arm' } as Record<
            number,
            ExecutableArchitecture
          >
        )[pe.readUInt16LE(4)],
      );
    } else if (header.readUInt32BE(0) === 0x7f454c46) {
      if (![1, 2].includes(header[4]!) || ![1, 2].includes(header[5]!)) return [];
      const machine = header[5] === 1 ? header.readUInt16LE(18) : header.readUInt16BE(18);
      add(
        (
          { 62: 'x64', 183: 'arm64', 3: 'ia32', 40: 'arm' } as Record<
            number,
            ExecutableArchitecture
          >
        )[machine],
      );
    } else {
      const littleMagic = header.readUInt32LE(0),
        bigMagic = header.readUInt32BE(0),
        normal = [0xfeedface, 0xfeedfacf],
        fat = [0xcafebabe, 0xcafebabf];
      const little = normal.includes(littleMagic) || fat.includes(littleMagic),
        magic = little ? littleMagic : bigMagic;
      const uint = (offset: number) =>
        little ? header.readUInt32LE(offset) : header.readUInt32BE(offset);
      const cpu = (value: number) =>
        (
          ({ 0x01000007: 'x64', 0x0100000c: 'arm64', 7: 'ia32', 12: 'arm' }) as Record<
            number,
            ExecutableArchitecture
          >
        )[value];
      if (normal.includes(magic)) add(cpu(uint(4)));
      else if (fat.includes(magic)) {
        const count = uint(4),
          stride = magic === 0xcafebabf ? 32 : 20;
        if (count < 1 || count > 16 || 8 + count * stride > bytesRead) return [];
        for (let index = 0; index < count; index++) add(cpu(uint(8 + index * stride)));
      }
    }
    return result;
  } finally {
    await file.close();
  }
}
