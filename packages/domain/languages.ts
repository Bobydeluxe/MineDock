export const languageCodes = ['en', 'fr', 'de', 'es', 'pt', 'it'] as const;
export type Language = (typeof languageCodes)[number];
export const languages: ReadonlyArray<{ code: Language; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
];
export const defaultLanguage: Language = 'en';
