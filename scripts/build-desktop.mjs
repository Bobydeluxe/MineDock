import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { writeNotices } from './notices.mjs';
const backend = await build({
  entryPoints: ['apps/desktop/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: true,
  metafile: true,
});
await build({
  entryPoints: ['apps/desktop/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
});
await mkdir('dist/assets', { recursive: true });
await copyFile('apps/desktop/assets/icon.png', 'dist/assets/icon.png');
await copyFile('LICENSE', 'dist/LICENSE.txt');
await writeNotices(backend.metafile.inputs);
