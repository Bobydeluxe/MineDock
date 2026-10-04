# Architecture

MineDock extends the existing Electron/React/strict TypeScript/Vite/Tailwind/SQLite application. There is one main-process application core and one typed preload contract, with no companion web service or parallel backend. The renderer does not own process, filesystem or download APIs.

## Boundaries

`BrowserWindow` retains `sandbox: true`, `contextIsolation: true` and `nodeIntegration: false`. Main validates the sender, main frame, exact URL and Zod input for every named IPC. Preload unwraps structured results into readable typed errors. Native file/folder choices authorize specific imports/exports; they do not grant the renderer arbitrary filesystem access. Production requires this bridge; demo data is selected only by explicit Vite mock mode.

## Services

- `packages/domain`: capabilities for eight engines, Java/PHP/native runtime types, DTOs/schemas, properties, languages and messages. The renderer and services use the same capabilities.
- `packages/core/app.ts`: service composition, per-server exclusions, preferences, audit and shutdown. Imports, modpacks, worlds, file operations, players and storage reuse the repository, downloads, backups and operation journal.
- `packages/minecraft`: official engine catalogs, artifact resolution, pinned installs and bounded installer processes. Forge and NeoForge resolve their own structures and argument files.
- `packages/runtime-manager`: official native runtimes, real executable/version/architecture probes, repair and usage guards.
- `packages/server-core` and `packages/rcon`: actual subprocess streams, engine readiness, lifecycle, metrics, player observations and authenticated RCON where supported.
- `packages/marketplace`: Modrinth/CurseForge/Hangar catalog providers, Geyser metadata, raster icons and a shared transactional content service.
- `packages/backups`: verified archives, full-server staged restore and journaled retention batches.
- `packages/security` and `packages/networking`: path containment, bounded copies/archives/NBT, secrets, allowed hosts, ports and native architecture checks.
- `packages/updates`: pinned publisher signatures, update state, verified downloads and native installation helpers.
- `apps/desktop/renderer`: capability-aware panels with bundled EN/FR/DE/ES/PT/IT catalogs; CodeMirror loads on demand.

The renderer shares one native dialog wrapper, portaled to `document.body` and opened before paint in the browser top layer. It manages nested body scroll locks, focus, bounded internal scrolling and explicit dismissal. Eight bundled original SVG symbols identify engines across creation, server lists, details and imports. These interface components preserve the same preload/service contracts; see [UI design](ui.md).

## Persistence and transactions

Native Node SQLite uses WAL, foreign keys, busy timeouts and integrity checks. Published migration 1 is unchanged. Versions 2–5 append long operations/checkpoints, partial downloads, content history, players, retention, runtimes, imports, marketplace settings, storage/world history, modpack approvals, authorized exports and retention-batch journals. A WAL checkpoint and database copy precede a schema upgrade; migrations run in transactions. Database snapshots also run at startup and hourly.

Long work persists its kind, status, phase, progress and safe checkpoint paths. Preparation occurs beside the destination. The operation validates ownership, keeps the previous copy, swaps the prepared files and commits profile/content metadata before cleanup. Startup recovery distinguishes prepared from committed states; it rolls back safely or reports attention. Ambiguous copies are preserved for explicit review. Native exports persist their exact authorized destination. Retention journals a group of archive moves and the database commit.

File and database renames are not a distributed transaction. Journals close recoverable interruption windows; impossible or ambiguous states remain blocked and visible. See [recovery](recovery.md).

## Events and shutdown

The existing event bus carries server state, logs, metrics, progress and audit. Console IPC batches every 100 ms, at most 500 lines per server per batch. The renderer retains 5,000 virtualized lines. Active processes are sampled every five seconds, metrics are saved every fifteen seconds and retained seven days. Player session observations are persisted separately from game statistics.

Shutdown stops schedulers/updater checks, cancels long jobs and downloads, waits for pending work, stops servers gracefully, flushes logs and snapshots/closes SQLite. Persisted orphan PIDs are never killed automatically because they may have been reused. Minecraft logs remain external server data.
