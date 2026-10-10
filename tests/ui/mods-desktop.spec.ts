import { test, expect, _electron as electron } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
import { modFixtures } from '../mod-fixtures';

test('real Electron mods: search, dependency installation, updates, rollback, pin, collection and safe uninstall', async () => {
  const f = await fixture(),
    data = await modFixtures();
  f.server.engine = 'fabric';
  f.repo.saveServer(f.server);
  f.repo.saveSettings({ ...f.repo.settings(), onboarded: true });
  // Only the external API and CDN are fixtures. IPC, downloads, hashes, SQLite, backups and folder transactions run unchanged.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const executablePath = process.env.MINEDOCK_TEST_BINARY,
    desktop = await electron.launch({
      executablePath,
      args: executablePath ? [] : ['.'],
      env: { ...env, MINEDOCK_DATA_DIR: f.root, MINEDOCK_TEST: '1' },
    });
  try {
    await desktop.evaluate((_electron, data) => {
      let latestPublished = false;
      globalThis.fetch = async (raw, options) => {
        const url = new URL(String(raw)),
          parts = url.pathname.split('/').filter(Boolean);
        let result: unknown;
        if (url.hostname === 'cdn.modrinth.com')
          return new Response(Buffer.from(data.files[url.pathname] ?? '', 'base64'));
        if (url.hostname !== 'api.modrinth.com')
          return new Response('Fixture not found', { status: 404 });
        if (parts[1] === 'search') {
          const query = url.searchParams.get('query') ?? '',
            hits = Object.values(data.projects)
              .filter((item) => String(item.title).includes(query))
              .map((item) => ({
                ...item,
                project_id: item.id,
                author: 'Fixture author',
                versions: ['1.21.11'],
              }));
          result = { hits, total_hits: hits.length };
        } else if (parts[1] === 'project') {
          result =
            parts[3] === 'version'
              ? Object.values(data.versions)
                  .filter(
                    (item) =>
                      item.project_id === parts[2] &&
                      (latestPublished || String(item.id).endsWith('V1')),
                  )
                  .sort((a, b) => String(a.date_published).localeCompare(String(b.date_published)))
              : data.projects[parts[2]!];
        } else if (parts[1] === 'version') result = data.versions[parts[2]!];
        else if (parts[1] === 'versions')
          result = (JSON.parse(url.searchParams.get('ids') ?? '[]') as string[]).map(
            (id) => data.versions[id],
          );
        else if (parts[1] === 'version_files') {
          latestPublished = true;
          const request = JSON.parse(String(options?.body)) as { hashes: string[] };
          result = Object.fromEntries(
            request.hashes.flatMap((hash) => {
              const old = Object.values(data.versions).find((item) =>
                JSON.stringify(item.files).includes(hash),
              );
              return old
                ? [
                    [
                      hash,
                      data.versions[
                        String(old.project_id) + 'V' + (old.project_id === 'dependency' ? 1 : 2)
                      ],
                    ],
                  ]
                : [];
            }),
          );
        }
        return result
          ? new Response(JSON.stringify(result))
          : new Response('Not found', { status: 404 });
      };
    }, data);
    const page = await desktop.firstWindow();
    await page
      .getByRole('navigation', { name: 'Servers', exact: true })
      .getByRole('button', { name: /Integration/ })
      .click();
    await page.getByRole('button', { name: 'Mods', exact: true }).click();
    const mods = page.locator('.mods-manager');
    await mods.getByRole('textbox', { name: 'Search plugins or mods' }).fill('main');
    const card = mods.locator('.mod-card').filter({ hasText: 'Test main' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Install', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review mod installation' });
    await expect(review).toContainText('Test dependency');
    await expect(review).toContainText('Optional — not installed');
    await review.getByRole('button', { name: 'Apply mods and required dependencies' }).click();
    await expect(review).toBeHidden({ timeout: 30000 });
    await expect(mods.getByRole('tab', { name: 'Installed', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect.poll(() => f.repo.content(f.server.id).length).toBe(2);
    await expect(mods.locator('.mod-installed').filter({ hasText: 'Test main' })).toContainText(
      '1 · fabric',
    );
    const first = await readFile(path.join(f.server.path, 'mods/main.jar'));
    await expect(stat(path.join(f.server.path, 'mods/optional.jar'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const main = mods.locator('.mod-installed').filter({ hasText: 'Test main' });
    await main.getByLabel('Actions for Test main', { exact: true }).click();
    await main.getByRole('button', { name: 'Lock this version', exact: true }).click();
    await expect(main.getByLabel('Version locked')).toBeVisible();
    await mods.getByRole('button', { name: 'Create collection', exact: true }).click();
    const collection = page.getByRole('dialog', { name: 'Create collection', exact: true });
    await collection
      .getByRole('textbox', { name: 'Collection name', exact: true })
      .fill('Server performance');
    await collection.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(collection).toHaveCount(0);
    await mods.getByRole('tab', { name: 'Updates', exact: true }).click();
    await mods.getByRole('button', { name: 'Check updates', exact: true }).click();
    const updateRow = mods.locator('.mod-installed').filter({ hasText: 'Test main' });
    await expect(updateRow).toContainText('1 → 2');
    await expect(mods.getByRole('button', { name: 'Update all unlocked mods' })).toBeDisabled();
    await updateRow.getByRole('button', { name: 'Update / change version', exact: true }).click();
    await review.getByRole('button', { name: 'Apply mods and required dependencies' }).click();
    await expect
      .poll(() => f.repo.content(f.server.id).find((item) => item.projectId === 'main')?.versionId)
      .toBe('mainV2');
    await main.getByLabel('Actions for Test main', { exact: true }).click();
    await main.getByRole('button', { name: 'Restore previous version', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Test main', exact: true });
    await detail.getByRole('button', { name: 'Restore', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirm this operation' });
    await confirm.getByRole('textbox').fill('Test main');
    await confirm.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect
      .poll(() => f.repo.content(f.server.id).find((item) => item.projectId === 'main')?.versionId)
      .toBe('mainV1');
    expect(await readFile(path.join(f.server.path, 'mods/main.jar'))).toEqual(first);
    await main.getByLabel('Actions for Test main', { exact: true }).click();
    await main.getByRole('button', { name: 'Uninstall', exact: true }).click();
    const remove = page.getByRole('dialog', { name: 'Uninstall', exact: true });
    await expect(remove).toContainText('Test dependency');
    await remove.getByRole('checkbox').check();
    await remove.getByRole('textbox').fill(f.server.name);
    await remove.getByRole('button', { name: 'Confirm changes', exact: true }).click();
    await expect.poll(() => f.repo.content(f.server.id).length).toBe(0);
    await mods.getByRole('tab', { name: 'Discover', exact: true }).click();
    await mods
      .locator('details')
      .filter({ hasText: 'Local collections' })
      .locator('summary')
      .click();
    const savedCollection = mods
      .locator('.mod-collection')
      .filter({ hasText: 'Server performance' });
    await savedCollection.getByRole('button', { name: 'Install collection', exact: true }).click();
    await review.getByRole('button', { name: 'Apply mods and required dependencies' }).click();
    await expect.poll(() => f.repo.content(f.server.id).length).toBe(2);
    expect(f.repo.backups().length).toBeGreaterThanOrEqual(4);
    await mods.getByRole('tab', { name: 'Discover', exact: true }).click();
    await mods.getByRole('textbox', { name: 'Search plugins or mods' }).fill('');
    await expect(mods.locator('.mod-card')).toHaveCount(5);
    if (!executablePath)
      await page.screenshot({ path: 'test-results/mods-real-desktop.png', animations: 'disabled' });
  } finally {
    await desktop.close();
    await f.cleanup();
  }
});
