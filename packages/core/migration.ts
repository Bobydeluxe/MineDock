import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AppCore } from './app';
import {
  migrationTargetSchema,
  cloneSchema,
  type MigrationTarget,
  type MigrationReview,
  type CloneInput,
} from '../domain/migration';
import { DomainError } from '../domain/errors';
import { engineDefinition } from '../domain/engines';
import { compatibleContent } from '../marketplace/content';
import { fetchJson } from '../minecraft/downloads';
import { z } from 'zod';
import { containedPath } from '../security/paths';
import { copyDirectory } from '../security/copy';
import { checkPort } from '../networking/network';
import type { Server } from '../domain/types';
function fail(message: string): never {
  throw new DomainError('MIGRATION', message);
}
const key = (core: AppCore, server: Server) =>
  JSON.stringify([server, core.repo.content(server.id)]);
export class MigrationService {
  private tickets = new Map<
    string,
    { review: MigrationReview; key: string; serverId: string; expires: number }
  >();
  constructor(private core: AppCore) {}
  async latest(id: string) {
    const server = this.core.repo.server(id);
    if (engineDefinition(server.engine).edition !== 'java') return null;
    const manifest = z
      .object({ latest: z.object({ release: z.string() }) })
      .parse(await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'));
    const release = manifest.latest.release;
    const newer = (version: string) => {
      if (!/^\d+(?:\.\d+){1,2}$/.test(version) || !/^\d+(?:\.\d+){1,2}$/.test(release))
        return false;
      const a = release.split('.').map(Number),
        b = version.split('.').map(Number);
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
      }
      return false;
    };
    for (const candidate of this.core.repo.servers())
      if (engineDefinition(candidate.engine).edition === 'java' && newer(candidate.version))
        this.core.health.minecraftRelease(candidate.id, release);
    return release;
  }
  async checkLatest() {
    const server = this.core.repo
      .servers()
      .find((s) => engineDefinition(s.engine).edition === 'java');
    if (server) await this.latest(server.id);
  }
  async review(id: string, raw: MigrationTarget): Promise<MigrationReview> {
    const target = migrationTargetSchema.parse(raw),
      server = this.core.repo.server(id);
    if (
      engineDefinition(server.engine).edition !== 'java' ||
      !(
        target.engine === server.engine ||
        (['paper', 'purpur'].includes(server.engine) && ['paper', 'purpur'].includes(target.engine))
      )
    )
      fail('This engine transition is not supported.');
    const versions = await this.core.versions.versions(target.engine);
    if (!versions.includes(target.version))
      fail('This engine does not provide the selected Minecraft version.');
    const before = server.version.split('.').map(Number),
      after = target.version.split('.').map(Number);
    let downgrade = false;
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      if ((after[i] ?? 0) !== (before[i] ?? 0)) {
        downgrade = (after[i] ?? 0) < (before[i] ?? 0);
        break;
      }
    }
    if (downgrade)
      fail('Minecraft world downgrades are unsafe. Restore a matching backup instead.');
    const artifact = await this.core.versions.artifact(
      target.engine,
      target.version,
      target.build,
      { loaderVersion: target.loaderVersion, installerVersion: target.installerVersion },
    );
    const future = { ...server, ...target, javaMajor: artifact.java };
    const review: MigrationReview = {
      token: randomUUID(),
      target: { ...target, build: artifact.build, loaderVersion: artifact.loaderVersion, installerVersion: artifact.installerVersion },
      javaMajor: artifact.java,
      items: [
        { category: 'runtime', title: 'Java ' + artifact.java, status: 'compatible' },
        {
          category: 'world',
          title: 'World data',
          status: target.version === server.version ? 'compatible' : 'unknown',
        },
        { category: 'config', title: 'Existing configuration', status: 'unknown' },
      ],
      blocked: false,
    };
    const folder = engineDefinition(server.engine).contentFolder;
    if (folder) {
      const inventory = await this.core.mods.inventory(server);
      for (const item of inventory.manual) {
        review.items.push({
          category: folder === 'mods' ? 'mod' : 'plugin',
          title: item.filename,
          status: 'unknown',
        });
        if (target.version !== server.version) review.blocked = true;
      }
      for (const item of this.core.repo.content(id)) {
        const category = folder === 'mods' ? ('mod' as const) : ('plugin' as const);
        if (item.provider && item.provider !== 'modrinth') {
          review.items.push({ category, title: item.title, status: 'unknown' });
          if (target.version !== server.version) review.blocked = true;
          continue;
        }
        try {
          const current = await this.core.marketplace.catalog.version(item.versionId),
            next = compatibleContent(future, current)
              ? current
              : (await this.core.marketplace.catalog.versions(future, item.projectId)).find(
                  (v) => v.releaseType === 'release' && compatibleContent(future, v),
                );
          const status =
            !next || (item.pinned && next.id !== item.versionId)
              ? 'incompatible'
              : next.id === item.versionId
                ? 'compatible'
                : 'update';
          review.items.push({ category, title: item.title, status, version: next?.name });
          if (status === 'incompatible') review.blocked = true;
        } catch {
          review.items.push({ category, title: item.title, status: 'unknown' });
          review.blocked = true;
        }
      }
    }
    for (const pack of server.packs ?? []) {
      const next = pack.projectId
        ? (await this.core.packs.versions(future, pack.kind, pack.projectId)).find(
            (v) => v.id === pack.versionId,
          )
        : undefined;
      const status =
        target.version === server.version
          ? 'compatible'
          : next
            ? 'compatible'
            : pack.projectId
              ? 'incompatible'
              : 'unknown';
      review.items.push({ category: pack.kind, title: pack.title, status });
      if (status === 'incompatible' || status === 'unknown') review.blocked = true;
    }
    if (this.tickets.size >= 100) this.tickets.delete(this.tickets.keys().next().value!);
    this.tickets.set(review.token, {
      review,
      key: key(this.core, server),
      serverId: id,
      expires: Date.now() + 600000,
    });
    return review;
  }
  async apply(id: string, token: string, confirmation: string) {
    await this.core.exclusive(id, async () => {
      const server = this.core.assertStopped(id),
        ticket = this.tickets.get(token);
      if (
        !ticket ||
        ticket.serverId !== id ||
        ticket.expires < Date.now() ||
        ticket.key !== key(this.core, server)
      )
        fail('Migration preview expired or the server changed.');
      if (confirmation !== server.name) fail('Confirm the server name.');
      if (ticket.review.blocked) fail('Resolve incompatible or unknown content before migrating.');
      this.tickets.delete(token);
      await this.core.safetyBackup(id, 'before_minecraft_change', true);
      const future = { ...server, ...ticket.review.target, javaMajor: ticket.review.javaMajor };
      await this.core.installer.install(id, {
        kind: 'server.migrate',
        replacement: future,
        prepare: async (stage, profile, context) => {
          const content = engineDefinition(profile.engine).contentFolder
            ? await this.core.mods.prepareMigration(profile, stage, context)
            : this.core.repo.content(id);
          for (const item of content)
            if (item.provider && item.provider !== 'modrinth') {
              item.gameVersion = profile.version;
              item.loader = profile.engine;
            }
          return content;
        },
      });
      this.core.repo.audit(
        'server.migrated',
        'Minecraft ' + future.version + ' / ' + future.engine,
        id,
      );
    });
  }
  async clone(id: string, raw: CloneInput): Promise<Server> {
    const input = cloneSchema.parse(raw),
      server = this.core.assertStopped(id);
    if (input.confirmation !== server.name) fail('Confirm the server name.');
    const reserved = await this.core.reservedPorts();
    const protocol = engineDefinition(server.engine).protocol;
    let port = input.port;
    while (reserved.has(port) || !(await checkPort(port, protocol))) {
      if (++port > Math.min(65535, input.port + 255)) fail('No available game port.');
    }
    const stage = await containedPath(this.core.root, 'clone-' + randomUUID());
    await mkdir(stage);
    try {
      await copyDirectory(server.path, stage, {
        exclude: (relative) => /(?:^|[/\\])session\.lock$|\.(?:lck|tmp|part)$/i.test(relative),
      });
      if (input.mode === 'newWorld') {
        const datapacks: { name: string; stage: string }[] = [];
        for (const world of await this.core.worlds.list(id))
          for (const folder of world.folders) {
            const source = await containedPath(stage, folder);
            const packs = await containedPath(source, 'datapacks');
            const has = await readdir(packs).then(
              () => true,
              (e: NodeJS.ErrnoException) => {
                if (e.code === 'ENOENT') return false;
                throw e;
              },
            );
            if (has) {
              const temporary = await containedPath(stage, '.clone-datapacks-' + randomUUID());
              await copyDirectory(packs, temporary);
              datapacks.push({ name: folder, stage: temporary });
            }
            await rm(source, { recursive: true, force: true });
          }
        for (const packs of datapacks) {
          const target = await containedPath(stage, path.join(packs.name, 'datapacks'));
          await copyDirectory(packs.stage, target);
          await rm(packs.stage, { recursive: true, force: true });
        }
      }
      for (const entry of ['logs', 'crash-reports'])
        await rm(await containedPath(stage, entry), { recursive: true, force: true });
      const preview = await this.core.imports.preview(stage);
      const result = await this.core.imports.import({
        token: preview.token,
        name: input.name,
        engine: server.engine,
        version: server.version,
        loaderVersion: server.loaderVersion,
        entrypoint:
          server.entrypoint ??
          preview.entrypoint ??
          (engineDefinition(server.engine).runtimeType === 'java' ? 'server.jar' : undefined),
        launchArgsFile: server.launchArgsFile,
        copy: true,
        acceptEula: false,
        port,
        memoryMin: server.memoryMin,
        memoryMax: server.memoryMax,
        confirmation: input.name,
      });
      for (const item of this.core.repo.content(id))
        this.core.repo.saveContent({ ...item, id: randomUUID(), serverId: result.id });
      const profile: Server = {
        ...result,
        modpack: server.modpack,
        jvm: server.jvm,
        macros: server.macros,
        autoRestart: server.autoRestart,
        packs: server.packs?.map((p) => ({ ...p, id: randomUUID() })),
        activeResourcePack: undefined,
      };
      const oldActive = server.packs?.findIndex((p) => p.id === server.activeResourcePack);
      if (oldActive !== undefined && oldActive >= 0)
        profile.activeResourcePack = profile.packs?.[oldActive]?.id;
      this.core.repo.saveServer(profile);
      return profile;
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
}
