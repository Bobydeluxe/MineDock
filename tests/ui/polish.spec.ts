import { test, expect, chromium, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { translator } from '../../apps/desktop/renderer/src/i18n';
import { languages } from '../../packages/domain/languages';
test.setTimeout(45000);

test('light appearance keeps enabled server actions readable', async () =>
  demo(async (page) => {
    await page
      .locator('.sidebar-bottom')
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await page.getByLabel('Appearance', { exact: true }).selectOption('light');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).click();
    const start = page
      .locator('.card-footer')
      .getByRole('button', { name: 'Start', exact: true })
      .first();
    await expect(start).toBeEnabled();
    await expect(start).toHaveCSS('color', 'rgb(55, 123, 62)');
    await expect(start).toHaveCSS('background-color', 'rgb(232, 242, 233)');
    await page
      .locator('.page-heading')
      .getByRole('button', { name: 'Create server', exact: true })
      .click();
    await centered(page);
    await expect(page.locator('.engine-option.selected')).toHaveCSS(
      'border-top-color',
      'rgb(55, 123, 62)',
    );
  }));

async function demo(run: (page: Page) => Promise<void>) {
  const server = await createServer({ mode: 'mock', server: { port: 5173, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    await page.goto('http://127.0.0.1:5173');
    await expect(page.getByText('Demo mode', { exact: false })).toBeVisible();
    await run(page);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function centered(page: Page) {
  const dialog = page.locator('dialog[open]').last();
  // Poll through the opening transition; test the viewport rather than a fixed pixel position.
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox(),
        size = page.viewportSize();
      if (!bounds || !size) return Infinity;
      return Math.max(
        Math.abs(bounds.x + bounds.width / 2 - size.width / 2),
        Math.abs(bounds.y + bounds.height / 2 - size.height / 2),
      );
    })
    .toBeLessThan(2);
  const bounds = (await dialog.boundingBox())!,
    size = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(10);
  expect(bounds.y).toBeGreaterThanOrEqual(10);
  expect(bounds.width).toBeLessThanOrEqual(size.width - 20);
  expect(bounds.height).toBeLessThanOrEqual(size.height - 20);
  await expect(dialog.locator('.dialog-footer').getByRole('button').last()).toBeInViewport();
}

test('dialogs stay centered across viewport changes, scroll internally and restore keyboard focus', async () =>
  demo(async (page) => {
    const trigger = page
      .locator('.page-heading')
      .getByRole('button', { name: 'Create server', exact: true });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Create server', exact: true })).toBeVisible();
    expect(await page.locator('dialog').evaluate((el) => el.parentElement === document.body)).toBe(
      true,
    );
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    for (const viewport of [
      { width: 480, height: 500 },
      { width: 760, height: 520 },
      { width: 1024, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await centered(page);
      const body = page.locator('dialog .dialog-body');
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await centered(page);
      await page.screenshot({
        path: `test-results/dialog-${viewport.width}x${viewport.height}.png`,
        animations: 'disabled',
      });
    }
    await page.setViewportSize({ width: 760, height: 520 });
    await page.getByLabel('Server name', { exact: true }).focus();
    for (let index = 0; index < 18; index++) {
      await page.keyboard.press('Tab');
      expect(
        await page.locator('dialog').evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await trigger.click();
    await centered(page);
    await page.mouse.click(2, 2);
    await expect(page.locator('dialog')).toHaveCount(0);
  }));

test('nested import confirmation retains scroll lock and restores the outer dialog', async () =>
  demo(async (page) => {
    await page.getByRole('button', { name: 'Import server', exact: true }).click();
    await centered(page);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Import server', exact: true })
      .click();
    await expect(page.locator('dialog[open]')).toHaveCount(2);
    await centered(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    expect(await page.locator('dialog').evaluate((el) => el.contains(document.activeElement))).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  }));

test('all eight engine symbols render, native resources omit Java controls and invalid ports are blocked', async () =>
  demo(async (page) => {
    await page.getByRole('button', { name: 'Create server', exact: true }).first().click();
    const sources = new Set<string>();
    for (const engine of ['Vanilla', 'Paper', 'Purpur', 'Fabric', 'Forge', 'NeoForge']) {
      await page
        .locator('.engine-options')
        .getByRole('button', { name: engine, exact: true })
        .click();
      await expect(
        page.locator('.engine-options').getByRole('button', { name: engine, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      const icon = page.locator('.engine-option.selected img');
      expect(
        await icon.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      ).toBe(true);
      sources.add((await icon.getAttribute('src'))!);
    }
    await page.getByRole('button', { name: 'Bedrock Edition', exact: true }).click();
    for (const engine of ['Bedrock Dedicated Server', 'PocketMine-MP']) {
      await page
        .locator('.engine-options')
        .getByRole('button', { name: engine, exact: true })
        .click();
      const icon = page.locator('.engine-option.selected img');
      expect(
        await icon.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      ).toBe(true);
      sources.add((await icon.getAttribute('src'))!);
    }
    expect(sources.size).toBe(8);
    await page.getByLabel('Server name', { exact: true }).fill('Native preview');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel(/Maximum RAM/)).toHaveCount(0);
    await expect(page.locator('dialog')).toContainText('PHP');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('IPv6 UDP port', { exact: true }).fill('19132');
    await page.getByLabel('Minecraft port', { exact: true }).fill('19132');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  }));

test('wizard hides advanced options, rejects invalid RAM and duplicate ports, and shows a useful summary', async () =>
  demo(async (page) => {
    await page.getByRole('button', { name: 'Create server', exact: true }).first().click();
    await page.getByLabel('Server name', { exact: true }).fill('Memory preview');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel(/Minimum RAM/)).not.toBeVisible();
    await page.getByText('Custom memory settings', { exact: true }).click();
    await page.getByLabel(/Minimum RAM/).fill('8192');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    await page.getByLabel(/Minimum RAM/).fill('1024');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel('View distance', { exact: true })).not.toBeVisible();
    await page.getByLabel('Minecraft port', { exact: true }).fill('25565');
    await expect(page.getByRole('alert')).toContainText('already assigned');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    await page.getByLabel('Minecraft port', { exact: true }).fill('25577');
    await page.locator('dialog .dialog-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Review your server', exact: true }),
    ).toBeFocused();
    expect(await page.locator('dialog .dialog-body').evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.locator('.review-engine img')).toHaveAttribute('data-engine', 'paper');
    await expect(page.locator('.installation-summary')).toContainText('Java');
    await expect(page.locator('.installation-summary')).toContainText('25577 TCP');
    await expect(page.locator('.installation-summary')).toContainText('No mods or plugins yet');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Create server', exact: true }),
    ).toBeDisabled();
  }));

for (const engine of ['Forge', 'NeoForge']) {
  test(`explicit demo creation still submits the selected ${engine} loader`, async () =>
    demo(async (page) => {
      await page.getByRole('button', { name: 'Create server', exact: true }).first().click();
      await page
        .locator('.engine-options')
        .getByRole('button', { name: engine, exact: true })
        .click();
      await page.getByLabel('Server name', { exact: true }).fill(`${engine} visual test`);
      await expect(page.getByLabel('Loader version', { exact: true })).toHaveValue('demo');
      for (let index = 0; index < 3; index++)
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.locator('.installation-summary')).toContainText('demo');
      // This explicitly simulated service never downloads or executes Minecraft.
      await page.getByLabel('I have read and accept the Minecraft EULA.').check();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Create server', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: `${engine} visual test`, exact: true }),
      ).toBeVisible();
      await expect(page.locator('.title-with-status img')).toHaveAttribute(
        'data-engine',
        engine.toLowerCase(),
      );
      await expect(
        page
          .getByRole('navigation', { name: 'Server details' })
          .getByRole('button', { name: 'Mods', exact: true }),
      ).toBeVisible();
    }));
}

test('unsaved language and appearance survive an unrelated settings refresh', async () =>
  demo(async (page) => {
    await page
      .locator('.sidebar-bottom')
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    const language = page.getByLabel('Language', { exact: true });
    const appearance = page.getByLabel('Appearance', { exact: true });
    await language.selectOption('it');
    await appearance.selectOption('light');
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await expect(language).toHaveValue('it');
    await expect(appearance).toHaveValue('light');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }));

test('new wizard labels and engine descriptions work in all six languages', async () =>
  demo(async (page) => {
    let current = 'en' as (typeof languages)[number]['code'];
    for (const { code } of languages) {
      const previous = translator(current),
        t = translator(code);
      await page
        .locator('.sidebar-bottom')
        .getByRole('button', { name: previous('settings'), exact: true })
        .click();
      await page.getByLabel(previous('language'), { exact: true }).selectOption(code);
      await page.getByRole('button', { name: previous('save'), exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await page
        .locator('.sidebar-heading')
        .getByRole('button', { name: t('newServer'), exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: t('engineStepTitle'), exact: true }),
      ).toBeVisible();
      await expect(page.locator('.engine-options')).toContainText(t('engineNeoForge'));
      await page.keyboard.press('Escape');
      current = code;
    }
  }));
