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

## Native Windows updater replay

Prepare two actual packaged versions and publisher-signed metadata matching the newer portable's exact bytes. Keep private keys ignored or in the environment. The native QA candidate can use a private later version; do not publish it as a release. Retain the production version/build when preparing that candidate.

```sh
node scripts/validate-native-upgrade.mjs --baseline-version 0.4.0 --baseline-binary release/win-unpacked/MineDock.exe --baseline-portable release/MineDock-0.4.0-Portable-x64.exe --candidate-version 0.4.1 --candidate data/upgrade-candidate/release/MineDock-0.4.1-Portable-x64.exe --metadata data/upgrade-candidate/metadata.json --runtime-dir PATH_TO_VERIFIED_JAVA21_FOLDER
```

The script changes only test transport for exact release-feed/metadata/artifact responses, leaving production signature/hash/install logic active. It launches actual packaged code, waits for native replacement/new-version startup, checks SQLite integrity, identity/settings/backup/runtime references and world/config/backup bytes, then closes its own relaunch. Providing `--runtime-dir` copies a verified Java 21 folder into the isolated profile, probes it before/after and verifies its executable bytes; omitting it tests only a labeled inert runtime reference. Evidence stays in ignored `data/upgrade-validation`. It uses fixed loopback debug ports 9367/9368: run sequentially and never on gameplay profiles.

The public 0.3.0 portable wrapper does not support direct Playwright attachment here. Extract its verified embedded application with the builder's official 7zip tool, provide that unchanged inner binary and retain the original portable as the destination source. `--manual-legacy` is restricted to this baseline, reproduces the old failed launch then executes its prepared helper explicitly. The result records manual intervention and must never be reported as seamless automatic upgrading.

Run NSIS lifecycle validation separately from any other MineDock test/application: the native installer can close MineDock processes. Use an owned isolated installation path, native silent install/uninstall, actual installed launch with `MINEDOCK_DATA_DIR`, and before/after hashes plus shortcut/registry checks. Default user data must be retained; the current NSIS config explicitly sets `deleteAppDataOnUninstall: false`. See [the executed result](validation-records/0.4.0-windows-native.json).

Add `--public-release` to the legacy replay after the release is public to use the real GitHub feed, signed metadata and public download without intercepting transport. Player history/observations/files, enabled/paused tasks and the schema-5 database safety copy are verified explicitly. Use the exact published portable as `--candidate` and its matching metadata.

## Reference design checks

Run pnpm build then pnpm screenshots for actual candidate windows and python scripts/build-demo-gif.py for the labeled screenshot slideshow. pnpm test:official --catalogs probes complete official catalog counts. node scripts/check-fabric-install.mjs executes the explicit 1.21.1 / loader 0.16.9 / installer 1.0.1 pair in ignored isolated validation storage, checks the installer SHA-256 and downloaded server SHA-1, and never launches Minecraft or accepts its EULA. The native reference-desktop test covers reviewed property saving, inherited values, unsaved navigation and persisted local profile images. It is included in pnpm test:packaged.
