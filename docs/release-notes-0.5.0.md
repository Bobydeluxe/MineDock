# MineDock 0.5.0

Player and world administration, private version-correct item resources and safer native commands. English is the default; French, German, Spanish, Portuguese and Italian are included.

## New features

- Open a complete player profile with Inventory, Actions, History and private Notes. Inspect actual inventory, armor, offhand and Ender Chest slots, full item IDs, saved components and available player stats.
- Safely remove a quantity, empty or replace an exact saved slot while the server is stopped. Every change creates a verified full backup and player copy; restoration previews use actual copies.
- Prepare native player actions, review exact targets and see whether each command was confirmed, sent, unverifiable or failed. Advanced actions require explicit confirmation.
- Select specific players for group messages, teleport, game mode, items, effects and whitelist changes. Each player receives an individual result; remaining work can be cancelled.
- Use world time, weather, difficulty and searchable gamerules in the existing Worlds page. More controls include announcements, safe world backup, player list, seed, border and world spawn; advanced forms expose supported structured commands.

- Download exact-version official resources privately without an installed game, after explicit ownership/EULA consent. Optional local clients remain supported.
- Inspect saved heads, ordered banner/shield patterns, supported charged crossbows/dyes/trims/static frames, and safe mod/pack item models. An opt-in exact Modrinth resource archive is verified but never installed/executed.
- Browse a paged vanilla registry plus actual observations with translated-name/ID search, mod badges and explicit compatibility limits. No Minecraft assets are bundled.

## Improvements

- Clear live, dated saved-file and unavailable inventory states. A player file is never labeled live just because the server is running.
- Version and engine capability checks across Java, Bedrock Dedicated Server and PocketMine. Java 1.21.11 gamerule names and value types are handled explicitly.
- English, French, German, Spanish, Portuguese and Italian interface translations, with the existing neutral dark and light themes.
- Local administration history omits message contents, reasons, IP addresses and raw commands/replies.
- SQLite migration 12 preserves existing servers, settings, player records, notes and tasks. The earlier administration candidate passed a real isolated Windows 0.4.1 → CI 0.5.0 replacement/relaunch and data migration with controlled update transport. That evidence identifies its original source hash; the item-image enhancement adds no database migration.

## Fixes

- Minecraft RCON response handling works when the native server processes request packets separately and returns fragmented or concatenated output.
- Live backups verify native save-off, save-all and save-on responses. Uncertain saving restoration reports a failure and stops the owned server for safety.
- Unrecognized player-list responses no longer fabricate an empty online list. Cancelling group work retains completed individual results.

## Download

Choose the package matching your computer. No Node.js or pnpm installation is needed.

| Platform            | Packages                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64         | [Setup-x64.exe](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-Setup-x64.exe) · [Portable-x64.exe](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-Portable-x64.exe)         |
| Windows ARM64       | [Setup-arm64.exe](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-Setup-arm64.exe) · [Portable-arm64.exe](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-Portable-arm64.exe) |
| Linux x64           | [x86_64.AppImage](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-x86_64.AppImage) · [amd64.deb](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-amd64.deb)                   |
| Linux ARM64         | [arm64.AppImage](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-arm64.AppImage) · [arm64.deb](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-arm64.deb)                     |
| macOS Intel         | [x64.dmg](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-x64.dmg) · [x64.zip](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-x64.zip)                                       |
| macOS Apple Silicon | [arm64.dmg](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-arm64.dmg) · [arm64.zip](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-0.5.0-arm64.zip)                               |

[SHA-256 checksums](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/SHA256SUMS.txt) · [Complete feature list](https://github.com/Bobydeluxe/MineDock/releases/download/v0.5.0/MineDock-Features.txt). Twelve packages are built and tested on their native OS/architecture; six signed updater files verify package integrity.

### Upgrading

Close MineDock, retain your storage folders and use the same OS account. Servers, settings, backups, runtimes, SQLite, player data and tasks stay in the existing profile. SQLite migrates from schema 11 to 12 with a safety copy. Windows 0.3.0 may require manually opening the verified new package for its first upgrade. Keep a data backup; see [validation](validation.md) for exact evidence and other-platform limits.

## Website migration (prepared, not deployed)

Free GitHub Pages hosting, four English legal pages and project-path SEO are prepared in PR #9. Production remains blocked on publisher/contact details, host identity-disclosure confirmation, legal review and a successful verified deployment. The application release does not approve publishing legal drafts; the existing website remains active. Search Console ownership and Google indexing have not been performed. See the [website guide](website-seo.md) and [legal checklist](website-legal-checklist.md). Application release downloads are available on GitHub.

## Known limits

- Actual Paper 1.21.11 world controls and safe live backup were tested with the owner's EULA acceptance, no added plugins and no connected players. Real connected-client inventory edits, multiplayer, Bedrock/PocketMine gameplay and exhaustive mod/version combinations remain unvalidated.
- Live Java inventory reads require a compatible native entity-data response and a matching online UUID. Localized or intercepted replies can be unverifiable. Saved-file writes are always blocked while any server process is active, including for offline players.
- First official setup requires Internet, Java ownership/terms consent and up to 150 MiB for one exact client archive. Rendering is partial: name/UUID-only heads, piglin/dragon geometry, world-dependent compass/clock, effect-derived potion colours, rotated/complex special models and executable mod renderers remain unavailable. Saved mod IDs are not proof of live server availability. [Detailed coverage and legal interpretation](asset-policy.md).
- Future Java data versions and unknown custom layouts are read-only. Bedrock/PocketMine native inventory storage is unavailable. Safety copies have no automatic garbage collection.
- Current weather cannot be read reliably. Stdio commands remain sent, and a reload acknowledgement does not prove completion. Native help cannot guarantee unchanged plugin/mod semantics.
- Windows/Apple publisher certificates and macOS notarization remain unavailable. Signed update metadata is a separate integrity check. Linux/macOS/ARM64 OS installation and update lifecycles are not claimed tested by packaged app journeys.

See the [user guide](player-world-administration.md), [native capture provenance](screenshots/player-world-050/README.md), [validation](validation.md) and [security notes](security.md).
