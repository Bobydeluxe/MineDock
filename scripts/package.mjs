import { build, Platform, Arch } from 'electron-builder';
import { distributionConfig } from './distribution-config.mjs';
const targets = {
  windows: { platform: 'win32', builder: Platform.WINDOWS, formats: ['nsis', 'portable'] },
  linux: { platform: 'linux', builder: Platform.LINUX, formats: ['AppImage', 'deb'] },
  mac: { platform: 'darwin', builder: Platform.MAC, formats: ['dmg', 'zip'] },
};
const target = targets[process.argv[2]],
  arch = process.argv[3] ?? process.arch;
if (!target || target.platform !== process.platform)
  throw new Error('Run this packaging command on its native operating system.');
if (!['x64', 'arm64'].includes(arch) || arch !== process.arch)
  throw new Error(
    'Native packaging requires an x64 or arm64 Node runtime matching the requested architecture.',
  );
const options = distributionConfig(target.platform);
Object.assign(process.env, options.environment);
if (!options.signing && target.platform !== 'linux')
  console.warn('No publisher certificate configured: this distribution is unsigned.');
if (options.signing && target.platform === 'darwin' && !options.notarizing)
  console.warn('Apple signing is configured, but notarization credentials are missing.');
console.log(
  `Packaging ${target.platform}/${arch}; signing=${options.signing}; notarization=${options.notarizing}`,
);
await build({
  targets: target.builder.createTarget(target.formats, Arch[arch]),
  config: options.config,
});
