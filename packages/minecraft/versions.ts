import { z } from 'zod';
import { fetchJson } from './downloads';
import type { Engine } from '../domain/types';
import { DomainError } from '../domain/errors';
import {
  additionalCatalogs,
  FabricCatalog,
  type EngineArtifact,
  type EngineSelection,
} from './catalogs';
const manifestSchema = z.object({
  versions: z.array(z.object({ id: z.string(), type: z.string(), url: z.string().url() })),
});
const metadataSchema = z.object({
  downloads: z.object({ server: z.object({ url: z.string().url(), sha1: z.string() }).optional() }),
  javaVersion: z.object({ majorVersion: z.number() }).optional(),
});
const paperSchema = z.array(
  z.object({
    id: z.number(),
    channel: z.string(),
    downloads: z.record(
      z.string(),
      z.object({
        name: z.string(),
        url: z.string().url(),
        checksums: z.object({ sha256: z.string() }),
      }),
    ),
  }),
);
export function javaForVersion(version: string): number {
  const [major = 1, minor = 0, patch = 0] = version.split('.').map(Number);
  if (major >= 26) return 25;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}
/** Paper recommendations, separate from Mojang's minimum for the same game version. */
export function javaForPaper(version: string): number {
  const [major = 1, minor = 0, patch = 0] = version.split('.').map(Number);
  if (major >= 26) return 25;
  if (minor >= 20) return 21;
  if (minor >= 17) return 17;
  if (minor === 16 && patch >= 5) return 16;
  if (minor >= 12) return 11;
  return 8;
}
export class MinecraftVersionService {
  private cache = new Map<Engine, { at: number; values: string[] }>();
  async versions(engine: Engine): Promise<string[]> {
    const cached = this.cache.get(engine);
    if (cached && Date.now() - cached.at < 3600000) return cached.values;
    const catalog = additionalCatalogs[engine];
    if (catalog) {
      const values = await catalog.versions();
      this.cache.set(engine, { at: Date.now(), values });
      return values;
    }
    const manifest = manifestSchema.parse(
      await fetchJson<unknown>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'),
    );
    let values = manifest.versions.filter((v) => v.type === 'release').map((v) => v.id);
    if (engine === 'paper') {
      const paper = z
        .object({ versions: z.record(z.string(), z.array(z.string())) })
        .parse(await fetchJson<unknown>('https://fill.papermc.io/v3/projects/paper'));
      const available = new Set(Object.values(paper.versions).flat());
      values = values.filter((v) => available.has(v));
    }
    this.cache.set(engine, { at: Date.now(), values });
    return values;
  }
  async artifact(
    engine: Engine,
    version: string,
    pinnedBuild?: string,
    selection?: EngineSelection,
  ): Promise<EngineArtifact> {
    const catalog = additionalCatalogs[engine];
    if (catalog) return catalog.artifact(version, pinnedBuild, selection);
    const manifest = manifestSchema.parse(
      await fetchJson<unknown>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'),
    );
    const entry = manifest.versions.find((v) => v.id === version && v.type === 'release');
    if (!entry) throw new DomainError('VERSION', 'Minecraft version is unavailable.');
    const meta = metadataSchema.parse(await fetchJson<unknown>(entry.url));
    const java = meta.javaVersion?.majorVersion ?? javaForVersion(version);
    if (engine === 'vanilla') {
      if (!meta.downloads.server)
        throw new DomainError('VERSION', 'This version does not provide an official server.');
      return {
        filename: 'server.jar',
        kind: 'jar',
        url: meta.downloads.server.url,
        hash: { algorithm: 'sha1', value: meta.downloads.server.sha1 },
        java,
        build: version,
      };
    }
    const builds = paperSchema.parse(
      await fetchJson<unknown>(
        `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds`,
      ),
    );
    const build = builds
      .filter((b) => b.channel === 'STABLE' && (!pinnedBuild || String(b.id) === pinnedBuild))
      .sort((a, b) => b.id - a.id)[0];
    const file = build?.downloads['server:default'];
    if (!file || !build)
      throw new DomainError(
        'VERSION',
        'No stable Paper build for this version. Choose another version.',
      );
    return {
      filename: file.name,
      kind: 'jar',
      url: file.url,
      hash: { algorithm: 'sha256', value: file.checksums.sha256 },
      java: Math.max(java, javaForPaper(version)),
      build: String(build.id),
    };
  }
  async builds(engine: Engine, version: string): Promise<string[]> {
    const catalog = additionalCatalogs[engine];
    if (catalog) return catalog.builds(version);
    if (engine === 'vanilla') return [version];
    return paperSchema
      .parse(
        await fetchJson(
          `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds`,
        ),
      )
      .filter((build) => build.channel === 'STABLE')
      .sort((a, b) => b.id - a.id)
      .map((build) => String(build.id));
  }
  async installers(engine: Engine): Promise<string[]> {
    const catalog = additionalCatalogs[engine];
    return catalog instanceof FabricCatalog
      ? (await catalog.installers()).map((item) => item.version)
      : [];
  }
}
