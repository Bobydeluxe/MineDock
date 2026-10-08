import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppCore } from '../packages/core/app';
import { LocalSecretStore } from '../packages/security/secrets';
import { serializeProperties } from '../packages/domain/properties';
import { worldMetadata } from '../tests/fixtures/world-metadata';
import type { Server, Api } from '../packages/domain/types';

const phase = process.argv[2] ?? 'after',
  root = path.resolve('data/visual-review/profile'),
  output =
    phase === 'before' ? path.resolve('docs/design/before') : path.resolve('docs/screenshots');
await mkdir(output, { recursive: true });
await mkdir(root, { recursive: true });
if (!['before', 'after'].includes(phase)) throw new Error('Choose before or after.');
const secrets = await LocalSecretStore.open(root),
  core = await AppCore.open(root, secrets);
let paper: Server, fabric: Server;
try {
  fabric = core.repo.servers().find((s) => s.engine === 'fabric')!;
  if (!fabric) {
    const id = randomUUID(),
      now = new Date().toISOString();
    fabric = {
      id,
      name: 'Fabric mod library',
      engine: 'fabric',
      version: '1.21.1',
      loaderVersion: '0.19.5',
      build: '0.19.5',
      memoryMin: 1024,
      memoryMax: 4096,
      port: 28230,
      difficulty: 'normal',
      gamemode: 'survival',
      maxPlayers: 20,
      viewDistance: 10,
      simulationDistance: 8,
      pvp: true,
      whitelist: false,
      onlineMode: true,
      seed: '',
      motd: 'Fabric mod library',
      autoStart: false,
      autoRestart: false,
      path: path.join(root, 'servers', id),
      javaMajor: 21,
      javaPath: process.execPath,
      status: 'stopped',
      createdAt: now,
      updatedAt: now,
      cpu: 0,
      memory: 0,
      players: [],
      diskBytes: 0,
      installationComplete: true,
    };
    await mkdir(path.join(fabric.path, 'mods'), { recursive: true });
    await mkdir(path.join(fabric.path, 'world'), { recursive: true });
    await writeFile(path.join(fabric.path, 'world/level.dat'), worldMetadata('java', '4829175'));
    await writeFile(
      path.join(fabric.path, 'server.properties'),
      serializeProperties({
        'server-port': String(fabric.port),
        'rcon.port': '28241',
        'rcon.password': 'private-review-secret',
        'enable-rcon': 'true',
        'online-mode': 'true',
        'level-name': 'world',
        motd: fabric.motd,
      }),
    );
    core.repo.addServer(fabric, secrets.encrypt('private-review-secret'));
    const plan = await core.mods.plan(fabric, {
      selections: [
        { projectId: 'lithium' },
        { projectId: 'ferrite-core' },
        { projectId: 'krypton' },
      ],
    });
    await core.mods.apply(fabric, plan.token);
  }
  for (const server of core.repo.servers()) {
    server.path = path.join(root, 'servers', server.id);
    core.repo.saveServer(server);
  }
  fabric = core.repo.server(fabric.id);
  paper = core.repo.servers().find((s) => s.engine === 'paper')!;
  if (!paper) {
    const id = randomUUID();
    paper = {
      ...fabric,
      id,
      name: 'Oakbridge survival',
      engine: 'paper',
      path: path.join(root, 'servers', id),
      version: '1.21.1',
      build: '132',
      loaderVersion: undefined,
      port: 28231,
      players: [],
      status: 'stopped',
      motd: 'Oakbridge survival',
      autoStart: false,
      autoRestart: false,
      javaPath: process.execPath,
      runtimePath: undefined,
      installationComplete: true,
    };
    await mkdir(path.join(paper.path, 'world/stats'), { recursive: true });
    await mkdir(path.join(paper.path, 'plugins'), { recursive: true });
    await mkdir(path.join(paper.path, 'config'), { recursive: true });
    await writeFile(
      path.join(paper.path, 'server.jar'),
      'Private visual-review process fixture; never Minecraft',
    );
    await writeFile(
      path.join(paper.path, 'eula.txt'),
      '# Inert process fixture only; never a Minecraft executable\neula=true\n',
    );
    await writeFile(path.join(paper.path, 'world/level.dat'), worldMetadata('java', '4829175'));
    await writeFile(
      path.join(paper.path, 'config/backup-policy.yml'),
      'retention:\n  daily: 7\n  weekly: 4\n',
    );
    await writeFile(
      path.join(paper.path, 'server.properties'),
      serializeProperties({
        'server-port': String(paper.port),
        'rcon.port': '28242',
        'rcon.password': 'private-review-secret',
        'enable-rcon': 'true',
        'online-mode': 'true',
        'max-players': '20',
        'level-name': 'world',
        motd: paper.motd,
        gamemode: 'survival',
        difficulty: 'normal',
        'view-distance': '10',
      }),
    );
    await writeFile(
      path.join(paper.path, 'usercache.json'),
      JSON.stringify([
        {
          name: 'Linden',
          uuid: '11111111-2222-4333-8444-555555555555',
          expiresOn: '2027-01-01 00:00:00 +0000',
        },
        {
          name: 'River',
          uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          expiresOn: '2027-01-01 00:00:00 +0000',
        },
      ]),
    );
    await writeFile(path.join(paper.path, 'whitelist.json'), '[]\n');
    await writeFile(path.join(paper.path, 'ops.json'), '[]\n');
    core.repo.addServer(paper, secrets.encrypt('private-review-secret'));
    core.players.observeOnline(
      paper.id,
      ['Linden', 'River'],
      new Date(Date.now() - 7200000).toISOString(),
    );
    core.players.endSessions(paper.id);
    await core.backups.create(paper.id, 'manual');
    core.repo.saveSchedule({
      id: randomUUID(),
      serverId: paper.id,
      action: 'backup',
      intervalMinutes: 1440,
      command: '',
      enabled: false,
      mode: 'daily',
      time: '03:00',
      timezone: 'Europe/Paris',
      nextRun: new Date(Date.now() + 86400000).toISOString(),
    });
  }
  core.repo.saveSettings({
    ...core.repo.settings(),
    serverRoot: path.join(root, 'servers'),
    backupRoot: path.join(root, 'backups'),
    onboarded: true,
    language: 'en',
    theme: 'dark',
  });
} finally {
  await core.close();
}

const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => typeof value === 'string' && key !== 'ELECTRON_RUN_AS_NODE',
  ),
) as Record<string, string>;
if (!process.argv.includes('--first-start')) {
  const desktop = await electron.launch({
    args: ['.', '--force-device-scale-factor=1'],
    env: { ...env, MINEDOCK_DATA_DIR: root, MINEDOCK_TEST: '1' },
  });
  const layouts: Record<string, unknown> = {};
  try {
    const page = await desktop.firstWindow();
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 960),
    );
    await expect(page.locator('.sidebar')).toBeVisible();
    const capture = async (name: string, fullPage = false, resetScroll = true) => {
      await page
        .locator('.loading')
        .waitFor({ state: 'hidden', timeout: 30000 })
        .catch(() => undefined);
      if ((await page.locator('.toast').count()) && !(await page.locator('dialog[open]').count()))
        await page
          .locator('.toast')
          .getByRole('button', { name: 'Close', exact: true })
          .click({ timeout: 1000 })
          .catch(() => undefined);
      await page.evaluate((reset) => {
        (document.activeElement as HTMLElement)?.blur();
        if (reset) window.scrollTo(0, 0);
      }, resetScroll);
      await page.mouse.move(1430, 950);
      layouts[name] = await page.evaluate(() => {
        const selectors = [
          '.sidebar',
          '.topbar',
          '.page-heading',
          '.page-heading .actions',
          '.metric-grid',
          '.server-grid',
          '.server-card',
          '.dialog',
          '.wizard-progress',
          '.engine-options',
          '.dialog-footer',
          '.tabs',
          '.mods-manager',
          '.mod-installed',
        ];
        return selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll<HTMLElement>(selector))
            .filter((el) => el.getClientRects().length)
            .map((el, index) => {
              const r = el.getBoundingClientRect(),
                s = getComputedStyle(el);
              return {
                selector,
                index,
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                display: s.display,
                position: s.position,
                columns: s.gridTemplateColumns,
                gap: s.gap,
                padding: s.padding,
              };
            }),
        );
      });
      const historical = new Set([
        'dashboard',
        'create-server',
        'server',
        'mods',
        'dashboard-light',
        'create-server-light',
        'server-light',
        'mods-light',
      ]);
      if (phase === 'after' || historical.has(name))
        await page.screenshot({
          path: path.join(output, name + '.png'),
          animations: 'disabled',
          fullPage,
        });
      await writeFile(
        path.resolve('data/visual-review/layout-' + phase + '.json'),
        JSON.stringify(layouts, null, 2),
      );
      console.log('Captured ' + phase + '/' + name);
    };
    const dashboard = () =>
      page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).click();
    const openPaper = () =>
      page
        .getByRole('navigation', { name: 'Servers', exact: true })
        .getByRole('button', { name: /Oakbridge survival/ })
        .click();
    const openFabric = () =>
      page
        .getByRole('navigation', { name: 'Servers', exact: true })
        .getByRole('button', { name: /Fabric mod library/ })
        .click();
    await capture('dashboard');
    await page
      .locator('.page-heading')
      .getByRole('button', { name: 'Create server', exact: true })
      .click();
    await page.getByLabel('Server name', { exact: true }).fill('Weekend survival');
    await page.getByLabel('Minecraft version', { exact: true }).waitFor();
    await capture('create-server');
    for (let i = 0; i < 3; i++)
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await capture('create-summary');
    await page.keyboard.press('Escape');
    await openPaper();
    await capture('server');
    const tabs = page.getByRole('navigation', { name: 'Server details' });
    for (const [label, name] of [
      ['Players', 'players'],
      ['Worlds', 'worlds'],
      ['Files', 'files'],
      ['Backups', 'backups'],
      ['Tasks', 'scheduler'],
    ] as const) {
      await tabs.getByRole('button', { name: label, exact: true }).click();
      await capture(name);
    }
    await tabs.getByRole('button', { name: 'Plugins', exact: true }).click();
    await page.locator('.plugin-card').first().waitFor();
    await capture('plugins');
    await openFabric();
    await tabs.getByRole('button', { name: 'Mods', exact: true }).click();
    await page.getByRole('tab', { name: 'Installed', exact: true }).click();
    await page.locator('.mod-installed').filter({ hasText: 'Lithium' }).waitFor();
    await capture('mods-installed');
    await capture('mods');
    await page.locator('.mod-menu').first().locator('summary').click();
    await capture('mod-menu');
    await page.keyboard.press('Escape');
    await page
      .locator('.sidebar-bottom')
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await capture('settings', true);
    if (await page.getByRole('button', { name: 'Show details', exact: true }).count())
      await page.getByRole('button', { name: 'Show details', exact: true }).first().click();
    await page.getByText('Java runtimes', { exact: true }).scrollIntoViewIfNeeded();
    await capture('runtimes', false, false);
    await desktop.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, paper.path);
    await dashboard();
    await page.getByRole('button', { name: 'Import server', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await capture('import');
    await page.keyboard.press('Escape');
    await openPaper();
    await tabs.getByRole('button', { name: 'Console', exact: true }).click();
    await capture('console');
    // The existing process launcher and all application services remain unchanged.
    // A private external child fixture supplies lifecycle/log/RCON data; it is never shipped.
    await desktop.evaluate(
      (_electron, input) => {
        const child = process.getBuiltinModule(
            'child_process',
          ) as typeof import('node:child_process'),
          original = child.spawn;
        child.spawn = ((
          file: string,
          args: string[],
          options: import('node:child_process').SpawnOptions,
        ) =>
          file === input.node && args?.includes('-jar')
            ? original(input.node, [input.fixture], options)
            : original(file, args, options)) as typeof child.spawn;
      },
      { node: process.execPath, fixture: path.resolve('tests/fixtures/visual-server.cjs') },
    );
    await page.evaluate(async (id) => {
      const api = (window as unknown as { minedock: Api }).minedock;
      await api.start(id);
    }, paper.id);
    await expect(page.locator('.status.running')).toBeVisible();
    // Let the real process sampler populate metrics before photographing active views.
    await expect
      .poll(
        () =>
          page.evaluate(async (id) => {
            const api = (window as unknown as { minedock: Api }).minedock;
            return (await api.snapshot()).servers.find((server) => server.id === id)?.memory ?? 0;
          }, paper.id),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
    await capture('console-active');
    await tabs.getByRole('button', { name: 'Overview', exact: true }).click();
    await capture('server-active');
    await dashboard();
    await capture('dashboard-active');
    await page.evaluate(async (id) => {
      const api = (window as unknown as { minedock: Api }).minedock;
      await api.stop(id);
    }, paper.id);
    await page
      .locator('.sidebar-bottom')
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await page.getByLabel('Appearance', { exact: true }).selectOption('light');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await dashboard();
    await capture('dashboard-light');
    await page
      .locator('.page-heading')
      .getByRole('button', { name: 'Create server', exact: true })
      .click();
    await capture('create-server-light');
    await page.keyboard.press('Escape');
    await openPaper();
    await capture('server-light');
    await tabs.getByRole('button', { name: 'Console', exact: true }).click();
    await capture('console-light');
    await openFabric();
    await tabs.getByRole('button', { name: 'Mods', exact: true }).click();
    await page.getByRole('tab', { name: 'Installed', exact: true }).click();
    await page.locator('.mod-installed').first().waitFor();
    await capture('mods-light');
    await page
      .locator('.sidebar-bottom')
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await capture('settings-light', true);
    await writeFile(
      path.resolve('data/visual-review/layout-' + phase + '.json'),
      JSON.stringify(layouts, null, 2),
    );
  } finally {
    await desktop.close();
  }
}

// Fresh first-start and empty-shell captures replace the previous UI revision.
if (phase === 'after') {
  const fresh = path.resolve('data/visual-review/first-start');
  await mkdir(fresh, { recursive: true });
  const store = await LocalSecretStore.open(fresh),
    setup = await AppCore.open(fresh, store);
  setup.repo.saveSettings({
    ...setup.repo.settings(),
    onboarded: false,
    theme: 'dark',
    language: 'en',
  });
  await setup.close();
  const first = await electron.launch({
    args: ['.', '--force-device-scale-factor=1'],
    env: { ...env, MINEDOCK_DATA_DIR: fresh, MINEDOCK_TEST: '1' },
  });
  try {
    const page = await first.firstWindow();
    await first.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 960),
    );
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({
      path: path.join(output, 'onboarding-desktop.png'),
      animations: 'disabled',
    });
    await page.evaluate(async () => {
      const api = (window as unknown as { minedock: Api }).minedock,
        snapshot = await api.snapshot();
      await api.settings({ ...snapshot.settings, onboarded: true });
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: path.join(output, 'desktop-empty.png'), animations: 'disabled' });
    console.log('Captured after/onboarding-desktop and desktop-empty');
  } finally {
    await first.close();
  }
}
