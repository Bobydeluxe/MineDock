# Extension implementation record

The 4–8 October development revision adds the complete Modrinth mod manager and migration 6: real hash-verified staged transactions, dependencies, updates, rollback, locks, local collections/favorites, manual identification and startup health checks. The source version stays unchanged during review; published packages remain 0.3.0. Current evidence and limits are in [validation](validation.md).

Requested on 4 October 2026, building on the inspected 0.2.0 domain, SQLite schema, services, typed Electron bridge and UI. The 0.3.0 source preserves that architecture and English defaults, with all six languages.

## Implemented and connected to real services

- [x] Foundations: engine capabilities, Java/PHP/native runtime types, appended migrations 2–5, structured validated IPC, persistent jobs/checkpoints, resumable HTTP, cancellation and reviewed recovery.
- [x] Engines: all eight official catalog/install/launch adapters and edition/capability-aware creation/administration.
- [x] Content: Modrinth/Hangar providers, compatible versions/dependencies, bounded icon cache, managed provenance, updates, verified history/rollback and uninstall.
- [x] Crossplay: supported official Geyser/Floodgate variants, dependency checks and atomic YAML/UDP/authentication configuration preserving Java online-mode/worlds.
- [x] Imports: existing-server copy/original preview, private original safety archive, Java/Bedrock worlds and real .mrpack installation with complete retry.
- [x] Administration: safe file rename/move/copy, native file/ZIP exports and extraction, lazy syntax editor/YAML validation, real persisted players/statistics and on-demand storage/history/largest files.
- [x] Automation: interval/daily/cron timezones/previews/readable descriptions, pause/resume, multiple warnings and verified retention previews/explicit purge.
- [x] Runtimes: actual native version/ZTS/header checks, atomic official repair and usage-protected deletion with verified replacement references.
- [x] Distribution infrastructure: pinned publisher-signed update metadata, verified downloads/native helpers, conditional OS signing/notarization and six native runners.
- [x] Regression/security tests and English documentation/complete feature text.

These entries declare implemented backend/UI and relevant automated checks. They do not declare every upstream engine/version or external certificate/account validated. Exact evidence is kept in [validation](validation.md), with architecture/compilation/execution/gameplay distinguished.

## Concrete external validation

Real official catalogs and Java/PHP probes are opt-in. Geyser/Floodgate/ViaVersion were actually downloaded/hash-checked into a sentinel profile, preserving its world and online-mode without a Minecraft executable/EULA. Paper bootstrap reaches eula=false. Native packages and seven real Electron journeys ran on all six CI targets. Windows short-name aliases, macOS system aliases and safe internal runtime-TAR link chains were corrected from native job evidence. Linux x64 metadata naming was corrected after its successful package/UI checks.

## Prerequisites and remaining limits

The owner has no Windows/Apple signing certificate. Unsigned packaging remains available. The publisher Ed25519 key for app updates is separate from OS signing.

Real game/client/crossplay sessions require personal EULA acceptance and clients. Historical-version coverage, interactive native OS installation, keychain/sleep behavior and extended power-loss/disk-full/load validation remain separate. Current final-run progress and actual results are recorded in validation.

The owner explicitly approved PR #1 integration and beta publication. The pull request is merged, v0.3.0 has twenty verified public assets, all twelve public update targets passed signature checks, and a real Windows portable installer passed the actual updater download/hash path. Installation was not executed.

## 0.3.1 UI revision

The next source revision fixes the shared dialog placement and nested focus/scroll behavior, simplifies creation and navigation, adds eight original MIT engine symbols and updates all six languages. It refreshes the README with nine actual renderer captures in clearly disclosed demo mode, development/contribution guidance and issue/PR templates. Existing core services and migrations remain in use.

Windows x64 production/NSIS/portable compilation and the full 22-case UI suite passed. Exact unit, packaged and CI results are recorded separately in [validation](validation.md). This revision has not been published as a new GitHub Release; the public 0.3.0 packages and their six-platform evidence remain distinct.
