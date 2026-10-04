# Interface design and validation

The 0.3.1 source revision refines the existing interface and uses the same real preload/core services. It does not introduce a second backend.

## Dialogs

All creation/import/confirmation/world/file/content/runtime/recovery/update dialogs share `apps/desktop/renderer/src/ui.tsx`. Native `showModal()` places the dialog and its viewport backdrop in the browser top layer. React portals attach the DOM node to `document.body`; context still reaches the content.

CSS explicitly restores `position: fixed`, `inset: 0` and `margin: auto`, overriding the reset that caused top-left placement. Width and height stay bounded by the viewport. The header, progress indicator and footer remain outside the scrolling body. No custom z-index competes with the native top layer.

Opening runs before paint. Open-dialog counting locks body scroll until the last nested dialog closes. The title provides its accessible name. Tab/Shift+Tab cycle through visible enabled controls. Escape and a genuine backdrop press dismiss a closable dialog; content clicks and drags do not. Onboarding is mandatory and busy operations cannot be dismissed. Closing restores a visible opener after unmount, with the main landmark as fallback if resizing hid the opener.

## Creation and navigation

Four steps choose the engine, resources, main settings and summary. Java and Bedrock have explicit edition controls and distinct local engine symbols. Engine descriptions identify actual plugin/mod compatibility. Loader/installer choices retain the selected backend values. Catalog failures, invalid RAM, invalid/conflicting ports and invalid player counts block progression.

Memory presets remain first; custom memory and advanced world settings are folded. PHP/native engines omit Java RAM controls. The summary includes the selected runtime, loader, modpack files, resources and protocol/ports. EULA consent remains explicit. Creating a real server still uses the existing installation service.

Engine symbols also identify sidebar entries, dashboard cards, server headers, imports, modpack previews and marketplaces. Server tabs use concise labels and accompanying icons. Optional crossplay configuration and marketplace credentials are folded so frequent actions stay prominent.

## Assets and screenshots

Eight original SVG engine symbols are authored for MineDock under MIT, with no copied official logos or remote image dependency. See [asset provenance](../apps/desktop/renderer/src/assets/engines/README.md).

`pnpm screenshots` captures the running Vite renderer in explicit demo mode at 1440 × 960. The visible banner and README captions disclose simulated server/player/console data. It captures dashboard, creation, summary, server overview, console, plugins, backups, worlds and light appearance. These are UI captures, not gameplay evidence. Native Electron tests separately use isolated filesystem/SQLite fixtures.

Targeted UI tests measure dialog centers relative to the actual viewport, repeat after resizing and internal scrolling, check visible footers/focus/backdrop/Escape/nesting, render all eight symbols, exercise Forge/NeoForge submissions and verify the new text in all six languages. Native Electron also checks first display and window resizing. See [validation](validation.md) for exact outcomes.
