# Changelog

## 0.5.0 — Unreleased development preview

The public download remains 0.4.1. No existing release executable is replaced.

### Added

- A large player profile with Inventory, Actions, History and Notes, official skin fallback, actual saved stats, 36 inventory slots, armor, offhand and 27 Ender Chest slots.
- Stopped-server inventory quantity removal, exact-slot empty/replace and previewed restoration from real pre-edit copies, with full verified backup, conflict checks, transaction journal and rollback.
- Validated native player action forms, partial saved-item search, filtered item removal and advanced confirmations for kill and explicit IP bans.
- Exact selected-player group actions, per-player results and cancellation of remaining targets.
- World controls in the existing Worlds page: time, weather, difficulty, categorized gamerules, verified save, announcements, player list, seed, border, spawn and structured advanced commands.

### Improved

- Honest live/saved/unavailable inventory sources, dates and command states; uncertain transport remains not verifiable.
- Java/Bedrock/PocketMine capability gates, native help checks and Java 1.21.11 rule names; English plus all five existing translations.
- Local administration history excludes private messages, reasons, IPs, raw commands and replies. SQLite migration 12 preserves existing records.

### Fixed

- Native Minecraft RCON interoperability when adjacent request packets coalesce, while retaining fragmented and bounded response collection.
- Live backup confirmation accepts the actual concatenated native save reply and verifies save-off/save-on; uncertain resume triggers a reported safety stop.
- An unrecognized player-list reply no longer invents an empty online list. Group cancellation preserves actual partial results.

### Known issues

- Item search is a partial list from saved player files, not a complete registry. Explicit IDs may still be rejected by the actual server.
- New/future Java data versions and unknown custom layouts are read-only; Bedrock/PocketMine native inventory storage is unavailable.
- No real connected-client inventory manipulation or multiplayer session is claimed. The real Paper world test has zero connected players; Bedrock/PocketMine gameplay and exhaustive mod/version combinations remain unvalidated.
- Stdio replies remain sent, localized/intercepted replies can remain not verifiable, and current weather cannot be read reliably. Safety copies have no automatic garbage collection.
- Publisher OS signatures/notarization remain unavailable. Publication requires a separate reviewed release, exact native packages/checksums and signed updater metadata.

## 0.4.1

### Added

- The approved MineDock cube icon across desktop packages, window, website, README and reproducible platform assets.
- Complete official version/build lists with refresh, persistent offline cache, advanced search and independent Fabric loader/installer choices.
- A categorized server properties editor, reviewed diffs, local profile names/images and curated existing Paper configuration controls.
- An original survival dusk website, responsive download choices and actual 0.4.1 screenshots.

### Improved

- Compact server rows, informative creation tiles, console category tabs and backup type filters follow the owner’s design reference.
- A focused cleanup removes the top breadcrumb/search strip, workspace promotion, sidebar Activity/Operations/Notifications entries, repeated page ribbons, beta/local badges and redundant metric captions. Dark surfaces are neutral black/charcoal; notification preferences/history and recovery/history access are inside Settings.
- Important controls remain readable in dark/light appearances; six offline app languages include all new labels and warnings.
- The shared create/migration selector preserves explicit versions and shows unsupported choices for review.
- Unsaved changes are guarded when navigating or closing the window; inherited properties stay unset unless edited.

### Fixed

- Fabric no longer hides all older loaders/installers behind the upstream stable flag; the chosen pair is pinned and retained.
- Beginner Paper selection skips game versions that have no stable build available.
- Properties save patches only edited effective values, preserving comments, CRLF, ordering and unknown keys; stale files refuse changes.
- Removed Java properties are gated by game version, RCON secrets stay hidden, and manual pack URL changes clear stale active-pack metadata.
- The creation review includes the exact chosen build and Fabric installer.
- Notification switches update immediately, persist their actual settings and restore their previous state if saving fails.

### Known issues

- Upstream catalog availability is not proof of every historical combination or live Minecraft multiplayer. See the exact validation record.
- Windows/macOS binaries remain unsigned; the historical 0.3.0 Windows first upgrade may require manual installation.
- Incremental object garbage collection, live map/multiplayer validation and native OS upgrade coverage retain the 0.4.0 limits.

## 0.4.0

### Added

- World-scoped Modrinth datapacks, server resource packs, local ZIP import and compatible version/dependency previews.
- Grouped health notices, notification preferences and bounded crash evidence with possible content candidates.
- Player details, observed sessions, private notes and official cached skins when identity is reliable.
- File-level incremental snapshots, exact partial restoration and mounted backup-folder write/space tests.
- Reviewed Minecraft/Paper/Purpur migration and full/fresh-world server clones.
- Historical log search, command suggestions and cancellable built-in/custom macros.
- Host-aware RAM suggestions, safe JVM presets, recognized Paper/Purpur TPS/MSPT, seven-day metrics and lag context.
- YAML/JSON graphical options, encrypted configuration versions, read-only safety advice and local map installation assistance.
- Explicit-consent external reachability checks and verified `.minedock` transfer archives.
- Beginner guide, internal security review, public website and real native screenshot gallery.

### Improved

- Modrinth is the main mod/plugin/pack experience; Hangar remains secondary. Existing offline inventory, dependency plans, locks and rollback are retained.
- Advanced tools remain secondary to ordinary creation/start/content/backup flows. All six app languages are bundled; English remains the source/default language.
- Content and Minecraft safety-backup policies are separate and enabled by default.
- Application update checks explicitly show “Up to date” after a successful check with no newer version; a failed verification never shows that status.

### Fixed

- Compatible server plugins such as Geyser are no longer rejected when a Modrinth version reports an unknown environment; explicit client-only versions remain blocked.

- Selected resource-pack removal clears its server properties, pack plans include engine/world identity, and package import validates generated world/network settings.
- Windows update helpers launch hidden without `DETACHED_PROCESS`, which caused PowerShell to exit before executing its script on the validation host. Native launch and failed-relaunch rollback now have regression coverage.
- Configuration editing preserves comments and refuses stale writes; cloned profiles choose independent available ports.

### Known issues

- Windows/macOS packages have no OS publisher certificate; verify the release checksums. Update metadata uses a separate publisher signature.
- The public 0.3.0 Windows portable launcher exhibited the detached-PowerShell failure here; its first upgrade requires manually opening the verified new package. See [exact upgrade evidence](docs/validation.md).
- Incremental objects have no garbage collector; legacy ZIP partial restoration is unavailable. Pack migration requiring new releases remains an explicit prerequisite.
- Process memory is not JVM heap; swap and Windows firewall/ACL inspection are unavailable. Unknown compatibility/reachability remains unknown.
- Live Minecraft multiplayer, map rendering, new macOS/Linux OS installation/upgrades and OS certificate signing need their own validation environments.

## 0.3.0 — Published beta

### Added

- Eight engine adapters, native runtime management, server/world/mrpack imports, content history, advanced files, players, storage, schedules, retention/recovery and signed application update metadata.
- English, French, German, Spanish, Portuguese and Italian; twelve native packages for supported Windows/Linux/macOS x64/ARM64 targets.

### Known issues

- Packages are unsigned by Windows/Apple certificates; native engine availability differs by OS/architecture. Historical release validation is retained in [validation](docs/validation.md).
