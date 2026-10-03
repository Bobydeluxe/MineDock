import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'vite';

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
  } finally {
    await browser.close();
    await server.close();
  }
});
