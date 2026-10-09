import path from 'node:path';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AppCore } from '../packages/core/app';
import { installerProcess } from '../packages/minecraft/process';
import yauzl from 'yauzl';
async function launcherManifest(file: string): Promise<string> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error);
        return;
      }
      zip.on('error', reject);
      zip.on('end', () => reject(Error('Launcher manifest missing.')));
      zip.on('entry', (entry) => {
        if (entry.fileName !== 'META-INF/MANIFEST.MF') {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > 100000) {
          zip.close();
          reject(Error('Unexpected manifest size.'));
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            zip.close();
            reject(error);
            return;
          }
          const parts: Buffer[] = [];
          stream.on('data', (b: Buffer) => parts.push(b));
          stream.on('error', reject);
          stream.on('end', () => {
            zip.close();
            resolve(
              Buffer.concat(parts)
                .toString('utf8')
                .replace(/\r?\n /g, ''),
            );
          });
        });
      });
      zip.readEntry();
    }),
  );
}
async function main() {
  const root = path.resolve('data/official-validation/' + process.platform + '-' + process.arch);
  const core = await AppCore.open(root);
  try {
    const artifact = await core.versions.artifact('fabric', '1.21.1', undefined, {
      loaderVersion: '0.16.9',
      installerVersion: '1.0.1',
    });
    if (artifact.build !== '0.16.9@1.0.1' || !artifact.hash)
      throw Error('Exact official Fabric artifact not available.');
    const java = await core.runtime.ensure(artifact.java);
    const stage = path.join(root, 'fabric-exact-0.16.9-1.0.1');
    await mkdir(stage, { recursive: true });
    const installer = path.join(stage, artifact.filename);
    await core.downloads.download(artifact.url, installer, 'Fabric exact installer', artifact.hash);
    await writeFile(path.join(stage, 'eula.txt'), 'eula=false\n');
    await installerProcess(
      java.path,
      [
        '-jar',
        installer,
        'server',
        '-mcversion',
        '1.21.1',
        '-loader',
        '0.16.9',
        '-downloadMinecraft',
      ],
      stage,
      undefined,
      (line) => console.log(line),
    );
    const entrypoint = path.join(stage, 'fabric-server-launch.jar');
    await stat(entrypoint);
    const launcher = await launcherManifest(entrypoint);
    if (!launcher.includes('fabric-loader/0.16.9/fabric-loader-0.16.9.jar'))
      throw Error('Installed loader differs from explicit selection.');
    const minecraft = await core.versions.artifact('vanilla', '1.21.1');
    const serverHash = createHash(minecraft.hash!.algorithm)
      .update(await readFile(path.join(stage, 'server.jar')))
      .digest('hex');
    if (serverHash !== minecraft.hash!.value) throw Error('Minecraft server digest mismatch.');
    if ((await readFile(path.join(stage, 'eula.txt'), 'utf8')).trim() !== 'eula=false')
      throw Error('EULA unexpectedly changed.');
    const proof = {
      at: new Date().toISOString(),
      platform: process.platform,
      architecture: process.arch,
      minecraft: '1.21.1',
      loader: artifact.loaderVersion,
      installer: artifact.installerVersion,
      build: artifact.build,
      url: artifact.url,
      officialHash: artifact.hash,
      downloadSha256: createHash('sha256')
        .update(await readFile(installer))
        .digest('hex'),
      launcher,
      serverHash,
      serverHashAlgorithm: minecraft.hash!.algorithm,
      entrypointBytes: (await stat(entrypoint)).size,
      eulaAccepted: false,
      minecraftExecuted: false,
      installerExecuted: true,
    };
    await writeFile(path.join(root, 'fabric-exact-install.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  } finally {
    await core.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
