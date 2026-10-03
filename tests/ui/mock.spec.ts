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
    await expect(page.getByText('Mode démo', { exact: false })).toBeVisible();
    await page.screenshot({
      path: 'test-results/dashboard-demo.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Créer un serveur', exact: true }).first().click();
    await page.getByLabel('Nom du serveur', { exact: true }).fill('UI test');
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    await page.getByLabel('J’ai lu et j’accepte l’EULA Minecraft.').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Créer le serveur', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'UI test', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Démarrer', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Détails du serveur' })
      .getByRole('button', { name: 'Console', exact: true })
      .click();
    await page.getByLabel('Envoyer une commande', { exact: true }).fill('list');
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('players online');
    await page.getByRole('button', { name: 'Arrêter', exact: true }).click();
    await page.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    await page.getByRole('button', { name: 'Paramètres', exact: true }).last().click();
    await page.getByLabel('Message du serveur', { exact: true }).fill('Updated');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByRole('button', { name: 'Sauvegardes', exact: true }).last().click();
    await page.getByRole('button', { name: 'Restaurer', exact: true }).first().click();
    await page.getByRole('dialog').getByLabel('Nom du serveur', { exact: true }).fill('UI test');
    await page.getByRole('dialog').getByRole('button', { name: 'Continuer', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await browser.close();
    await server.close();
  }
});
