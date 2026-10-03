import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };
import pt from './locales/pt.json' with { type: 'json' };
import it from './locales/it.json' with { type: 'json' };
import { defaultLanguage, type Language } from '../../../../packages/domain/languages';

export type Key = keyof typeof en;
export const dictionaries: Record<Language, Record<Key, string>> = { en, fr, de, es, pt, it };
export function translator(language: Language = defaultLanguage): (key: Key) => string {
  return (key) => (dictionaries[language] ?? en)[key] ?? en[key];
}

export function activityLabel(action: string, language: Language): string {
  const key = 'event.' + action;
  return Object.hasOwn(en, key) ? translator(language)(key as Key) : action;
}
