import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, readFile, copyFile, rename, rm } from 'node:fs/promises';
import { z } from 'zod';
import type { Repository } from '../database/database';
import type { Server } from '../domain/types';
import { engineDefinition } from '../domain/engines';
import {
  packRequestSchema,
  packActionSchema,
  type PackKind,
  type PackPlan,
  type PackRequest,
  type PackFile,
  type PackAction,
  type PackInventory,
} from '../domain/packs';
import type { ContentVersion } from '../domain/content';
import { DomainError } from '../domain/errors';
import { parseProperties, serializeProperties } from '../domain/properties';
import { containedPath, validateRelative, atomicWrite } from '../security/paths';
import { readZipEntries } from '../security/zip-reader';
import { sha256 } from '../backups/archive';
import type { DownloadManager } from '../minecraft/downloads';
import type { ModrinthCatalog } from './modrinth';
import type { ManagedContentService } from './content';

function fail(message: string): never {
  throw new DomainError('PACK', message);
}
const fingerprint = (server: Server) =>
  JSON.stringify([server.version, server.path, server.packs, server.activeResourcePack]);
export class PackService {
  private plans = new Map<
    string,
    { plan: PackPlan; input: PackRequest; serverId: string; key: string; expires: number }
  >();
  constructor(
    private repo: Repository,
    private catalog: ModrinthCatalog,
    private downloads: DownloadManager,
    private content: ManagedContentService,
  ) {}
  private async scope(server: Server, kind: PackKind, world?: string) {
    if (engineDefinition(server.engine).edition !== 'java')
      fail('Packs require a Minecraft Java server.');
    if (kind === 'resourcepack') return 'resourcepacks';
    const props = parseProperties(
      await readFile(await containedPath(server.path, 'server.properties'), 'utf8'),
    );
    const name = validateRelative(world ?? props['level-name'] ?? 'world');
    if (!name || name.includes(path.sep) || name.startsWith('.'))
      fail('Choose a world in this server.');
    if (!(await stat(await containedPath(server.path, name))).isDirectory())
      fail('The selected world does not exist. Start the server once to generate it.');
    return path.join(name, 'datapacks');
  }
  async inventory(server: Server, kind: PackKind, world?: string): Promise<PackInventory> {
    const scope = await this.scope(server, kind, world),
      root = await containedPath(server.path, scope);
    const installed = (server.packs ?? []).filter(
      (p) => p.kind === kind && (kind !== 'datapack' || p.world === path.dirname(scope)),
    );
    const report: PackInventory = {
      installed,
      manual: [],
      problems: [],
      active: server.activeResourcePack,
    };
    const names = await readdir(root).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [] as string[];
      throw e;
    });
    for (const name of names) {
      const filename = await containedPath(root, name),
        info = await stat(filename);
      const managed = installed.find((p) => p.filename + (p.enabled ? '' : '.disabled') === name);
      if (!managed)
        report.manual.push({
          filename: name,
          enabled: !name.endsWith('.disabled'),
          size: info.size,
        });
      else if (!info.isFile() || (await sha256(filename)) !== managed.sha256)
        report.problems.push(name + ': changed outside MineDock');
    }
    for (const item of installed)
      if (!names.includes(item.filename + (item.enabled ? '' : '.disabled')))
        report.problems.push(item.filename + ': missing');
    return report;
  }
  async search(server: Server, kind: PackKind, query: string) {
    await this.scope(server, kind);
    const result = await this.catalog.browse(server, { query, side: 'any' }, undefined, kind);
    const items = [];
    for (const item of result.items)
      if ((await this.catalog.packVersions(server, kind, item.id)).length) items.push(item);
    return items;
  }
  versions(server: Server, kind: PackKind, id: string) {
    return this.catalog.packVersions(server, kind, id);
  }
  private compatible(server: Server, kind: PackKind, v: ContentVersion) {
    return (
      v.gameVersions.includes(server.version) &&
      v.loaders.includes(kind === 'datapack' ? 'datapack' : 'minecraft') &&
      v.files.some((f) => f.filename.endsWith('.zip'))
    );
  }
  async plan(server: Server, raw: PackRequest): Promise<PackPlan> {
    const input = packRequestSchema.parse(raw);
    await this.scope(server, input.kind, input.world);
    const plan: PackPlan = { token: randomUUID(), entries: [], optional: [], conflicts: [] };
    const resolved = new Map<string, string>(),
      visiting = new Set<string>();
    const resolve = async (id: string, pinned?: string): Promise<void> => {
      const project = await this.catalog.project(id);
      if (project.kind !== input.kind)
        fail('A dependency is a different content type. Review this project manually.');
      const known = resolved.get(project.id);
      if (known) {
        if (pinned && pinned !== known) fail('Dependencies require different versions.');
        return;
      }
      if (visiting.has(project.id) || visiting.size + resolved.size >= 100)
        fail('Circular or oversized dependency graph.');
      visiting.add(project.id);
      const version = pinned
        ? await this.catalog.version(pinned)
        : (await this.versions(server, input.kind, project.id)).find(
            (v) => v.releaseType !== 'alpha' && v.releaseType !== 'beta',
          );
      if (
        !version ||
        version.projectId !== project.id ||
        !this.compatible(server, input.kind, version)
      )
        fail('No compatible ZIP version is available.');
      for (const dependency of version.dependencies) {
        let depId = dependency.projectId;
        if (!depId && dependency.versionId)
          depId = (await this.catalog.version(dependency.versionId)).projectId;
        if (!depId) {
          if (dependency.required) fail('A required dependency has no verifiable project.');
          continue;
        }
        if (dependency.required) await resolve(depId, dependency.versionId);
        else if (dependency.type === 'incompatible') plan.conflicts.push(depId);
        else if (dependency.type === 'optional') plan.optional.push(depId);
      }
      const existing = server.packs?.find(
        (p) =>
          p.projectId === project.id &&
          p.kind === input.kind &&
          (input.kind !== 'datapack' || p.world === (input.world ?? 'world')),
      );
      if (existing && !existing.enabled)
        fail('A required or selected pack is disabled. Enable it first.');
      resolved.set(project.id, version.id);
      visiting.delete(project.id);
      plan.entries.push({
        project,
        version,
        action: existing?.versionId === version.id ? 'keep' : existing ? 'update' : 'install',
      });
    };
    await resolve(input.projectId, input.versionId);
    if (
      plan.conflicts.some(
        (id) => resolved.has(id) || server.packs?.some((p) => p.projectId === id && p.enabled),
      )
    )
      fail('This selection conflicts with another pack.');
    if (this.catalog.offline)
      fail('Modrinth is unavailable. Cached installed packs remain available.');
    if (this.plans.size >= 100) this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(plan.token, {
      plan,
      input,
      serverId: server.id,
      key: fingerprint(server),
      expires: Date.now() + 600000,
    });
    return plan;
  }
  private async inspect(filename: string) {
    const metadata = (await readZipEntries(filename, ['pack.mcmeta'])).get('pack.mcmeta');
    if (!metadata) fail('The ZIP needs pack.mcmeta at its root.');
    z.object({
      pack: z.object({
        description: z.unknown(),
        pack_format: z.number().int().nonnegative().optional(),
        min_format: z.union([z.number(), z.array(z.number())]).optional(),
        max_format: z.union([z.number(), z.array(z.number())]).optional(),
      }),
    }).parse(JSON.parse(metadata.toString('utf8')));
    const hash = createHash('sha1');
    for await (const chunk of createReadStream(filename)) hash.update(chunk as Buffer);
    return {
      sha256: await sha256(filename),
      sha1: hash.digest('hex'),
      size: (await stat(filename)).size,
    };
  }
  private async check(root: string, item: PackFile) {
    const file = await containedPath(root, item.filename + (item.enabled ? '' : '.disabled'));
    if ((await sha256(file)) !== item.sha256)
      fail('This file was changed outside MineDock. It will not be replaced.');
    return file;
  }
  async apply(server: Server, token: string) {
    const saved = this.plans.get(token);
    if (
      !saved ||
      saved.serverId !== server.id ||
      saved.expires < Date.now() ||
      saved.key !== fingerprint(server)
    )
      fail('This preview expired or the server changed. Review the selection again.');
    this.plans.delete(token);
    const scope = await this.scope(server, saved.input.kind, saved.input.world);
    await this.content.transaction(
      server,
      async (stage, context) => {
        const root = await containedPath(stage, scope);
        await mkdir(root, { recursive: true });
        let packs = [...(server.packs ?? [])];
        for (const entry of saved.plan.entries) {
          const old = packs.find(
            (p) =>
              p.projectId === entry.project.id &&
              p.kind === saved.input.kind &&
              (p.kind !== 'datapack' || p.world === path.dirname(scope)),
          );
          if (entry.action === 'keep' && old) {
            await this.check(root, old);
            continue;
          }
          const file =
            entry.version.files.find((f) => f.primary && f.filename.endsWith('.zip')) ??
            entry.version.files.find((f) => f.filename.endsWith('.zip'));
          if (!file?.hash || path.basename(file.filename) !== file.filename)
            fail('This version has no verified ZIP.');
          validateRelative(file.filename);
          const target = await containedPath(root, file.filename);
          if (old) await rm(await this.check(root, old));
          for (const name of [target, target + '.disabled'])
            if (
              await stat(name).then(
                () => true,
                (e: NodeJS.ErrnoException) => {
                  if (e.code === 'ENOENT') return false;
                  throw e;
                },
              )
            )
              fail('A manual pack uses this filename. It will not be overwritten.');
          await this.downloads.download(
            file.url,
            target,
            entry.project.title,
            file.hash,
            512 * 1024 ** 2,
            context?.signal,
            (url) => url.hostname === 'cdn.modrinth.com',
          );
          const item: PackFile = {
            id: old?.id ?? randomUUID(),
            kind: saved.input.kind,
            world: saved.input.kind === 'datapack' ? path.dirname(scope) : undefined,
            projectId: entry.project.id,
            versionId: entry.version.id,
            title: entry.project.title,
            version: entry.version.name,
            filename: file.filename,
            enabled: true,
            ...(await this.inspect(target)),
            url: file.url,
            installedAt: new Date().toISOString(),
            dependencies: entry.version.dependencies
              .filter((d) => d.required && d.projectId)
              .map((d) => d.projectId!),
          };
          packs = [...packs.filter((p) => p.id !== item.id), item];
        if (old && server.activeResourcePack === old.id) {
            const config = await containedPath(stage, 'server.properties'),
              props = parseProperties(await readFile(config, 'utf8'));
            props['resource-pack'] = item.url!;
            props['resource-pack-sha1'] = item.sha1;
            await atomicWrite(config, serializeProperties(props));
          }
        }
        return {
          value: undefined,
          items: this.repo.content(server.id),
          profile: { ...server, packs },
        };
      },
      'Install packs',
      true,
    );
  }
  async import(server: Server, kind: PackKind, source: string, world?: string) {
    const scope = await this.scope(server, kind, world),
      info = await stat(source);
    if (!info.isFile() || info.size > 512 * 1024 ** 2) fail('Choose a ZIP smaller than 512 MB.');
    const hashes = await this.inspect(source),
      name = path.basename(source);
    validateRelative(name);
    if (!name.endsWith('.zip')) fail('Choose a ZIP file.');
    await this.content.transaction(
      server,
      async (stage) => {
        const root = await containedPath(stage, scope);
        await mkdir(root, { recursive: true });
        const target = await containedPath(root, name);
        await copyFile(source, target, 1);
        if ((await sha256(target)) !== hashes.sha256)
          fail('The imported pack changed while copying.');
        const item: PackFile = {
          id: randomUUID(),
          kind,
          world: kind === 'datapack' ? path.dirname(scope) : undefined,
          title: name,
          filename: name,
          enabled: true,
          ...hashes,
          installedAt: new Date().toISOString(),
          dependencies: [],
        };
        return {
          value: undefined,
          items: this.repo.content(server.id),
          profile: { ...server, packs: [...(server.packs ?? []), item] },
        };
      },
      'Import pack',
      true,
    );
  }
  async action(server: Server, raw: PackAction) {
    const input = packActionSchema.parse(raw),
      item = server.packs?.find((p) => p.id === input.id);
    if (!item || input.confirmation !== server.name) fail('Confirm with the server name.');
    if (
      input.action !== 'select' &&
      server.packs?.some((p) => p.enabled && p.dependencies.includes(item.projectId ?? ''))
    )
      fail('Another enabled pack requires this pack.');
    const scope = await this.scope(server, item.kind, item.world);
    await this.content.transaction(
      server,
      async (stage) => {
        const file = await this.check(await containedPath(stage, scope), item),
          profile = { ...server, packs: (server.packs ?? []).map((p) => ({ ...p })) };
        if (input.action === 'select') {
          if (item.kind !== 'resourcepack') fail('Select a resource pack.');
          const url = new URL(input.url ?? item.url ?? '');
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            fail('Provide an HTTP(S) download URL without credentials.');
          const config = await containedPath(stage, 'server.properties'),
            props = parseProperties(await readFile(config, 'utf8'));
          props['resource-pack'] = url.href;
          props['resource-pack-sha1'] = item.sha1;
          await atomicWrite(config, serializeProperties(props));
          profile.activeResourcePack = item.id;
        } else {
          if (server.activeResourcePack === item.id)
            fail('Choose another resource pack before removing the selected pack.');
          if (input.action === 'remove') {
            await rm(file);
            profile.packs = profile.packs.filter((p) => p.id !== item.id);
          } else {
            await rename(
              file,
              await containedPath(
                path.dirname(file),
                item.filename + (item.enabled ? '.disabled' : ''),
              ),
            );
            profile.packs.find((p) => p.id === item.id)!.enabled = !item.enabled;
          }
        }
        return { value: undefined, items: this.repo.content(server.id), profile };
      },
      'Change pack',
      true,
    );
  }
}
