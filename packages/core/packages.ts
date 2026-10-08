import { mkdir, readdir, lstat, readFile, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { stringify, parseDocument } from 'yaml';
import type { AppCore } from './app';
import {
  packageManifestSchema,
  packageImportSchema,
  type PackageManifest,
  type PackagePreview,
} from '../domain/package';
import { createServerSchema } from '../domain/types';
import { engineDefinition } from '../domain/engines';
import { parseProperties, serializeProperties } from '../domain/properties';
import { atomicWrite, containedPath, validateRelative } from '../security/paths';
import { copyDirectory, copyRegularFile } from '../security/copy';
import { readZipEntries } from '../security/zip-reader';
import { extractZip, sha256, zipDirectory } from '../backups/archive';
import { checkPort } from '../networking/network';
import { recommendMemory } from '../domain/performance';
import { DomainError } from '../domain/errors';
const secretName =
  /(?:^|[\\/])(?:\.env(?:\..*)?|saved-refresh-tokens\.json|credentials\.json|secrets\.json|.*\.(?:pem|key|p12|pfx))$/i;
const temporary =
  /(?:^|[\\/])(?:session\.lock|.*\.(?:lck|tmp|part)|logs|crash-reports|cache|libraries|versions|\.git|\.minedock[^/]*)$/i;
const rootFiles = new Set([
  'server.properties',
  'whitelist.json',
  'ops.json',
  'banned-players.json',
  'banned-ips.json',
  'allowlist.json',
  'permissions.json',
  'bukkit.yml',
  'spigot.yml',
  'purpur.yml',
]);
export class PackageService {
  private tickets = new Map<
    string,
    { stage: string; manifest: PackageManifest; preview: PackagePreview; expires: number }
  >();
  constructor(private core: AppCore) {}
  private cache() {
    return path.join(this.core.root, 'cache', 'packages');
  }
  private async inventory(root: string) {
    const files: PackageManifest['files'] = [];
    let bytes = 0,
      entries = 2;
    const walk = async (relative: string): Promise<void> => {
      for (const entry of await readdir(await containedPath(root, relative, true), {
        withFileTypes: true,
      })) {
        if (++entries > 100000)
          throw new DomainError('SIZE', 'Package exceeds the archive entry limit.');
        const child = path.join(relative, entry.name),
          file = await containedPath(root, child),
          info = await lstat(file);
        if (entry.isDirectory()) await walk(child);
        else if (info.isFile()) {
          if (files.length >= 100000 || (bytes += info.size) > 64 * 1024 ** 3)
            throw new DomainError('SIZE', 'Package exceeds the file or size limit.');
          files.push({
            path: child.replaceAll('\\', '/'),
            bytes: info.size,
            sha256: await sha256(file),
          });
        } else throw new DomainError('PATH', 'Packages cannot contain links or special files.');
      }
    };
    await walk('');
    return files;
  }
  async export(id: string, destination: string, includeSensitive: boolean, confirmation: string) {
    await this.core.exclusive(id, async () => {
      const server = this.core.assertStopped(id);
      if (confirmation !== server.name) throw new DomainError('CONFIRM', 'Incorrect confirmation.');
      const root = this.cache();
      await mkdir(root, { recursive: true });
      const stage = await containedPath(root, randomUUID());
      await mkdir(stage);
      try {
        const data = await containedPath(stage, 'server');
        await mkdir(data);
        const worlds = await this.core.worlds.list(id),
          worldRoots = new Set(worlds.flatMap((w) => w.folders).map((f) => f.split(/[\\/]/)[0]!));
        if (engineDefinition(server.engine).worldFolder === 'worlds') worldRoots.add('worlds');
        const allowedRoot = (relative: string) => {
          const first = relative.split(/[\\/]/)[0]!;
          return (
            worldRoots.has(first) ||
            ['mods', 'plugins', 'resourcepacks', 'config'].includes(first) ||
            rootFiles.has(first)
          );
        };
        await copyDirectory(server.path, data, {
          exclude: (relative) => {
            const normalized = relative.replaceAll('\\', '/');
            if (
              !allowedRoot(relative) ||
              temporary.test(normalized) ||
              secretName.test(normalized) ||
              /\.(?:exe|dll|bat|cmd|ps1|sh)$/i.test(normalized)
            )
              return true;
            if (includeSensitive) return false;
            const first = normalized.split('/')[0];
            if (['mods', 'plugins'].includes(first!))
              return (
                normalized.split('/').length > 1 &&
                !/\.(?:jar|phar)(?:\.disabled)?$/i.test(normalized)
              );
            if (first === 'config')
              return ![
                'config',
                'config/paper-global.yml',
                'config/paper-world-defaults.yml',
              ].includes(normalized);
            return false;
          },
        });
        const props = parseProperties(
          await readFile(await containedPath(data, 'server.properties'), 'utf8'),
        );
        delete props['rcon.password'];
        if (!includeSensitive) delete props['resource-pack'];
        await atomicWrite(
          await containedPath(data, 'server.properties'),
          serializeProperties(props),
        );
        if (!includeSensitive) {
          const scrub = (value: unknown): unknown => {
            if (Array.isArray(value)) return value.map(scrub);
            if (value && typeof value === 'object')
              return Object.fromEntries(
                Object.entries(value)
                  .filter(([k]) => !/password|secret|token|credential|private.?key/i.test(k))
                  .map(([k, v]) => [k, scrub(v)]),
              );
            return value;
          };
          for (const file of [
            'bukkit.yml',
            'spigot.yml',
            'purpur.yml',
            'config/paper-global.yml',
            'config/paper-world-defaults.yml',
          ]) {
            try {
              const filename = await containedPath(data, file);
              const doc = parseDocument(await readFile(filename, 'utf8'));
              await atomicWrite(filename, stringify(scrub(doc.toJS({ maxAliasCount: 20 }))));
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
            }
          }
        }
        const profile = createServerSchema.parse({ ...server, eula: true, autoStart: false }),
          manifest: PackageManifest = {
            format: 'minedock',
            version: 1,
            createdAt: new Date().toISOString(),
            sourcePlatform: process.platform as PackageManifest['sourcePlatform'],
            includesSensitiveConfiguration: includeSensitive,
            profile,
            javaRequired: server.javaMajor,
            jvm: server.jvm,
            packs: (server.packs ?? []).map((pack) =>
              includeSensitive ? pack : { ...pack, url: undefined },
            ),
            activeResourcePack: includeSensitive ? server.activeResourcePack : undefined,
            content: this.core.repo.content(id),
            files: await this.inventory(data),
          };
        const text = JSON.stringify(packageManifestSchema.parse(manifest), null, 2);
        if (Buffer.byteLength(text) > 16 * 1024 * 1024)
          throw new DomainError('SIZE', 'Package manifest exceeds 16 MB.');
        await atomicWrite(await containedPath(stage, 'manifest.json'), text);
        await zipDirectory(stage, destination, undefined, { preserveServerProperties: true });
        this.core.repo.audit(
          'package.exported',
          includeSensitive
            ? 'Explicitly included plugin/mod configuration'
            : 'Default configuration exclusions',
          id,
        );
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  async preview(archive: string): Promise<PackagePreview> {
    if (!(await stat(archive)).isFile())
      throw new DomainError('PACKAGE', 'Choose a regular package file.');
    const metadata = (await readZipEntries(archive, ['manifest.json'], 16 * 1024 * 1024)).get(
      'manifest.json',
    );
    if (!metadata) throw new DomainError('PACKAGE', 'The MineDock manifest is missing.');
    const manifest = packageManifestSchema.parse(JSON.parse(metadata.toString('utf8'))),
      definition = engineDefinition(manifest.profile.engine);
    if (!definition.platforms.includes(process.platform))
      throw new DomainError('PLATFORM', 'This engine is unavailable on this operating system.');
    await this.expire();
    const root = this.cache();
    await mkdir(root, { recursive: true });
    const token = randomUUID(),
      stage = await containedPath(root, token);
    await mkdir(stage);
    try {
      await extractZip(archive, stage, 64 * 1024 ** 3 + 16 * 1024 * 1024);
      const names = await readdir(stage);
      if (names.some((n) => !['manifest.json', 'server'].includes(n)))
        throw new DomainError('PACKAGE', 'Unexpected package root entries.');
      await this.verify(stage, manifest);
      const reserved = await this.core.reservedPorts();
      const port = await this.available(manifest.profile.port, definition.protocol, reserved);
      reserved.add(port);
      const ipv6Port =
        definition.protocol === 'udp'
          ? await this.available(manifest.profile.ipv6Port ?? 19133, 'udp', reserved, true)
          : undefined;
      const suggestion = recommendMemory(
          'modded',
          os.totalmem() / 1024 ** 2,
          os.freemem() / 1024 ** 2,
        ),
        memoryMax = Math.min(manifest.profile.memoryMax, suggestion.memoryMax),
        memoryMin = Math.min(manifest.profile.memoryMin, memoryMax);
      const preview: PackagePreview = {
        token,
        name: manifest.profile.name,
        engine: manifest.profile.engine,
        version: manifest.profile.version,
        javaRequired: manifest.javaRequired,
        sourcePlatform: manifest.sourcePlatform,
        includesSensitiveConfiguration: manifest.includesSensitiveConfiguration,
        files: manifest.files.length,
        bytes: manifest.files.reduce((sum, f) => sum + f.bytes, 0),
        worlds: manifest.files
          .filter((f) => /(?:^|\/)level.dat$/.test(f.path))
          .map((f) => path.posix.dirname(f.path)),
        content: manifest.content.length,
        port,
        ipv6Port,
        memoryMin,
        memoryMax,
      };
      this.tickets.set(token, { stage, manifest, preview, expires: Date.now() + 30 * 60000 });
      return preview;
    } catch (e) {
      await rm(stage, { recursive: true, force: true });
      throw e;
    }
  }
  private async verify(stage: string, manifest: PackageManifest) {
    const data = await containedPath(stage, 'server'),
      actual = await this.inventory(data),
      expected = new Map<string, PackageManifest['files'][number]>();
    for (const file of manifest.files) {
      const normalized = validateRelative(file.path).replaceAll('\\', '/').toLowerCase();
      if (expected.has(normalized)) throw new DomainError('PACKAGE', 'Duplicate package paths.');
      expected.set(normalized, file);
    }
    if (actual.length !== expected.size)
      throw new DomainError('INTEGRITY', 'Package inventory differs from its manifest.');
    for (const file of actual) {
      const entry = expected.get(file.path.toLowerCase());
      if (!entry || entry.bytes !== file.bytes || entry.sha256 !== file.sha256)
        throw new DomainError('INTEGRITY', 'Package file checksum verification failed.');
    }
    // Engine launch files always come from the official installer, never from this package.
    for (const file of actual) {
      const first = file.path.split('/')[0]!;
      const known =
        rootFiles.has(first) ||
        ['mods', 'plugins', 'config', 'resourcepacks', 'worlds'].includes(first) ||
        manifest.files.some((f) => f.path === first + '/level.dat');
      if (!known || /\.(exe|dll|bat|cmd|ps1|sh)$/i.test(file.path) || temporary.test(file.path))
        throw new DomainError('PACKAGE', 'Unsupported package payload path.');
    }
    for (const item of manifest.content) {
      if (validateRelative(item.filename) !== path.basename(item.filename))
        throw new DomainError('PATH', 'Invalid content filename.');
    }
    for (const pack of manifest.packs) {
      if (validateRelative(pack.filename) !== path.basename(pack.filename))
        throw new DomainError('PATH', 'Invalid pack filename.');
      if (pack.world && !/^[A-Za-z\d_-]{1,120}$/.test(pack.world))
        throw new DomainError('PATH', 'Invalid pack world name.');
    }
    const props = parseProperties(
      await readFile(await containedPath(data, 'server.properties'), 'utf8'),
    );
    if (props['level-name'] && !/^[A-Za-z\d _-]{1,120}$/.test(props['level-name']))
      throw new DomainError('PATH', 'Invalid package world name.');
  }
  private async available(
    start: number,
    protocol: 'tcp' | 'udp',
    reserved: Set<number>,
    ipv6 = false,
  ) {
    for (let port = start; port <= Math.min(65535, start + 255); port++)
      if (!reserved.has(port) && (await checkPort(port, protocol, ipv6))) return port;
    throw new DomainError('PORT', 'No available game port.');
  }
  async import(raw: unknown) {
    const input = packageImportSchema.parse(raw),
      ticket = this.tickets.get(input.token);
    if (!ticket || ticket.expires < Date.now())
      throw new DomainError('STALE', 'Select and preview the package again.');
    if (input.confirmation !== input.name)
      throw new DomainError('CONFIRM', 'Incorrect confirmation.');
    await this.verify(ticket.stage, ticket.manifest);
    const { manifest, preview } = ticket,
      data = await containedPath(ticket.stage, 'server');
    const sourceProps = parseProperties(
      await readFile(await containedPath(data, 'server.properties'), 'utf8'),
    );
    const packs = manifest.packs.map((p) => ({ ...p, id: randomUUID() })),
      activeIndex = manifest.packs.findIndex((p) => p.id === manifest.activeResourcePack);
    const result = await this.core.create(
      {
        ...manifest.profile,
        name: input.name,
        port: preview.port,
        ipv6Port: preview.ipv6Port,
        memoryMin: preview.memoryMin,
        memoryMax: preview.memoryMax,
        eula: true,
        autoStart: false,
      },
      {
        kind: 'package.import',
        profile: {
          jvm: manifest.jvm,
          packs,
          activeResourcePack: activeIndex >= 0 ? packs[activeIndex]?.id : undefined,
        },
        prepare: async (stage, server, context) => {
          const props = parseProperties(
            await readFile(await containedPath(stage, 'server.properties'), 'utf8'),
          );
          for (const entry of await readdir(data, { withFileTypes: true })) {
            if (entry.name === 'server.properties') continue;
            const destination = await containedPath(stage, entry.name);
            await rm(destination, { recursive: true, force: true });
            const source = await containedPath(data, entry.name);
            if (entry.isDirectory())
              await copyDirectory(source, destination, { signal: context?.signal });
            else await copyRegularFile(source, destination, { signal: context?.signal });
          }
          const restored: Record<string, string> = {
            ...sourceProps,
            ...Object.fromEntries(
              Object.entries(props).filter(([key]) =>
                [
                  'online-mode',
                  'gamemode',
                  'difficulty',
                  'max-players',
                  'view-distance',
                  'simulation-distance',
                  'pvp',
                  'white-list',
                  'level-seed',
                  'motd',
                ].includes(key),
              ),
            ),
            'server-port': String(server.port),
            'rcon.port': props['rcon.port'] ?? '',
            'rcon.password': props['rcon.password'] ?? '',
            'enable-rcon': props['enable-rcon'] ?? 'false',
          };
          if (server.ipv6Port) restored['server-portv6'] = String(server.ipv6Port);
          await atomicWrite(
            await containedPath(stage, 'server.properties'),
            serializeProperties(restored),
          );
          return manifest.content.map((item) => ({
            ...item,
            id: randomUUID(),
            serverId: server.id,
          }));
        },
      },
    );
    this.tickets.delete(input.token);
    await rm(ticket.stage, { recursive: true, force: true });
    this.core.repo.audit('package.imported', result.name, result.id);
    return result;
  }
  private async expire() {
    for (const [token, ticket] of this.tickets)
      if (ticket.expires < Date.now()) {
        await rm(ticket.stage, { recursive: true, force: true });
        this.tickets.delete(token);
      }
    if (this.tickets.size >= 5) {
      const token = this.tickets.keys().next().value!,
        ticket = this.tickets.get(token)!;
      await rm(ticket.stage, { recursive: true, force: true });
      this.tickets.delete(token);
    }
  }
  async close() {
    for (const ticket of this.tickets.values())
      await rm(ticket.stage, { recursive: true, force: true });
    this.tickets.clear();
  }
  async clean() {
    const root = this.cache();
    await mkdir(root, { recursive: true });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name))
        await rm(await containedPath(root, entry.name), { recursive: true, force: true });
    }
  }
}
