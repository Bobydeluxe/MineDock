import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'vite';

test('visual identity keeps readable states, keyboard focus and desktop geometry in both themes', async () => {
  test.setTimeout(60000);
  const server = await createServer({ mode: 'mock', server: { port: 5173, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto('http://127.0.0.1:5173');
    await expect(page.getByText('Demo mode', { exact: false })).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      const contrast = await page.evaluate(() => {
        const context = document.createElement('canvas').getContext('2d')!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const c = Array.from(context.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((n) => {
              const v = n / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
        };
        const ratio = (foreground: string, background: string) => {
          const a = luminance(foreground),
            b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const probe = document.createElement('span');
        probe.style.position = 'fixed';
        probe.style.visibility = 'hidden';
        document.body.append(probe);
        const results: { label: string; ratio: number; minimum: number }[] = [];
        const states = [
          'running',
          'stopped',
          'starting',
          'stopping',
          'crashed',
          'installing',
          'backing_up',
          'restoring',
        ];
        for (const state of states) {
          probe.className = 'status ' + state;
          const css = getComputedStyle(probe);
          results.push({
            label: state,
            ratio: ratio(css.color, css.backgroundColor),
            minimum: 4.5,
          });
        }
        for (const type of [
          'compatible',
          'incompatible',
          'pinned',
          'manual',
          'update',
          'disabled',
        ] as const) {
          probe.className = 'badge ' + type;
          const css = getComputedStyle(probe);
          results.push({ label: type, ratio: ratio(css.color, css.backgroundColor), minimum: 4.5 });
        }
        for (const [foreground, background] of [
          ['--text-muted', '--surface-panel'],
          ['--text-secondary', '--surface-card'],
          ['--console-text', '--surface-console'],
          ['--console-muted', '--surface-console'],
          ['--console-warning', '--surface-console'],
          ['--console-danger', '--surface-console'],
          ['--accent-on-primary', '--accent-primary'],
          ['--text-quiet', '--surface-disabled'],
        ] as const) {
          probe.className = '';
          probe.style.color = `var(${foreground})`;
          probe.style.backgroundColor = `var(${background})`;
          const css = getComputedStyle(probe);
          results.push({
            label: foreground,
            ratio: ratio(css.color, css.backgroundColor),
            minimum: 4.5,
          });
        }
        probe.style.color = 'var(--focus)';
        probe.style.backgroundColor = 'var(--surface-panel)';
        const focus = getComputedStyle(probe);
        results.push({
          label: 'keyboard focus',
          ratio: ratio(focus.color, focus.backgroundColor),
          minimum: 3,
        });
        probe.remove();
        return results;
      });
      for (const value of contrast)
        expect(value.ratio, `${theme}: ${value.label}`).toBeGreaterThanOrEqual(value.minimum);
      for (const viewport of [
        { width: 760, height: 520 },
        { width: 1360, height: 900 },
        { width: 1920, height: 1080 },
        { width: 2560, height: 1440 },
      ]) {
        await page.setViewportSize(viewport);
        const geometry = await page.evaluate(() => {
          const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect(),
            main = document.querySelector('.main-shell')!.getBoundingClientRect(),
            top = document.querySelector('.topbar')!.getBoundingClientRect();
          return {
            sidebarLeft: sidebar.left,
            sidebarRight: sidebar.right,
            mainLeft: main.left,
            headerTop: top.top,
            headerHeight: top.height,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(geometry.sidebarLeft).toBe(0);
        expect(geometry.mainLeft).toBe(geometry.sidebarRight);
        expect(geometry.headerTop).toBe(0);
        expect(geometry.headerHeight).toBe(65);
        expect(geometry.overflow).toBe(false);
        const trigger = page
          .locator('.page-heading')
          .getByRole('button', { name: 'Create server', exact: true });
        await page.keyboard.press('Tab');
        await trigger.focus();
        await expect(trigger).toHaveCSS('outline-style', 'solid');
        await trigger.click();
        const dialog = page.getByRole('dialog'),
          bounds = (await dialog.boundingBox())!;
        await expect(dialog.locator('.dialog-footer').getByRole('button').last()).toBeInViewport();
        await expect
          .poll(async () => {
            const b = (await dialog.boundingBox())!;
            return Math.max(
              Math.abs(b.x + b.width / 2 - viewport.width / 2),
              Math.abs(b.y + b.height / 2 - viewport.height / 2),
            );
          })
          .toBeLessThan(2);
        expect(bounds.width).toBeLessThanOrEqual(viewport.width - 20);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.className = 'status starting';
      probe.innerHTML = '<i></i>';
      document.body.append(probe);
      const animation = getComputedStyle(probe.firstElementChild!).animationName;
      probe.remove();
      return animation;
    });
    expect(motion).toBe('none');
  } finally {
    await browser.close();
    await server.close();
  }
});
