import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Only the explicitly labeled demo is used. No Minecraft process or owner data is accessed.
const output = path.resolve('docs/screenshots');
await mkdir(output, { recursive: true });
const server = await createServer({ mode: 'mock', server: { port: 5180, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  await page.goto('http://127.0.0.1:5180');
  await page.getByText('Demo mode', { exact: false }).waitFor();
  const capture = async (name) => {
    const toast = page.locator('.toast');
    if (await toast.count())
      await toast.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.mouse.move(1430, 950);
    await page.screenshot({
      path: path.join(output, name + '.png'),
      animations: 'disabled',
      fullPage: name === 'console',
    });
    console.log('Captured ' + name);
  };
  await capture('dashboard');
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Create server', exact: true })
    .click();
  await page.getByLabel('Server name', { exact: true }).fill('Weekend survival');
  await page.getByLabel('Minecraft version', { exact: true }).waitFor();
  await capture('create-server');
  for (let step = 0; step < 3; step++)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await capture('create-summary');
  await page.keyboard.press('Escape');
  await page
    .getByRole('navigation', { name: 'Servers', exact: true })
    .getByRole('button')
    .first()
    .click();
  await capture('server');
  const nav = page.getByRole('navigation', { name: 'Server details' });
  await nav.getByRole('button', { name: 'Console', exact: true }).click();
  await page.getByLabel('Send a command', { exact: true }).fill('list');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('log').getByText('players online', { exact: false }).waitFor();
  await capture('console');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Back up', exact: true }).click();
  await nav.getByRole('button', { name: 'Plugins', exact: true }).click();
  await page.getByRole('button', { name: 'Choose version', exact: true }).waitFor();
  await capture('plugins');
  await nav.getByRole('button', { name: 'Backups', exact: true }).click();
  await page.locator('.backup-row').first().waitFor();
  await capture('backups');
  await nav.getByRole('button', { name: 'Worlds', exact: true }).click();
  await page.locator('.managed-world').first().waitFor();
  await capture('worlds');
  await page
    .locator('.sidebar-bottom')
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await page.getByLabel('Appearance', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).click();
  await capture('dashboard-light');
} finally {
  await browser.close();
  await server.close();
}
