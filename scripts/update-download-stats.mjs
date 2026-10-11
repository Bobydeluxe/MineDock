import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPOSITORY = 'Bobydeluxe/MineDock';
export const START = '<!-- download-statistics:start -->';
export const END = '<!-- download-statistics:end -->';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPage(url, { fetchImpl, token, sleep }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'MineDock-download-statistics',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      });
    } catch {
      if (attempt === 2) throw Error('GitHub request failed; previous statistics retained.');
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      const items = await response.json();
      if (!Array.isArray(items))
        throw Error('Invalid GitHub list response; previous statistics retained.');
      return { items, link: response.headers.get('link') };
    }
    const message = await response.text();
    const limited =
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' ||
          response.headers.has('retry-after') ||
          /rate limit|abuse/i.test(message)));
    const transient = response.status >= 500 && response.status <= 599;
    if ((!limited && !transient) || attempt === 2) {
      throw Error(`GitHub HTTP ${response.status}; previous statistics retained.`);
    }
    let delay = 1000 * 2 ** attempt;
    if (limited) {
      const retryAfter = response.headers.get('retry-after');
      const reset = response.headers.get('x-ratelimit-reset');
      delay =
        retryAfter !== null
          ? /^\d+(\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Date.parse(retryAfter) - Date.now()
          : response.headers.get('x-ratelimit-remaining') === '0' && reset !== null
            ? Number(reset) * 1000 - Date.now() + 1000
            : 60_000 * 2 ** attempt;
      // Do not retry before GitHub permits it or keep a daily job waiting for hours.
      if (!Number.isFinite(delay) || delay > 60_000) {
        throw Error('GitHub rate limit exceeds retry budget; previous statistics retained.');
      }
      delay = Math.max(1000, delay);
    }
    await sleep(delay);
  }
  throw Error('GitHub retry budget exhausted.');
}

async function listAll(route, options) {
  const endpoint = `${API}${route}`;
  let next = `${endpoint}?per_page=100`;
  const seenPages = new Set();
  const items = [];
  while (next) {
    const url = new URL(next);
    // Never send a token to a different origin or follow an unrelated pagination URL.
    if (
      url.origin !== 'https://api.github.com' ||
      url.pathname !== new URL(endpoint).pathname ||
      seenPages.has(url.href)
    )
      throw Error('Invalid or repeated GitHub pagination link.');
    seenPages.add(url.href);
    const result = await getPage(url.href, options);
    items.push(...result.items);
    const nextLink = result.link
      ?.split(',')
      .map((part) => part.trim())
      .find((part) => /;\s*rel="next"/.test(part));
    next = nextLink?.match(/^<([^>]+)>/)?.[1];
    if (nextLink && !next) throw Error('Invalid GitHub pagination link.');
  }
  return items;
}

export function packagePlatform(asset, assets) {
  const name = asset.name;
  if (asset.state !== 'uploaded' || typeof name !== 'string' || !/^MineDock-/i.test(name))
    return null;
  if (/\.exe$/i.test(name)) return 'windows';
  if (/\.(AppImage|deb)$/i.test(name)) return 'linux';
  if (/\.dmg$/i.test(name)) return 'macos';
  const explicitMacZip =
    /^MineDock-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-(?:macos|darwin|mac)-(?:x64|arm64|x86_64|universal)\.zip$/i;
  const pairedMacZip =
    /^MineDock-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-(?:x64|arm64|x86_64|universal)\.zip$/i;
  if (
    explicitMacZip.test(name) ||
    (pairedMacZip.test(name) &&
      assets.some(
        (other) =>
          other.state === 'uploaded' &&
          other.name?.toLowerCase() === name.replace(/\.zip$/i, '.dmg').toLowerCase(),
      ))
  )
    return 'macos';
  return null;
}

export function countDownloads(releases) {
  const totals = { windows: 0, linux: 0, macos: 0, total: 0 };
  const seenReleases = new Set();
  const seenAssets = new Set();
  const tags = [];
  for (const release of releases) {
    if (!isPublished(release)) continue;
    if (!Array.isArray(release.assets)) throw Error('Invalid release assets.');
    if (seenReleases.has(release.id)) continue;
    seenReleases.add(release.id);
    tags.push(release.tag_name);
    for (const asset of release.assets) {
      if (
        !asset ||
        !Number.isSafeInteger(asset.id) ||
        typeof asset.name !== 'string' ||
        typeof asset.state !== 'string'
      )
        throw Error('Invalid GitHub asset data.');
      const platform = packagePlatform(asset, release.assets);
      if (!platform) continue;
      if (
        !Number.isSafeInteger(asset.id) ||
        !Number.isSafeInteger(asset.download_count) ||
        asset.download_count < 0
      ) {
        throw Error('Invalid package download count; previous statistics retained.');
      }
      if (seenAssets.has(asset.id)) continue;
      seenAssets.add(asset.id);
      totals[platform] += asset.download_count;
      totals.total += asset.download_count;
      if (!Number.isSafeInteger(totals.total))
        throw Error('Download total exceeds safe integer range.');
    }
  }
  return { totals, releaseCount: seenReleases.size, packageCount: seenAssets.size, tags };
}

function isPublished(release) {
  if (
    !release ||
    !Number.isSafeInteger(release.id) ||
    typeof release.draft !== 'boolean' ||
    typeof release.tag_name !== 'string' ||
    (release.published_at !== null &&
      (typeof release.published_at !== 'string' ||
        !Number.isFinite(Date.parse(release.published_at))))
  ) {
    throw Error('Invalid GitHub release data; previous statistics retained.');
  }
  return !release.draft && release.published_at !== null;
}

export async function collectDownloads({
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  sleep = pause,
} = {}) {
  const options = { fetchImpl, token, sleep };
  const releases = await listAll('/releases', options);
  const published = [];
  const seen = new Set();
  for (const release of releases) {
    if (!isPublished(release) || seen.has(release.id)) continue;
    seen.add(release.id);
    // Fetch the paginated assets endpoint; embedded release assets may be incomplete.
    published.push({
      ...release,
      assets: await listAll(`/releases/${release.id}/assets`, options),
    });
  }
  return countDownloads(published);
}

export function replaceStatistics(readme, totals) {
  if (
    readme.split(START).length !== 2 ||
    readme.split(END).length !== 2 ||
    readme.indexOf(START) > readme.indexOf(END)
  ) {
    throw Error('README must contain exactly one ordered download statistics marker pair.');
  }
  const newline = readme.includes('\r\n') ? '\r\n' : '\n';
  const format = (value) => value.toLocaleString('en-US');
  const table = [
    '| Platform | Downloads |',
    '| -------- | --------: |',
    `| Windows | ${format(totals.windows)} |`,
    `| Linux | ${format(totals.linux)} |`,
    `| macOS | ${format(totals.macos)} |`,
    `| **Total** | **${format(totals.total)}** |`,
  ].join(newline);
  return (
    readme.slice(0, readme.indexOf(START) + START.length) +
    newline +
    table +
    newline +
    readme.slice(readme.indexOf(END))
  );
}

export async function updateReadme({
  readmePath = fileURLToPath(new URL('../README.md', import.meta.url)),
  ...options
} = {}) {
  const original = await readFile(readmePath, 'utf8');
  const statistics = await collectDownloads(options);
  const updated = replaceStatistics(original, statistics.totals);
  if (updated === original) return { ...statistics, changed: false };
  const temporary = `${readmePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, updated, 'utf8');
    await rename(temporary, readmePath);
  } finally {
    await rm(temporary, { force: true });
  }
  return { ...statistics, changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await updateReadme()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
