import { z } from 'zod';
import { fetchJson, fetchText, approvedUrl } from './downloads';
import { DomainError } from '../domain/errors';
import type { Engine } from '../domain/types';
import { javaForPaper, javaForVersion } from './versions';

export interface EngineSelection {
  loaderVersion?: string;
  installerVersion?: string;
}
export interface EngineArtifact {
  url: string;
  filename: string;
  hash?: { algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512'; value: string };
  java: number;
  build: string;
  kind: 'jar' | 'installer' | 'zip' | 'phar';
  loaderVersion?: string;
  installerVersion?: string;
  minecraftVersion?: string;
}
export interface EngineCatalog {
  versions(): Promise<string[]>;
  builds(version: string): Promise<string[]>;
  artifact(version: string, pinned?: string, selection?: EngineSelection): Promise<EngineArtifact>;
}
const safeVersion = (value: string): string =>
  z
    .string()
    .regex(/^[a-zA-Z0-9._+-]{1,80}$/)
    .parse(value);
const sortVersions = (values: string[]): string[] =>
  [...new Set(values)].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
export async function officialHash(
  url: string,
  algorithm: 'sha1' | 'sha256',
): Promise<NonNullable<EngineArtifact['hash']>> {
  const value = (await fetchText(url + '.' + algorithm)).trim().split(/\s+/)[0] ?? '';
  if (!new RegExp(`^[a-fA-F0-9]{${algorithm === 'sha1' ? 40 : 64}}$`).test(value))
    throw new DomainError('CHECKSUM', 'Invalid checksum returned by the download service.');
  return { algorithm, value };
}
const githubReleaseSchema = z.object({
  tag_name: z.string(),
  prerelease: z.boolean(),
  draft: z.boolean(),
  assets: z.array(
    z.object({
      name: z.string(),
      browser_download_url: z.string().url(),
      digest: z.string().nullable().optional(),
    }),
  ),
});
export type GithubRelease = z.infer<typeof githubReleaseSchema>;
function githubHeaders(): Record<string, string> {
  return process.env.MINEDOCK_GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.MINEDOCK_GITHUB_TOKEN}` }
    : {};
}
export async function githubRelease(
  repository: 'pmmp/PocketMine-MP' | 'pmmp/PHP-Binaries',
  tag?: string,
  signal?: AbortSignal,
): Promise<GithubRelease> {
  return githubReleaseSchema.parse(
    await fetchJson(
      `https://api.github.com/repos/${repository}/releases/${tag ? 'tags/' + encodeURIComponent(tag) : 'latest'}`,
      githubHeaders(),
      signal,
    ),
  );
}
export function githubAssetHash(digest?: string | null): EngineArtifact['hash'] {
  if (!digest) return undefined;
  const match = /^sha256:([a-fA-F0-9]{64})$/.exec(digest);
  if (!match) throw new DomainError('CHECKSUM', 'Invalid release checksum.');
  return { algorithm: 'sha256', value: match[1]! };
}
export class PurpurCatalog implements EngineCatalog {
  async versions(): Promise<string[]> {
    return sortVersions(
      z
        .object({ versions: z.array(z.string()) })
        .parse(await fetchJson('https://api.purpurmc.org/v2/purpur')).versions,
    );
  }
  async builds(version: string): Promise<string[]> {
    return sortVersions(
      z
        .object({ builds: z.object({ all: z.array(z.string()) }) })
        .parse(await fetchJson(`https://api.purpurmc.org/v2/purpur/${safeVersion(version)}`)).builds
        .all,
    );
  }
  async artifact(version: string, pinned?: string): Promise<EngineArtifact> {
    const build = z
      .object({
        build: z.string(),
        result: z.literal('SUCCESS'),
        md5: z.string().regex(/^[a-f0-9]{32}$/i),
      })
      .parse(
        await fetchJson(
          `https://api.purpurmc.org/v2/purpur/${safeVersion(version)}/${pinned ? safeVersion(pinned) : 'latest'}`,
        ),
      );
    if (pinned && build.build !== pinned)
      throw new DomainError('VERSION', 'The upstream returned a different Purpur build.');
    return {
      url: `https://api.purpurmc.org/v2/purpur/${version}/${build.build}/download`,
      filename: `purpur-${version}-${build.build}.jar`,
      kind: 'jar',
      hash: { algorithm: 'md5', value: build.md5 },
      java: javaForPaper(version),
      build: build.build,
    };
  }
}
export class FabricCatalog implements EngineCatalog {
  async games() {
    return z
      .array(z.object({ version: z.string(), stable: z.boolean() }))
      .parse(await fetchJson('https://meta.fabricmc.net/v2/versions/game'));
  }
  async versions(): Promise<string[]> {
    return (await this.games()).filter((v) => v.stable).map((v) => v.version);
  }
  async builds(version: string): Promise<string[]> {
    return (await this.loaders(version)).map((v) => v.version);
  }
  async loaders(version: string) {
    return z
      .array(z.object({ loader: z.object({ version: z.string(), stable: z.boolean() }) }))
      .parse(
        await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${safeVersion(version)}`),
      )
      .map((v) => v.loader);
  }
  async installers(): Promise<{ version: string; url: string; stable: boolean }[]> {
    return z
      .array(z.object({ version: z.string(), url: z.string().url(), stable: z.boolean() }))
      .parse(await fetchJson('https://meta.fabricmc.net/v2/versions/installer'));
  }
  async artifact(
    version: string,
    pinned?: string,
    selection: EngineSelection = {},
  ): Promise<EngineArtifact> {
    const entries = await this.loaders(version);
    const loaders = entries.map((v) => v.version);
    const installers = await this.installers();
    const loader =
      selection.loaderVersion ?? pinned?.split('@')[0] ?? entries.find((v) => v.stable)?.version;
    const installer =
      selection.installerVersion ??
      pinned?.split('@')[1] ??
      installers.find((v) => v.stable)?.version;
    if (!loader || !installer || !loaders.includes(loader))
      throw new DomainError('VERSION', 'No compatible Fabric loader is available.');
    const selected = installers.find((value) => value.version === installer);
    if (!selected) throw new DomainError('VERSION', 'Fabric installer is unavailable.');
    return {
      url: selected.url,
      filename: `fabric-installer-${installer}.jar`,
      kind: 'installer',
      hash: await officialHash(selected.url, 'sha256'),
      java: javaForVersion(version),
      build: `${loader}@${installer}`,
      loaderVersion: loader,
      installerVersion: installer,
    };
  }
}
export function neoforgeMinecraftVersion(value: string): string {
  const [major, minor, patch] = value.split('.').map(Number);
  if (major === undefined || minor === undefined) throw new Error('Invalid NeoForge version.');
  return major >= 26
    ? `${major}.${minor}${patch ? '.' + patch : ''}`
    : `1.${major}${minor ? '.' + minor : ''}`;
}
export class ForgeCatalog implements EngineCatalog {
  constructor(private readonly engine: 'forge' | 'neoforge') {}
  private async all(): Promise<string[]> {
    if (this.engine === 'neoforge')
      return z
        .object({ versions: z.array(z.string()) })
        .parse(
          await fetchJson(
            'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
          ),
        ).versions;
    const xml = await fetchText(
      'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
    );
    return [...xml.matchAll(/<version>([a-zA-Z0-9._+-]+)<\/version>/g)].map((m) => m[1]!);
  }
  async versions(): Promise<string[]> {
    return sortVersions(
      (await this.all()).map((v) =>
        this.engine === 'forge' ? v.split('-')[0]! : neoforgeMinecraftVersion(v),
      ),
    );
  }
  async builds(version: string): Promise<string[]> {
    return sortVersions(
      (await this.all()).filter((v) =>
        this.engine === 'forge'
          ? v.startsWith(safeVersion(version) + '-')
          : neoforgeMinecraftVersion(v) === version,
      ),
    );
  }
  async artifact(
    version: string,
    pinned?: string,
    selection: EngineSelection = {},
  ): Promise<EngineArtifact> {
    const available = await this.builds(version);
    const build =
      pinned ?? selection.loaderVersion ?? available.find((v) => !/-alpha|-beta/.test(v));
    if (!build || !available.includes(build))
      throw new DomainError('VERSION', 'No compatible loader build is available.');
    const url =
      this.engine === 'forge'
        ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${build}/forge-${build}-installer.jar`
        : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${build}/neoforge-${build}-installer.jar`;
    return {
      url,
      filename: `${this.engine}-${build}-installer.jar`,
      kind: 'installer',
      hash: await officialHash(url, this.engine === 'forge' ? 'sha1' : 'sha256'),
      java: javaForVersion(version),
      build,
      loaderVersion: build,
    };
  }
}
export class BedrockCatalog implements EngineCatalog {
  private async current(): Promise<{ version: string; url: string }> {
    if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64')
      throw new DomainError(
        'PLATFORM',
        'The official Bedrock server is available for Windows/Linux x64.',
      );
    const links = z
      .object({
        result: z.object({
          links: z.array(z.object({ downloadType: z.string(), downloadUrl: z.string().url() })),
        }),
      })
      .parse(
        await fetchJson('https://net-secondary.web.minecraft-services.net/api/v1.0/download/links'),
      ).result.links;
    const url = links.find(
      (v) =>
        v.downloadType ===
        (process.platform === 'win32' ? 'serverBedrockWindows' : 'serverBedrockLinux'),
    )?.downloadUrl;
    const version = url && /bedrock-server-([0-9.]+)\.zip$/.exec(new URL(url).pathname)?.[1];
    if (!url || !version)
      throw new DomainError('VERSION', 'The official Bedrock server package is unavailable.');
    approvedUrl(url);
    return { url, version };
  }
  async versions(): Promise<string[]> {
    return [(await this.current()).version];
  }
  async builds(version: string): Promise<string[]> {
    const value = await this.current();
    return value.version === version ? [version] : [];
  }
  async artifact(version: string): Promise<EngineArtifact> {
    const value = await this.current();
    if (value.version !== version)
      throw new DomainError(
        'VERSION',
        'Microsoft no longer lists that Bedrock release. Choose the current release.',
      );
    return {
      url: value.url,
      filename: `bedrock-server-${version}.zip`,
      java: 0,
      build: version,
      kind: 'zip',
    };
  }
}
export class PocketMineCatalog implements EngineCatalog {
  async versions(): Promise<string[]> {
    const releases: GithubRelease[] = [];
    for (let page = 1; ; page++) {
      const batch = z
        .array(githubReleaseSchema)
        .parse(
          await fetchJson(
            `https://api.github.com/repos/pmmp/PocketMine-MP/releases?per_page=100&page=${page}`,
            githubHeaders(),
          ),
        );
      releases.push(...batch);
      if (batch.length < 100) break;
      if (page >= 100)
        throw new DomainError(
          'CATALOG',
          'The upstream release catalog exceeded its supported size.',
        );
    }
    return releases
      .filter(
        (v) => !v.prerelease && !v.draft && v.assets.some((a) => a.name === 'PocketMine-MP.phar'),
      )
      .map((v) => v.tag_name);
  }
  async builds(version: string): Promise<string[]> {
    const release = await githubRelease('pmmp/PocketMine-MP', safeVersion(version));
    return release.prerelease ? [] : [release.tag_name];
  }
  async artifact(version: string): Promise<EngineArtifact> {
    const release = await githubRelease('pmmp/PocketMine-MP', safeVersion(version));
    const asset = release.assets.find((a) => a.name === 'PocketMine-MP.phar');
    if (!asset || release.prerelease)
      throw new DomainError('VERSION', 'PocketMine release is unavailable.');
    const info = z
      .object({ mcpe_version: z.string().regex(/^[0-9.]{1,40}$/) })
      .parse(
        await fetchJson(
          `https://github.com/pmmp/PocketMine-MP/releases/download/${encodeURIComponent(release.tag_name)}/build_info.json`,
        ),
      );
    return {
      url: asset.browser_download_url,
      filename: 'PocketMine-MP.phar',
      kind: 'phar',
      hash: githubAssetHash(asset.digest),
      java: 0,
      build: release.tag_name,
      minecraftVersion: info.mcpe_version,
    };
  }
}
export const additionalCatalogs: Partial<Record<Engine, EngineCatalog>> = {
  purpur: new PurpurCatalog(),
  fabric: new FabricCatalog(),
  forge: new ForgeCatalog('forge'),
  neoforge: new ForgeCatalog('neoforge'),
  bedrock: new BedrockCatalog(),
  pocketmine: new PocketMineCatalog(),
};
