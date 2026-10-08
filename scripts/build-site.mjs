import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('data/website-publish');
await mkdir(path.join(root, 'dist/assets/engines'), { recursive: true });
await mkdir(path.join(root, '.openai'), { recursive: true });
for (const file of ['index.html', 'styles.css'])
  await cp(path.join('site', file), path.join(root, 'dist', file));
for (const file of ['dashboard-light.png', 'mods-light.png', 'backups.png'])
  await cp(path.join('docs/screenshots', file), path.join(root, 'dist/assets', file));
await cp('apps/desktop/renderer/src/assets/engines', path.join(root, 'dist/assets/engines'), {
  recursive: true,
});
await writeFile(
  path.join(root, '.openai/hosting.json'),
  await readFile('site/.openai/hosting.json'),
);
console.log('Static site ready at ' + root);
