# Localization

English (`en`) is the canonical project language and the default for new installations. The application supports French (`fr`), German (`de`), Spanish (`es`), Portuguese (`pt`) and Italian (`it`). Languages are offered by their native names, in the same order during onboarding and in Settings. All catalogs ship with the app and work offline.

`packages/domain/languages.ts` defines supported codes and native names. The settings schema accepts only these codes. Existing `fr`/`en` preferences are preserved; choosing another language persists in the same SQLite settings record. Onboarding previews a language immediately. Settings apply the choice when saved. The HTML language attribute follows the current language, and date/time formatting uses that locale.

UI catalogs live in `apps/desktop/renderer/src/locales/`. English defines the typed `Key`; every other dictionary must implement every key. Add a label to all six JSON files, then use `t(key)` rather than hard-coded text. Native language names and protocol/product names remain stable.

Canonical application diagnostics are English. `packages/domain/locales/` contains six shared message catalogs for error dialogs, progress failures, crash explanations and audit details. Numbered placeholders preserve values such as Java versions, ports and paths. The display translator recognizes English messages and messages persisted by older French builds, so changing language does not rewrite historical records. Change a canonical sentence and its catalog key together. Unknown errors remain readable verbatim.

Minecraft console output, free-form commands, player/server names, file contents, plugin titles/descriptions and other external data are not translated. These remain usable with the original protocols and files. File dialogs may use the operating system's own language.

`tests/localization.test.ts` checks catalog completeness, nonempty values, placeholder consistency, translations of current/legacy messages and preference persistence across database restarts. The real Electron UI test checks onboarding choices, all six saved languages, renderer reloads and a full application restart. Extend these tests when adding languages or changing message formatting.

## 0.4.1 labels

Catalog refresh/cache/offline state, independent Fabric lists, property categories/review/risk/inherited/unsaved messages, local profile controls and curated Paper options ship in all six locale JSON files. English remains the default/source language. Actual upstream version strings, file keys and console output are retained. Existing language preferences are preserved.
