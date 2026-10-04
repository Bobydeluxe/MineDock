# Development

Requires Node 24+, pnpm 11+ and network access for dependency installation. Use the lockfile. Native package builds and binary probes run on the actual OS/architecture. The project postinstall prefetches Electron; its installer can also be invoked explicitly with `node node_modules/electron/install.js`. Linux GUI tests configure the stock sandbox helper and use a display/Xvfb.

`pnpm dev` builds main/preload and starts Vite/Electron with actual services. `pnpm dev:mock` is an explicitly simulated browser UI. Production never falls back to demo data when the bridge is missing. Restart desktop development after main/preload changes; Vite reloads renderer edits.

New methods require typed DTOs/schemas, preload/main contract entries, sender/origin validation, capability/path/ownership checks and relevant persistence. Reuse existing repository/download/backup/operation services. Use English canonical diagnostics and all six UI translations; external server/plugin text remains original. See [localization](localization.md).

`MINEDOCK_DATA_DIR` selects isolated development/test data. `MINEDOCK_TEST=1` hides test windows; it does not replace production services. Never point tests at real gameplay data. Unit/integration tests use temporary files, HTTP fixtures and inert process fixtures. Full UI tests include explicit demo journeys and actual Electron/backend journeys; packaged tests use the native unpacked application.

External-service tests are opt-in:

```sh
pnpm test:official --catalogs
pnpm test:official --runtimes --content
pnpm test:live
```

Official checks save result JSON under ignored `data/official-validation/PLATFORM-ARCH/`. They query real catalogs, verify/probe actual Java/PHP and can install real Geyser/Floodgate dependencies into an isolated sentinel profile with no Minecraft executable or EULA. A missing native upstream runtime is reported as unavailable, with no x64 fallback. Paper smoke keeps `eula=false`, verifies real downloads and reaches the EULA gate only. None of these is a playable-world/client connection test.

Run install, lint, typecheck, unit/integration tests, UI tests, build, native packaging and packaged tests before release. Test new failure/cancellation/recovery cases when they affect existing data; avoid tests that simply mirror implementation. Record exact native results rather than assuming that a configured matrix has executed successfully.
