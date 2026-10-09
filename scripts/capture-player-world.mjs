import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({
  entryPoints: ['scripts/capture-player-world.ts'],
  outfile: 'data/capture-player-world.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node24',
});
const child = spawn(process.execPath, ['data/capture-player-world.mjs', ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
