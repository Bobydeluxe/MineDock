import { DomainError } from '../domain/errors';
/** Inspect container headers before asking the native decoder to allocate pixels. */
export function profileImageSize(bytes: Buffer): { width: number; height: number } {
  const fail = (): never => {
    throw new DomainError('IMAGE', 'Choose a PNG, JPEG or WebP image up to 4096 pixels per side.');
  };
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 24) return fail();
  let width = 0,
    height = 0;
  if (
    bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' &&
    bytes.subarray(12, 16).toString() === 'IHDR'
  ) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 0xff) return fail();
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (at + 2 > bytes.length) return fail();
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length) return fail();
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        if (length < 8) return fail();
        height = bytes.readUInt16BE(at + 3);
        width = bytes.readUInt16BE(at + 5);
        break;
      }
      at += length;
    }
  } else if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  ) {
    const type = bytes.subarray(12, 16).toString();
    if (type === 'VP8X' && bytes.length >= 30) {
      width = 1 + bytes.readUIntLE(24, 3);
      height = 1 + bytes.readUIntLE(27, 3);
    } else if (type === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
    } else if (
      type === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes.subarray(23, 26).toString('hex') === '9d012a'
    ) {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    }
  }
  if (!width || !height || width > 4096 || height > 4096) return fail();
  return { width, height };
}
