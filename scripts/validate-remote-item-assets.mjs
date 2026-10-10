import { build } from 'esbuild';
await build({
  entryPoints: ['scripts/validate-remote-item-assets.ts'],
  outfile: 'data/validate-remote-item-assets.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
});
await import('../data/validate-remote-item-assets.cjs');
