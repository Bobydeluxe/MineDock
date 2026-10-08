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

This Windows workspace can validate local files, SQLite, Electron and Windows packages. macOS/Linux installation and an actual multiplayer game need their own environments. A local port check alone cannot establish Internet reachability. A local resource pack requires an accessible HTTP(S) URL before clients can download it.
