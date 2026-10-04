import { generateKeyPairSync, createPublicKey, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const folder = path.resolve('data/publisher'),
  privatePath = path.join(folder, 'update-private.pem');
await mkdir(folder, { recursive: true });
let privateKey;
try {
  privateKey = await readFile(privatePath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const keys = generateKeyPairSync('ed25519');
  privateKey = keys.privateKey.export({ format: 'pem', type: 'pkcs8' });
  await writeFile(privatePath, privateKey, { flag: 'wx', mode: 0o600 });
}
const publicKey = createPublicKey(privateKey);
if (publicKey.asymmetricKeyType !== 'ed25519')
  throw new Error('Expected an Ed25519 publisher key.');
const keyId = createHash('sha256')
  .update(publicKey.export({ format: 'der', type: 'spki' }))
  .digest('hex');
await mkdir('config', { recursive: true });
await writeFile(
  'config/update-trust.json',
  JSON.stringify({ keyId, publicKey: publicKey.export({ format: 'pem', type: 'spki' }) }, null, 2) +
    '\n',
);
console.log('Publisher update key: ' + keyId);
console.log(
  'Private key stored in ignored data/publisher/update-private.pem. Never publish this file.',
);
