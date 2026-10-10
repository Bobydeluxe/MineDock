import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { metadata, routes, siteUrl } from './build-site.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(repository, 'dist/site');
const production = process.argv.includes('--production');
const packageConfig = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}
check(
  packageConfig.build.files.includes('!dist/site/**'),
  'Desktop packages exclude the website export',
);
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    check(!(await lstat(file)).isSymbolicLink(), 'No symlinks in the public artifact');
    if (entry.isDirectory()) files.push(...(await walk(file)));
    else files.push(file);
  }
  return files;
}
const files = await walk(root);
for (const file of files) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  check(
    /^(?:assets\/[\w/.-]+\.(?:png|webp|ico|svg)|(?:legal|terms|privacy|licenses)\/index\.html|index\.html|404\.html|styles\.css|robots\.txt|sitemap\.xml|\.nojekyll)$/.test(
      relative,
    ),
    'Only allowlisted static files: ' + relative,
  );
}
const documents = new Map();
for (const file of files.filter((file) => file.endsWith('.html')))
  documents.set(file, await readFile(file, 'utf8'));
check(documents.size === 6, 'Home, four legal pages, custom 404');
const titles = new Set(),
  descriptions = new Set();
let localLinks = 0;
for (const [file, html] of documents) {
  const route = path
    .relative(root, file)
    .replaceAll('\\', '/')
    .replace(/index\.html$/, '');
  check(/<html lang="en">/.test(html), 'English language: ' + route);
  check((html.match(/<h1\b/g) ?? []).length === 1, 'Exactly one H1: ' + route);
  check((html.match(/<main\b/g) ?? []).length === 1, 'One main landmark');
  check(!/<!-- (?:SITE_|PUBLICATION_)/.test(html), 'All template markers resolved');
  check(
    !/<(?:iframe|form)\b|<script(?![^>]*application\/ld\+json)/i.test(html),
    'No active script, embed or form',
  );
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  const description = html.match(/name="description"\s+content="([^"]+)"/)?.[1];
  check(!!title && !titles.has(title), 'Unique title');
  titles.add(title);
  check(!!description && !descriptions.has(description), 'Unique description');
  descriptions.add(description);
  for (const legal of ['legal', 'terms', 'privacy', 'licenses'])
    check(html.includes(`href="/MineDock/${legal}/"`), 'Shared legal footer');
  for (const image of html.matchAll(/<img\b[^>]*>/g))
    check(/\balt="[^"]*"/.test(image[0]), 'Every image has an alt attribute');
  if (production && route !== '404.html') {
    check(
      html.includes(`rel="canonical" href="${new URL(route, siteUrl).href}"`),
      'Exact project canonical',
    );
    check(!/noindex|TODO|DRAFT/i.test(html), 'Production pages are approved and indexable');
  } else check(html.includes('content="noindex,follow"'), 'Review and 404 are not indexable');
  const prepared = metadata(html, route, true);
  check(
    route === '404.html'
      ? prepared.includes('noindex')
      : prepared.includes(`property="og:url" content="${new URL(route, siteUrl).href}"`) &&
          prepared.includes('content="index,follow"'),
    'Prepared production metadata has correct project path',
  );
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), new URL(route, siteUrl));
    if (url.origin !== new URL(siteUrl).origin) continue;
    check(url.pathname.startsWith('/MineDock/'), 'Internal link stays in project: ' + url.pathname);
    let relative = decodeURIComponent(url.pathname.slice('/MineDock/'.length));
    if (relative.endsWith('/') || !relative) relative += 'index.html';
    const target = path.resolve(root, relative);
    check(target.startsWith(root + path.sep), 'Safe internal target');
    check(files.includes(target), 'Internal target exists: ' + relative);
    localLinks++;
    if (url.hash)
      check(
        new RegExp(`\\bid="${url.hash.slice(1)}"`).test(documents.get(target) ?? ''),
        'Anchor exists: ' + url.href,
      );
  }
}
const css = await readFile(path.join(root, 'styles.css'), 'utf8');
for (const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))
  check(files.includes(path.resolve(root, match[1])), 'CSS asset exists');
const home = documents.get(path.join(root, 'index.html'));
const downloads = [
  ...new Set(
    [
      ...home.matchAll(
        /href="(https:\/\/github\.com\/Bobydeluxe\/MineDock\/releases\/download\/[^"]+)"/g,
      ),
    ].map((match) => match[1]),
  ),
];
check(
  downloads.length === 13 && downloads.every((url) => url.includes('/v0.4.1/')),
  'Only actual public 0.4.1 downloads',
);
check(home.includes('unreleased') && home.includes('0.5.0'), 'Honest candidate version label');
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
check(
  JSON.stringify(locations) ===
    JSON.stringify(production ? routes.map((route) => new URL(route, siteUrl).href) : []),
  'Only production public pages in sitemap',
);
if (!production) {
  const result = spawnSync(process.execPath, ['scripts/build-site.mjs', '--production'], {
    cwd: repository,
    env: { ...process.env, SITE_URL: siteUrl },
    encoding: 'utf8',
    windowsHide: true,
  });
  check(
    result.status !== 0 && result.stderr.includes('PUBLICATION BLOCKED'),
    'Unapproved legal drafts cannot reach production build',
  );
}
console.log(
  JSON.stringify({
    mode: production ? 'production' : 'review only',
    checks,
    documents: documents.size,
    files: files.length,
    localLinks,
    downloads: downloads.length,
  }),
);
