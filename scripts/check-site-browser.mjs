import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve('dist/site');
const capture = process.argv.includes('--capture');
const verifyDownloads = process.argv.includes('--downloads');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/MineDock/')) {
      res.writeHead(404);
      res.end('Outside project');
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice('/MineDock/'.length));
    let target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(400);
      res.end();
      return;
    }
    const stat = await fs.stat(target).catch(() => null);
    if (stat?.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: url.pathname + '/' });
        res.end();
        return;
      }
      target = path.join(target, 'index.html');
    }
    const content = await fs.readFile(target).catch(() => null);
    if (content) {
      res.writeHead(200, {
        'Content-Type': types[path.extname(target)] ?? 'application/octet-stream',
      });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await fs.readFile(path.join(root, '404.html')));
    }
  } catch (e) {
    res.writeHead(500);
    res.end(e.message);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/MineDock/`;
const browser = await chromium.launch({
  ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  headless: true,
});
const results = [],
  requests = new Set(),
  downloadChecks = [];
const luminance = (color) => {
  const c = color.replace('#', '');
  const parts = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
};
const contrast = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const contrastChecks = ['#edf4f3', '#bccbce', '#43d2cb', '#efae75'].flatMap((text) =>
  ['#111719', '#29231d'].map((background) => ({
    text,
    background,
    ratio: contrast(text, background),
  })),
);
if (contrastChecks.some((c) => c.ratio < 4.5))
  throw Error('Fixed page palette fails normal-text contrast');
if (capture) await fs.mkdir('test-results/website-review', { recursive: true });
try {
  for (const width of [390, 768, 1280, 1440, 1920]) {
    for (const route of ['', 'legal/', 'terms/', 'privacy/', 'licenses/', '404.html']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      const errors = [],
        failed = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        requests.add(r.url());
        if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
      });
      await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
      await page.keyboard.press('Tab');
      const focus = await page.locator(':focus').evaluate((el) => ({
        text: el.textContent.trim(),
        outline: getComputedStyle(el).outlineStyle,
        rect: el.getBoundingClientRect().toJSON(),
      }));
      if (focus.text !== 'Skip to content' || focus.outline === 'none' || focus.rect.bottom <= 0)
        throw Error('Keyboard skip/focus failed');
      await page.evaluate(async () =>
        Promise.all(
          [...document.images].map((i) => {
            i.loading = 'eager';
            return i.decode().catch(() => {});
          }),
        ),
      );
      const check = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        broken: [...document.images]
          .filter((i) => !i.complete || !i.naturalWidth)
          .map((i) => i.src),
        h1: document.querySelectorAll('h1').length,
        lang: document.documentElement.lang,
        scripts: document.querySelectorAll('script').length,
        storage: localStorage.length + sessionStorage.length,
        cookies: document.cookie,
        footer: [...document.querySelectorAll('footer nav a')].map((a) => a.href),
        colors: ['--bg', '--text', '--muted', '--teal', '--copper'].map((k) => [
          k,
          getComputedStyle(document.documentElement).getPropertyValue(k).trim(),
        ]),
      }));
      if (
        check.overflow ||
        check.broken.length ||
        check.h1 !== 1 ||
        check.lang !== 'en' ||
        check.scripts ||
        check.storage ||
        check.cookies ||
        errors.length ||
        failed.length
      )
        throw Error(JSON.stringify({ width, route, ...check, errors, failed }));
      if (route === '') {
        const hashes = [];
        for (const img of await page
          .locator('#administration-preview img')
          .evaluateAll((images) => images.map((i) => i.src))) {
          const name = new URL(img).pathname.split('/').at(-1);
          const actual = await (await page.request.get(img)).body(),
            expected = await fs.readFile('docs/screenshots/player-world-050/' + name);
          const hash = (b) => createHash('sha256').update(b).digest('hex');
          if (hash(actual) !== hash(expected)) throw Error('Screenshot bytes changed');
          hashes.push({ name, sha256: hash(actual) });
        }
        if (hashes.length !== 7) throw Error('Preview count');
        check.previewHashes = hashes;
        await page.getByText('Does MineDock host my server?', { exact: true }).click();
        if (!(await page.locator('details[open]').count()))
          throw Error('FAQ keyboard native disclosure');
        await page.locator('footer a[href="/MineDock/privacy/"]').click();
        await page.waitForURL('**/MineDock/privacy/');
        await page.getByRole('link', { name: 'Download', exact: true }).click();
        await page.waitForURL('**/MineDock/#download');
      }
      if (route === 'privacy/') {
        const table = page.getByRole('region', {
          name: 'Application network requests and controls',
        });
        await table.focus();
        const scroll = await table.evaluate((el) => ({
          focus: el === document.activeElement,
          outline: getComputedStyle(el).outlineStyle,
          width: el.clientWidth,
          scrollWidth: el.scrollWidth,
        }));
        if (
          !scroll.focus ||
          scroll.outline === 'none' ||
          (width === 390 && scroll.scrollWidth <= scroll.width)
        )
          throw Error('Privacy table must scroll within its keyboard-focusable region on mobile');
        if (width === 390) {
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(
            () => document.querySelector('.policy-table-wrap').scrollLeft > 0,
          );
        }
      }
      if (
        capture &&
        ((width === 1440 && route === '') ||
          (width === 390 && route === 'legal/') ||
          ([390, 1440].includes(width) && route === 'privacy/'))
      ) {
        await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
        await page.evaluate(async () =>
          Promise.all(
            [...document.images].map((i) => {
              i.loading = 'eager';
              return i.decode().catch(() => {});
            }),
          ),
        );
        await page.screenshot({
          path: `test-results/website-review/${route ? route.replace('/', '') : 'home'}-${width}.png`,
          fullPage: true,
        });
        if (route === 'privacy/')
          await page.screenshot({
            path: `test-results/website-review/privacy-top-${width}.png`,
          });
        if (route === 'privacy/' && width === 1440)
          await page
            .locator('.policy-table-wrap')
            .screenshot({ path: 'test-results/website-review/privacy-network-1440.png' });
      }
      results.push({
        width,
        route,
        ...check,
        keyboardSkip: true,
        errors,
        failed,
        cookiesInContext: (await context.cookies()).length,
      });
      await context.close();
    }
  }
  const missing = await fetch(new URL('missing/deep/path', base));
  if (missing.status !== 404 || !(await missing.text()).includes('href="/MineDock/"'))
    throw Error('Custom nested 404');
  const noSlash = await fetch(new URL('privacy', base), { redirect: 'manual' });
  if (noSlash.status !== 301 || noSlash.headers.get('location') !== '/MineDock/privacy/')
    throw Error('Nested trailing slash');
  const outer = await fetch(new URL('/', base));
  if (outer.status !== 404) throw Error('Test must run only at project subpath');
  const home = await fs.readFile('dist/site/index.html', 'utf8');
  for (const url of verifyDownloads
    ? [
        ...new Set(
          [
            ...home.matchAll(
              /href="(https:\/\/github\.com\/Bobydeluxe\/MineDock\/releases\/download\/[^"]+)"/g,
            ),
          ].map((m) => m[1]),
        ),
      ]
    : []) {
    const r = await fetch(url, { method: 'HEAD' });
    const size = Number(r.headers.get('content-length'));
    if (r.status !== 200 || size <= 0) throw Error('Public download unavailable');
    downloadChecks.push({ url, status: r.status, size });
  }
  const remoteRequests = [...requests].filter((url) => !url.startsWith(base));
  if (remoteRequests.length)
    throw Error('Unexpected third-party resource request: ' + remoteRequests.join(','));
  const evidence = {
    checkedAt: new Date().toISOString(),
    state: 'PREPARED ONLY',
    basePath: '/MineDock/',
    contrastChecks,
    viewports: results,
    downloadChecks,
    remoteResourceRequests: remoteRequests,
    trailingSlash: 301,
    nestedMissing: 404,
    outsideProject: 404,
  };
  await fs.mkdir('test-results', { recursive: true });
  await fs.writeFile('test-results/website-browser.json', JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      pagesAtWidths: results.length,
      screenshotHashesPerWidth: 7,
      downloadChecks: downloadChecks.length,
      remoteResources: remoteRequests.length,
      cookies: results.reduce((s, r) => s + r.cookiesInContext, 0),
      overflow: results.filter((r) => r.overflow).length,
      brokenImages: results.reduce((s, r) => s + r.broken.length, 0),
      trailingSlash: 301,
      nested404: 404,
    }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
