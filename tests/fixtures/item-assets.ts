import { ZipFile } from 'yazl';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { ItemAssets } from '../../packages/items/assets';

/** Original solid-color QA artwork, deliberately not Minecraft game textures. */
export async function itemAssetFixture(root: string, version = '1.20.1', modern = false) {
  await mkdir(root, { recursive: true });
  const png = new PNG({ width: 16, height: 16 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 240;
    png.data[i + 1] = 128;
    png.data[i + 2] = 40;
    png.data[i + 3] = 255;
  }
  const zip = new ZipFile(),
    chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (b) => chunks.push(b));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  const json = (file: string, data: unknown) =>
    zip.addBuffer(Buffer.from(JSON.stringify(data)), file);
  json('version.json', { id: version });
  json('assets/minecraft/models/item/generated.json', { parent: 'builtin/generated' });
  json('assets/minecraft/models/item/handheld.json', { parent: 'item/generated' });
  json('assets/minecraft/models/item/diamond_sword.json', {
    parent: 'item/handheld',
    textures: { layer0: 'item/qa' },
  });
  json('assets/minecraft/models/item/apple.json', {
    parent: 'item/generated',
    textures: { layer0: 'item/qa', layer1: 'item/qa' },
  });
  json('assets/minecraft/models/item/stone.json', { parent: 'block/qa_cube' });
  json('assets/minecraft/models/block/qa_cube.json', {
    display: { gui: { rotation: [30, 225, 0], scale: [0.625, 0.625, 0.625] } },
    textures: { all: 'block/qa' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: Object.fromEntries(
          ['up', 'down', 'east', 'west', 'north', 'south'].map((f) => [f, { texture: '#all' }]),
        ),
      },
    ],
  });
  json('assets/minecraft/lang/en_us.json', {
    'item.minecraft.diamond_sword': 'QA sword',
    'item.minecraft.apple': 'QA apple',
  });
  if (modern) {
    for (const id of ['diamond_sword', 'apple', 'stone'])
      json('assets/minecraft/items/' + id + '.json', {
        model: { type: 'minecraft:model', model: 'minecraft:item/' + id },
      });
  }
  zip.addBuffer(PNG.sync.write(png), 'assets/minecraft/textures/item/qa.png');
  zip.addBuffer(PNG.sync.write(png), 'assets/minecraft/textures/block/qa.png');
  zip.end();
  const bytes = await done,
    filename = path.join(root, version + '.jar');
  await writeFile(filename, bytes);
  const sha1 = createHash('sha1').update(bytes).digest('hex');
  let requests = 0;
  const registry = [
    'diamond_sword',
    'apple',
    'stone',
    ...Array.from({ length: 110 }, (_, i) => 'qa_' + i),
  ];
  const fetcher = async (url: string) => {
    requests++;
    if (url.includes('version_manifest'))
      return { versions: [{ id: version, url: 'https://piston-meta.mojang.com/qa' }] };
    if (url.includes('piston-meta')) return { id: version, downloads: { client: { sha1 } } };
    if (url.endsWith('version.json')) return { id: version };
    if (url.endsWith('item/data.json')) return registry;
    throw new Error('Unexpected QA metadata URL');
  };
  const assets = new ItemAssets(path.join(root, 'cache'), fetcher);
  await assets.importClient(version, filename);
  return { assets, filename, registry, requests: () => requests };
}
