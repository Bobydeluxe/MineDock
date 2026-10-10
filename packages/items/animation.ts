import type { Raster } from './raster';

/** Static first declared frame, never a made-up game tick. Bounds are checked before copying. */
export function animationFrame(image: Raster, metadata?: Record<string, unknown>): Raster {
  if (!metadata) {
    if (image.width !== image.height) throw new Error('Animation metadata is missing');
    return image;
  }
  const a = metadata.animation as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object') throw new Error('Invalid animation metadata');
  const width =
    a.width ?? (a.height === undefined ? Math.min(image.width, image.height) : image.width);
  const height =
    a.height ?? (a.width === undefined ? Math.min(image.width, image.height) : image.height);
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    image.width % width ||
    image.height % height ||
    width !== height
  )
    throw new Error('Unsupported animation frame size');
  const total = (image.width / width) * (image.height / height);
  if (total > 256) throw new Error('Animation frame limit');
  const frames = a.frames;
  if (frames !== undefined && (!Array.isArray(frames) || !frames.length || frames.length > 256))
    throw new Error('Invalid animation frames');
  const indexOf = (f: unknown) =>
    typeof f === 'object' && f ? (f as Record<string, unknown>).index : f;
  for (const f of Array.isArray(frames) ? frames : []) {
    const i = indexOf(f);
    if (typeof i !== 'number' || !Number.isSafeInteger(i) || i < 0 || i >= total)
      throw new Error('Invalid animation frame index');
    const t = typeof f === 'object' && f ? (f as Record<string, unknown>).time : undefined;
    if (
      t !== undefined &&
      (typeof t !== 'number' || !Number.isSafeInteger(t) || t < 1 || t > 100000)
    )
      throw new Error('Invalid frame duration');
  }
  const index = Number(Array.isArray(frames) ? indexOf(frames[0]) : 0);
  const x = (index % (image.width / width)) * width,
    y = Math.floor(index / (image.width / width)) * height;
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++)
    image.data.copy(
      data,
      row * width * 4,
      ((y + row) * image.width + x) * 4,
      ((y + row) * image.width + x + width) * 4,
    );
  return { width, height, data };
}
