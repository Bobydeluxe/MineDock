import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
import { worldMetadata } from '../fixtures/world-metadata';
import { checkPort } from '../../packages/networking/network';

test('real Electron world journey: filesystem metadata, safety backup, atomic duplicate and select', async () => {
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  await writeFile(path.join(f.server.path, 'world', 'level.dat'), worldMetadata());
  await mkdir(path.join(f.server.path, 'world', 'region'));
  await writeFile(
    path.join(f.server.path, 'world', 'region', 'r.0.0.mca'),
    'preserve this payload',
  );
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        typeof pair[1] === 'string' && pair[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const executablePath = process.env.MINEDOCK_TEST_BINARY;
  const desktop = await electron.launch({
    executablePath,
    args: executablePath ? [] : ['.'],
    env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
  });
  try {
    const page = await desktop.firstWindow();
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button', { name: 'Integration', exact: false })
      .click();
    await page
      .getByRole('navigation', { name: 'Server details' })
      .getByRole('button', { name: 'Worlds', exact: true })
      .click();
    await expect(page.locator('.managed-world')).toContainText('9223372036854775806');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByLabel('New world folder name', { exact: true }).fill('duplicate');
    await page.getByLabel('World name', { exact: true }).fill('world');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await readFile(path.join(f.server.path, 'duplicate', 'region', 'r.0.0.mca'), 'utf8'),
    ).toBe('preserve this payload');
    expect(f.repo.backups()).toHaveLength(1);
    const copy = page
      .locator('.managed-world')
      .filter({ has: page.getByRole('heading', { name: /^duplicate(?:\s|$)/ }) });
    await copy.getByRole('button', { name: 'Use this world', exact: true }).click();
    await page.getByLabel('World name', { exact: true }).fill('duplicate');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(copy).toContainText('Active world');
    expect(await readFile(path.join(f.server.path, 'server.properties'), 'utf8')).toContain(
      'level-name=duplicate',
    );
    expect(await readFile(path.join(f.server.path, 'world', 'region', 'r.0.0.mca'), 'utf8')).toBe(
      'preserve this payload',
    );
    expect(f.repo.backups()).toHaveLength(2);
    expect(
      f.repo
        .operations()
        .filter(
          (operation) => operation.kind === 'world.duplicate' || operation.kind === 'world.select',
        )
        .every((operation) => operation.status === 'completed'),
    ).toBe(true);
    if (!executablePath)
      await page.screenshot({
        path: 'test-results/worlds-real-desktop.png',
        fullPage: true,
        animations: 'disabled',
      });
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});

test('real Electron import journey: native folder selection, Bedrock metadata, copy confirmation and preserved source', async () => {
  test.skip(process.platform === 'darwin', 'Bedrock Dedicated Server has no macOS distribution.');
  const f = await fixture();
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  const source = path.join(f.root, 'bedrock-source');
  await mkdir(path.join(source, 'worlds', 'ImportedWorld'), { recursive: true });
  await writeFile(
    path.join(source, 'worlds', 'ImportedWorld', 'level.dat'),
    worldMetadata('bedrock', '42'),
  );
  await writeFile(
    path.join(source, process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server'),
    'fixture only: never executed',
  );
  let port = 28931;
  while (!(await checkPort(port, 'udp')) || !(await checkPort(port + 1, 'udp', true))) port += 2;
  await writeFile(
    path.join(source, 'server.properties'),
    `server-port=${port}\nserver-portv6=${port + 1}\nlevel-name=ImportedWorld\nserver-name=Imported\n`,
  );
  const before = await readFile(path.join(source, 'server.properties'));
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        typeof pair[1] === 'string' && pair[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const executablePath = process.env.MINEDOCK_TEST_BINARY;
  const desktop = await electron.launch({
    executablePath,
    args: executablePath ? [] : ['.'],
    env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
  });
  try {
    await desktop.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
    }, source);
    const page = await desktop.firstWindow();
    await page.getByRole('button', { name: 'Import server', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('ImportedWorld');
    await expect(page.getByLabel('Copy into MineDock', { exact: true })).toBeChecked();
    await page.getByLabel('Server name', { exact: true }).fill('Imported native');
    await page.getByLabel('Version', { exact: true }).fill('1.26.52.3');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Import server', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .last()
      .getByLabel('Server name', { exact: true })
      .fill('Imported native');
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Continue', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Imported native', exact: true })).toBeVisible();
    const imported = f.repo.servers().find((server) => server.name === 'Imported native')!;
    expect(imported).toMatchObject({
      engine: 'bedrock',
      externalFolder: false,
      javaMajor: 0,
      installationComplete: true,
    });
    expect(imported.path).not.toBe(source);
    expect(await readFile(path.join(source, 'server.properties'))).toEqual(before);
    expect(
      (await stat(path.join(imported.path, 'worlds', 'ImportedWorld', 'level.dat'))).isFile(),
    ).toBe(true);
    expect(
      f.repo.operations().find((operation) => operation.kind === 'server.import')?.status,
    ).toBe('completed');
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
