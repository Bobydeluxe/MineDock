import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ItemAssets, ClientAssets, itemMetadata } from '../packages/items/assets';
import { fetchApproved } from '../packages/minecraft/downloads';
import { containedPath, atomicWrite } from '../packages/security/paths';
import { decodeTexture } from '../packages/items/raster';

async function main() {
  if (!process.argv.includes('--owned-client'))
    throw new Error(
      'Confirm an owned Java client with --owned-client before private official-client validation.',
    );
  const root = path.resolve('data/item-assets-validation');
  await mkdir(root, { recursive: true });
  const runRoot=path.join(root,'runs',new Date().toISOString().replaceAll(':','-'));
  const assets = new ItemAssets(path.join(runRoot, 'cache'));
  const signal = AbortSignal.timeout(120000);
  const manifest = (await itemMetadata(
    'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    signal,
  )) as { versions: { id: string; url: string }[] };
  const records = [];
  try {
    for (const version of ['1.20.1', '1.21.1', '1.21.4', '26.3']) {
      const meta = (await itemMetadata(
        manifest.versions.find((v) => v.id === version)!.url,
        signal,
      )) as { downloads: { client: { url: string; sha1: string; size: number } } };
      const expected = meta.downloads.client;
      const local =
        version === '26.3'
          ? path.join(process.env.APPDATA ?? '', 'ModrinthApp/meta/versions/26.3/26.3.jar')
          : undefined;
      const filename =
        local && (await stat(local).catch(() => undefined))
          ? local
          : await containedPath(root, version + '.jar');
      const valid = async () =>
        createHash('sha1')
          .update(await readFile(filename))
          .digest('hex') === expected.sha1;
      if (!(await valid().catch(() => false))) {
        const response = await fetchApproved(
          expected.url,
          signal,
          {},
          [],
          (u) => u.hostname === 'piston-data.mojang.com',
        );
        const reader = response.body!.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const p = await reader.read();
          if (p.done) break;
          size += p.value.length;
          if (size > 100 * 1024 ** 2) {
            await reader.cancel();
            throw new Error('Client size limit');
          }
          chunks.push(p.value);
        }
        const bytes = Buffer.concat(chunks);
        if (
          bytes.length !== expected.size ||
          createHash('sha1').update(bytes).digest('hex') !== expected.sha1
        )
          throw new Error('Client SHA-1 mismatch');
        await atomicWrite(filename, bytes);
      }
      await assets.importClient(
        version,
        filename,
        version === '26.3'
          ? path.join(process.env.APPDATA ?? '', 'ModrinthApp/meta/assets')
          : undefined,
      );
      const client=await ClientAssets.open(filename);
      let modern:boolean;
      try {modern=!!await client.json('assets/minecraft/items/diamond_sword.json');
        if(modern!==['1.21.4','26.3'].includes(version))throw new Error('Unexpected release model schema');
      }finally{client.close();}
      const start = performance.now(),
        registry = await assets.registry(version);
      if (!registry) throw new Error('Missing exact registry ' + version);
      if (registry.has('minecraft:mace') !== (version !== '1.20.1'))
        throw new Error('Version contamination');
      if (registry.has('minecraft:pale_oak_log') !== ['1.21.4', '26.3'].includes(version))
        throw new Error('Version contamination');
      const examples = [];
      for (const id of [
        'diamond_sword',
        'diamond_pickaxe',
        'apple',
        'iron_ingot',
        'stone',
        'oak_log',
        'crafting_table',
        'iron_boots',
        'leather_chestplate',
        'potion',
        'enchanted_book',
        'shield',
        'filled_map',
        'mace',
        'sulfur',
        'cow_spawn_egg','player_head','white_banner','bundle','bow','compass','chest','water_bucket','bread',
      ]) {
        const v = await assets.visual(version, { id: 'minecraft:' + id, components: {} }, 'en');
        if (v.url) {
          const bytes = await assets.image(v.url.split('/').pop()!);
          if (!bytes) throw new Error('Rendered image missing');
          decodeTexture(bytes);
        }
        examples.push({
          id: v.id,
          registered: registry.has(v.id),
          status: v.status,
          render: v.render,
        });
      }
      records.push({
        edition: 'java',
        version,
        clientSha1: expected.sha1,
        registry: registry.size,
        schema:modern?'items-presentation':'legacy-model',
        elapsedMs: Math.round(performance.now() - start),
        examples,
      });
      console.log(
        version,
        registry.size,
        examples.filter((e) => e.status === 'ready').length + ' rendered',
      );
    }
    const cold = { ...assets.metrics };
    const start = performance.now();
    await Promise.all(
      Array.from({ length: 200 }, () =>
        assets.visual('26.3', { id: 'minecraft:diamond_sword', components: {} }, 'en'),
      ),
    );
    const disk = (await import('node:fs/promises')).readdir;
    let size = 0,
      count = 0;
    for (const file of await disk(assets.root)) {
      size += (await stat(path.join(assets.root, file))).size;
      count++;
    }
    const report = {
      at: new Date().toISOString(),
      source:
        'Private official client JARs, verified against Mojang SHA-1; existing owned Modrinth 26.3 installation. No client assets are committed.',
      records,
      cold,
      repeat200Ms: Math.round(performance.now() - start),
      metrics: assets.metrics,
      memory:assets.stats(),
      cache: { files: count, bytes: size },
    };
    await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(path.join(runRoot, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log({ repeat200Ms: report.repeat200Ms, cache: report.cache, metrics: report.metrics });
  } finally {
    assets.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
