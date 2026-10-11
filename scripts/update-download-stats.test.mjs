import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  collectDownloads,
  countDownloads,
  packagePlatform,
  replaceStatistics,
  updateReadme,
  START,
  END,
} from './update-download-stats.mjs';

const API = 'https://api.github.com/repos/Bobydeluxe/MineDock';
const asset = (id, name, download_count, state = 'uploaded') => ({
  id,
  name,
  download_count,
  state,
});
const release = (id, assets, extra = {}) => ({
  id,
  tag_name: `v0.${id}.0`,
  draft: false,
  published_at: '2026-10-01T00:00:00Z',
  assets,
  ...extra,
});
const response = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });
const readme = `# MineDock\n\nIntroduction stays here.\n${START}\nprevious valid table\n${END}\n\nOther documentation stays here.\n`;
const noWait = async () => {};

test('combines multiple releases, including prereleases, with exact platform totals', () => {
  const result = countDownloads([
    release(1, [
      asset(1, 'MineDock-0.1.0-Setup-x64.exe', 10),
      asset(2, 'MineDock-0.1.0-amd64.deb', 2),
      asset(3, 'MineDock-0.1.0-x64.dmg', 3),
      asset(4, 'MineDock-0.1.0-x64.zip', 4),
    ]),
    release(
      2,
      [
        asset(5, 'MineDock-0.2.0-Portable-arm64.exe', 5),
        asset(6, 'MineDock-0.2.0-arm64.AppImage', 6),
        asset(7, 'MineDock-0.2.0-macos-arm64.zip', 7),
      ],
      { prerelease: true },
    ),
  ]);
  assert.deepEqual(result.totals, { windows: 15, linux: 8, macos: 14, total: 37 });
  assert.equal(result.releaseCount, 2);
  assert.equal(result.packageCount, 7);
});

test('excludes checksums, update manifests, signatures, documentation and unrelated assets', () => {
  const names = [
    'SHA256SUMS.txt',
    'update-win32-x64.json',
    'MineDock-Features.txt',
    'MineDock-0.5.0-x64.exe.sig',
    'MineDock-0.5.0-x64.dmg.sha256',
    'release-notes.md',
    'MineDock-source.zip',
    'MineDock-Windows-x64.zip',
    'MineDock-debug-symbols.zip',
    'MineDock-0.5.0-macos-source.zip',
    'MineDock-0.5.0-macos-x64-symbols.zip',
    'third-party.exe',
  ];
  assert.deepEqual(
    countDownloads([
      release(
        1,
        names.map((name, index) => asset(index + 1, name, 100)),
      ),
    ]).totals,
    { windows: 0, linux: 0, macos: 0, total: 0 },
  );
});

test('recognizes only identified macOS ZIPs, including the historical paired-DMG convention', () => {
  const assets = [asset(1, 'MineDock-0.5.0-arm64.dmg', 1)];
  assert.equal(packagePlatform(asset(2, 'MineDock-0.5.0-arm64.zip', 2), assets), 'macos');
  assert.equal(packagePlatform(asset(3, 'MineDock-0.5.0-x64.zip', 3), assets), null);
  assert.equal(packagePlatform(asset(4, 'MineDock-0.5.0-darwin-x64.zip', 4), []), 'macos');
  assert.equal(packagePlatform(asset(5, 'MineDock-0.5.0-mac-arm64.zip', 5), []), 'macos');
  assert.equal(packagePlatform(asset(6, 'MineDock-0.5.0-ARM64.ZIP', 6), assets), 'macos');
});

test('ignores drafts, unpublished releases and unfinished uploads', () => {
  const result = countDownloads([
    release(1, [asset(1, 'MineDock-Setup.exe', 100)], { draft: true }),
    release(2, [asset(2, 'MineDock-Setup.exe', 100)], { published_at: null }),
    release(3, [
      asset(3, 'MineDock-Setup.exe', 100, 'new'),
      asset(4, 'MineDock-x64.zip', 100),
      asset(5, 'MineDock-x64.dmg', 100, 'new'),
    ]),
  ]);
  assert.equal(result.totals.total, 0);
  assert.equal(result.releaseCount, 1);
});

test('deduplicates both release IDs and asset IDs', () => {
  const executable = asset(1, 'MineDock-Setup.exe', 5);
  const first = release(1, [executable, executable]);
  const result = countDownloads([first, first, release(2, [executable])]);
  assert.equal(result.totals.total, 5);
  assert.equal(result.releaseCount, 2);
  assert.equal(result.packageCount, 1);
});

test('empty release lists have a valid zero total', async () => {
  const result = await collectDownloads({ fetchImpl: async () => response([]), token: '' });
  assert.deepEqual(result, {
    totals: { windows: 0, linux: 0, macos: 0, total: 0 },
    releaseCount: 0,
    packageCount: 0,
    tags: [],
  });
});

test('paginates releases and assets independently and reads complete asset lists', async () => {
  const calls = [];
  const pages = new Map([
    [
      `${API}/releases?per_page=100`,
      response([release(1, [asset(999, 'MineDock-embedded.exe', 999)])], 200, {
        link: `<${API}/releases?per_page=100&page=2>; rel="next", <${API}/releases?per_page=100&page=2>; rel="last"`,
      }),
    ],
    [
      `${API}/releases?per_page=100&page=2`,
      response([
        release(1, []),
        release(2, [], { prerelease: true }),
        release(3, [], { draft: true }),
      ]),
    ],
    [
      `${API}/releases/1/assets?per_page=100`,
      response([asset(1, 'MineDock-Setup.exe', 8)], 200, {
        link: `<${API}/releases/1/assets?per_page=100&page=2>; rel="next"`,
      }),
    ],
    [
      `${API}/releases/1/assets?per_page=100&page=2`,
      response([asset(1, 'MineDock-Setup.exe', 8), asset(2, 'MineDock-amd64.deb', 3)]),
    ],
    [
      `${API}/releases/2/assets?per_page=100`,
      response([asset(3, 'MineDock-0.2.0-x64.dmg', 2), asset(4, 'MineDock-0.2.0-x64.zip', 1)]),
    ],
  ]);
  const result = await collectDownloads({
    token: 'sample-token',
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.headers.Authorization, 'Bearer sample-token');
      assert.equal(options.redirect, 'error');
      assert.ok(pages.has(url), `Unexpected page: ${url}`);
      return pages.get(url);
    },
  });
  assert.equal(calls.length, 5);
  assert.equal(new Set(calls).size, 5);
  assert.deepEqual(result.totals, { windows: 8, linux: 3, macos: 3, total: 14 });
  assert.equal(result.packageCount, 4);
  assert.equal(result.releaseCount, 2);
});

test('retries temporary network and server failures', async () => {
  let attempts = 0;
  const delays = [];
  const result = await collectDownloads({
    sleep: async (ms) => delays.push(ms),
    fetchImpl: async () => {
      attempts++;
      if (attempts === 1) throw Error('Temporary connection failure');
      if (attempts === 2) return response({ message: 'Temporary server failure' }, 503);
      return response([]);
    },
  });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(result.totals.total, 0);
});

test('respects Retry-After for secondary rate limits', async () => {
  let attempts = 0;
  const delays = [];
  await collectDownloads({
    sleep: async (ms) => delays.push(ms),
    fetchImpl: async () =>
      ++attempts === 1
        ? response({ message: 'secondary rate limit' }, 403, { 'retry-after': '2' })
        : response([]),
  });
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [2000]);
});

test('respects primary rate-limit reset and does not retry an over-budget limit early', async () => {
  const delays = [];
  let attempts = 0;
  await collectDownloads({
    sleep: async (ms) => delays.push(ms),
    fetchImpl: async () =>
      ++attempts === 1
        ? response({}, 403, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 2),
          })
        : response([]),
  });
  assert.equal(attempts, 2);
  assert.ok(delays[0] >= 1000 && delays[0] <= 3000);
  attempts = 0;
  await assert.rejects(
    collectDownloads({
      sleep: noWait,
      fetchImpl: async () => {
        attempts++;
        return response({}, 429, { 'retry-after': '3600' });
      },
    }),
    /rate limit exceeds retry budget/,
  );
  assert.equal(attempts, 1);
});

test('stops after bounded retries and does not retry ordinary authorization errors', async () => {
  for (const [status, expectedAttempts] of [
    [503, 3],
    [401, 1],
    [404, 1],
  ]) {
    let attempts = 0;
    await assert.rejects(
      collectDownloads({
        sleep: noWait,
        fetchImpl: async () => {
          attempts++;
          return response({}, status);
        },
      }),
      new RegExp(`GitHub HTTP ${status}`),
    );
    assert.equal(attempts, expectedAttempts);
  }
});

test('rejects repeated pagination URLs and never forwards authentication outside GitHub', async () => {
  for (const next of [
    `${API}/releases?per_page=100`,
    'https://example.com/releases?page=2',
    `${API}/issues?page=2`,
  ]) {
    let requests = 0;
    await assert.rejects(
      collectDownloads({
        token: 'private-test-token',
        fetchImpl: async () => {
          requests++;
          return response([], 200, { link: `<${next}>; rel="next"` });
        },
      }),
      /pagination link/,
    );
    assert.equal(requests, 1);
  }
});

test('rejects invalid API data and negative, missing or unsafe package counters', async () => {
  await assert.rejects(
    collectDownloads({ fetchImpl: async () => response({ message: 'not a list' }) }),
    /Invalid GitHub list/,
  );
  for (const invalid of [-1, undefined, '12', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => countDownloads([release(1, [asset(1, 'MineDock-Setup.exe', invalid)])]),
      /Invalid package/,
    );
  }
  assert.throws(
    () =>
      countDownloads([
        release(1, [
          asset(1, 'MineDock-Setup.exe', Number.MAX_SAFE_INTEGER),
          asset(2, 'MineDock-Portable.exe', 1),
        ]),
      ]),
    /safe integer/,
  );
});

test('rejects malformed next links instead of publishing a partial total', async () => {
  await assert.rejects(
    collectDownloads({
      fetchImpl: async () => response([], 200, { link: 'invalid-url; rel="next"' }),
    }),
    /pagination link/,
  );
});

test('does not mistake incomplete release metadata for an empty published list', async () => {
  for (const invalid of [{ id: 1 }, { ...release(1, []), published_at: undefined }, null]) {
    await assert.rejects(
      collectDownloads({ fetchImpl: async () => response([invalid]) }),
      /Invalid GitHub release data/,
    );
  }
});

test('replaces only the marked section, with English number formatting and original line endings', () => {
  const totals = { windows: 1234, linux: 6, macos: 7, total: 1247 };
  for (const original of [readme, readme.replaceAll('\n', '\r\n')]) {
    const updated = replaceStatistics(original, totals);
    assert.equal(
      updated.slice(0, updated.indexOf(START)),
      original.slice(0, original.indexOf(START)),
    );
    assert.equal(updated.slice(updated.indexOf(END)), original.slice(original.indexOf(END)));
    assert.ok(updated.includes('| Windows | 1,234 |'));
    assert.ok(updated.includes('| **Total** | **1,247** |'));
    assert.equal(/(?<!\r)\n/.test(updated), !original.includes('\r\n'));
    assert.equal(replaceStatistics(updated, totals), updated);
  }
});

test('rejects missing, duplicated and reversed README markers', () => {
  const totals = { windows: 0, linux: 0, macos: 0, total: 0 };
  for (const invalid of ['no markers', readme + START, readme + END, `${END}\n${START}`]) {
    assert.throws(() => replaceStatistics(invalid, totals), /marker pair/);
  }
});

test('preserves the last valid README if a later API page fails', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'minedock-stats-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const readmePath = path.join(directory, 'README.md');
  await writeFile(readmePath, readme);
  let requests = 0;
  await assert.rejects(
    updateReadme({
      readmePath,
      sleep: noWait,
      fetchImpl: async () => (++requests === 1 ? response([release(1, [])]) : response({}, 503)),
    }),
    /previous statistics retained/,
  );
  assert.equal(await readFile(readmePath, 'utf8'), readme);
  assert.equal(requests, 4);
});

test('writes a complete snapshot once and leaves an unchanged README untouched', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'minedock-stats-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const readmePath = path.join(directory, 'README.md');
  await writeFile(readmePath, readme);
  const fetchImpl = async (url) =>
    response(url.includes('/assets?') ? [asset(1, 'MineDock-Setup.exe', 5)] : [release(1, [])]);
  const first = await updateReadme({ readmePath, fetchImpl });
  assert.equal(first.changed, true);
  const contents = await readFile(readmePath, 'utf8');
  assert.ok(contents.includes('| Windows | 5 |'));
  await utimes(readmePath, new Date(0), new Date(0));
  const before = await stat(readmePath);
  const second = await updateReadme({ readmePath, fetchImpl });
  assert.equal(second.changed, false);
  assert.equal((await stat(readmePath)).mtimeMs, before.mtimeMs);
  assert.equal(await readFile(readmePath, 'utf8'), contents);
});
