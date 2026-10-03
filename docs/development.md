# Development

Requires Node 24+, pnpm 11+ and network access for dependency installation. `pnpm install` uses the lockfile. `pnpm-workspace.yaml` explicitly allows Electron and esbuild installation scripts.

`pnpm dev` builds main/preload, then starts Vite and Electron. `pnpm dev:mock` opens only the simulated UI at `127.0.0.1:5173`. Production never selects mock data automatically when the Electron bridge is absent.

The shared contract is `packages/domain/types.ts`. Add methods to the domain, preload and main with validation and relevant system permission checks. File UI methods take relative paths rather than arbitrary system paths. Native file selectors work only in the desktop.

Use English for code, documentation and canonical diagnostics. [Localization](localization.md) explains the six catalogs, default language and translation tests. New UI text must have all six translations.

`MINEDOCK_DATA_DIR` selects an isolated development/test data folder. `MINEDOCK_TEST=1` hides test windows without replacing real services. Never point tests at gameplay data.

Unit/integration tests do not download files. UI tests use temporary folders; process integration tests use purpose-built Node fixtures. Optional `test:live` downloads a real runtime and Paper into `data/live-smoke`, retains `eula=false` and reaches the consent gate without creating a playable world.

Run `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:ui` and `pnpm build` before contributing. Console history is bounded; full `logs/latest.log` remains in the server folder for archival and diagnostics.
