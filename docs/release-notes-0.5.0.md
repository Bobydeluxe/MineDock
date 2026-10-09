# MineDock 0.5.0 — release draft

**Unreleased review candidate. Public downloads still use 0.4.1.** These notes describe the development branch and are prepared for review before a separately approved publication.

## New features

- Open a complete player profile with Inventory, Actions, History and private Notes. Inspect actual inventory, armor, offhand and Ender Chest slots, full item IDs, saved components and available player stats.
- Safely remove a quantity, empty or replace an exact saved slot while the server is stopped. Every change creates a verified full backup and player copy; restoration previews use actual copies.
- Prepare native player actions, review exact targets and see whether each command was confirmed, sent, unverifiable or failed. Advanced actions require explicit confirmation.
- Select specific players for group messages, teleport, game mode, items, effects and whitelist changes. Each player receives an individual result; remaining work can be cancelled.
- Use world time, weather, difficulty and searchable gamerules in the existing Worlds page. More controls include announcements, safe world backup, player list, seed, border and world spawn; advanced forms expose supported structured commands.

## Improvements

- Clear live, dated saved-file and unavailable inventory states. A player file is never labeled live just because the server is running.
- Version and engine capability checks across Java, Bedrock Dedicated Server and PocketMine. Java 1.21.11 gamerule names and value types are handled explicitly.
- English, French, German, Spanish, Portuguese and Italian interface translations, with the existing neutral dark and light themes.
- Local administration history omits message contents, reasons, IP addresses and raw commands/replies.
- SQLite migration 12 preserves existing servers, settings, player records, notes and tasks. A real isolated Windows 0.4.1 → 0.5.0 replacement/relaunch and data migration was validated with controlled update transport.

## Fixes

- Minecraft RCON response handling works when the native server processes request packets separately and returns fragmented or concatenated output.
- Live backups verify native save-off, save-all and save-on responses. Uncertain saving restoration reports a failure and stops the owned server for safety.
- Unrecognized player-list responses no longer fabricate an empty online list. Cancelling group work retains completed individual results.

## Candidate packages

Six native build targets prepare Windows x64/ARM64 Setup and Portable, Linux x64/ARM64 AppImage and Debian, and macOS Intel/Apple Silicon ZIP and DMG. These are CI review artifacts, **not public release downloads**. See [validation](validation.md) for the exact successful runs, checksums and publisher metadata signatures. Existing 0.4.1 executables are unchanged.

## Known limits

- Actual Paper 1.21.11 world controls and safe live backup were tested with the owner's EULA acceptance, no added plugins and no connected players. Real connected-client inventory edits, multiplayer, Bedrock/PocketMine gameplay and exhaustive mod/version combinations remain unvalidated.
- Live Java inventory reads require a compatible native entity-data response and a matching online UUID. Localized or intercepted replies can be unverifiable. Saved-file writes are always blocked while any server process is active, including for offline players.
- The item picker contains IDs observed in saved player files, not a complete vanilla/mod registry. Explicit validated IDs can still be refused by the actual server. Item icons use generic symbols.
- Future Java data versions and unknown custom layouts are read-only. Bedrock/PocketMine native inventory storage is unavailable. Safety copies have no automatic garbage collection.
- Current weather cannot be read reliably. Stdio commands remain sent, and a reload acknowledgement does not prove completion. Native help cannot guarantee unchanged plugin/mod semantics.
- Windows/Apple publisher certificates and macOS notarization remain unavailable. Signed update metadata is a separate integrity check. Linux/macOS/ARM64 OS installation and update lifecycles are not claimed tested by packaged app journeys.

See the [user guide](player-world-administration.md), [native capture provenance](screenshots/player-world-050/README.md), [validation](validation.md) and [security notes](security.md).
