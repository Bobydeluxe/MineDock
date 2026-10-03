import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { languageCodes } from '../packages/domain/languages';
import { localizeMessage, messageCatalogs, type MessageKey } from '../packages/domain/localization';
import { settingsSchema } from '../packages/domain/types';
import { Repository } from '../packages/database/database';
import { EventBus } from '../packages/core/events';
import { dictionaries, translator } from '../apps/desktop/renderer/src/i18n';

it.each(languageCodes)(
  'has complete UI and message catalogs for %s, with matching placeholders',
  (language) => {
    expect(Object.keys(dictionaries[language]).sort()).toEqual(Object.keys(dictionaries.en).sort());
    expect(Object.keys(messageCatalogs[language]).sort()).toEqual(
      Object.keys(messageCatalogs.en).sort(),
    );
    for (const value of Object.values(dictionaries[language])) expect(value.trim()).not.toBe('');
    for (const key of Object.keys(messageCatalogs.en) as MessageKey[]) {
      const translated = messageCatalogs[language][key];
      expect(translated.trim()).not.toBe('');
      expect(translated.match(/\{\d+\}/g)?.sort() ?? []).toEqual(
        key.match(/\{\d+\}/g)?.sort() ?? [],
      );
      const fill = (value: string) =>
        value.replace(/\{(\d+)\}/g, (_, index: string) => `value-${index}[$]`);
      expect(localizeMessage(fill(key), language)).toBe(fill(translated));
      expect(localizeMessage(fill(messageCatalogs.fr[key]), language)).toBe(fill(translated));
    }
  },
);

it.each(languageCodes)('persists %s across a database restart', async (language) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'minedock-language-'));
  let repo: Repository | undefined;
  try {
    repo = new Repository(root, new EventBus());
    expect(repo.settings().language).toBe('en');
    repo.saveSettings(settingsSchema.parse({ ...repo.settings(), language, onboarded: true }));
    repo.close();
    repo = new Repository(root, new EventBus());
    expect(repo.settings().language).toBe(language);
    expect(repo.settings().onboarded).toBe(true);
  } finally {
    repo?.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('defaults to English and rejects unsupported preferences', () => {
  expect(translator()('welcome')).toBe('A home for all your worlds.');
  expect(settingsSchema.shape.language.safeParse('xx').success).toBe(false);
});

it('translates composed crash diagnostics and strips Electron transport wrappers', () => {
  const crash = 'The server ran out of memory. Increase allocated RAM or reduce view distance.';
  const suffix = ' Three crashes in ten minutes: automatic restart suspended.';
  expect(localizeMessage(crash + suffix, 'de')).toBe(
    messageCatalogs.de[crash] + messageCatalogs.de[suffix],
  );
  expect(
    localizeMessage(
      "Error invoking remote method 'minedock:start': Error: Port 25565 is already in use.",
      'es',
    ),
  ).toBe('El puerto 25565 ya está en uso.');
  expect(localizeMessage('A custom plugin error: keep this text', 'it')).toBe(
    'A custom plugin error: keep this text',
  );
});
