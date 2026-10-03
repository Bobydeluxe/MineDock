import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({
  entryPoints: ['scripts/smoke-live.ts'],
  outfile: 'data/smoke-live.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
});
const child = spawn(process.execPath, ['data/smoke-live.cjs'], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
