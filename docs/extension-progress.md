# Extension implementation record

Requested on 4 October 2026, building on the inspected 0.2.0 domain, SQLite schema, services, typed Electron bridge and UI. The 0.3.0 source preserves that architecture and English defaults, with all six languages.

## Implemented and connected to real services

- [x] Foundations: engine capabilities, Java/PHP/native runtime types, appended migrations 2–5, structured validated IPC, persistent jobs/checkpoints, resumable HTTP, cancellation and reviewed recovery.
- [x] Engines: all eight official catalog/install/launch adapters and edition/capability-aware creation/administration.
- [x] Content: Modrinth/Hangar/CurseForge providers, compatible versions/dependencies, bounded icon cache, managed provenance, updates, verified history/rollback and uninstall.
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

The owner has no CurseForge API key or Windows/Apple signing certificate. Secrets are never requested in public text. Provider/certificate infrastructure and unsigned packaging are present; authenticated API calls and OS signatures remain unvalidated. A separate publisher Ed25519 key is ignored locally and encrypted in CI; it is not an OS certificate.

Real game/client/crossplay sessions require personal EULA acceptance and clients. Historical-version coverage, interactive native OS installation, keychain/sleep behavior and extended power-loss/disk-full/load validation remain separate. CurseForge pack import has an official API/restrictions assessment, without a fake import button. Current final-run progress and actual results are recorded in validation.

The owner explicitly approved PR #1 integration and beta publication. The pull request is merged, v0.3.0 has twenty verified public assets, all twelve public update targets passed signature checks, and a real Windows portable installer passed the actual updater download/hash path. Installation was not executed.
