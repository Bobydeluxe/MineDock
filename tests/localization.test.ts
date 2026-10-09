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
import { readFileSync } from 'node:fs';
import { gameRules } from '../packages/domain/admin-commands';
import type { Server } from '../packages/domain/types';

it('covers static and dynamic player/world administration labels in all six languages', () => {
  const keys = new Set<string>();
  for (const file of ['administration-ui.tsx', 'player-profile.tsx', 'world-controls.tsx']) {
    const text = readFileSync(path.join('apps/desktop/renderer/src', file), 'utf8');
    for (const match of text.matchAll(/\ba\('([^']+)'\)/g)) keys.add('admin.' + match[1]);
  }
  for (const action of [
    'message',
    'teleport',
    'gamemode',
    'kick',
    'ban',
    'pardon',
    'op',
    'deop',
    'whitelistAdd',
    'whitelistRemove',
    'give',
    'clear',
    'replace',
    'effect',
    'effectClear',
    'experience',
    'spawnpoint',
    'title',
    'kill',
    'inventory.remove',
    'inventory.empty',
    'inventory.replace',
    'inventory.restore',
  ])
    keys.add('admin.action.' + action);
  for (const version of ['1.13.2', '1.21.5', '1.21.11', '26.1'])
    for (const rule of gameRules({ engine: 'paper', version } as Server)) {
      keys.add('admin.rule.' + rule.key);
      keys.add('admin.ruleHelp.' + rule.key);
    }
  for (const state of ['confirmed', 'sent', 'unverifiable', 'failed']) keys.add('admin.' + state);
  for (const language of languageCodes)
    for (const key of keys)
      expect(
        (dictionaries[language] as Record<string, string>)[key],
        language + ': ' + key,
      ).toBeTruthy();
});

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
  expect(translator()('welcome')).toBe('Server dashboard');
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
