import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('data/website-publish');
await mkdir(path.join(root, 'dist/assets/engines'), { recursive: true });
await mkdir(path.join(root, '.openai'), { recursive: true });
for (const file of ['index.html', 'styles.css'])
  await cp(path.join('site', file), path.join(root, 'dist', file));
for (const file of [
  'dashboard.png',
  'dashboard-light.png',
  'create-server.png',
  'fabric-versions.png',
  'server-settings.png',
  'console.png',
  'backups.png',
  'mods.png',
  'mods-light.png',
])
  await cp(path.join('docs/screenshots', file), path.join(root, 'dist/assets', file));
await mkdir(path.join(root, 'dist/assets/player-world-050'), { recursive: true });
for (const file of ['player-profile.png', 'group-actions.png', 'world-controls.png'])
  await cp(
    path.join('docs/screenshots/player-world-050', file),
    path.join(root, 'dist/assets/player-world-050', file),
  );
await cp('apps/desktop/renderer/src/assets/engines', path.join(root, 'dist/assets/engines'), {
  recursive: true,
});
await mkdir(path.join(root, 'dist/assets/brand'), { recursive: true });
for (const file of [
  'icon-128.png',
  'icon-256.png',
  'favicon.svg',
  'apple-touch-icon.png',
  'survival-dusk.webp',
])
  await cp(path.join('assets/brand', file), path.join(root, 'dist/assets/brand', file));
await cp('apps/desktop/assets/icon.ico', path.join(root, 'dist/assets/brand/icon.ico'));
await writeFile(
  path.join(root, '.openai/hosting.json'),
  await readFile('site/.openai/hosting.json'),
);
console.log('Static site ready at ' + root);
