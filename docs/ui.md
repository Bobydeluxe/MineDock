# Interface design and validation

The 0.3.1 visual-review source gives the existing interface a mineral teal/copper identity and uses the same real preload/core services. Sidebar placement, page/tab order, card geometry, wizard steps and user journeys stay unchanged. See the [before/after review](design/visual-review.md) for the palette, native comparisons and measured geometry.

## Shared appearance

`apps/desktop/renderer/src/tokens.css` centralizes dark/light surfaces, text levels, semantic states, control borders, focus, selection, console/editor colors, radii and short transitions. The sidebar uses an inset selection rail; server cards, metrics and administration panels have distinct surfaces. Copper identifies secondary world/archive context. Eight server states and mod/plugin badges use readable semantic colors. Console output retains its own dark surface in both themes. Keyboard focus remains visible and reduced-motion preferences disable transient indicators.

These presentation changes do not alter persistence, security boundaries, downloads, process supervision or update rules. English remains the default with the existing six offline languages.

## Dialogs

All creation/import/confirmation/world/file/content/runtime/recovery/update dialogs share `apps/desktop/renderer/src/ui.tsx`. Native `showModal()` places the dialog and its viewport backdrop in the browser top layer. React portals attach the DOM node to `document.body`; context still reaches the content.

CSS explicitly restores `position: fixed`, `inset: 0` and `margin: auto`, overriding the reset that caused top-left placement. Width and height stay bounded by the viewport. The header, progress indicator and footer remain outside the scrolling body. No custom z-index competes with the native top layer.

Opening runs before paint. Open-dialog counting locks body scroll until the last nested dialog closes. The title provides its accessible name. Tab/Shift+Tab cycle through visible enabled controls. Escape and a genuine backdrop press dismiss a closable dialog; content clicks and drags do not. Onboarding is mandatory and busy operations cannot be dismissed. Closing restores a visible opener after unmount, with the main landmark as fallback if resizing hid the opener.

## Creation and navigation

Four steps choose the engine, resources, main settings and summary. Java and Bedrock have explicit edition controls and distinct local engine symbols. Engine descriptions identify actual plugin/mod compatibility. Loader/installer choices retain the selected backend values. Catalog failures, invalid RAM, invalid/conflicting ports and invalid player counts block progression.

Memory presets remain first; custom memory and advanced world settings are folded. PHP/native engines omit Java RAM controls. The summary includes the selected runtime, loader, modpack files, resources and protocol/ports. EULA consent remains explicit. Creating a real server still uses the existing installation service.

Engine symbols also identify sidebar entries, dashboard cards, server headers, imports, modpack previews and marketplaces. Server tabs use concise labels and accompanying icons. Optional crossplay configuration is folded so frequent actions stay prominent.

Settings synchronize when persisted preference values change. A background snapshot with the same values preserves unsaved language/theme edits; it no longer resets the form simply because IPC supplied a new object. A regression journey changes both preferences, invokes an unrelated folder action and verifies that the drafts survive before saving.

## Assets and screenshots

The mod manager has Discover, Installed and Updates views with exact Minecraft/loader context. Recommended installation reviews named required and optional dependencies before the real transaction. Installed actions, shared dependency removal, updates, locks, archived rollback, favorites, collections, manual hash identification and advanced loader migration use the typed main-process bridge. Local inventory and actions stay available offline.

`docs/screenshots/mods.png` and `mods-installed.png` are actual Electron captures from an isolated Fabric 1.21.1 profile. They use live official Modrinth catalogue metadata and three downloaded, SHA-512-verified JARs: Lithium, FerriteCore and Krypton. There is no demo catalogue or simulated installation in these captures. No Minecraft executable is launched. The automated mod journey separately substitutes only external API/CDN responses with readable ZIP JAR fixtures; real IPC, SQLite, hashing, backups, file transactions and rollback run unchanged.

Eight original SVG engine symbols are authored for MineDock under MIT, with no copied official logos or remote image dependency. Each retains its individual drawing and color; the common enclosing background tile is removed. See [asset provenance](../apps/desktop/renderer/src/assets/engines/README.md).

`pnpm build` followed by `pnpm screenshots` captures the production Electron application at a 1440 × 960 native content viewport, using isolated filesystem/SQLite storage under ignored `data/visual-review`. The 28 current images cover onboarding, empty/populated dashboards, creation/review, server states, console, players, worlds, files, backups, mods/plugins, scheduler, runtimes, settings and import. Dark/light variants use the same layout. Settings captures include the full scrollable page. All former current gallery images are replaced; eight explicitly historical comparisons remain under `docs/design/before`.

Mod metadata/files are actual verified Modrinth downloads. Administration/world/player records are private QA fixtures. Active console and lifecycle captures use a real external Node child and RCON fixture, which is never shipped and is not Minecraft. First-start/empty views use a separate fresh native profile. See the [complete gallery and provenance](screenshots/README.md). Browser demonstration data remains confined to explicitly selected development and automated test paths; it is not used for the current screenshot gallery.

Targeted UI tests measure dialog centers relative to the actual viewport, repeat after resizing and internal scrolling, check visible footers/focus/backdrop/Escape/nesting, render all eight symbols, exercise Forge/NeoForge submissions and verify text in all six languages. The visual case checks 23 contrast/focus combinations per theme, all eight server states, mod badges, console levels, reduced motion and geometry across four desktop sizes. Native Electron also checks first display and window resizing. See [validation](validation.md) for exact outcomes.
