import { readFile, readdir, writeFile, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
export async function writeNotices(inputs) {
  const packages = new Map();
  const rootManifest = JSON.parse(await readFile('package.json', 'utf8'));
  for (const name of Object.keys(rootManifest.dependencies)) {
    const folder = await realpath(path.resolve('node_modules', name));
    const metadata = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
    packages.set(name, { folder, ...metadata });
  }
  for (const input of Object.keys(inputs).filter((name) => name.includes('node_modules'))) {
    let folder = path.dirname(path.resolve(input));
    while (folder !== path.dirname(folder)) {
      try {
        const metadata = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
        if (metadata.name) {
          packages.set(metadata.name, { folder, ...metadata });
          break;
        }
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      }
      folder = path.dirname(folder);
    }
  }
  for (const item of packages.values()) {
    const require = createRequire(path.join(item.folder, 'package.json'));
    for (const dependency of Object.keys(item.dependencies ?? {})) {
      if (packages.has(dependency)) continue;
      let folder = path.dirname(require.resolve(dependency));
      while (folder !== path.dirname(folder)) {
        try {
          const metadata = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
          if (metadata.name) {
            packages.set(metadata.name, { folder, ...metadata });
            break;
          }
        } catch (error) {
          if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
        }
        folder = path.dirname(folder);
      }
    }
  }
  const output = [
    '# Third-party notices',
    '',
    'Dependencies bundled into MineDock. Electron and Chromium license files are also included by the Electron distribution.',
    '',
  ];
  for (const item of [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    output.push(
      `## ${item.name} ${item.version}`,
      '',
      `License: ${typeof item.license === 'string' ? item.license : JSON.stringify(item.license)}`,
      '',
    );
    for (const entry of (await readdir(item.folder, { withFileTypes: true })).filter(
      (entry) => entry.isFile() && /^(license|copying|notice)(\.|$)/i.test(entry.name),
    )) {
      const content = await readFile(path.join(item.folder, entry.name), 'utf8');
      output.push(content, '');
    }
  }
  await mkdir('dist', { recursive: true });
  const noticeText = `${output.join('\n').trimEnd()}\n`;
  await writeFile('dist/THIRD_PARTY_NOTICES.txt', noticeText);
  await writeFile('docs/THIRD_PARTY_NOTICES.md', noticeText);
}
