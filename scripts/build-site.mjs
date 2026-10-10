import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(repository, 'dist/site');
export const siteUrl = 'https://bobydeluxe.github.io/MineDock/';
export const routes = ['', 'legal/', 'terms/', 'privacy/', 'licenses/'];

export function validatePublication(publication, documents) {
  const date = publication.reviewedOn;
  const validDate =
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const anonymousIndividual =
    publication.publisherType === 'private-nonprofessional' &&
    publication.identityPreference === 'anonymity';
  if (
    publication.approved !== true ||
    !validDate ||
    !['private-nonprofessional', 'professional-individual', 'company'].includes(
      publication.publisherType,
    ) ||
    !['anonymity', 'public'].includes(publication.identityPreference) ||
    (publication.identityPreference === 'anonymity' && !anonymousIndividual) ||
    typeof publication.publicEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publication.publicEmail) ||
    ['publisherStatus', 'privacyStatus', 'hostContactStatus'].some(
      (key) => publication[key] !== 'approved',
    ) ||
    (anonymousIndividual && publication.hostIdentityDisclosureConfirmed !== true) ||
    documents.some(({ html }) => /TODO|DRAFT|awaiting owner/i.test(html))
  ) {
    throw Error(
      'PUBLICATION BLOCKED: publisher identity, privacy terms and host contacts need owner review. See docs/website-legal-checklist.md.',
    );
  }
}

export function metadata(html, route, production) {
  if (!production || route === '404.html') return '<meta name="robots" content="noindex,follow" />';
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  const description = html.match(/name="description"\s+content="([^"]+)"/)?.[1];
  if (!title || !description) throw Error('Every page needs a title and description');
  const canonical = new URL(route, siteUrl).href;
  const image = new URL('assets/brand/icon-256.png', siteUrl).href;
  return `<link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index,follow" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="MineDock" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="MineDock cube app icon" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />`;
}

export async function buildSite(production = false) {
  const publication = JSON.parse(
    await readFile(path.join(repository, 'site/publication.json'), 'utf8'),
  );
  const documents = await Promise.all(
    [...routes, '404.html'].map(async (route) => ({
      route,
      html: await readFile(
        path.join(repository, 'site', route.endsWith('.html') ? route : route + 'index.html'),
        'utf8',
      ),
    })),
  );
  if (production) {
    if (process.env.SITE_URL !== siteUrl)
      throw Error(
        'Production requires the exact GitHub configure-pages base_url + trailing slash; no custom domain is allowed.',
      );
    validatePublication(publication, documents);
  }
  // Fixed disposable output, verified inside the workspace before recursive cleanup.
  if (root !== path.join(repository, 'dist', 'site')) throw Error('Unsafe site output');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const footer = await readFile(path.join(repository, 'site/partials/footer.html'), 'utf8');
  for (const { route, html } of documents) {
    const output = path.join(root, route.endsWith('.html') ? route : route + 'index.html');
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      html
        .replace('<!-- SITE_METADATA -->', metadata(html, route, production))
        .replace('<!-- SITE_FOOTER -->', footer)
        .replace(
          '<!-- PUBLICATION_NOTICE -->',
          production
            ? ''
            : '<aside class="review-notice" aria-label="Review status">Local review build · GitHub Pages migration pending · Legal text is a draft awaiting owner information. Not a public launch.</aside>',
        ),
    );
  }
  await cp(path.join(repository, 'site/styles.css'), path.join(root, 'styles.css'));
  await mkdir(path.join(root, 'assets'), { recursive: true });
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
  ]) {
    await cp(path.join(repository, 'docs/screenshots', file), path.join(root, 'assets', file));
  }
  await mkdir(path.join(root, 'assets/player-world-050'), { recursive: true });
  for (const file of [
    'player-profile.png',
    'group-actions.png',
    'world-controls.png',
    'head.png',
    'banner.png',
    'shield.png',
    'mod-item.png',
  ]) {
    await cp(
      path.join(repository, 'docs/screenshots/player-world-050', file),
      path.join(root, 'assets/player-world-050', file),
    );
  }
  await mkdir(path.join(root, 'assets/engines'), { recursive: true });
  for (const engine of [
    'vanilla',
    'paper',
    'purpur',
    'fabric',
    'forge',
    'neoforge',
    'bedrock',
    'pocketmine',
  ]) {
    await cp(
      path.join(repository, 'apps/desktop/renderer/src/assets/engines', engine + '.svg'),
      path.join(root, 'assets/engines', engine + '.svg'),
    );
  }
  await mkdir(path.join(root, 'assets/brand'), { recursive: true });
  for (const file of [
    'icon-128.png',
    'icon-256.png',
    'favicon.svg',
    'apple-touch-icon.png',
    'survival-dusk.webp',
  ]) {
    await cp(path.join(repository, 'assets/brand', file), path.join(root, 'assets/brand', file));
  }
  await cp(
    path.join(repository, 'apps/desktop/assets/icon.ico'),
    path.join(root, 'assets/brand/icon.ico'),
  );
  await writeFile(path.join(root, '.nojekyll'), '');
  const urls = production
    ? routes.map((route) => `  <url><loc>${new URL(route, siteUrl).href}</loc></url>`).join('\n')
    : '';
  await writeFile(
    path.join(root, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  // Standard crawlers use origin /robots.txt. This project file cannot control the host.
  await writeFile(
    path.join(root, 'robots.txt'),
    `# Project-scoped informational file; not the origin robots.txt.\n# ${production ? 'Submit ' + siteUrl + 'sitemap.xml through Search Console.' : 'Review build: pages use meta noindex; no public sitemap URLs.'}\n`,
  );
  console.log(`Static site: ${root} (${production ? 'production' : 'review only; noindex'})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite(process.argv.includes('--production'));
}
