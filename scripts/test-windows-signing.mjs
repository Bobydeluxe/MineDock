// Explicit disposable native QA, invoked only by Test-SigningIntegration.ps1 -Package.
// Its temporary packages and private certificate are never uploaded or released.
import { build, Platform, Arch } from 'electron-builder';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { distributionConfig } from './distribution-config.mjs';
import { validateWindowsCertificate, verifyWindowsDistribution } from './windows-signing.mjs';

if (process.platform !== 'win32' || !['x64', 'arm64'].includes(process.arch))
  throw new Error('Run the native signing integration test on Windows x64 or ARM64.');
const directory = path.resolve(process.argv[2]);
const config = distributionConfig('win32');
Object.assign(process.env, config.environment);
validateWindowsCertificate();
await build({
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch[process.arch]),
  config: {
    ...config.config,
    directories: { output: directory },
  },
});
await verifyWindowsDistribution(directory, process.arch);
const binary = path.join(
  directory,
  `win${process.arch === 'arm64' ? '-arm64' : ''}-unpacked/MineDock.exe`,
);
execFileSync(process.execPath, ['scripts/test-packaged.mjs'], {
  env: { ...process.env, MINEDOCK_TEST_BINARY: binary },
  windowsHide: true,
  stdio: 'inherit',
});
