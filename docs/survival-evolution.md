# Friends survival evolution

This work extends the pending Modrinth and visual identity branches. It keeps the approved warm light and charcoal dark palettes, the eight engines and the local-first security boundary. English is the source language; all visible additions need French, German, Spanish, Portuguese and Italian translations.

## Implementation ledger

The requested order is: (1) Modrinth packs and plugins; (2) health, notifications and diagnostics; (3) players and whitelist; (4) incremental, partial and external backups; (5) migration; (6) console and macros; (7) performance; (8) configuration; (9) portable packages; (10) documentation, website and distribution validation.

All ten stages are initially pending. Existing functionality is evidence to reuse, not proof that new requirements are complete. Every completed stage will record its concrete implementation, checks and limitations here. Published database migrations 1–6 must remain unchanged. Native captures must distinguish real application behaviour from isolated server fixtures. No merge or release is authorized by this implementation request.

Stage 1 implementation: world-scoped datapacks, required dependency preview, contextual Modrinth ZIP versions, managed/manual inventory, local imports, enable/disable/remove and resource pack selection with actual SHA-1. Recoverable whole-server swaps keep profile and files together. Paper/Purpur reuse the dependency, pin, update, rollback and manual-identification manager. Plugin metadata reads bounded YAML. Live search returned HTTP 200 for datapacks and resource packs on Minecraft 1.21.11. Unit regression: 187 passed, four platform skips; lint passed. Pack compatibility relies on upstream version metadata; no guessed pack-format compatibility is presented. Final native UI validation and captures are pending.

## Upstream references

- [Modrinth search API](https://docs.modrinth.com/api/operations/searchprojects/): explicit project types and contextual filters.
- [Paper commands](https://docs.papermc.io/paper/reference/commands/): measured performance information; unsupported command replies never become numeric measurements.

## Validation boundaries

Stage 4 implementation: stopped-server file-level incremental snapshots with SHA-256 object deduplication, verified manifests, integrity checks before restore, exact partial replacement previews for worlds/config/mods/plugins/datapacks and a full ZIP safety backup before restore. Full ZIP backups now preserve managed pack metadata. Independent default-on content/Minecraft safety switches are wired into content operations. Mounted external storage supports a real write/free-space test. Migration 9 adds incremental snapshot metadata. Unit regression: 194 passed, four platform skips. Incremental objects are immutable copies; managed RCON passwords are excluded and restored from the current configuration. Object garbage collection and partial restore from legacy ZIP archives are pending; deleted/unreferenced objects are intentionally retained until a verified collector exists.

Stage 3 implementation: persisted observed player sessions, today/7/30-day totals, bounded retention, private local notes and player detail dialog. Online verified UUIDs use the official Mojang session service and bounded texture cache; unavailable/offline identities use a default icon. Whitelist on/off uses the real running-server command; existing confirmed moderation and local list inspection are retained. Migration 8 adds sessions and notes. Mojang session response and texture host were checked against its live HTTPS endpoint. Unit regression and final native captures are tracked separately.

Stage 2 implementation: a bounded persisted notification centre with read/all-read, preference switches, thirty-second CPU/working-set thresholds and fifteen-minute deduplication; native Electron notifications when supported and enabled. Health reports backup age, crash/install state, free disk and host memory. The crash viewer reads a bounded tail from the latest report/log, redacts secrets and links possible managed content to matching evidence without asserting causality. Migration 7 only adds notice storage. Lint, types and unit regression passed: 190 tests, four platform skips. JVM heap/swap and external reachability are not inferred from process memory or local connectivity.

This Windows workspace can validate local files, SQLite, Electron and Windows packages. macOS/Linux installation and an actual multiplayer game need their own environments. A local port check alone cannot establish Internet reachability. A local resource pack requires an accessible HTTP(S) URL before clients can download it.
