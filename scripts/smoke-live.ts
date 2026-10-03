import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventBus } from '../packages/core/events';
import { Repository } from '../packages/database/database';
import { MinecraftVersionService } from '../packages/minecraft/versions';
import { DownloadManager } from '../packages/minecraft/downloads';
import { RuntimeManager } from '../packages/runtime-manager/runtime';
import { ModrinthProvider } from '../packages/marketplace/modrinth';
import { sha256 } from '../packages/backups/archive';
import type { Server } from '../packages/domain/types';

async function main(): Promise<void> {
  const root = path.resolve('data/live-smoke');
  await mkdir(root, { recursive: true });
  const bus = new EventBus();
  const repo = new Repository(root, bus);
  const downloads = new DownloadManager(bus);
  const versions = new MinecraftVersionService();
  const runtimes = new RuntimeManager(repo, downloads);
  let last = 0;
  bus.subscribe((event) => {
    if (event.type === 'progress' && (event.progress.done || Date.now() - last > 3000)) {
      last = Date.now();
      console.log(
        event.progress.label,
        Math.round(event.progress.received / 1024 ** 2) + ' MB',
        event.progress.phase,
      );
    }
  });
  try {
    const paperVersions = await versions.versions('paper');
    const vanillaVersions = await versions.versions('vanilla');
    const artifact = await versions.artifact('paper', '1.21.11');
    console.log(
      'Catalogs:',
      paperVersions.length,
      'Paper /',
      vanillaVersions.length,
      'Vanilla. Paper build:',
      artifact.build,
      'Java:',
      artifact.java,
    );
    const java = await runtimes.ensure(artifact.java);
    const binary = await promisify(execFile)(java.path, ['-version'], {
      windowsHide: true,
      timeout: 10000,
    });
    console.log('Managed runtime:', binary.stderr.split('\n')[0]);
    const folder = path.join(root, 'paper');
    await mkdir(folder, { recursive: true });
    await downloads.download(
      artifact.url,
      path.join(folder, 'server.jar'),
      'Paper real download',
      artifact.hash,
    );
    console.log('Verified Paper SHA-256:', await sha256(path.join(folder, 'server.jar')));
    // Deliberately decline the EULA here. Consent belongs to the user in the wizard.
    await writeFile(path.join(folder, 'eula.txt'), 'eula=false\n');
    const boot = await promisify(execFile)(
      java.path,
      ['-Xms256M', '-Xmx512M', '-jar', 'server.jar', 'nogui'],
      { cwd: folder, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 ** 2 },
    );
    const output = boot.stdout + boot.stderr;
    if (!/EULA|eula/.test(output))
      throw new Error('Expected the real server to request EULA acceptance.');
    console.log('Real Paper bootstrap reached the EULA gate. No world started.');
    const fakeProfile = {
      id: 'live-probe',
      engine: 'paper',
      version: '1.21.11',
      path: folder,
    } as Server;
    const projects = await new ModrinthProvider(repo, downloads).search(fakeProfile, 'LuckPerms');
    console.log('Compatible Modrinth search:', projects[0]?.title, projects.length, 'results');
    if (!projects.length) throw new Error('No compatible live marketplace result.');
    const eula = await readFile(path.join(folder, 'eula.txt'), 'utf8');
    if (!eula.includes('eula=false')) throw new Error('EULA consent changed unexpectedly.');
    await writeFile(
      path.join(root, 'result.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          paperBuild: artifact.build,
          java: artifact.java,
          paperVersions: paperVersions.length,
          vanillaVersions: vanillaVersions.length,
          eulaAccepted: false,
          bootReachedEula: true,
          modrinthResults: projects.length,
        },
        null,
        2,
      ),
    );
  } finally {
    repo.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
