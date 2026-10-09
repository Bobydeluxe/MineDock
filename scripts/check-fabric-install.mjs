import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({
  entryPoints: ['scripts/check-fabric-install.ts'],
  outfile: 'data/check-fabric-install.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
});
const child = spawn(process.execPath, ['data/check-fabric-install.cjs'], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
