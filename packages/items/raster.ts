import { PNG } from 'pngjs';

export interface Raster {
  width: number;
  height: number;
  data: Buffer;
}
export function decodeTexture(bytes: Buffer): Raster {
  if (
    bytes.length > 512 * 1024 ||
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.subarray(12, 16).toString() !== 'IHDR'
  )
    throw new Error('Invalid PNG');
  const w = bytes.readUInt32BE(16),
    h = bytes.readUInt32BE(20);
  if (!w || !h || w > 512 || h > 512) throw new Error('Texture dimensions exceed limits');
  // pngjs checks CRCs and bounds inflate output against the validated IHDR.
  const image = PNG.sync.read(bytes, { checkCRC: true });
  return { width: image.width, height: image.height, data: image.data };
}
export function blank(): Raster {
  return { width: 64, height: 64, data: Buffer.alloc(64 * 64 * 4) };
}
export function encode(image: Raster): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = image.data;
  return PNG.sync.write(png);
}
export function blend(out: Raster, x: number, y: number, rgba: number[]): void {
  if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
  const i = (y * out.width + x) * 4,
    a = rgba[3]! / 255,
    b = (out.data[i + 3]! / 255) * (1 - a),
    alpha = a + b;
  if (!alpha) return;
  for (let c = 0; c < 3; c++) out.data[i + c] = (rgba[c]! * a + out.data[i + c]! * b) / alpha;
  out.data[i + 3] = alpha * 255;
}
export function sample(image: Raster, u: number, v: number, tint = 0xffffff): number[] {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width))),
    y = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height))),
    i = (y * image.width + x) * 4;
  return [
    (image.data[i]! * ((tint >>> 16) & 255)) / 255,
    (image.data[i + 1]! * ((tint >>> 8) & 255)) / 255,
    (image.data[i + 2]! * (tint & 255)) / 255,
    image.data[i + 3]!,
  ];
}
export function layer(out: Raster, image: Raster, tint?: number): void {
  if (image.width !== image.height) throw new Error('Animated texture is unsupported');
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      blend(out, x, y, sample(image, (x + 0.5) / 64, (y + 0.5) / 64, tint));
}
