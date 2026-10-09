# Mod management

Open Mods on a Fabric, Forge or NeoForge server. Discover, Installed and Updates are the three views. The default catalogue search includes only server-side projects for that engine and Minecraft version. Advanced filters can show other versions/loaders/environments; installation still requires a compatible dedicated-server version.

## Install and dependencies

Install chooses the newest compatible stable JAR, then opens one review of the mod and named dependencies. Required dependencies are installed together in dependency order. Optional and embedded dependencies are informational; incompatible dependencies block a conflicting selection. Exact required version constraints, cycles and filename collisions are checked. Download paths cannot overwrite manual files.

The entire folder is prepared beside the original, every download is bounded and hash verified, and file swaps and SQLite records share the existing recoverable operation journal. Failures and cancellation preserve original installed files and records. Minecraft is not launched by a mod install.

## Installed mods and updates

Installed cards show version, Minecraft/loader, state, provenance and locks. The actions menu offers details, version selection, lock/unlock, reversible enable/disable, file reveal, archived rollback, dependencies and uninstall. Multiple selections share one confirmed transaction. All file mutations require the server to be stopped.

Check updates explicitly. Stable compatible releases are looked up in hash batches of 100; old installed records acquire their official file hashes through batched version metadata. Update all excludes locked versions in the backend as well as the UI. Individual updates may change a locked version. Updates archive old binaries; the history setting keeps 1–20 versions, default five. Rollback verifies the archived hash and the recorded server requirements. Safety backups have their own retention policy.

Uninstall keeps dependencies still referenced by remaining mods. Only automatic dependencies with no remaining references are offered as optional extra removals. Mod configuration directories and manual files are kept. Operations are saved in local SQLite history.

## Favorites, collections and manual files

Favorites require no account. Save selected installed mods, or the complete installed set, as a local collection. Each destination server resolves compatible versions before confirmation, falling back from an incompatible saved version only with a visible review.

Scan the folder on demand. Bounded JAR metadata reads identify Fabric/Forge/NeoForge names and identifiers without extraction or execution. Local scans/hash results are reused by file size and modification time. Manual JARs can be disabled reversibly using the tracked filename plus a .disabled suffix. An explicit hash identification may associate an exact compatible Modrinth binary; files are never silently adopted, overwritten or removed.

## Health and migration

The Mods page summarizes missing files, managed file changes, known Minecraft/loader mismatches, dependency conflicts, duplicate identifiers and unreadable archives. The same local check runs before every supervisor start, including automatic starts, restart recovery and scheduled starts. Certain critical problems block startup; unknown manual compatibility is a warning.

Advanced Minecraft/loader migration first analyzes compatible, replaceable, incompatible and manual mods. Resolve incompatible/manual records before migration. The engine, runtimes and replacement mods are prepared after a safety backup; world/configuration files are preserved. The whole server folder and profile commit together. A compatible binary retained during migration receives the destination compatibility metadata. No game version is changed silently.

## Limits

Metadata checks cannot prove arbitrary JAR code safe or predict every runtime conflict. Unknown or complex embedded mod metadata can require manual review. Minecraft/loader migration refuses unidentified manual mods rather than guessing their replacements. Actual game/client sessions and exhaustive historical loader compatibility remain separate from file/SQLite/API validation.

Local inventory, toggles, pins, history and uninstall remain available offline. Cached catalogue information is labeled; new downloads require connectivity. Search pages contain 24 projects, installed pages 30 cards; images use the existing bounded raster cache.

See [catalogues](marketplaces.md), [imports](import.md), [recovery](recovery.md) and [validation](validation.md).
