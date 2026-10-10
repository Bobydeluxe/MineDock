# Architecture

MineDock extends the existing Electron/React/strict TypeScript/Vite/Tailwind/SQLite application. There is one main-process application core and one typed preload contract, with no companion web service or parallel backend. The renderer does not own process, filesystem or download APIs.

The 0.5.0 development branch adds typed administration DTOs/Zod schemas and shared version-aware command builders. `AdministrationService` reuses the existing supervisor, player reports, exclusive server locks, operations and backups. `PlayerInventoryService` uses a bounded lossless NBT/SNBT parser, verified stopped-only transactions and startup journal reconciliation. Migration 12 adds local administration events, player safety copies and transaction journals without rewriting existing server/settings/player/task data. Native help discovery is non-destructive and cached; unrecognized responses never establish success or fabricate current values. [Detailed boundaries](player-world-administration.md).

## Boundaries

`BrowserWindow` retains `sandbox: true`, `contextIsolation: true` and `nodeIntegration: false`. Main validates the sender, main frame, exact URL and Zod input for every named IPC. Preload unwraps structured results into readable typed errors. Native file/folder choices authorize specific imports/exports; they do not grant the renderer arbitrary filesystem access. Production requires this bridge; demo data is selected only by explicit Vite mock mode.

## Services

- `packages/domain`: capabilities for eight engines, Java/PHP/native runtime types, DTOs/schemas, properties, languages and messages. The renderer and services use the same capabilities.
- `packages/core/app.ts`: service composition, per-server exclusions, preferences, audit and shutdown. Imports, modpacks, worlds, file operations, players and storage reuse the repository, downloads, backups and operation journal.
- `packages/minecraft`: official engine catalogs, artifact resolution, pinned installs and bounded installer processes. Forge and NeoForge resolve their own structures and argument files.
- `packages/runtime-manager`: official native runtimes, real executable/version/architecture probes, repair and usage guards.
- `packages/server-core` and `packages/rcon`: actual subprocess streams, engine readiness, lifecycle, metrics, player observations and authenticated RCON where supported.
- `packages/marketplace`: Modrinth/Hangar catalog providers, Geyser metadata, raster icons and a shared transactional content service.
- `packages/items`: exact-release generated registry metadata, verified private-official/local-client and licensed mod/pack archive readers, inherited presentation/model resolution, bounded PNG decoding/compositing/software 3D rendering, language lookup and deduplicated private caches.
- `packages/backups`: verified archives, full-server staged restore and journaled retention batches.
- `packages/security` and `packages/networking`: path containment, bounded copies/archives/NBT, secrets, allowed hosts, ports and native architecture checks.
- `packages/updates`: pinned publisher signatures, update state, verified downloads and native installation helpers.
- `apps/desktop/renderer`: capability-aware panels with bundled EN/FR/DE/ES/PT/IT catalogs; CodeMirror loads on demand.

The renderer shares one native dialog wrapper, portaled to `document.body` and opened before paint in the browser top layer. It manages nested body scroll locks, focus, bounded internal scrolling and explicit dismissal. Eight bundled original SVG symbols identify engines across creation, server lists, details and imports. These interface components preserve the same preload/service contracts; see [UI design](ui.md).

The visual identity centralizes material/color/radius/focus/motion tokens in `apps/desktop/renderer/src/tokens.css`. Existing layout rules and responsive breakpoints remain in `style.css`. Presentation-only classes expose existing mod states; editor token categories use theme colors. The historical visual change introduced no new IPC, business service, database migration or runtime UI dependency. Native QA captures and labeled before/after evidence are described in [visual review](design/visual-review.md).

## Persistence and transactions

Native Node SQLite uses WAL, foreign keys, busy timeouts and integrity checks. Published migration 1 is unchanged. Versions 2–5 append long operations/checkpoints, partial downloads, content history, players, retention, runtimes, imports, marketplace settings, storage/world history, modpack approvals, authorized exports and retention-batch journals. A WAL checkpoint and database copy precede a schema upgrade; migrations run in transactions. Database snapshots also run at startup and hourly. Migration 6 appends catalogue caches, favorites, collections and mod operation history; it removes the retired credential and preserves retired catalogue records as local content. Published migrations 1–5 are unchanged.

The deterministic mod planner resolves exact versions and required dependency constraints before issuing a short-lived, server-bound review token. Applying that token rechecks inventory identity, verifies existing files and uses the shared content transaction for the entire batch. Renderer plans cannot supply download URLs, paths or arbitrary metadata. Required dependency references, automatic provenance and version locks persist with the installed record. API metadata caches are bounded in SQLite; local metadata/hash scans are bounded and reused by file size/time. Updates use the official hash batch endpoint in groups of 100.

Long work persists its kind, status, phase, progress and safe checkpoint paths. Preparation occurs beside the destination. The operation validates ownership, keeps the previous copy, swaps the prepared files and commits profile/content metadata before cleanup. Startup recovery distinguishes prepared from committed states; it rolls back safely or reports attention. Ambiguous copies are preserved for explicit review. Native exports persist their exact authorized destination. Retention journals a group of archive moves and the database commit.

File and database renames are not a distributed transaction. Journals close recoverable interruption windows; impossible or ambiguous states remain blocked and visible. See [recovery](recovery.md).

## Events and shutdown

The existing event bus carries server state, logs, metrics, progress and audit. Console IPC batches every 100 ms, at most 500 lines per server per batch. The renderer retains 5,000 virtualized lines. Active processes are sampled every five seconds, metrics are saved every fifteen seconds and retained seven days. Player session observations are persisted separately from game statistics.

Shutdown stops schedulers/updater checks, cancels long jobs and downloads, waits for pending work, stops servers gracefully, flushes logs and snapshots/closes SQLite. Persisted orphan PIDs are never killed automatically because they may have been reused. Minecraft logs remain external server data.

## Friends survival services (0.4.0)

The same core/preload contract now composes world-scoped pack transactions, bounded health/notices, observed player sessions, incremental snapshots, migration/clone plans, historical log search/macros, performance aggregation, configuration history/maps/reachability and portable packages. These are main-process services, not renderer filesystem capabilities. A reviewed plan is short-lived and bound to the current server/inventory; native selections authorize import/export locations.

Migrations 7–11 append notices, player sessions/notes, incremental manifests, performance/lag samples and encrypted configuration versions. Migrations 1–6 remain byte-for-byte unchanged. Full ZIP backups remain independent from immutable file-object snapshots. Partial restore stages only the selected section and creates a full safety archive first. Packages carry a verified format-1 manifest and selected data; the destination resolves its official engine/runtime and regenerates local identity, ports and secrets.

Notifications are capped at 400 and grouped over fifteen minutes; sustained process thresholds use thirty seconds. Player sessions retain at most 180 days/20,000 records per server. Performance samples are at most one per thirty seconds with seven-day retention and bounded aggregation; lag context is capped at 200 events. Configuration history retains at most ten versions/file, 200/server, 20 MB/server and 90 days. These limits and unsupported measurements are explained in [the evolution ledger](survival-evolution.md).

The public product site is buildless static HTML/CSS using bundled engine symbols and real native captures. `scripts/build-site.mjs` prepares its separate ignored deployment checkout. It exposes no desktop IPC, backend, analytics or private server data.

## Unreleased 0.5.0 item presentation

The actual server edition and `minecraftVersion ?? version` select the context; Fabric loader changes do not select game assets. Availability comes from the exact mcmeta generated registry plus separately marked observed IDs. Artwork comes from explicit official private downloads or optional verified local clients, overlaid with safe permitted mod/pack resources. Old models and modern definitions remain separate. `remote`, `layers`, `modrinth`, `profile`, `special` and `animation` modules extend the existing resolver; no game/mod code runs. The renderer owns no asset HTTP/file parsing and receives only bounded names/status and a hash-addressed `minedock-item` URL. Version/component/language/revision-bound caches never substitute a latest release. Native selection alone selects external paths; the image protocol serves only validated cached PNGs. The existing player-inventory reader, transactions, journal and migration 12 remain the data/safety authority; image caches require no SQLite migration. [Asset policy and numerical bounds](asset-policy.md).

## 0.4.1 catalog, properties and profile paths

Validated EngineCatalogData flows from MinecraftVersionService through typed main/preload IPC into EngineVersionPicker, reused in creation and migration. Cached JSON under the selected data root retains complete official choices and fetch timestamps. Explicit loader/installer/build choices are optional create/migration fields and become the resolved persistent server profile.

PropertiesEditor reads an actual property document plus raw SHA-256. Domain field metadata applies real engine/version gates; only changed values reach AppCore. Saves hold the existing server lock, require a stopped server, validate types/ports/identity, make a full safety backup and encrypted configuration-history entry, recheck the original bytes and atomically patch only edited effective occurrences. Raw file editing remains available.

Native local image selection validates headers and dimensions before decoding, normalizes to at most 128px PNG, and stores the bounded data URL in server-profile JSON. Display-name changes do not touch server.properties or worlds. These optional profile fields need no new SQLite migration; existing schema 1–11, server paths, runtimes, jobs, backup/player/history tables and update trust keys are retained.
