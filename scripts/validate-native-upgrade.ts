import { chromium } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../tests/helpers';
import { AppCore } from '../packages/core/app';
import { migrations } from '../packages/database/migrations';
import { sha256 } from '../packages/backups/archive';
import type { Api } from '../packages/domain/types';
import { playerData } from '../tests/fixtures/player-data';
function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1]!;
}
const baselineVersion = option('--baseline-version', '0.3.0'),
  candidateVersion = option('--candidate-version', '0.4.0');
const legacyManual = process.argv.includes('--manual-legacy');
const publicRelease = process.argv.includes('--public-release');
const baselineBinary = path.resolve(
  option('--baseline-binary', 'data/upgrade-validation/public-0.3.0/MineDock.exe'),
);
const baselinePortable = path.resolve(
  option(
    '--baseline-portable',
    'data/public-update-validation/updates/0.3.0-MineDock-0.3.0-Portable-x64.exe',
  ),
);
const candidate = path.resolve(
  option('--candidate', `release/MineDock-${candidateVersion}-Portable-x64.exe`),
);
const metadataPath = path.resolve(option('--metadata', 'release/update-win32-x64.json'));
if (!/^\d+\.\d+\.\d+$/.test(baselineVersion) || !/^\d+\.\d+\.\d+$/.test(candidateVersion))
  throw Error('Invalid QA version');
if (process.platform !== 'win32') throw Error('Run this native upgrade validation on Windows.');
if (legacyManual && baselineVersion !== '0.3.0')
  throw Error('Legacy manual recovery only applies to public 0.3.0.');
const output = path.resolve(
  'data/upgrade-validation',
  baselineVersion + '-to-' + candidateVersion + (legacyManual ? '-manual' : ''),
);
await mkdir(output, { recursive: true });
const f = await fixture();
f.repo.saveSettings({ ...f.repo.settings(), onboarded: true, language: 'fr', theme: 'light' });
const playerName = 'UpgradeFriend';
f.repo.seenPlayer(f.server.id, playerName);
const playerObservation = JSON.stringify({
  name: playerName,
  uuid: '12345678-1234-4234-8234-123456789abc',
  firstSeen: '2026-01-01T12:00:00.000Z',
  lastSeen: '2026-10-01T12:00:00.000Z',
  joins: 12,
  observedMs: 7200000,
});
f.repo.db
  .prepare('INSERT INTO player_observations VALUES(?,?,?)')
  .run(f.server.id, playerName.toLowerCase(), playerObservation);
const playerHistory = f.repo.db
  .prepare('SELECT * FROM player_history WHERE server_id=? AND name=?')
  .get(f.server.id, playerName);
const nextRun = new Date(Date.now() + 48 * 3600000).toISOString();
for (const [id, enabled, mode] of [
  ['d8f3d0a0-64c1-48de-96a0-397bb4c9318e', true, 'interval'],
  ['d8f3d0a0-64c1-48de-96a0-397bb4c9318f', false, 'daily'],
] as const)
  f.repo.saveSchedule({
    id,
    serverId: f.server.id,
    action: 'backup',
    intervalMinutes: 1440,
    command: '',
    enabled,
    mode,
    time: '04:00',
    timezone: 'Europe/Paris',
    nextRun,
  });
const schedulesBefore = f.repo.schedules();
const encryptedSecretBefore = f.repo.db
  .prepare('SELECT secret FROM servers WHERE id=?')
  .get(f.server.id)?.secret;
const playerFiles = [
  'usercache.json',
  'whitelist.json',
  'ops.json',
  'world/stats/12345678-1234-4234-8234-123456789abc.json',
  'world/playerdata/12345678-1234-4234-8234-123456789abc.dat',
];
await mkdir(path.join(f.server.path, 'world/stats'), { recursive: true });
await mkdir(path.join(f.server.path, 'world/playerdata'), { recursive: true });
await writeFile(path.join(f.server.path, playerFiles[4]!), playerData());
const playerNote = 'Private isolated migration QA note';
if (baselineVersion !== '0.3.0')
  f.repo.db
    .prepare('INSERT INTO player_notes VALUES(?,?,?)')
    .run(f.server.id, playerName.toLowerCase(), playerNote);
await writeFile(
  path.join(f.server.path, playerFiles[0]!),
  JSON.stringify([{ name: playerName, uuid: '12345678-1234-4234-8234-123456789abc' }]),
);
await writeFile(
  path.join(f.server.path, playerFiles[1]!),
  JSON.stringify([{ name: playerName, uuid: '12345678-1234-4234-8234-123456789abc' }]),
);
await writeFile(path.join(f.server.path, playerFiles[2]!), '[]');
await writeFile(
  path.join(f.server.path, playerFiles[3]!),
  '{"stats":{"minecraft:custom":{"minecraft:play_time":3600}},"DataVersion":4325}',
);
const runtimeSource = option('--runtime-dir', '');
let runtimePath = process.execPath,
  runtimeVersion = 'QA runtime reference, never launched';
if (runtimeSource) {
  const runtimeTarget = path.join(f.root, 'runtimes', 'upgrade-java');
  await cp(path.resolve(runtimeSource), runtimeTarget, { recursive: true });
  runtimePath = path.join(runtimeTarget, 'bin', 'java.exe');
  const probe = await promisify(execFile)(runtimePath, ['-version'], { windowsHide: true });
  runtimeVersion = (probe.stderr || probe.stdout).split(/\r?\n/)[0]!;
  if (!/version "21[.]/.test(runtimeVersion))
    throw Error('The native upgrade fixture requires verified Java 21.');
  f.server.javaPath = runtimePath;
  f.repo.saveServer(f.server);
}
f.repo.saveRuntime({ major: 21, path: runtimePath, source: 'system', version: runtimeVersion });
f.repo.close();
const core = await AppCore.open(f.root, f.secrets);
await core.backups.create(f.server.id, 'manual');
const backup = core.repo.backup(core.repo.backups()[0]!.id);
const preserved = [
  path.join(f.server.path, 'world/level.dat'),
  path.join(f.server.path, 'server.properties'),
  backup.path,
  ...playerFiles.map((file) => path.join(f.server.path, file)),
];
if (runtimeSource) preserved.push(runtimePath);
const before = await Promise.all(preserved.map((file) => sha256(file)));
await core.close();
await writeFile(
  path.join(output, 'baseline.json'),
  JSON.stringify({
    root: f.root,
    serverId: f.server.id,
    backupId: backup.metadata.id,
    preserved,
    before,
  }),
);
const db = new DatabaseSync(path.join(f.root, 'app.db'));
db.exec('PRAGMA foreign_keys=OFF');
const initialSchema = baselineVersion === '0.3.0' ? 5 : 11;
for (const migration of migrations.slice(initialSchema).reverse())
  for (const match of migration.sql.matchAll(/CREATE TABLE ([a-z_]+)/g))
    db.exec('DROP TABLE IF EXISTS ' + match[1]);
db.exec('PRAGMA user_version=' + initialSchema + '; PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
const destination = path.join(output, 'MineDock-' + Date.now() + '.exe');
await cp(baselinePortable, destination, { errorOnExist: true, force: false });
await writeFile(path.join(f.root, 'logs/application.log'), '');
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (p): p is [string, string] => typeof p[1] === 'string' && p[0] !== 'ELECTRON_RUN_AS_NODE',
  ),
);
console.log(
  'Opening actual packaged ' +
    baselineVersion +
    ' with isolated schema ' +
    initialSchema +
    ' data.',
);
const oldProcess = spawn(baselineBinary, ['--inspect=9367', '--remote-debugging-port=9368'], {
  env: {
    ...env,
    MINEDOCK_DATA_DIR: f.root,
    MINEDOCK_TEST: '1',
    PORTABLE_EXECUTABLE_FILE: destination,
  },
  stdio: 'ignore',
  windowsHide: true,
});
async function ready(url: string) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw Error('Debug endpoint unavailable');
}
const inspector = (await ready('http://127.0.0.1:9367/json/list')) as {
  webSocketDebuggerUrl: string;
}[];
const main = new WebSocket(inspector[0]!.webSocketDebuggerUrl);
await new Promise<void>((resolve, reject) => {
  main.addEventListener('open', () => resolve(), { once: true });
  main.addEventListener('error', reject, { once: true });
});
await ready('http://127.0.0.1:9368/json/version');
const desktop = await chromium.connectOverCDP('http://127.0.0.1:9368');
let installationRequested = false;
const evidence: Record<string, unknown> = {
  baseline: baselineVersion,
  candidate: candidateVersion,
  baselinePortableSha256: await sha256(baselinePortable),
  initialSchema,
  legacyManual,
  feed: publicRelease
    ? 'actual public GitHub feed, signed metadata and public installer download'
    : 'controlled transport only; production metadata signature and actual installer bytes',
  at: new Date().toISOString(),
};
try {
  const page = desktop.contexts()[0]!.pages()[0]!;
  await page.waitForFunction(() => !!(window as unknown as { minedock: Api }).minedock);
  const old = await page.evaluate(() =>
    (window as unknown as { minedock: Api }).minedock.snapshot(),
  );
  if (old.settings.language !== 'fr' || old.servers[0]?.id !== f.server.id)
    throw Error('Old data did not load');
  const oldStatus = await page.evaluate(() =>
    (window as unknown as { minedock: Api }).minedock.updateStatus(),
  );
  if (oldStatus.currentVersion !== baselineVersion || !oldStatus.packaged)
    throw Error('Not the genuine packaged old application');
  evidence.oldVersion = oldStatus.currentVersion;
  const expression = `(() => {const fs=process.getBuiltinModule('fs'); const original=globalThis.fetch; globalThis.fetch=async(url,options)=>{const address=String(url); if(address==='https://api.github.com/repos/Bobydeluxe/MineDock/releases/latest')return new Response(JSON.stringify({tag_name:'v${candidateVersion}',draft:false,prerelease:false,assets:[{name:'update-win32-x64.json',browser_download_url:'https://github.com/Bobydeluxe/MineDock/releases/download/v${candidateVersion}/update-win32-x64.json'}]}));if(address.endsWith('/v${candidateVersion}/update-win32-x64.json'))return new Response(${JSON.stringify(JSON.stringify(metadata))});if(address.endsWith('/v${candidateVersion}/MineDock-${candidateVersion}-Portable-x64.exe'))return new Response(fs.readFileSync(${JSON.stringify(candidate)}),{headers:{'Content-Length':String(fs.statSync(${JSON.stringify(candidate)}).size)}});return original(url,options)};return true})()`;
  if (!publicRelease)
    await new Promise<void>((resolve, reject) => {
      main.addEventListener('message', (event) => {
        const response = JSON.parse(String(event.data));
        if (response.id === 1) {
          if (response.result?.exceptionDetails)
            reject(Error(JSON.stringify(response.result.exceptionDetails)));
          else resolve();
        }
      });
      main.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      );
    });
  const checked = await page.evaluate(() =>
    (window as unknown as { minedock: Api }).minedock.checkUpdates(),
  );
  if (checked.available?.version !== candidateVersion)
    throw Error('Signed update was not accepted');
  await page.evaluate(() => (window as unknown as { minedock: Api }).minedock.downloadUpdate());
  const status = await page.evaluate(() =>
    (window as unknown as { minedock: Api }).minedock.updateStatus(),
  );
  if (!status.downloaded) throw Error('Update download not verified');
  evidence.signatureAndDownload = 'verified by old production application';
  console.log(
    'Production application verified metadata signature and downloaded the actual ' +
      candidateVersion +
      ' binary.',
  );
  installationRequested = true;
  const closed = new Promise<void>((resolve) => oldProcess.once('exit', () => resolve()));
  await page.evaluate(
    (version) =>
      (window as unknown as { minedock: Api }).minedock.installUpdate('MineDock ' + version),
    candidateVersion,
  );
  main.close();
  await closed;
  if (legacyManual) {
    await new Promise((r) => setTimeout(r, 5000));
    const updateRoot = path.join(f.root, 'updates'),
      files = await readdir(updateRoot);
    if (files.some((n) => n.startsWith('result-')))
      throw Error('Expected legacy detached launch failure was not reproduced');
    const helper = files.find((n) => n.startsWith('helper-'))!,
      request = files.find((n) => n.startsWith('request-'))!;
    await promisify(execFile)(
      path.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(updateRoot, helper),
        '-RequestPath',
        path.join(updateRoot, request),
      ],
      {
        env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
        windowsHide: true,
        timeout: 30000,
      },
    );
    evidence.manualIntervention =
      'Explicit native helper execution after legacy launcher failed; not an automatic 0.3.0 upgrade';
  }

  const until = Date.now() + 120000;
  let restarted = false;
  while (Date.now() < until) {
    const log = await readFile(path.join(f.root, 'logs/application.log'), 'utf8').catch(() => '');
    if (log.includes('MineDock ' + candidateVersion + ' started.')) {
      restarted = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!restarted)
    throw Error('New packaged application was not relaunched by the production updater');
  if ((await sha256(destination)) !== (await sha256(candidate)))
    throw Error('Replacement executable checksum differs');
  const results = await readdir(path.join(f.root, 'updates'));
  const resultFile = results.find((name) => name.startsWith('result-') && name.endsWith('.json'))!;
  const helper = JSON.parse(
    (await readFile(path.join(f.root, 'updates', resultFile), 'utf8')).replace(/^\uFEFF/, ''),
  );
  if (helper.status !== 'completed') throw Error('Native updater did not complete');
  evidence.helperRelaunch = 'completed; actual ' + candidateVersion + ' startup log observed';
  evidence.replacedBinarySha256 = await sha256(destination);
  const verify = new DatabaseSync(path.join(f.root, 'app.db'));
  evidence.finalSchema = Number(verify.prepare('PRAGMA user_version').get()?.user_version);
  evidence.quickCheck = verify.prepare('PRAGMA quick_check').get()?.quick_check;
  const saved = JSON.parse(
    String(verify.prepare("SELECT value FROM settings WHERE key='general'").get()?.value),
  );
  if (saved.language !== 'fr' || saved.theme !== 'light') throw Error('Settings lost');
  for (const [key, value] of Object.entries(old.settings))
    if (JSON.stringify(saved[key]) !== JSON.stringify(value))
      throw Error('Existing preference lost: ' + key);
  if (!verify.prepare('SELECT id FROM servers WHERE id=?').get(f.server.id))
    throw Error('Server lost');
  if (!verify.prepare('SELECT id FROM backups WHERE id=?').get(backup.metadata.id))
    throw Error('Backup record lost');
  if (!verify.prepare('SELECT major FROM runtime_versions WHERE major=21').get())
    throw Error('Runtime reference lost');
  if (
    JSON.stringify(
      verify
        .prepare('SELECT * FROM player_history WHERE server_id=? AND name=?')
        .get(f.server.id, playerName),
    ) !== JSON.stringify(playerHistory)
  )
    throw Error('Player history lost');
  if (
    verify
      .prepare('SELECT metadata FROM player_observations WHERE server_id=? AND name=?')
      .get(f.server.id, playerName.toLowerCase())?.metadata !== playerObservation
  )
    throw Error('Player observation lost');
  const schedulesAfter = verify
    .prepare('SELECT metadata FROM schedules ORDER BY id')
    .all()
    .map((row) => JSON.parse(String(row.metadata)));
  if (
    JSON.stringify(schedulesAfter) !==
    JSON.stringify([...schedulesBefore].sort((a, b) => a.id.localeCompare(b.id)))
  )
    throw Error('Scheduled tasks lost');
  if (
    verify.prepare('SELECT secret FROM servers WHERE id=?').get(f.server.id)?.secret !==
    encryptedSecretBefore
  )
    throw Error('Encrypted RCON secret changed');
  if (evidence.finalSchema !== migrations.length || evidence.quickCheck !== 'ok')
    throw Error('Migration or database integrity failed');
  if (
    baselineVersion !== '0.3.0' &&
    verify
      .prepare('SELECT note FROM player_notes WHERE server_id=? AND name=?')
      .get(f.server.id, playerName.toLowerCase())?.note !== playerNote
  )
    throw Error('Private player note lost');
  evidence.installAudit = !!verify
    .prepare("SELECT id FROM events WHERE action='app.update.installed'")
    .get();
  verify.close();
  if (initialSchema === 11 && migrations.length > 11) {
    const safety = new DatabaseSync(path.join(f.root, 'app.db.before-v12.bak'), { readOnly: true });
    if (
      safety.prepare('PRAGMA user_version').get()?.user_version !== 11 ||
      safety.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
      safety.prepare('SELECT count(*) AS n FROM schedules').get()?.n !== 2 ||
      safety
        .prepare('SELECT note FROM player_notes WHERE server_id=? AND name=?')
        .get(f.server.id, playerName.toLowerCase())?.note !== playerNote
    )
      throw Error('Schema-11 migration safety copy invalid or incomplete');
    safety.close();
    evidence.preMigrationDatabaseBackup = {
      schema: 11,
      quickCheck: 'ok',
      playersNotesAndTasksPreserved: true,
    };
  }
  if (initialSchema === 5) {
    const safety = new DatabaseSync(path.join(f.root, 'app.db.before-v6.bak'), { readOnly: true });
    if (
      safety.prepare('PRAGMA user_version').get()?.user_version !== 5 ||
      safety.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok'
    )
      throw Error('Pre-migration database backup invalid');
    if (
      safety.prepare('SELECT count(*) AS n FROM schedules').get()?.n !== 2 ||
      !safety.prepare('SELECT name FROM player_history WHERE name=?').get(playerName)
    )
      throw Error('Pre-migration backup missing data');
    safety.close();
    evidence.preMigrationDatabaseBackup = {
      schema: 5,
      quickCheck: 'ok',
      playersAndTasksPreserved: true,
    };
  }
  const after = await Promise.all(preserved.map((file) => sha256(file)));
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error('Server or backup bytes changed');
  evidence.dataPreserved = {
    settings: true,
    server: true,
    world: true,
    properties: true,
    backupRecord: true,
    backupBytes: true,
    runtimeReference: true,
    sqliteDatabase: true,
    playerHistory: true,
    playerObservations: true,
    playerFiles: true,
    playerInventoryBytes: true,
    ...(baselineVersion !== '0.3.0' ? { privatePlayerNotes: true } : {}),
    scheduledTasks: true,
    encryptedRconSecret: true,
  };
  if (runtimeSource) {
    const probe = await promisify(execFile)(runtimePath, ['-version'], { windowsHide: true });
    if (!(probe.stderr || probe.stdout).includes(runtimeVersion))
      throw Error('Java version changed after upgrade');
    evidence.actualJavaRuntime = {
      version: runtimeVersion,
      binaryBytesPreserved: true,
      executableProbeAfterUpgrade: true,
    };
  }
  evidence.isolatedDataRoot = f.root;
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await desktop.close().catch(() => undefined);
  if (!installationRequested) oldProcess.kill();
  // Close only wrappers beneath the private upgrade-validation directory and their own windows.
  await promisify(execFile)(
    path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    ),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.resolve('scripts/close-native-upgrade.ps1'),
    ],
    { windowsHide: true, timeout: 30000 },
  );
  await writeFile(path.join(output, 'isolated-profile.txt'), f.root);
}
