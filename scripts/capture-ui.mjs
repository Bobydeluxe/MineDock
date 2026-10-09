import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await mkdir('data', { recursive: true });
await build({
  entryPoints: ['scripts/capture-desktop.ts'],
  outfile: 'data/capture-desktop.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node24',
});
const child = spawn(process.execPath, ['data/capture-desktop.mjs', ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
