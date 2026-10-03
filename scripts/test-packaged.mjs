import { spawn } from 'node:child_process';
import path from 'node:path';
const binary = path.resolve('release/win-unpacked/MineDock.exe');
const child = spawn(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', 'tests/ui/desktop.spec.ts'],
  { stdio: 'inherit', env: { ...process.env, MINEDOCK_TEST_BINARY: binary }, windowsHide: true },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
