import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('data', { recursive: true });
await build({
  entryPoints: ['scripts/validate-native-upgrade.ts'],
  outfile: 'data/native-upgrade.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node24',
});
await import('../data/native-upgrade.mjs');
