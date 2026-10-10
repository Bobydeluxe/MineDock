import path from 'node:path';
import { mkdir, writeFile, readdir, stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ItemAssets } from '../packages/items/assets';
import { decodeTexture } from '../packages/items/raster';

async function main() {
  if (!process.argv.includes('--owned-java-eula-accepted'))
    throw new Error(
      'Confirm owned Minecraft Java and accepted EULA before this private official-source probe.',
    );
  const root = path.resolve(
    'data/remote-item-assets-validation/' + new Date().toISOString().replaceAll(':', '-'),
  );
  await mkdir(root, { recursive: true });
  const service = new ItemAssets(path.join(root, 'cache'));
  const cases: [string, Record<string, unknown>][] = [
    ['diamond_sword', {}],
    ['apple', {}],
    ['stone', {}],
    ['oak_log', {}],
    ['crafting_table', {}],
    ['skeleton_skull', {}],
    ['creeper_head', {}],
    ['zombie_head', {}],
    ['wither_skeleton_skull', {}],
    ['player_head', {}],
    ['white_banner', {}],
    [
      'white_banner',
      {
        'minecraft:banner_patterns': [
          { pattern: 'minecraft:stripe_top', color: 'red' },
          { pattern: 'minecraft:border', color: 'blue' },
        ],
      },
    ],
    ['shield', {}],
    [
      'shield',
      {
        'minecraft:base_color': 'red',
        'minecraft:banner_patterns': [{ pattern: 'minecraft:cross', color: 'white' }],
      },
    ],
    ['bow', {}],
    ['crossbow', {}],
    ['crossbow', { 'minecraft:charged_projectiles': [{ id: 'minecraft:arrow', count: 1 }] }],
    [
      'crossbow',
      { 'minecraft:charged_projectiles': [{ id: 'minecraft:firework_rocket', count: 1 }] },
    ],
    ['compass', {}],
    ['clock', {}],
    ['potion', {}],
    ['potion', { 'minecraft:potion_contents': { custom_color: 0x00cc55 } }],
    ['potion', { 'minecraft:potion_contents': { potion: 'minecraft:healing' } }],
    ['splash_potion', { 'minecraft:potion_contents': { custom_color: 0x00cc55 } }],
    ['lingering_potion', { 'minecraft:potion_contents': { custom_color: 0x00cc55 } }],
    ['leather_boots', { 'minecraft:dyed_color': 0x3366dd }],
    [
      'iron_chestplate',
      { 'minecraft:trim': { material: 'minecraft:gold', pattern: 'minecraft:sentry' } },
    ],
    ['bundle', {}],
    ['red_bundle', {}],
    ['filled_map', {}],
    ['mace', {}],
    ['sulfur', {}],
    ['prismarine', {}],
  ];
  const records = [];
  let cold = 0;
  try {
    for (const version of ['1.20.1', '1.21.1', '1.21.4', '26.3']) {
      const start = performance.now();
      await service.downloadOfficial(version);
      const registry = await service.registry(version);
      if (!registry) throw new Error('Exact registry missing');
      const images = [];
      for (const [name, components] of cases) {
        const item = { id: 'minecraft:' + name, components: structuredClone(components) };
        // Legacy fixture uses legacy metadata: this is saved-data QA, never gameplay.
        if (['1.20.1', '1.21.1'].includes(version)) {
          if (components['minecraft:dyed_color'])
            item.components = { display: { color: components['minecraft:dyed_color'] } };
          if (components['minecraft:banner_patterns'])
            item.components = {
              BlockEntityTag: {
                Base: components['minecraft:base_color'] === 'red' ? 14 : 0,
                Patterns:
                  name === 'shield'
                    ? [{ Pattern: 'cr', Color: 0 }]
                    : [
                        { Pattern: 'ts', Color: 14 },
                        { Pattern: 'bo', Color: 11 },
                      ],
              },
            };
          if (components['minecraft:charged_projectiles'])
            item.components = { ChargedProjectiles: components['minecraft:charged_projectiles'] };
          if (
            (components['minecraft:potion_contents'] as Record<string, unknown> | undefined)
              ?.custom_color
          )
            item.components = { CustomPotionColor: 0x00cc55 };
        }
        const visual = await service.visual(version, item, 'en');
        if (visual.url) {
          const b = await service.image(visual.url.split('/').pop()!);
          if (!b || decodeTexture(b).width !== 64) throw new Error('Invalid rendered preview');
        }
        images.push({
          id: item.id,
          components: item.components,
          status: visual.status,
          render: visual.render,
          detail: visual.detail,
        });
      }
      const elapsed = Math.round(performance.now() - start);
      cold += elapsed;
      records.push({ version, registry: registry.size, elapsedMs: elapsed, images });
      console.log(
        JSON.stringify({
          version,
          ready: images.filter((i) => i.status === 'ready').length,
          total: images.length,
          elapsedMs: elapsed,
        }),
      );
    }
    const server = { id: 'real-adorn-qa', path: path.join(root, 'server'), engine: 'fabric' };
    await mkdir(server.path, { recursive: true });
    const choices = await service.modChoices(server, '1.20.1', 'adorn');
    if (!choices[0]) throw new Error('Matching licensed Adorn archive unavailable');
    await service.downloadMod(server, '1.20.1', choices[0].project, choices[0].id);
    const mods = [];
    for (const id of [
      'adorn:oak_table',
      'adorn:oak_chair',
      'adorn:stone_torch',
      'adorn:oak_drawer',
      'adorn:stone_platform',
      'adorn:trading_station',
    ])
      mods.push(await service.visual('1.20.1', { id, components: {} }, 'en', server));
    const warmStart = performance.now();
    await Promise.all(
      Array.from({ length: 200 }, () =>
        service.visual('26.3', { id: 'minecraft:stone', components: {} }, 'en'),
      ),
    );
    const warmMs = Math.round(performance.now() - warmStart);
    const files = await readdir(path.join(root, 'cache'));
    let bytes = 0;
    for (const f of files) bytes += (await stat(path.join(root, 'cache', f))).size;
    const registrations = JSON.parse(
      await readFile(path.join(root, 'cache', 'sources.json'), 'utf8'),
    ).map((s: { version: string; sha1: string; origin: string }) => ({
      version: s.version,
      sha1: s.sha1,
      origin: s.origin,
    }));
    const result = {
      at: new Date().toISOString(),
      releaseStatus: 'NOT RELEASED',
      source:
        'Mojang official exact-version private downloads; no launcher/client registration or game execution',
      root,
      registrations,
      cases: records,
      modSource: choices[0],
      mods: await Promise.all(
        mods.map(async ({ url, ...v }) => {
          const bytes = url ? await service.image(url.split('/').pop()!) : undefined;
          return {
            ...v,
            imageSha256: bytes ? createHash('sha256').update(bytes).digest('hex') : undefined,
          };
        }),
      ),
      warm200Ms: warmMs,
      coldMs: cold,
      cacheFiles: files.length,
      cacheBytes: bytes,
      metrics: service.metrics,
    };
    await writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(
      JSON.stringify({
        result: path.join(root, 'result.json'),
        warmMs,
        bytes,
        mods: mods.map((v) => ({ id: v.id, status: v.status, detail: v.detail })),
      }),
    );
  } finally {
    service.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
