import cronstrue from 'cronstrue';
import 'cronstrue/locales/fr';
import 'cronstrue/locales/de';
import 'cronstrue/locales/es';
import 'cronstrue/locales/pt_PT';
import 'cronstrue/locales/it';
import type { Language } from './languages';

/** Display only. The scheduler validates and executes with cron-parser. */
export function describeCron(expression: string, language: Language): string {
  try {
    return cronstrue.toString(expression, {
      locale: language === 'pt' ? 'pt_PT' : language,
      use24HourTimeFormat: true,
    });
  } catch {
    return expression;
  }
}
