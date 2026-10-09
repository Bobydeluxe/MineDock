# MineDock validation

## Charcoal dark-theme refinement, 8 October 2026

Owner feedback refined the dark surfaces, text, borders and overlays to neutral charcoal grays. A before/after computed-style comparison confirms **all 76 light-theme tokens unchanged**, including the console. All ten relevant identity/polish cases pass across the targeted run and isolated rerun; two initial cases had a concurrent test-server port collision and pass when run separately. The visual case checks 23 contrast/focus combinations per theme, eight server states, mod badges, four desktop sizes, focus return and reduced motion. Lint, strict TypeScript, production compilation and unsigned Windows x64 NSIS/portable packaging pass. Backend, layout, languages and public release version are unchanged.

The current local portable x64 SHA-256 is `4e898083d8692677e6bc6aa50b82ec592049002ff31adac9323265fba9620400`; NSIS x64 is `665e22b1b4a4b0c181bc0baee5284640c71436544e44ef454a3205deb8bb6826`. Current-head CI results are available in [PR #6 checks](https://github.com/Bobydeluxe/MineDock/pull/6/checks). Earlier full-suite evidence below describes the initial visual revision before this palette-only refinement.

The 22 current dark captures are refreshed; the six approved light images are retained byte-for-byte. The native before/after record again measures 181 rectangles across 26 views/states with zero differences beyond 0.5 CSS pixels. All 120 checked local documentation links resolve. Active capture views now wait for the real process sampler before recording metrics; this is a QA-tool change only.

## Initial visual identity review, 8 October 2026 (`863c6fc`)

This separate style revision is based on the validated mod-manager branch. The source remains 0.3.1 and no release is published. Windows 11 x64 / Node 24 / pnpm 11.19: local lint and strict TypeScript pass; the full unit run passes **183 cases with four platform-specific skips (187 total in 24 files)**. The final full source UI run passes **25 cases in 3.6 minutes**. The final packaged Windows suite passes **nine actual Electron cases in 3.1 minutes**, against the rebuilt executable after the last semantic badge correction. Production compilation and unsigned Windows x64 NSIS/portable packaging pass. Historical results remain labeled separately below.

The new visual case checks 23 foreground/background or focus combinations per theme, eight server states, mod states, secondary/disabled text, console levels, keyboard focus/return, reduced motion and native-layout boundaries at 760 × 520, 1360 × 900, 1920 × 1080 and 2560 × 1440. Text targets 4.5:1 and focus 3:1. A 4.33:1 light disabled-state contrast was found and corrected; the complete visual case then passed. Existing dialog, first-paint, small-window, nested focus, six-language, wizard and preference regressions are retained.

Native before/after captures measure 181 rectangles across 26 views/states, agreeing in layout properties within 0.5 CSS pixels. The current gallery uses actual Electron/SQLite services and isolated QA records. Mod binaries were actually downloaded and verified; active console/lifecycle data comes from an inert external Node fixture, not Minecraft. No gameplay, interactive OS installation, new six-platform native package matrix or OS signing is claimed. See [design, geometry and capture provenance](design/visual-review.md).

All 28 then-current native images were visually reviewed; eight historical comparison images are retained separately. All 119 checked local documentation links resolve. The public release is still v0.3.0; all twelve public package links return HTTP 200 with their expected content length. The original unsigned preview at `863c6fc` had portable x64 SHA-256 `c23975c97bbb06702c3fd1c5ef0b92e34f09ac0ac06fb27cb70620b5161c46e0` and NSIS x64 SHA-256 `31918b66ccad65a8db9882c96049a7fccc55c7bff8f85ed43b6ca62d1a1d1d0c`. Those local packages are superseded by the charcoal rebuild above; neither revision is uploaded as a release.

## Development mod manager, 4–8 October 2026

The source remains 0.3.1 while review is pending. Windows 11 x64 / Node 24 / pnpm 11.19: lint and strict TypeScript pass; the full unit run passes **183 cases with four OS-specific skips (187 total in 24 files)**. The full source UI suite passes **24 cases**. Windows NSIS and portable x64 compile unsigned; the packaged suite includes **nine actual Electron cases**, including the mod management journey. No new public release or new six-platform packaging matrix is claimed.

The 37 mod-manager cases cover Fabric/Forge/NeoForge JAR transactions; named required and optional dependencies; constraints, conflicts, pins and shared dependency removal; updates and archived rollback; cancellation and failed-batch preservation; manual metadata/hash identification; favorites and destination collections; offline local administration; bounded caches and 300-mod updates in three requests; appended schema-6 upgrade with preserved encrypted RCON secrets and old binaries; rejected retired download hosts; local startup blocking; and whole-server migration preserving world/configuration/property bytes, including comments and line endings, or restoring the old profile/files on failure.

The new UI case exercises search, a recommended version and required dependency install, installed records, locks, collections, explicit update checks, bulk lock exclusion, individual update, archived rollback, optional automatic orphan removal and collection reinstall. Only external API/CDN responses are fixtures. The production preload/core, readable ZIP JAR bytes, downloads, hashes, SQLite, backup service, folder transactions and history run unchanged.

An isolated real Modrinth probe downloaded and SHA-512-verified Lithium `mc1.21.1-0.15.4-fabric`, FerriteCore `7.0.3-fabric` and Krypton `0.2.8` for Fabric 1.21.1 / loader 0.19.5. Local health reported zero problems. The current API environment array format was verified and has a regression. Native catalogue/installed screenshots use this profile without a demo provider. No Minecraft process or game client was run by the probe.

Manual metadata is not exhaustive runtime compatibility evidence. Unknown embedded identifiers are warnings; proven managed missing/exact-version dependencies and corrupted or incompatible files block starts. Migration refuses unidentified manual content. OS certificates, gameplay, native macOS/Linux packages for this source revision and interactive installer execution remain separate validation.

Historical results below describe their exact earlier source/release revisions.

This record distinguishes the **0.3.1 UI source revision** from the published **0.3.0 beta**, both checked on 4 October 2026. Compilation, actual packaged execution, native probes and Minecraft gameplay are separate evidence. The previous 0.2.0 release passed 66 tests and two UI journeys on 3 October; those older checks are not evidence for the extension or UI revision.

## 0.3.1 UI revision

The source fixes viewport centering and first-paint placement in the shared dialog, nested body scroll locks, keyboard focus/return, backdrop dismissal and bounded internal scrolling. It simplifies four-step creation, adds original bundled symbols for eight engines, improves light-theme Start contrast and navigation, and updates all six language catalogs. Unrelated snapshot refreshes preserve unsaved language/theme preferences. See [UI design](ui.md).

Local validation on Windows 11 x64, Node 24 and pnpm 11.19:

| Check                                           | Result                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| ESLint and strict TypeScript                    | Passed                                                                                                 |
| Vitest                                          | 147 passed, 4 platform-specific skips across the full run and the corrected 14-case localization rerun |
| Full Playwright UI suite                        | 23 passed in the final local run                                                                       |
| Packaged Windows x64 UI suite                   | 8 passed in 2.2 minutes against the compiled 0.3.1 executable                                          |
| Production build, Windows NSIS and portable x64 | Passed; version 0.3.1, unsigned                                                                        |

The UI suite includes eight real Electron cases, six existing explicit demo journeys and nine targeted UI cases. Targeted checks measure dialog centering at 480 × 500, 760 × 520, 1024 × 768 and 1920 × 1080, then resizing and internal scrolling; test nested dialogs, footer visibility, body locks, Tab/Shift+Tab, Escape/backdrop and focus restoration; load all eight icons; validate RAM/ports/step focus; submit Forge/NeoForge demo creation; check light-theme contrast, preservation of unsaved preferences and six-language copy. Native Electron separately checks first display and window sizes 760 × 520, 1360 × 920 and 1920 × 1080 against the actual content viewport.

Each language now has **567 UI keys and 408 shared messages**. Nine current renderer captures were visually reviewed in dark/light appearance, including the complete console panel. Two additional native Electron captures show first start and the fresh empty dashboard. Captures disclose explicit demo mode and simulated game data. Existing server imports, worlds, backups, files, players, schedules, runtimes and update behavior remain covered by the existing backend/UI suites. No real Minecraft EULA was accepted for this revision.

The six-platform native execution below belongs to **0.3.0**, not a new 0.3.1 matrix. The latest public download remains 0.3.0; 0.3.1 is an unpublished source revision with a locally compiled Windows x64 package.

The [initial Linux GitHub validation](https://github.com/Bobydeluxe/MineDock/actions/runs/37219775900) at application source `d26461e` passed frozen installation, lint, strict types, a fresh full unit run (**147 passed, 4 OS-specific skips**), production compilation and **all 22 then-existing UI cases** under Xvfb. Its independent push validation passed as well. A later repeat exposed an intermittent loss of a draft language selection. A deterministic regression reproduced it: an unrelated snapshot refresh reset unchanged persisted preferences over the form draft. The renderer now compares persisted values before synchronizing. The new regression and six-language journey both pass. Current-head CI results are available in [PR #4](https://github.com/Bobydeluxe/MineDock/pull/4/checks). These are source-build/Electron checks, not a newly packaged six-platform 0.3.1 matrix.

## 0.3.0 beta: local final checks

Native workstation: Windows 11 x64, Node 24, pnpm 11.19.

| Check                                     | Result                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| Frozen dependency installation            | Passed                                                       |
| ESLint                                    | Passed                                                       |
| Strict TypeScript                         | Passed                                                       |
| Vitest                                    | 147 passed, 4 platform-specific skips; 151 cases in 23 files |
| Production main/preload/renderer build    | Passed                                                       |
| Windows NSIS and portable x64 compilation | Passed; unsigned                                             |
| Full UI suite                             | 13 passed in final local run                                 |
| Packaged Windows suite                    | 7 passed in final local run                                  |

The catalogs contain **541 UI keys and 408 shared messages in each of six languages**. Tests verify matching keys/placeholders, canonical and legacy French diagnostics, preference persistence and composed crash explanations. Unknown external errors/console output remain original.

## 0.3.0 beta: native platform matrix

The [native distribution workflow](https://github.com/Bobydeluxe/MineDock/actions/runs/37210682159) at source `a0363174` passed on **all six native targets**, including installation, lint, types, units, opt-in official catalogs/runtime/content checks, real Paper eula=false bootstrap, package compilation, seven packaged Electron cases and publisher-signed update metadata generation.

| Platform / architecture   | Configured | Compiled        | Actually executed | Automated packaged cases |
| ------------------------- | ---------- | --------------- | ----------------- | ------------------------ |
| Windows x64               | Yes        | NSIS + portable | Yes               | 7 passed                 |
| Windows ARM64             | Yes        | NSIS + portable | Yes               | 7 passed                 |
| Linux x64                 | Yes        | AppImage + deb  | Yes, Xvfb         | 7 passed                 |
| Linux ARM64               | Yes        | AppImage + deb  | Yes, Xvfb         | 7 passed                 |
| macOS Intel x64           | Yes        | dmg + zip       | Yes               | 7 passed                 |
| macOS Apple Silicon ARM64 | Yes        | dmg + zip       | Yes               | 7 passed                 |

Execution uses the packaged native unpacked application and actual main/preload/SQLite/filesystem services. It does not mean NSIS/deb/dmg were interactively installed into the runner OS. Windows/Apple packages are unsigned; no certificate/keychain trust/notarization claim is made. The renderer sandbox and context isolation remain enabled; Linux uses the stock privileged sandbox helper under Xvfb.

The [Validate workflow](https://github.com/Bobydeluxe/MineDock/actions/runs/37210679775) also passed installation, lint, types, units, production build and all thirteen UI cases under Linux Xvfb. Platform-specific unit skips reflect tests for another OS, not silently unsupported architectures. Native helper tests cover actual contained Unix links, macOS aliases, Windows short-path aliases and inert Windows/AppImage/macOS update replacements/rollback.

## Automated feature and regression coverage

Backend tests cover schema-1 data/secret preservation through appended migrations; secure IPC/paths/archives; hash/redirect/resumable downloads; interrupted directory/native-file exchanges and reviewed recovery; pinned engines and runtime architecture; mods/providers/dependency conflicts/history/rollback; Geyser YAML/ports; imports and mrpack retry; real Java/Bedrock NBT/dimension metadata; file actions/YAML/ZIP; persisted actual player observations/lists/statistics; storage scans; cron/timezones/missed deadlines; retention previews/manual protection/interrupted batches; and signed-update wrong-key/tamper/expiry/version/URL/architecture/cache checks.

Existing process/RCON/crash/backups/restore/trash/settings/theme/language flows remain covered. Purpose-built inert executables and temporary worlds are not playable Minecraft installations. Production has no demo fallback.

Thirteen UI cases include real Electron onboarding/languages/restart/isolation, files/editor/ZIP, player/storage administration, Java dimension actions, Bedrock world import, recovery/retention and optional-update refusal/persistence. Explicit demo journeys exercise Paper/Fabric creation, original-server preview/import, daily scheduling, world actions and mrpack preview. The packaged suite selects seven actual Electron cases; demo data never enters production.

## Actual official services and native probes

Opt-in official checks query real Vanilla/Paper/Purpur/Fabric/Forge/NeoForge/PocketMine catalogs and BDS where upstream supports the native OS/architecture. The known stable Java test selection is Minecraft 1.21.11. Selected results include Paper build 132, Purpur 2568, Fabric loader 0.19.5/installer 1.1.2, Forge 61.2.1, NeoForge 21.11.45, BDS 1.26.52.3 and PocketMine release 5.44.3 (Bedrock game version 1.26.30).

Official Temurin Java 21 is downloaded, checked and executed for a version/architecture probe on all six targets. Official PocketMine PHP 8.2.30 ZTS is hash-verified/probed on available native targets. Linux/Windows ARM64 report the unavailable official PHP asset rather than downloading x64. Native Linux/macOS extension paths are resolved explicitly before the PHP probe/server launch.

Real Hangar metadata/icons and Geyser/Floodgate/ViaVersion downloads are exercised in isolated sentinel profiles without any Minecraft executable/EULA. Checks verify hashes, managed records, YAML/UDP settings and an unchanged world sentinel. This validates a real content transaction, not a Java/Bedrock client connection.

`test:live` downloads/verifies Java and Paper 1.21.11 build 132, executes the real bootstrap and stops at **eula=false**. The checked JAR SHA-256 is `5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba`. No real EULA is accepted and no playable world is created. Results are stored in ignored `data/official-validation/PLATFORM-ARCH/result.json` / `data/live-smoke/result.json` and opt-in CI artifacts.

## Published release and actual update feed

[MineDock 0.3.0 beta](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.3.0) is published with twelve tested native installers, six publisher-signed metadata files, the feature text and SHA256SUMS. Every uploaded asset was checked against its GitHub SHA-256/size before publication.

After publication, the actual UpdateService verified the public feed for all twelve OS/architecture/package combinations against the embedded publisher key. An isolated verifier host with comparison version 0.2.0 downloaded the real Windows x64 portable release and checked its signed size/SHA-256 again through installationFile(). This is a comparison/download test, not a claim that an old 0.2.0 client upgraded itself. The current 0.3.0 host correctly reports no newer update. No installer or Minecraft executable was launched by this check. Results are in ignored data/public-update-validation/result.json.

## Unvalidated external conditions and limits

- Real client gameplay, ready/save/stop behavior across every upstream engine/version, Bedrock crossplay and Internet/firewall connectivity need owner consent and actual clients.
- Authenticode and Apple Developer ID/notarization/stapling trust require currently absent owner certificates/credentials. Configuration and unsigned native packaging are tested.
- Actual newer-version installation/relaunch through each OS installer remains separate from the validated public feed/download and native helper fixtures. The legacy unsigned release is refused correctly.
- Interactive NSIS/deb/dmg installation, OS keychain behavior, sleep prevention on every OS, extended very-large-server/disk-full/power-loss load tests and independent security review remain unvalidated.

Nonfatal build output currently includes an upstream Zod annotation warning and a renderer chunk-size warning. These do not disable checks; the editor is split into a lazy chunk. License and third-party notices ship in each package.
