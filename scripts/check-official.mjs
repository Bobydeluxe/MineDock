import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({
  entryPoints: ['scripts/check-official.ts'],
  outfile: 'data/check-official.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
});
const child = spawn(process.execPath, ['data/check-official.cjs', ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', () => {
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
