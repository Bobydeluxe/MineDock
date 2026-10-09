# Changelog

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
