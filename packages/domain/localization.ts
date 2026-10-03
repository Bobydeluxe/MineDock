import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };
import pt from './locales/pt.json' with { type: 'json' };
import it from './locales/it.json' with { type: 'json' };
import { defaultLanguage, type Language } from './languages';

export type MessageKey = keyof typeof en;
export const messageCatalogs: Record<Language, Record<MessageKey, string>> = {
  en,
  fr,
  de,
  es,
  pt,
  it,
};
const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = (Object.keys(en) as MessageKey[])
  .flatMap((key) =>
    [...new Set([en[key], fr[key]])].map((source) => {
      const parameters: number[] = [];
      const pattern = source
        .split(/(\{\d+\})/)
        .map((part) => {
          const parameter = /^\{(\d+)\}$/.exec(part);
          if (!parameter) return escape(part);
          parameters.push(Number(parameter[1]));
          return '([\\s\\S]+?)';
        })
        .join('');
      return { key, source, parameters, exact: new RegExp('^' + pattern + '$') };
    }),
  )
  .sort(
    (a, b) => b.source.replace(/\{\d+\}/g, '').length - a.source.replace(/\{\d+\}/g, '').length,
  );

/** Translate MineDock messages only, including diagnostics persisted by older French versions. */
export function localizeMessage(text: string, language: Language = defaultLanguage): string {
  const value = text
    .replace(/^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/, '')
    .replace(/^Error: /, '');
  const dictionary = messageCatalogs[language] ?? en;
  for (const { key, exact, parameters } of patterns) {
    const match = exact.exec(value);
    if (match) {
      const args = new Map(parameters.map((parameter, i) => [parameter, match[i + 1] ?? '']));
      return dictionary[key].replace(
        /\{(\d+)\}/g,
        (_, parameter: string) => args.get(Number(parameter)) ?? '',
      );
    }
  }
  for (const { key, source, parameters } of patterns) {
    if (parameters.length || !source.trim()) continue;
    if (/\s$/.test(source) && value.startsWith(source) && value.length > source.length)
      return dictionary[key] + localizeMessage(value.slice(source.length), language);
    if (/^\s/.test(source) && value.endsWith(source) && value.length > source.length)
      return localizeMessage(value.slice(0, -source.length), language) + dictionary[key];
  }
  return value;
}
