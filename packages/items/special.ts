import { assetId, type AssetReader } from './models';
import { blend, sample, type Raster } from './raster';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
const colors = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
];
// Minecraft DyeColor texture diffuse values, distinct from text/firework colors.
const rgb = [
  0xf9fffe, 0xf9801d, 0xc74ebd, 0x3ab3da, 0xfed83d, 0x80c71f, 0xf38baa, 0x474f52, 0x9d9d97,
  0x169c9c, 0x8932b8, 0x3c44aa, 0x835432, 0x5e7c16, 0xb02e26, 0x1d1d21,
];
const legacyPatterns: Record<string, string> = {
  b: 'base',
  bl: 'square_bottom_left',
  br: 'square_bottom_right',
  tl: 'square_top_left',
  tr: 'square_top_right',
  bs: 'stripe_bottom',
  ts: 'stripe_top',
  ls: 'stripe_left',
  rs: 'stripe_right',
  cs: 'stripe_center',
  ms: 'stripe_middle',
  drs: 'stripe_downright',
  dls: 'stripe_downleft',
  ss: 'small_stripes',
  cr: 'cross',
  sc: 'straight_cross',
  bt: 'triangle_bottom',
  tt: 'triangle_top',
  bts: 'triangles_bottom',
  tts: 'triangles_top',
  ld: 'diagonal_left',
  rd: 'diagonal_up_right',
  lud: 'diagonal_up_left',
  rud: 'diagonal_right',
  mc: 'circle',
  mr: 'rhombus',
  vh: 'half_vertical',
  hh: 'half_horizontal',
  vhr: 'half_vertical_right',
  hhb: 'half_horizontal_bottom',
  bo: 'border',
  cbo: 'curly_border',
  gra: 'gradient',
  gru: 'gradient_up',
  bri: 'bricks',
  glb: 'globe',
  cre: 'creeper',
  sku: 'skull',
  flo: 'flower',
  moj: 'mojang',
  pig: 'piglin',
  flw: 'flow',
  gus: 'guster',
};
function dye(value: unknown): number {
  const index =
    typeof value === 'number' && Number.isInteger(value)
      ? value
      : colors.indexOf(String(value).replace('minecraft:', ''));
  if (index < 0 || index >= 16) throw new Error('Unknown dye color');
  return rgb[index]!;
}
function faces(
  texture: string,
  rectangles: Record<string, number[]>,
  width: number,
  height: number,
) {
  return Object.fromEntries(
    Object.entries(rectangles).map(([face, uv]) => [
      face,
      { texture, uv: uv.map((v, i) => (v / (i % 2 ? height : width)) * 16) },
    ]),
  );
}
export interface SpecialGeometry {
  model: Json;
  textures: Map<string, Raster>;
}
function frontDisplay(display: unknown, fallback: Json): Json {
  const source = display === undefined ? fallback : obj(display),
    gui = obj(source.gui);
  const rotation = Array.isArray(gui.rotation) ? [...gui.rotation] : [0, 0, 0];
  // Entity models face -Z; our GUI camera looks from +Z. Reverse their facing before
  // applying the ordinary item GUI transform so the saved face/pattern is visible.
  rotation[1] = Number(rotation[1] ?? 0) + 180;
  return { ...source, gui: { ...gui, rotation } };
}
export async function specialGeometry(
  reader: AssetReader,
  id: string,
  state: Json,
  spec: Json,
  display: unknown,
): Promise<SpecialGeometry> {
  const type = String(spec.type).replace('minecraft:', '');
  const textures = new Map<string, Raster>();
  const texture = 'minedock:private/derived';
  if (type === 'banner' || type === 'shield') {
    const shield = type === 'shield',
      tag = obj(state.BlockEntityTag);
    const patterns = state['minecraft:banner_patterns'] ?? tag.Patterns ?? [];
    if (!Array.isArray(patterns) || patterns.length > 16) throw new Error('Pattern limit');
    const base = shield
      ? (state['minecraft:base_color'] ?? tag.Base)
      : (spec.color ?? id.replace('minecraft:', '').replace('_banner', ''));
    const decorated = base !== undefined || patterns.length > 0;
    const group = shield ? 'shield' : 'banner';
    let material: Raster;
    try {
      material = await reader.texture(
        `minecraft:entity/${group}/${shield ? 'shield_base' + (decorated ? '' : '_nopattern') : 'banner_base'}`,
      );
    } catch {
      material = await reader.texture(
        `minecraft:entity/${shield ? 'shield_base' + (decorated ? '' : '_nopattern') : 'banner_base'}`,
      );
    }
    const image: Raster = { ...material, data: Buffer.from(material.data) };
    const layers = [
      ...(decorated ? [{ pattern: 'minecraft:base', color: base ?? 'white' }] : []),
      ...patterns,
    ];
    for (const raw of layers) {
      const p = obj(raw),
        rawId = p.pattern ?? legacyPatterns[String(p.Pattern)];
      const resource = assetId(rawId),
        [ns, name] = resource.split(':');
      const mask = await reader.texture(`${ns}:entity/${group}/${name}`),
        color = dye(p.color ?? p.Color);
      if (mask.width !== image.width || mask.height !== image.height)
        throw new Error('Pattern dimensions mismatch');
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++)
          blend(
            image,
            x,
            y,
            sample(mask, (x + 0.5) / image.width, (y + 0.5) / image.height, color),
          );
    }
    textures.set(texture, image);
    const rect = shield
      ? {
          north: [2, 2, 14, 24],
          south: [16, 2, 28, 24],
          east: [0, 2, 2, 24],
          west: [14, 2, 16, 24],
          up: [2, 0, 14, 2],
          down: [14, 0, 26, 2],
        }
      : {
          north: [1, 1, 21, 41],
          south: [22, 1, 42, 41],
          east: [0, 1, 1, 41],
          west: [21, 1, 22, 41],
          up: [1, 0, 21, 1],
          down: [21, 0, 41, 1],
        };
    const elements: Json[] = [
      {
        from: shield ? [2, -3, 7] : [-2, -12, 7],
        to: shield ? [14, 19, 9] : [18, 28, 8],
        faces: faces(texture, rect, image.width, image.height),
      },
    ];
    if (!shield) {
      const pole = {
        north: [44, 2, 46, 44],
        south: [48, 2, 50, 44],
        east: [42, 2, 44, 44],
        west: [46, 2, 48, 44],
        up: [44, 0, 46, 2],
        down: [46, 0, 48, 2],
      };
      elements.push({
        from: [7, -14, 8],
        to: [9, 28, 10],
        faces: faces(texture, pole, image.width, image.height),
      });
    }
    return {
      model: {
        display: frontDisplay(display, {
          gui: { rotation: [15, -25, 0], scale: shield ? [0.65, 0.65, 0.65] : [0.3, 0.3, 0.3] },
        }),
        gui_light: 'front',
        elements,
      },
      textures,
    };
  }
  if (type === 'head' || type === 'player_head') {
    const kind = type === 'player_head' ? 'player' : spec.kind;
    const defaults: Record<string, string> = {
      skeleton: 'skeleton/skeleton',
      wither_skeleton: 'skeleton/wither_skeleton',
      zombie: 'zombie/zombie',
      creeper: 'creeper/creeper',
    };
    let image: Raster;
    if (spec.texture) image = await reader.texture(assetId(spec.texture).replace(':', ':entity/'));
    else if (kind === 'player') image = await reader.texture('minedock:profile/skin');
    else {
      const name = defaults[String(kind)];
      if (!name) throw new Error('This mob head geometry is unsupported');
      image = await reader.texture('minecraft:entity/' + name);
    }
    if (image.width !== 64 || ![32, 64].includes(image.height))
      throw new Error('Unsupported head dimensions');
    if (kind === 'player') {
      image = { ...image, data: Buffer.from(image.data) };
      // Legacy RGB skins used an opaque empty hat area. Minecraft discards that legacy overlay
      // when the entire upper-right 32×32 region is opaque; otherwise preserve actual alpha.
      if (image.height === 32) {
        let opaque = true;
        for (let y = 0; y < 32; y++)
          for (let x = 32; x < 64; x++) if (image.data[(y * 64 + x) * 4 + 3]! < 128) opaque = false;
        if (opaque)
          for (let y = 0; y < 16; y++)
            for (let x = 32; x < 64; x++) image.data[(y * 64 + x) * 4 + 3] = 0;
      }
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 32; x++) image.data[(y * 64 + x) * 4 + 3] = 255;
    }
    textures.set(texture, image);
    const rect = {
      north: [8, 8, 16, 16],
      south: [24, 8, 32, 16],
      east: [0, 8, 8, 16],
      west: [16, 8, 24, 16],
      up: [8, 0, 16, 8],
      down: [16, 0, 24, 8],
    };
    const elements: Json[] = [
      { from: [4, 4, 4], to: [12, 12, 12], faces: faces(texture, rect, image.width, image.height) },
    ];
    if (kind === 'player')
      elements.push({
        from: [3.75, 3.75, 3.75],
        to: [12.25, 12.25, 12.25],
        faces: faces(
          texture,
          Object.fromEntries(
            Object.entries(rect).map(([f, uv]) => [f, uv.map((n, i) => n + (i % 2 ? 0 : 32))]),
          ),
          image.width,
          image.height,
        ),
      });
    return {
      model: {
        display: frontDisplay(display, { gui: { rotation: [30, 45, 0], scale: [1, 1, 1] } }),
        elements,
      },
      textures,
    };
  }
  throw new Error('Special geometry is unavailable');
}
