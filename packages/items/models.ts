import { blank, blend, layer, sample, type Raster } from './raster';
import { specialGeometry } from './special';

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
  if (
    state['minecraft:custom_model_data'] !== undefined &&
    (!modern || typeof state['minecraft:custom_model_data'] !== 'object')
  )
    throw new Error('Custom presentation unsupported for this schema');
  // Component overrides require their own validated presentation, never guess from a filename.
  if (/^minecraft:(?:compass|recovery_compass|clock)$/.test(id))
    throw new Error('World direction/time is not available in saved item data');
  const out = blank();
  let kind: Rendered['kind'] = 'flat';
  const derived = new Map<string, Raster>();
  const readTexture = async (id: string) => derived.get(id) ?? reader.texture(id);
  async function model(name: string): Promise<Json> {
    const seen = new Set<string>();
    async function resolve(current: string): Promise<Json> {
      current = assetId(current);
      if (seen.has(current) || seen.size >= 24) throw new Error('Model inheritance limit');
      seen.add(current);
      if (current === 'minecraft:builtin/generated') return { generated: true };
      const child = await reader.json(assetPath('models', current));
      if (!child && ['minecraft:item/generated', 'minecraft:item/handheld'].includes(current))
        return { generated: true };
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
  async function draw(name: string, tints: unknown[] = [], geometry?: Json) {
    const m = geometry ?? (await model(name)),
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
      if (!modern && /(?:spawn_egg|firework_star|tipped_arrow|filled_map)/.test(id))
        throw new Error('Legacy tint unsupported');
      for (const key of layers) {
        const i = Number(key.slice(5));
        let color = tints[i] === undefined ? undefined : tint(tints[i]);
        if (!modern && i === 0 && id.includes('leather_'))
          color = Number(
            object(state.display).color ??
              object(state['minecraft:dyed_color']).rgb ??
              state['minecraft:dyed_color'] ??
              0xa06540,
          );
        if (!modern && i === 0 && id.includes('potion')) {
          const custom =
            state.CustomPotionColor ?? object(state['minecraft:potion_contents']).custom_color;
          if (typeof custom !== 'number') throw new Error('Potion effect tint unsupported');
          color = custom;
        }
        layer(out, await readTexture(texture(textures[key])), color);
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
          tex = await readTexture(texture(f.texture)),
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
    if (p.type === 'minecraft:condition') {
      let value: boolean;
      if (
        p.property === 'minecraft:using_item' ||
        p.property === 'minecraft:bundle/has_selected_item'
      )
        value = false; // static inventory has no active use/hover selection
      else if (p.property === 'minecraft:has_component')
        value = state[String(p.component)] !== undefined;
      else if (p.property === 'minecraft:custom_model_data') {
        const flags = object(state['minecraft:custom_model_data']).flags;
        value = Array.isArray(flags) && flags[Number(p.index ?? 0)] === true;
      } else throw new Error('Unknown conditional state');
      return presentation(value ? p.on_true : p.on_false, depth + 1);
    }
    if (
      p.type === 'minecraft:range_dispatch' &&
      p.property === 'minecraft:custom_model_data' &&
      Array.isArray(p.entries)
    ) {
      const floats = object(state['minecraft:custom_model_data']).floats;
      const v = Array.isArray(floats) ? floats[Number(p.index ?? 0)] : 0;
      if (typeof v !== 'number' || !Number.isFinite(v) || p.entries.length > 128)
        throw new Error('Invalid model range');
      const scale = p.scale ?? 1;
      if (typeof scale !== 'number' || !Number.isFinite(scale))
        throw new Error('Invalid model scale');
      const match = p.entries
        .map(object)
        .filter((e) => typeof e.threshold === 'number' && e.threshold <= v * scale)
        .sort((a, b) => Number(a.threshold) - Number(b.threshold))
        .pop();
      return presentation(match?.model ?? p.fallback, depth + 1);
    }
    if (p.type === 'minecraft:special') {
      if (typeof p.base !== 'string' || !p.model)
        throw new Error('Special presentation unsupported');
      const base = await model(assetId(p.base));
      const special = await specialGeometry(reader, id, state, object(p.model), base.display);
      for (const [k, v] of special.textures) derived.set(k, v);
      return draw('minedock:private/special', [], special.model);
    }
    if (p.type === 'minecraft:select' && Array.isArray(p.cases)) {
      let selected: unknown;
      if (p.property === 'minecraft:trim_material')
        selected = object(state['minecraft:trim']).material;
      else if (p.property === 'minecraft:display_context') selected = 'gui';
      else if (p.property === 'minecraft:charge_type') {
        const projectiles = state['minecraft:charged_projectiles'] ?? state.ChargedProjectiles;
        if (Array.isArray(projectiles) && projectiles.length)
          selected = object(projectiles[0]).id === 'minecraft:firework_rocket' ? 'rocket' : 'arrow';
        else selected = 'none';
      } else if (p.property === 'minecraft:custom_model_data') {
        const values = object(state['minecraft:custom_model_data']).strings;
        selected = Array.isArray(values) ? values[Number(p.index ?? 0)] : '';
      } else throw new Error('Unknown model selection state');
      const match = p.cases
        .map(object)
        .find((c) => c.when === selected || (Array.isArray(c.when) && c.when.includes(selected)));
      return presentation(match?.model ?? p.fallback, depth + 1);
    }
    // Context (held/use state, compass target, special entities) is deliberately not invented.
    throw new Error('Dynamic or special presentation unsupported');
  }
  if (modern) {
    const definition = await reader.json(
      assetPath('items', assetId(state['minecraft:item_model'] ?? id)),
    );
    if (!definition) throw new Error('Presentation unavailable');
    await presentation(definition.model);
  } else {
    const headKind: Record<string, string> = {
      player_head: 'player',
      skeleton_skull: 'skeleton',
      wither_skeleton_skull: 'wither_skeleton',
      zombie_head: 'zombie',
      creeper_head: 'creeper',
    };
    const name = id.replace('minecraft:', '');
    if (headKind[name] || name.endsWith('_banner') || name === 'shield') {
      const spec = headKind[name]
        ? { type: 'minecraft:head', kind: headKind[name] }
        : {
            type: name === 'shield' ? 'minecraft:shield' : 'minecraft:banner',
            color: name.replace('_banner', ''),
          };
      const special = await specialGeometry(reader, id, state, spec, undefined);
      for (const [k, v] of special.textures) derived.set(k, v);
      await draw('minedock:private/special', [], special.model);
      return { image: out, kind };
    }
    const definition = await reader.json(assetPath('models', id.replace(':', ':item/')));
    let chosen = id.replace(':', ':item/');
    if (Array.isArray(definition?.overrides)) {
      if (definition.overrides.length > 128) throw new Error('Override limit');
      for (const raw of definition.overrides) {
        const entry = object(raw),
          predicates = object(entry.predicate);
        const matches = Object.entries(predicates).every(([k, v]) => {
          const prop = k.replace('minecraft:', '');
          let actual = 0;
          if (prop === 'charged')
            actual =
              Array.isArray(state.ChargedProjectiles) && state.ChargedProjectiles.length ? 1 : 0;
          else if (prop === 'firework')
            actual =
              Array.isArray(state.ChargedProjectiles) &&
              object(state.ChargedProjectiles[0]).id === 'minecraft:firework_rocket'
                ? 1
                : 0;
          else if (prop === 'custom_model_data') actual = Number(state.CustomModelData ?? 0);
          else if (!['pulling', 'pull', 'blocking'].includes(prop))
            throw new Error('Legacy predicate unsupported');
          return typeof v === 'number' && actual >= v;
        });
        if (matches) chosen = assetId(entry.model);
      }
    }
    if (state['minecraft:trim'] || state.Trim) throw new Error('Legacy trim atlas unsupported');
    await draw(chosen);
  }
  if (!out.data.some((v, i) => i % 4 === 3 && v)) throw new Error('Empty rendering');
  return { image: out, kind };
}
