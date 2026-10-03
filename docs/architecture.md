# Architecture and decisions

## Initial state and scope

The repository began empty. V1 implements Java, Vanilla/Paper, native processes, local administration and data protection. Advanced requirements are explicitly tracked in [the roadmap](roadmap.md). No account, cloud or AI assistant is required.

## Electron for V1

The bundled Node main process combines process streams, TCP RCON, runtime extraction, network streaming and SQLite. This avoids an external Node service or a second Rust implementation. The original workspace already had Node 24 and no Rust toolchain. Delivery and testing favored Electron despite its larger memory footprint. React depends on the preload `Api` contract rather than Electron APIs.

The window uses `sandbox: true`, `contextIsolation: true` and `nodeIntegration: false`. Preload exposes only named contract methods, never `ipcRenderer`, `fs`, arbitrary PIDs or execution primitives. Main verifies renderer identity and URL for every call. External pages are never embedded in a privileged renderer.

## Layers

- Domain: DTOs, Zod validation, property parsing, errors, states and language definitions.
- Application: `AppCore` orchestrates services, serializes mutations per server and centralizes audit.
- Infrastructure: processes, downloads, files, SQLite and secrets.
- Presentation: React, six complete language catalogs and themes. Mock data requires the explicit Vite `mock` mode.

`ServerRunner`, `SecretStore`, `BackupStorageProvider` and `MarketplaceProvider` define boundaries for future implementations. V1 providers are concrete; future providers are not empty functions presented as working features.

## Data

Electron embeds native Node SQLite without a separate native module to rebuild. `migrations.ts` holds versioned SQL and `PRAGMA user_version` records the version. `quick_check` checks integrity; a copy precedes migration, followed by a schema transaction. WAL and foreign keys are enabled. A consistent database snapshot is taken on opening and hourly.

Tables store profiles, preferences, archives, tasks, events, metrics, installed content, player history and runtimes. Application code types JSON profiles; time indexes support metric retention. Future remote accounts require their own migrations. Language preferences already stored by earlier versions remain valid.

## Events and load

The bus carries states, logs, metrics, progress and audit. Console IPC sends batches every 100 ms, capped at 500 lines per server per batch. No administrative web server starts. Active processes are sampled every five seconds, metrics persist every fifteen seconds, are aggregated on read and retained seven days. The renderer caps console history at 5,000 lines and virtualizes it. Java retains its own logs on disk.

## Sources

- [Paper Downloads Service](https://docs.papermc.io/misc/downloads-service/): v3 API, identified User-Agent, stable builds and SHA-256.
- [Paper Java requirements](https://docs.papermc.io/paper/getting-started/): recommendations separate from Mojang, including Java 25 for 26.1+.
- [Modrinth API](https://docs.modrinth.com/api/): version/loader/server-side filters and SHA-512.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) and [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

Mojang supplies `javaVersion.majorVersion` in version metadata. Historical mapping is only a fallback.
