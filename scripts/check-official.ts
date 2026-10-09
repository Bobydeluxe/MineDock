import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AppCore } from '../packages/core/app';
import { engineIds } from '../packages/domain/engines';
import { DomainError } from '../packages/domain/errors';
import type { Server } from '../packages/domain/types';
import { inspectJava } from '../packages/runtime-manager/runtime';
import { inspectPhp } from '../packages/runtime-manager/php';
import { ModrinthCatalog } from '../packages/marketplace/modrinth';
import { HangarCatalog } from '../packages/marketplace/hangar';
import { GeyserCatalog } from '../packages/marketplace/geyser';
import { IconCache } from '../packages/marketplace/icons';
import { checkPort } from '../packages/networking/network';

/** Opt-in external-service validation. Never executes a Minecraft server or accepts its EULA. */
async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags)
    if (!['--catalogs', '--runtimes', '--content'].includes(flag))
      throw new Error('Unknown official-check option.');
  if (!flags.size) flags.add('--catalogs');
  const root = path.resolve(`data/official-validation/${process.platform}-${process.arch}`);
  await mkdir(root, { recursive: true });
  const core = await AppCore.open(root);
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    eulaAccepted: false,
    minecraftExecuted: false,
  };
  try {
    if (flags.has('--catalogs')) {
      const results = [];
      for (const engine of engineIds) {
        console.log(`Checking official ${engine} catalog...`);
        try {
          const versions = await core.versions.versions(engine);
          if (!versions.length) throw new Error(`${engine}: empty official catalog.`);
          const version = versions.includes('1.21.11') ? '1.21.11' : versions[0]!,
            artifact = await core.versions.artifact(engine, version);
          const catalog = await core.versions.catalog(engine, version, true);
          results.push({
            engine,
            catalog: 'validated',
            versions: versions.length,
            availableBuilds: catalog.builds.length,
            availableInstallers: catalog.installers.length,
            recommendedBuild: catalog.builds.find((v) => v.recommended)?.version,
            recommendedInstaller: catalog.installers.find((v) => v.recommended)?.version,
            installerExamples: catalog.installers.slice(0, 4),
            version,
            build: artifact.build,
            java: artifact.java,
            officialHash: artifact.hash?.algorithm ?? 'not supplied',
            minecraftVersion: artifact.minecraftVersion,
          });
        } catch (error) {
          if (error instanceof DomainError && error.code === 'PLATFORM')
            results.push({ engine, catalog: 'unavailable', reason: error.message });
          else throw error;
        }
      }
      report.catalogs = results;
      console.log('Official engine catalog results:', JSON.stringify(results));
    }
    if (flags.has('--runtimes')) {
      const runtime = await core.runtime.ensure(21),
        health = await inspectJava(runtime.path);
      if (!health || health.major !== 21 || health.arch !== process.arch)
        throw new Error('Official Java runtime native probe failed.');
      report.java = { version: health.version, architecture: health.arch, probe: 'validated' };
      const pocketmine = (await core.versions.versions('pocketmine'))[0]!;
      try {
        const php = await core.php.ensure(pocketmine),
          checked = await inspectPhp(php.path);
        if (!checked?.zts || checked.architecture !== process.arch)
          throw new Error('Official PHP runtime native probe failed.');
        report.php = { ...checked, probe: 'validated', pocketmine };
      } catch (error) {
        if (error instanceof DomainError && error.code === 'PLATFORM')
          report.php = { probe: 'unavailable', reason: error.message, pocketmine };
        else throw error;
      }
      console.log(
        'Native runtime results:',
        JSON.stringify({ java: report.java, php: report.php }),
      );
    }
    if (flags.has('--content')) {
      // This isolated validation profile contains a sentinel world; it has no server executable or EULA.
      const id = randomUUID(),
        folder = path.join(core.repo.settings().serverRoot, id);
      await mkdir(path.join(folder, 'world'), { recursive: true });
      await writeFile(path.join(folder, 'world/sentinel.txt'), 'preserved');
      await writeFile(
        path.join(folder, 'server.properties'),
        'online-mode=true\nserver-port=25565\n',
      );
      const server = {
        id,
        path: folder,
        name: 'Official content validation',
        engine: 'paper',
        version: '1.21.11',
        javaMajor: 21,
        port: 25565,
        onlineMode: true,
        status: 'stopped',
      } as Server;
      core.repo.addServer(server, randomUUID());
      const hangar = new HangarCatalog(),
        projects = await hangar.search(server, 'ViaVersion'),
        versions = await hangar.versions(server, '31');
      if (!projects.length || !versions.length)
        throw new Error('Official Hangar search or compatible versions failed.');
      const geyser = (await new ModrinthCatalog().versions(server, 'wKkoqHrH'))[0]!,
        floodgate = (await new GeyserCatalog().versions(server, 'floodgate'))[0]!;
      let udp = 30333;
      while (
        core.repo.servers().some((item) => item.crossplayPort === udp) ||
        !(await checkPort(udp, 'udp'))
      ) {
        if (++udp > 65535) throw new Error('No validation UDP port available.');
      }
      await core.crossplay.configure(server, {
        port: udp,
        floodgate: true,
        geyserVersion: geyser.id,
        floodgateVersion: floodgate.id,
        confirmation: server.name,
      });
      if ((await readFile(path.join(folder, 'world/sentinel.txt'), 'utf8')) !== 'preserved')
        throw new Error('World sentinel changed during content installation.');
      const icon = projects[0]?.iconUrl;
      report.content = {
        hangarProjects: projects.length,
        hangarVersions: versions.length,
        icon: icon ? !!(await new IconCache(path.join(root, 'icons')).get(icon)) : 'not supplied',
        crossplay: await core.crossplay.status(core.repo.server(id)),
        managed: core.repo.content(id).map((item) => ({
          title: item.title,
          provider: item.provider,
          version: item.versionName,
        })),
      };
      console.log('Verified official content transaction:', JSON.stringify(report.content));
    }
    await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
    console.log('No Minecraft executable was launched and no real EULA was accepted.');
  } catch (error) {
    report.failure = error instanceof Error ? error.message : 'Official validation failed.';
    await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await core.close();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Official validation failed.');
  process.exitCode = 1;
});
