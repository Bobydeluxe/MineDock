import { spawn } from 'node:child_process';
import path from 'node:path';
import { stat } from 'node:fs/promises';
const arch = process.arch,
  suffix = arch === 'arm64' ? '-arm64' : '';
const relative =
  process.platform === 'win32'
    ? `win${suffix}-unpacked/MineDock.exe`
    : process.platform === 'darwin'
      ? `mac${suffix}/MineDock.app/Contents/MacOS/MineDock`
      : `linux${suffix}-unpacked/minedock`;
const binary = path.resolve('release', relative);
await stat(binary);
const child = spawn(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    'tests/ui/desktop.spec.ts',
    'tests/ui/administration-desktop.spec.ts',
    'tests/ui/files-desktop.spec.ts',
    'tests/ui/worlds-desktop.spec.ts',
    'tests/ui/recovery-retention-desktop.spec.ts',
    'tests/ui/updates-desktop.spec.ts',
    'tests/ui/mods-desktop.spec.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, MINEDOCK_TEST_BINARY: binary }, windowsHide: true },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
