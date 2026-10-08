import yazl from 'yazl';
import { createHash } from 'node:crypto';
export async function modJar(id: string, version = '1.0', loader = 'fabric'): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  if (loader === 'fabric')
    zip.addBuffer(
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          id,
          name: 'Test ' + id,
          version,
          environment: '*',
          depends: { minecraft: '>=1.20' },
        }),
      ),
      'fabric.mod.json',
    );
  else
    zip.addBuffer(
      Buffer.from(
        `modLoader="javafml"\nloaderVersion="[1,)"\n[[mods]]\nmodId="${id}"\nversion="${version}"\ndisplayName="Test ${id}"\n`,
      ),
      loader === 'neoforge' ? 'META-INF/neoforge.mods.toml' : 'META-INF/mods.toml',
    );
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  zip.end();
  return result;
}
export async function modFixtures() {
  const files: Record<string, string> = {},
    versions: Record<string, Record<string, unknown>> = {},
    projects: Record<string, Record<string, unknown>> = {};
  for (const id of ['main', 'dependency', 'other', 'optional', 'conflict']) {
    projects[id] = {
      id,
      title: 'Test ' + id,
      description: 'Server mod ' + id,
      body: 'A real metadata fixture.',
      server_side: 'required',
      client_side: 'optional',
      project_type: 'mod',
      categories: ['optimization'],
      downloads: 12000,
      icon_url: null,
      game_versions: ['1.21.11'],
      loaders: ['fabric'],
      updated: '2026-10-01',
      slug: id,
    };
    for (const number of [1, 2]) {
      const bytes = await modJar(id, String(number)),
        hash = createHash('sha512').update(bytes).digest('hex'),
        versionId = id + 'V' + number;
      files['/' + versionId + '.jar'] = bytes.toString('base64');
      versions[versionId] = {
        id: versionId,
        project_id: id,
        version_type: 'release',
        version_number: String(number),
        date_published: `2026-0${number}-01`,
        changelog: 'Changes ' + number,
        game_versions: ['1.21.11'],
        loaders: ['fabric'],
        files: [
          {
            filename: id + '.jar',
            url: 'https://cdn.modrinth.com/' + versionId + '.jar',
            primary: true,
            hashes: { sha512: hash },
          },
        ],
        dependencies: [],
      };
    }
  }
  versions.mainV1!.dependencies = [
    { project_id: 'dependency', version_id: 'dependencyV1', dependency_type: 'required' },
    { project_id: 'optional', version_id: null, dependency_type: 'optional' },
  ];
  versions.mainV2!.dependencies = [
    { project_id: 'dependency', version_id: 'dependencyV1', dependency_type: 'required' },
  ];
  versions.otherV1!.dependencies = [
    { project_id: 'dependency', version_id: 'dependencyV1', dependency_type: 'required' },
  ];
  versions.otherV2!.dependencies = versions.otherV1!.dependencies;
  return { files, versions, projects };
}
export function fixtureFetch(data: Awaited<ReturnType<typeof modFixtures>>, latest = 2) {
  return async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    const value = new URL(String(url)),
      parts = value.pathname.split('/').filter(Boolean);
    if (value.hostname === 'cdn.modrinth.com')
      return new Response(Buffer.from(data.files[value.pathname] ?? '', 'base64'));
    if (value.hostname !== 'api.modrinth.com')
      return new Response('Unknown fixture host', { status: 404 });
    let result: unknown;
    if (parts[1] === 'search') {
      const query = value.searchParams.get('query') ?? '';
      const hits = Object.values(data.projects)
        .filter((p) => String(p.title).includes(query))
        .map((p) => ({ ...p, project_id: p.id, author: 'Fixture author', versions: ['1.21.11'] }));
      result = { hits, total_hits: hits.length };
    } else if (parts[1] === 'project') {
      result =
        parts[3] === 'version'
          ? Object.values(data.versions)
              .filter((v) => v.project_id === parts[2])
              .sort((a, b) => String(b.date_published).localeCompare(String(a.date_published)))
          : data.projects[parts[2]!];
    } else if (parts[1] === 'version') result = data.versions[parts[2]!];
    else if (parts[1] === 'versions') {
      const ids = JSON.parse(value.searchParams.get('ids') ?? '[]') as string[];
      result = ids.map((id) => data.versions[id]);
    } else if (parts[1] === 'version_file') {
      result = Object.values(data.versions).find((v) =>
        JSON.stringify(v.files).includes(parts[2]!),
      );
    } else if (parts[1] === 'version_files') {
      const request = JSON.parse(String(options?.body)) as { hashes: string[] };
      result = Object.fromEntries(
        request.hashes.flatMap((hash) => {
          const old = Object.values(data.versions).find((v) =>
            JSON.stringify(v.files).includes(hash),
          );
          return old
            ? [
                [
                  hash,
                  data.versions[
                    String(old.project_id) + 'V' + (old.project_id === 'dependency' ? 1 : latest)
                  ],
                ],
              ]
            : [];
        }),
      );
    }
    return result ? new Response(JSON.stringify(result)) : new Response('Missing', { status: 404 });
  };
}
