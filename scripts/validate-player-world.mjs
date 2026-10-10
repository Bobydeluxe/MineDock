import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({
  entryPoints: ['scripts/validate-player-world.ts'],
  outfile: 'data/validate-player-world.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
});
const child = spawn(
  process.execPath,
  ['data/validate-player-world.cjs', ...process.argv.slice(2)],
  { stdio: 'inherit', windowsHide: true },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
