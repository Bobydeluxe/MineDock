import { blank, blend, layer, sample, type Raster } from './raster';

type Json = Record<string, unknown>;
const object = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
export function assetId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid resource');
  const id = value.includes(':') ? value : 'minecraft:' + value;
  if (
    !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id) ||
    id.length > 180 ||
    id
      .split(':')[1]!
      .split('/')
      .some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('Invalid resource');
  return id;
}
export function assetPath(kind: 'models' | 'textures' | 'items', id: string): string {
  const [ns, name] = assetId(id).split(':');
  return `assets/${ns}/${kind}/${name}.${kind === 'textures' ? 'png' : 'json'}`;
}
export interface AssetReader {
  json(path: string): Promise<Json | undefined>;
  texture(id: string): Promise<Raster>;
}
export interface Rendered {
  image: Raster;
  kind: 'flat' | 'layered' | 'model';
}
const vector = (v: unknown, fallback: number[]): number[] => {
  if (v === undefined) return fallback;
  if (
    !Array.isArray(v) ||
    v.length !== 3 ||
    v.some((x) => typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 360)
  )
    throw new Error('Invalid transform');
  return v;
};
export async function renderItem(
  reader: AssetReader,
  id: string,
  modern: boolean,
  state: Json,
): Promise<Rendered> {
  // Component overrides require their own validated presentation, never guess from a filename.
  if (
    state['minecraft:item_model'] ||
    state['minecraft:custom_model_data'] ||
    state.CustomModelData
  )
    throw new Error('Custom presentation unsupported');
  const out = blank();
  let kind: Rendered['kind'] = 'flat';
  async function model(name: string): Promise<Json> {
    const seen = new Set<string>();
    async function resolve(current: string): Promise<Json> {
      current = assetId(current);
      if (seen.has(current) || seen.size >= 24) throw new Error('Model inheritance limit');
      seen.add(current);
      if (current === 'minecraft:builtin/generated') return { generated: true };
      const child = await reader.json(assetPath('models', current));
      if (!child) throw new Error('Model unavailable');
      const parent = child.parent ? await resolve(assetId(child.parent)) : {};
      return {
        ...parent,
        ...child,
        textures: { ...object(parent.textures), ...object(child.textures) },
        display: { ...object(parent.display), ...object(child.display) },
      };
    }
    return resolve(name);
  }
  function tint(entry: unknown): number {
    const t = object(entry);
    if (t.type === 'minecraft:constant' && typeof t.value === 'number') return t.value;
    if (t.type === 'minecraft:dye') {
      const value = state['minecraft:dyed_color'] ?? object(state.display).color;
      const rgb = typeof value === 'number' ? value : object(value).rgb;
      if (typeof rgb === 'number') return rgb;
      if (typeof t.default === 'number') return t.default;
    }
    if (t.type === 'minecraft:potion') {
      const p = object(state['minecraft:potion_contents']),
        custom = p.custom_color;
      if (typeof custom === 'number') return custom;
      if (p.potion || p.custom_effects || state.Potion)
        throw new Error('Potion effect tint unsupported');
      if (typeof t.default === 'number') return t.default;
    }
    throw new Error('Tint unsupported');
  }
  async function draw(name: string, tints: unknown[] = []) {
    const m = await model(name),
      textures = object(m.textures);
    function texture(ref: unknown): string {
      const seen = new Set<string>();
      while (typeof ref === 'string' && ref.startsWith('#')) {
        if (seen.has(ref) || seen.size >= 24) throw new Error('Texture reference cycle');
        seen.add(ref);
        ref = textures[ref.slice(1)];
      }
      return assetId(ref);
    }
    if (m.generated) {
      const layers = Object.keys(textures)
        .filter((k) => /^layer[0-4]$/.test(k))
        .sort();
      if (!layers.length) throw new Error('No generated layers');
      // Old models encode tinting outside their JSON. Never show untinted leather/potion art.
      if (!modern && /(?:leather_|potion|spawn_egg|firework_star|tipped_arrow|filled_map)/.test(id))
        throw new Error('Legacy tint unsupported');
      for (const key of layers) {
        const i = Number(key.slice(5));
        layer(
          out,
          await reader.texture(texture(textures[key])),
          tints[i] === undefined ? undefined : tint(tints[i]),
        );
      }
      if (layers.length > 1) kind = 'layered';
      return;
    }
    const elements = m.elements;
    if (!Array.isArray(elements) || !elements.length || elements.length > 128)
      throw new Error('Special model unsupported');
    kind = 'model';
    const gui = object(object(m.display).gui),
      rotation = vector(gui.rotation, [0, 0, 0]),
      scale = vector(gui.scale, [1, 1, 1]),
      translation = vector(gui.translation, [0, 0, 0]);
    const project = (p: number[]) => {
      let [x, y, z] = p.map((n, i) => (n - 8) * scale[i]!);
      for (const axis of [1, 0, 2]) {
        const a = (rotation[axis]! * Math.PI) / 180,
          c = Math.cos(a),
          s = Math.sin(a);
        if (axis === 0) [y, z] = [y! * c - z! * s, y! * s + z! * c];
        if (axis === 1) [x, z] = [x! * c + z! * s, -x! * s + z! * c];
        if (axis === 2) [x, y] = [x! * c - y! * s, x! * s + y! * c];
      }
      return [32 + (x! + translation[0]!) * 4, 32 - (y! + translation[1]!) * 4, z!];
    };
    const depth = new Float64Array(64 * 64).fill(-Infinity);
    for (const raw of elements) {
      const e = object(raw);
      if (e.rotation) throw new Error('Rotated element unsupported');
      const [x0, y0, z0] = vector(e.from, [0, 0, 0]),
        [x1, y1, z1] = vector(e.to, [16, 16, 16]);
      const faces: Record<string, number[][]> = {
        south: [
          [x1!, y1!, z1!],
          [x0!, y1!, z1!],
          [x0!, y0!, z1!],
          [x1!, y0!, z1!],
        ],
        north: [
          [x0!, y1!, z0!],
          [x1!, y1!, z0!],
          [x1!, y0!, z0!],
          [x0!, y0!, z0!],
        ],
        east: [
          [x1!, y1!, z0!],
          [x1!, y1!, z1!],
          [x1!, y0!, z1!],
          [x1!, y0!, z0!],
        ],
        west: [
          [x0!, y1!, z1!],
          [x0!, y1!, z0!],
          [x0!, y0!, z0!],
          [x0!, y0!, z1!],
        ],
        up: [
          [x0!, y1!, z0!],
          [x1!, y1!, z0!],
          [x1!, y1!, z1!],
          [x0!, y1!, z1!],
        ],
        down: [
          [x0!, y0!, z1!],
          [x1!, y0!, z1!],
          [x1!, y0!, z0!],
          [x0!, y0!, z0!],
        ],
      };
      for (const [face, value] of Object.entries(object(e.faces))) {
        if (!faces[face]) throw new Error('Unknown face');
        const f = object(value);
        if (f.rotation) throw new Error('Rotated UV unsupported');
        const points = faces[face]!.map(project);
        // Implicit UVs depend on cuboid geometry, per Minecraft's face convention.
        const defaults: Record<string, number[]> = {
          down: [x0!, 16 - z1!, x1!, 16 - z0!],
          up: [x0!, z0!, x1!, z1!],
          north: [16 - x1!, 16 - y1!, 16 - x0!, 16 - y0!],
          south: [x0!, 16 - y1!, x1!, 16 - y0!],
          west: [z0!, 16 - y1!, z1!, 16 - y0!],
          east: [16 - z1!, 16 - y1!, 16 - z0!, 16 - y0!],
        };
        const uv = Array.isArray(f.uv) ? f.uv : defaults[face]!;
        if (
          uv.length !== 4 ||
          uv.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 32)
        )
          throw new Error('Invalid UV');
        const coords = [
            [uv[0] / 16, uv[1] / 16],
            [uv[2] / 16, uv[1] / 16],
            [uv[2] / 16, uv[3] / 16],
            [uv[0] / 16, uv[3] / 16],
          ],
          tex = await reader.texture(texture(f.texture)),
          color = f.tintindex === undefined ? undefined : tint(tints[Number(f.tintindex)]);
        for (const triangle of [
          [0, 1, 2],
          [0, 2, 3],
        ]) {
          const [a, b, c] = triangle.map((i) => points[i]!),
            [ta, tb, tc] = triangle.map((i) => coords[i]!);
          const den = (b![1]! - c![1]!) * (a![0]! - c![0]!) + (c![0]! - b![0]!) * (a![1]! - c![1]!);
          if (!den) continue;
          for (
            let y = Math.max(0, Math.floor(Math.min(a![1]!, b![1]!, c![1]!)));
            y < Math.min(64, Math.ceil(Math.max(a![1]!, b![1]!, c![1]!)));
            y++
          )
            for (
              let x = Math.max(0, Math.floor(Math.min(a![0]!, b![0]!, c![0]!)));
              x < Math.min(64, Math.ceil(Math.max(a![0]!, b![0]!, c![0]!)));
              x++
            ) {
              const w =
                  ((b![1]! - c![1]!) * (x + 0.5 - c![0]!) +
                    (c![0]! - b![0]!) * (y + 0.5 - c![1]!)) /
                  den,
                v =
                  ((c![1]! - a![1]!) * (x + 0.5 - c![0]!) +
                    (a![0]! - c![0]!) * (y + 0.5 - c![1]!)) /
                  den,
                u = 1 - w - v;
              if (Math.min(w, v, u) < -1e-8) continue;
              const z = w * a![2]! + v * b![2]! + u * c![2]!;
              if (z < depth[y * 64 + x]!) continue;
              const rgba = sample(
                tex,
                w * ta![0]! + v * tb![0]! + u * tc![0]!,
                w * ta![1]! + v * tb![1]! + u * tc![1]!,
                color,
              );
              if (!rgba[3]) continue;
              const shade =
                m.gui_light === 'front'
                  ? 1
                  : face === 'up'
                    ? 1
                    : face === 'north' || face === 'south'
                      ? 0.8
                      : 0.65;
              for (let i = 0; i < 3; i++) rgba[i] = rgba[i]! * shade;
              blend(out, x, y, rgba);
              depth[y * 64 + x] = z;
            }
        }
      }
    }
  }
  let nodes = 0;
  async function presentation(value: unknown, depth = 0): Promise<void> {
    if (++nodes > 32 || depth > 12) throw new Error('Presentation limit');
    const p = object(value);
    if (p.type === 'minecraft:model')
      return draw(assetId(p.model), Array.isArray(p.tints) ? p.tints : []);
    if (p.type === 'minecraft:composite' && Array.isArray(p.models)) {
      for (const m of p.models) await presentation(m, depth + 1);
      return;
    }
    if (
      p.type === 'minecraft:select' &&
      p.property === 'minecraft:trim_material' &&
      Array.isArray(p.cases)
    ) {
      const trim = object(state['minecraft:trim']).material;
      const match = p.cases
        .map(object)
        .find((c) => c.when === trim || (Array.isArray(c.when) && c.when.includes(trim)));
      return presentation(match?.model ?? p.fallback, depth + 1);
    }
    // Context (held/use state, compass target, special entities) is deliberately not invented.
    throw new Error('Dynamic or special presentation unsupported');
  }
  if (modern) {
    const definition = await reader.json(assetPath('items', id));
    if (!definition) throw new Error('Presentation unavailable');
    await presentation(definition.model);
  } else {
    const definition = await reader.json(assetPath('models', id.replace(':', ':item/')));
    if (definition?.overrides && Object.keys(state).length)
      throw new Error('Legacy component override unsupported');
    await draw(id.replace(':', ':item/'));
  }
  if (!out.data.some((v, i) => i % 4 === 3 && v)) throw new Error('Empty rendering');
  return { image: out, kind };
}
