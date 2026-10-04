import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, createPublicKey, sign } from 'node:crypto';
import path from 'node:path';
const pkg = JSON.parse(await readFile('package.json', 'utf8')),
  trust = JSON.parse(await readFile('config/update-trust.json', 'utf8'));
let key = process.env.MINEDOCK_UPDATE_PRIVATE_KEY;
if (!key)
  try {
    key = await readFile('data/publisher/update-private.pem', 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
if (!key) {
  console.warn('No publisher update key configured: verified update metadata was not generated.');
  process.exit(0);
}
const publicKey = createPublicKey(key),
  keyId = createHash('sha256')
    .update(publicKey.export({ format: 'der', type: 'spki' }))
    .digest('hex');
if (
  publicKey.asymmetricKeyType !== 'ed25519' ||
  keyId !== trust.keyId ||
  publicKey.export({ format: 'pem', type: 'spki' }).toString() !== trust.publicKey
)
  throw new Error('The release key does not match the pinned publisher public key.');
const platform = process.platform,
  arch = process.arch;
if (!['win32', 'linux', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch))
  throw new Error('Unsupported native release target.');
const targets =
  platform === 'win32'
    ? [
        ['nsis', `MineDock-${pkg.version}-Setup-${arch}.exe`],
        ['portable', `MineDock-${pkg.version}-Portable-${arch}.exe`],
      ]
    : platform === 'linux'
      ? [
          ['appimage', `MineDock-${pkg.version}-${arch === 'x64' ? 'x86_64' : arch}.AppImage`],
          ['deb', `MineDock-${pkg.version}-${arch === 'x64' ? 'amd64' : arch}.deb`],
        ]
      : [
          ['maczip', `MineDock-${pkg.version}-${arch}.zip`],
          ['dmg', `MineDock-${pkg.version}-${arch}.dmg`],
        ];
const files = await readdir('release'),
  artifacts = [];
for (const [target, filename] of targets) {
  if (!files.includes(filename))
    throw new Error('Missing native distribution artifact: ' + filename);
  const file = path.join('release', filename),
    info = await stat(file),
    hash = createHash('sha256');
  if (!info.isFile() || info.size > 2 * 1024 ** 3)
    throw new Error('Invalid update installer size.');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  artifacts.push({
    platform,
    arch,
    target,
    filename,
    url: `https://github.com/Bobydeluxe/MineDock/releases/download/v${pkg.version}/${filename}`,
    size: info.size,
    sha256: hash.digest('hex'),
  });
}
let notes;
try {
  notes = await readFile('release/notes.txt', 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  notes = `MineDock ${pkg.version}. See the published release notes.`;
}
if (notes.length > 16000) throw new Error('Update release notes exceed the signed metadata limit.');
const now = Date.now(),
  payload = Buffer.from(
    JSON.stringify({
      format: 1,
      product: 'app.minedock.desktop',
      channel: 'stable',
      version: pkg.version,
      notes,
      publishedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 365 * 86400000).toISOString(),
      artifacts,
    }),
  );
const wrapper = {
  keyId,
  payload: payload.toString('base64'),
  signature: sign(null, payload, key).toString('base64'),
};
await writeFile(`release/update-${platform}-${arch}.json`, JSON.stringify(wrapper, null, 2) + '\n');
console.log(`Signed update metadata generated for ${platform}/${arch}.`);
