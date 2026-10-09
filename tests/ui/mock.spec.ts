import { test, expect, chromium, type Page } from '@playwright/test';
import { createServer } from 'vite';

async function demo(run: (page: Page) => Promise<void>) {
  const server = await createServer({ mode: 'mock', server: { port: 5173, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
    await page.goto('http://127.0.0.1:5173');
    await expect(page.getByText('Demo mode', { exact: false })).toBeVisible();
    await run(page);
  } finally {
    await browser.close();
    await server.close();
  }
}

test('explicit demo UI: create, start, command, stop, backup, settings, restore', async () => {
  const server = await createServer({ mode: 'mock', server: { port: 5173, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
    await page.goto('http://127.0.0.1:5173');
    await expect(page.getByText('Demo mode', { exact: false })).toBeVisible();
    await page.screenshot({
      path: 'test-results/dashboard-demo.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Create server', exact: true }).first().click();
    await page.getByLabel('Server name', { exact: true }).fill('UI test');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('I have read and accept the Minecraft EULA.').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create server', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'UI test', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Server details' })
      .getByRole('button', { name: 'Console', exact: true })
      .click();
    await page.getByLabel('Send a command', { exact: true }).fill('list');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('players online');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.getByRole('button', { name: 'Back up', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
    await page.getByLabel('Server message', { exact: true }).fill('Updated');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Backups', exact: true }).last().click();
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    await page.getByRole('dialog').getByLabel('Server name', { exact: true }).fill('UI test');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Server details' })
      .getByRole('button', { name: 'Plugins', exact: true })
      .click();
    await page
      .locator('summary')
      .filter({ hasText: /^Hangar$/ })
      .click();
    await page.getByRole('button', { name: 'Choose version', exact: true }).click();
    await page.getByLabel('Available version', { exact: true }).selectOption('demo');
    await expect(page.getByRole('dialog')).toContainText('explicit demo fixture');
    await page.getByRole('dialog').getByRole('button', { name: 'Install', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Managed content', exact: true })).toBeVisible();
    await expect(page.locator('.installed-row').filter({ hasText: 'luckperms.jar' })).toContainText(
      'LuckPerms',
    );
  } finally {
    await browser.close();
    await server.close();
  }
});

test('explicit demo journey: create Fabric with selected loader and installer', async () =>
  demo(async (page) => {
    await page.getByRole('button', { name: 'Create server', exact: true }).first().click();
    await page.getByRole('button', { name: 'Fabric', exact: false }).click();
    await page.getByLabel('Server name', { exact: true }).fill('Fabric UI');
    await expect(page.getByLabel('Loader version', { exact: true })).toHaveValue('demo');
    await expect(page.getByLabel('Installer version', { exact: true })).toHaveValue('demo');
    for (let i = 0; i < 3; i++)
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('I have read and accept the Minecraft EULA.').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create server', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Fabric UI', exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Server details' })
        .getByRole('button', { name: 'Mods', exact: true }),
    ).toBeVisible();
  }));

test('explicit demo journey: preview and import a copied existing server with confirmation', async () =>
  demo(async (page) => {
    await page.getByRole('button', { name: 'Import server', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Engine and version detected');
    await expect(page.getByLabel('Copy into MineDock', { exact: true })).toBeChecked();
    await page.getByLabel('Server name', { exact: true }).fill('Imported UI');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Import server', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .last()
      .getByLabel('Server name', { exact: true })
      .fill('Imported UI');
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Continue', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Imported UI', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }));

test('explicit demo journey: add, pause and resume a daily task with timezone preview', async () =>
  demo(async (page) => {
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button')
      .first()
      .click();
    await page
      .getByRole('navigation', { name: 'Server details' })
      .getByRole('button', { name: 'Tasks', exact: true })
      .click();
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    await page.getByLabel('Schedule', { exact: true }).selectOption('daily');
    await page.getByLabel('Daily time', { exact: true }).fill('04:15');
    await page.getByLabel('Timezone', { exact: true }).fill('Europe/Paris');
    await expect(page.getByRole('dialog').locator('.details-list p')).toHaveCount(5);
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.schedule-row').last()).toContainText('Every day 04:15');
    await page
      .locator('.schedule-row')
      .last()
      .getByRole('button', { name: 'Pause', exact: true })
      .click();
    await expect(page.locator('.schedule-row').last()).toContainText('Disabled');
    await page
      .locator('.schedule-row')
      .last()
      .getByRole('button', { name: 'Resume', exact: true })
      .click();
    await expect(page.locator('.schedule-row').last()).toContainText('Enabled');
  }));

test('explicit demo journey: duplicate dimensions, select the copy and delete the old inactive world', async () =>
  demo(async (page) => {
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button')
      .last()
      .click();
    await page
      .getByRole('navigation', { name: 'Server details' })
      .getByRole('button', { name: 'Worlds', exact: true })
      .click();
    await expect(page.locator('.managed-world')).toContainText('world_nether, world_the_end');
    await expect(page.getByRole('button', { name: 'Delete world', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByLabel('New world folder name', { exact: true }).fill('adventure');
    await page.getByLabel('World name', { exact: true }).fill('world');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    const copy = page
      .locator('.managed-world')
      .filter({ has: page.getByRole('heading', { name: /^adventure(?:\s|$)/ }) });
    await expect(copy).toContainText('adventure_nether, adventure_the_end');
    await copy.getByRole('button', { name: 'Use this world', exact: true }).click();
    await page.getByLabel('World name', { exact: true }).fill('adventure');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(copy).toContainText('Active world');
    await page
      .locator('.managed-world')
      .filter({ has: page.getByRole('heading', { name: 'world', exact: true }) })
      .getByRole('button', { name: 'Delete world', exact: true })
      .click();
    await page.getByLabel('World name', { exact: true }).fill('world');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.managed-world')).toHaveCount(1);
  }));

test('explicit demo journey: inspect a modpack, confirm its manifest and create with explicit EULA consent', async () =>
  demo(async (page) => {
    await page.getByRole('button', { name: 'Import modpack', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Client only — excluded');
    await page.getByLabel('Modpack name', { exact: true }).fill('Explicit demo modpack');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel('Minecraft version', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Loader version', { exact: true })).toBeDisabled();
    await page.getByLabel('Server name', { exact: true }).fill('Pack UI');
    for (let i = 0; i < 3; i++)
      await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Create server', exact: true }),
    ).toBeDisabled();
    await page.getByLabel('I have read and accept the Minecraft EULA.').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create server', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Pack UI', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }));
