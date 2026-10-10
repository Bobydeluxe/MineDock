import { fetchApproved } from '../minecraft/downloads';
import { assetBytes, verified } from './remote';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
export const permittedModLicense = (value: unknown) =>
  typeof value === 'string' &&
  /^(?:MIT|Apache-2\.0|BSD-[23]-Clause|ISC|CC0-1\.0|CC-BY(?:-SA)?-4\.0|MPL-2\.0|[AL]?GPL-[23]\.[01]-(?:only|or-later))$/.test(
    value,
  );
export interface ModResourceChoice {
  id: string;
  project: string;
  title: string;
  version: string;
  license: string;
  size: number;
}
async function metadata(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetchApproved(
    url,
    AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    { 'User-Agent': 'Bobydeluxe/MineDock/0.5.0 (https://github.com/Bobydeluxe/MineDock)' },
    [],
    (u) =>
      u.hostname === 'api.modrinth.com' &&
      /^\/v2\/project\/[a-zA-Z0-9_-]{1,80}(?:\/version)?$/.test(u.pathname),
  );
  const r = response.body!.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const p = await r.read();
      if (p.done) break;
      size += p.value.length;
      if (size > 2 * 1024 ** 2) throw new Error('Mod metadata exceeds limits');
      chunks.push(p.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } finally {
    await r.cancel();
  }
}
export class ModResourceDownloads {
  constructor(
    private fetchJson = metadata,
    private fetchBytes = assetBytes,
  ) {}
  private async versions(project: string, minecraft: string, loader: string, signal: AbortSignal) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(project) || !['fabric', 'forge', 'neoforge'].includes(loader))
      throw new Error('Select an exact mod project and supported loader');
    const base = 'https://api.modrinth.com/v2/project/' + project;
    const info = obj(await this.fetchJson(base, signal));
    if (
      info.project_type !== 'mod' ||
      !permittedModLicense(obj(info.license).id) ||
      typeof info.id !== 'string'
    )
      throw new Error('Mod resource license is unknown or not supported');
    const response = await this.fetchJson(
      base +
        '/version?game_versions=' +
        encodeURIComponent(JSON.stringify([minecraft])) +
        '&loaders=' +
        encodeURIComponent(JSON.stringify([loader])),
      signal,
    );
    if (!Array.isArray(response) || response.length > 1000) throw new Error('Invalid mod versions');
    return {
      info,
      versions: response
        .map(obj)
        .filter(
          (v) =>
            v.project_id === info.id &&
            Array.isArray(v.game_versions) &&
            v.game_versions.includes(minecraft) &&
            Array.isArray(v.loaders) &&
            v.loaders.includes(loader),
        ),
    };
  }
  async choices(
    project: string,
    minecraft: string,
    loader: string,
    signal: AbortSignal,
  ): Promise<ModResourceChoice[]> {
    const { info, versions } = await this.versions(project, minecraft, loader, signal);
    return versions.slice(0, 20).flatMap((v) => {
      const files = Array.isArray(v.files) ? v.files.map(obj) : [];
      const file =
        files.find((f) => f.primary === true) ?? (files.length === 1 ? files[0] : undefined);
      return file &&
        typeof file.size === 'number' &&
        file.size > 0 &&
        file.size <= 150 * 1024 ** 2 &&
        typeof v.id === 'string'
        ? [
            {
              id: v.id,
              project: String(info.id),
              title: String(info.title).slice(0, 160),
              version: String(v.version_number).slice(0, 100),
              license: String(obj(info.license).id),
              size: file.size,
            },
          ]
        : [];
    });
  }
  async download(
    project: string,
    versionId: string,
    minecraft: string,
    loader: string,
    signal: AbortSignal,
  ): Promise<{ bytes: Buffer; sha512: string; choice: ModResourceChoice }> {
    const { info, versions } = await this.versions(project, minecraft, loader, signal);
    const v = versions.find((v) => v.id === versionId);
    if (!v) throw new Error('Exact mod version unavailable');
    const files = Array.isArray(v.files) ? v.files.map(obj) : [],
      f = files.find((f) => f.primary === true) ?? (files.length === 1 ? files[0] : undefined);
    if (
      !f ||
      typeof f.url !== 'string' ||
      typeof f.size !== 'number' ||
      f.size < 1 ||
      f.size > 150 * 1024 ** 2
    )
      throw new Error('Mod archive exceeds limits');
    const sha512 = obj(f.hashes).sha512;
    if (typeof sha512 !== 'string' || !/^[a-f0-9]{128}$/.test(sha512))
      throw new Error('Mod integrity metadata missing');
    const url = new URL(f.url);
    if (!url.pathname.startsWith('/data/' + info.id + '/versions/' + versionId + '/'))
      throw new Error('Mod provenance mismatch');
    const bytes = verified(await this.fetchBytes(f.url, 'mod', f.size, signal), sha512, 'sha512');
    if (bytes.length !== f.size) throw new Error('Mod size mismatch');
    return {
      bytes,
      sha512,
      choice: {
        id: versionId,
        project: String(info.id),
        title: String(info.title).slice(0, 160),
        version: String(v.version_number).slice(0, 100),
        license: String(obj(info.license).id),
        size: f.size,
      },
    };
  }
}
