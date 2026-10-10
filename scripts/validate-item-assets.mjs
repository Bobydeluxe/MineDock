import { build } from 'esbuild';
await build({
  entryPoints: ['scripts/validate-item-assets.ts'],
  outfile: 'data/validate-item-assets.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
});
await import('../data/validate-item-assets.cjs');
