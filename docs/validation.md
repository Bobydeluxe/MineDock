# MineDock validation

## MineDock 0.4.1 release validation

The current release contains the cleaned black interface and server customization described in [the release notes](release-notes-0.4.1.md). Its exact application/build inputs are `5492f9757477f87be1fd7d0bb90423e38ba95349`; later documentation, website and capture-helper changes do not alter the packaged application. The owner authorized publication on 9 October 2026.

Lint, type checking and build pass. Local Windows tests pass **222 unit/integration cases** (4 OS skips), **29 UI journeys** and **13 packaged journeys**. The [six native jobs](https://github.com/Bobydeluxe/MineDock/actions/runs/37950007485) produced **12 packages**: Windows/Linux x64/ARM64 pass 13 packaged journeys each; macOS Intel/Apple Silicon pass 12 each with one explicit unsupported directory-import skip. Six signed metadata files match the exact package sizes and SHA-256 hashes.

Public asset, checksum, updater and website checks are recorded after publication. The pre-publication evidence below records what was checked before the release; earlier revisions retain their own historical evidence and limitations.

## Historical pre-publication UI cleanup validation — 9 October 2026

**0.4.1 remains an unpublished review build in [PR #8](https://github.com/Bobydeluxe/MineDock/pull/8); public downloads remain 0.4.0.** The cleaned application/build inputs are at `5492f9757477f87be1fd7d0bb90423e38ba95349`. Later documentation, image, website and capture-helper changes do not change these packaged inputs. [Machine-readable cleanup evidence](validation-records/0.4.1-cleanup.json) records the exact source, CI jobs, artifact integrity, public image hashes and update result. Earlier candidate evidence below is historical.

| Check                                       | Actual result                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed locally and in source CI                                                                                                                                       |
| `pnpm test`                                 | Windows: **222 passed, 4 OS skips, 226 total / 38 files**; Linux CI: 221 passed, 5 OS skips                                                                           |
| `pnpm test:ui`                              | **29 passed** locally (6.2m) and in Linux source CI (6.6m)                                                                                                            |
| Local `pnpm test:packaged`                  | **13 passed** (5.6m) on the newly built Windows x64 unpacked application                                                                                              |
| Native Windows and Linux x64 / ARM64        | **13 packaged passes each**, all four jobs successful                                                                                                                 |
| Native macOS Intel / Apple Silicon          | **12 passes + 1 existing directory-import skip each**, both jobs successful                                                                                           |
| Artifacts                                   | **12 packages**, SHA-256 and sizes verified; **six updater metadata signatures** verified against the pinned publisher key                                            |
| Cleanup regression                          | Removed routes/header/labels absent; Settings preferences and acknowledged real notification persist after restart; original server/world/properties remain unchanged |
| Appearance and navigation                   | Neutral dark base RGB channels, both-theme contrast/focus, responsive geometry, dialogs, all six languages, important server pages and creation pass                  |
| Current assets                              | **48 fresh actual Electron PNGs**, a nine-frame labeled slideshow; **17 obsolete comparison PNGs** retired from the current tree                                      |
| Live website                                | Production **Sites version 5**, source `1987aa590bd640f23edf9f69aad9dec82a365b07`; five widths pass; all nine public gallery files match current local SHA-256        |
| Public downloads and keyboard               | **13 distinct 0.4.0 URLs** return HTTP 200/nonzero size; skip link first; 12 visible keyboard focus targets                                                           |
| Actual Windows update                       | Public **0.4.0 → exact new CI portable 0.4.1**: signature/download, native replacement and automatic relaunch pass; schema 11 and SQLite quick-check ok               |
| Current candidate feed                      | Packaged 0.4.1 checks the real public GitHub feed and displays **Up to date**                                                                                         |

[Source CI](https://github.com/Bobydeluxe/MineDock/actions/runs/37949981714) and [all six native jobs](https://github.com/Bobydeluxe/MineDock/actions/runs/37950007485) pass at the recorded application source. Native packages/checksums remain review artifacts; no existing public binary was replaced. The local portable output was initially locked by the owner's open application, so packaging completed with the same distribution configuration in an isolated output directory.

The newest update test uses **controlled transport because 0.4.1 is unpublished**. Production signature verification, exact CI bytes (Windows portable SHA-256 `b3500b19ef6dedba583e855b1921ef9aa7202951749462a76d425922c2f09d87`), replacement/helper/relaunch and data checks are real. Settings, server, world/properties bytes, backup record/archive bytes, runtime reference, players/notes and scheduled task survive. This is not a public 0.4.1 download/update test. Existing 0.3.0 → 0.4.0 migration evidence remains below, including its manual first-upgrade caveat. Backend services and schema migrations were not changed by this cleanup.

The [cleanup review](design/cleanup-041/README.md) explains the relocated notifications/recovery/history controls. [Current native captures](screenshots/README.md) use isolated QA records, actual verified content and an inert process fixture, not Minecraft multiplayer. Windows/Apple publisher certificates, Linux/macOS/ARM64 OS installer/update lifecycles, existing pinned taskbar appearance and live map/gameplay remain unvalidated. Earlier exact NSIS/icon lifecycle evidence below applies to its explicitly recorded earlier candidate bytes.

## Historical reference-design candidate — 9 October 2026

**These results describe the earlier candidate, before the owner's UI cleanup.** App/build inputs were at source `0ebd29526cfd1e1a6d9304ec619b560226143e67`; its following documentation commit did not change those inputs. The newer cleanup changes application code and requires its own evidence. [Machine-readable historical evidence](validation-records/0.4.1-reference.json) records that exact earlier input. At the time of this historical check, the public app was 0.4.0.

| Check                                       | Actual result                                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed; final Windows setup and portable built                                                                                                                                         |
| `pnpm test`                                 | Windows: **222 passed, 4 OS skips, 226 total in 38 files**                                                                                                                             |
| `pnpm test:ui`                              | **28 passed** locally; **28 passed** in source CI                                                                                                                                      |
| Local `pnpm test:packaged`                  | **12 passed** against the final Windows x64 unpacked binary                                                                                                                            |
| Native Windows x64 / ARM64                  | **12 packaged tests passed each**, 222 unit passes + 4 OS skips each                                                                                                                   |
| Native Linux x64 / ARM64                    | **12 packaged tests passed each**, 221 unit passes + 5 OS skips each                                                                                                                   |
| Native macOS Intel / Apple Silicon          | **11 packaged passes + 1 unsupported skip each**, 222 unit passes + 4 OS skips each                                                                                                    |
| Candidate artifact integrity                | **12 native packages**, matching SHA-256/size, **six trusted Ed25519 metadata signatures**; collected locally, not released                                                            |
| Official probes                             | All eight catalog services; native Java 21/PHP; verified Geyser/Floodgate/ViaVersion transactions                                                                                      |
| Real historical Fabric installer            | Minecraft 1.21.1, loader **0.16.9**, installer **1.0.1**, actual official installer CLI and verified Minecraft download                                                                |
| Windows installed app                       | Final NSIS setup installs, launches 0.4.1, saves French settings and preserves world/properties/backup bytes; owned uninstall removes its shortcuts and retains isolated profile files |
| Windows branding                            | ICO resources extracted from setup, portable and installed executable; real native window icon obtained with `WM_GETICON`; Desktop/Start-menu targets and icon locations verified      |
| Appearance/accessibility                    | Both themes; 760×520, laptop/1080p/1440p viewports; status/text contrast, focus contrast, keyboard/dialog return and reduced motion pass                                               |
| Current gallery                             | **48 actual Electron PNGs** and a labeled nine-frame slideshow; seven named before/after comparisons                                                                                   |
| Public website                              | Sites version **4**, source `5969d2b986fb0769bbe823a644ad0e1e70a8a833`, production deployment succeeds; 390/768/1280/1440/1920 widths pass                                             |
| Live links/keyboard                         | 13 distinct public release downloads respond HTTP 200, first skip link and 12 visible keyboard focus targets verified                                                                  |
| Existing 0.4.0 release                      | Description is English; **all 20 asset identities, sizes and digests remain unchanged**                                                                                                |
| GitHub social preview                       | Uploaded through the supported web setting; visually verified after reload                                                                                                             |

[The native distribution workflow](https://github.com/Bobydeluxe/MineDock/actions/runs/37936740596) and [source validation](https://github.com/Bobydeluxe/MineDock/actions/runs/37936740381) both complete successfully at the recorded app source. Native packages are available as CI artifacts for review; no 0.4.1 tag or public release is created. The macOS unsupported skip is the existing native directory-import journey; it is recorded rather than treated as a pass.

### Complete official catalog observations

The dated Windows probe reports 103 Vanilla releases; 55 Paper game versions with 92 builds for 1.21.11; 41 Purpur game versions with 33 builds; 48 stable Fabric game versions, **253 loaders and 67 installers**; 78 Forge game versions with 31 builds; 23 NeoForge game versions with 45 builds; one current BDS 1.26.52.3 binary; and 349 stable PocketMine releases (selected 5.44.3, Bedrock compatibility 1.26.30). These are live observations, not fixed UI limits. Refreshing the final capture's owned Paper cache selects the actually available stable recommendation **26.2** rather than an unavailable default from the earlier QA cache.

The older Fabric installer runs for real, with SHA-256 `62edf170bdcc41edea85d33acf3eb85474258699b3d41f9418d286c836cb088d`. Its generated launcher names loader 0.16.9 and its downloaded Minecraft server matches upstream SHA-1 `59353fb40c36d304f2035d51e7d6e6baa98dc05c`. Neither a Minecraft executable nor a playable world is started; the real EULA is not accepted.

### Actual 0.4.0 → final candidate update

The unchanged executable extracted from the real public 0.4.0 portable verifies the publisher's actual pinned signature and downloads the exact private CI candidate, SHA-256 `990fa2c3fc80a3b4629ae98f76b29c21987b1d1dde74614e52bfe87a4ee80ff6`. Its production native helper replaces the portable and automatically relaunches **0.4.1**, with no manual intervention. Schema remains **11**, SQLite quick-check is **ok** and the installation audit exists. Settings, server, world/properties bytes, backup record/archive bytes, runtime reference, player history/note and scheduled task survive. Existing migration SQL is unchanged; profile images use optional profile JSON fields.

**This is private candidate validation with controlled transport, not a public 0.4.1 release or a public 0.4.1 download test.** Production signature/download/helper checks are real. Separately, the actual final packaged 0.4.1 candidate checks the real public GitHub feed without interception and visibly shows **Up to date**. Historical 0.3.0→0.4.0 public validation below remains applicable with its manual first-upgrade caveat.

The visible state of an existing pinned Windows/taskbar shortcut is not claimed observed. Linux/macOS/ARM64 OS installer/update lifecycles and actual multiplayer/map behavior remain unvalidated. See [the current design comparison](design/reference-041/README.md), [candidate notes](release-notes-0.4.1.md), [security](security.md) and [roadmap](roadmap.md). Public download links still use 0.4.0.

## Release validation — 9 October 2026

MineDock **0.4.0** is the current public version. Release app/build inputs were validated at source `ad876c2b52f2a0b55120a66495ba6f34e5ddb9bc`; later release-documentation commits leave those inputs identical. [Machine-readable release evidence](validation-records/0.4.0-release.json) separates the following results from historical checkpoints below.

| Required check                              | Actual result                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed on local Windows and all six native runners                                                                                                |
| `pnpm test`                                 | Local: **214 passed, 4 OS skips, 218 total / 37 files**; Windows/macOS same; Linux **213 passed, 5 OS skips**                                     |
| `pnpm test:ui`                              | Fresh full run after compatibility fix: **26 passed**, 4.8 minutes; source CI also passes                                                         |
| Local `pnpm test:packaged`                  | **10 passed**, 4.4 minutes                                                                                                                        |
| Native packaged Windows x64 / ARM64         | **10 passed each**                                                                                                                                |
| Native packaged Linux x64 / ARM64           | **10 passed each**                                                                                                                                |
| Native packaged macOS Intel / Apple Silicon | **9 passed + 1 unsupported skip each**                                                                                                            |
| Official downloads on six native hosts      | Real engine catalogs, Java 21 executable probes, available official PHP runtimes and hash-verified Geyser/Floodgate/ViaVersion configuration pass |
| Paper bootstrap on six native hosts         | Reaches the `eula=false` gate; no playable world or multiplayer claim                                                                             |
| Release integrity                           | **12 native packages**, six pinned-key Ed25519 metadata signatures and matching SHA-256/size verified                                             |
| Current screenshots/site                    | **38 real Electron PNGs + nine-frame labeled GIF**, refreshed 9 October; site desktop/mobile local QA passes                                      |

The [six-platform workflow](https://github.com/Bobydeluxe/MineDock/actions/runs/37920061725) completed successfully. Its exact downloaded artifacts are the release inputs. The initial official-content run found a real Geyser compatibility bug: Modrinth's version environment `unknown` was treated as client-only. The corrected fallback requires known project/loader support, still blocks explicit client-only versions, passes its regression and succeeds against the real upstream downloads on all six hosts.

### Upgrade with the exact release portable

The unchanged public **0.3.0** binary loads schema 5, verifies the new publisher signature and downloads the actual release candidate portable, SHA-256 `312dfb650b543ce92b0fe8c86532d6a63fcffe3c5c5a2673b18ca29b10971d91`. On this host its legacy detached launcher fails; explicit execution of its prepared native helper then replaces the executable and genuinely relaunches **0.4.0**. **This is a validated upgrade with a manual recovery step, not a seamless automatic 0.3.0 upgrade.** Normal users should close the old app and open the verified new package under the same OS account, keeping their storage folders/profile.

Schema **5→11** and SQLite quick-check `ok` are verified, including the schema-5 pre-migration database copy. Existing settings, server, world/properties, full-backup record/bytes, runtime reference and executable, SQLite data, player history/observations/files, two scheduled tasks and encrypted RCON secret all survive. Real OpenJDK **21.0.12.1** successfully probes before and after. Published migrations 1–5 and the existing migration 6 remain unchanged. Testing uses owned isolated data; no user server is started or replaced.

### Public follow-up and limits

[Post-publication evidence](validation-records/0.4.0-public.json) verifies the public release titled **MineDock 0.4.0** and its **20 downloadable assets**, all **19 checksum entries** and six public metadata signatures. The Windows x64 portable was downloaded anonymously from its public GitHub URL and matches the exact validated native build by SHA-256/size. Production UpdateService checks all **12 package targets**, verifies the real download again and reports no newer version for 0.4.0. The unchanged actual 0.3.0 application also uses the **real public feed, metadata and download without interception**: it detects 0.4.0, verifies its bytes, reproduces the old launcher failure, then its explicitly executed native helper genuinely relaunches 0.4.0 with schema 5→11 and all listed data preserved. The actual packaged application extracted from the public 0.4.0 portable checks GitHub and visibly shows **Up to date** with no error. Public Sites version **2**, source `59ae38f5625c1ffdf64abffda036df5dfe184855`, passes desktop/mobile image, anchor, overflow, page-error and FAQ/download checks at the production URL. Historical private 0.4.0→0.4.1 QA and isolated NSIS lifecycle evidence are retained below with their own hashes, not represented as the release artifact's OS installation result.

Packages are unsigned by Windows/Apple OS certificates; update metadata signatures are separate. No multiplayer/map-rendering, Linux/macOS/ARM64 OS installation or upgrade lifecycle, JVM heap/swap, Windows ACL/firewall or local UDP/IPv6 inspection is claimed. Incremental deletion/GC and legacy ZIP partial restore remain unavailable; complex configuration structures remain textual; changed pack releases need explicit review before Minecraft migration. See [the complete ledger](survival-evolution.md), [security](security.md) and [roadmap](roadmap.md).

## Historical pre-release candidate — 8 October 2026

At this pre-release checkpoint, source 0.4.0 was under review in [PR #7](https://github.com/Bobydeluxe/MineDock/pull/7), stacked on PR #6/#5. Public downloads were then 0.3.0. Local host: Windows 11 x64, Node 24.19, pnpm 11.25, Electron 44.5.1. Historical results below belong to their stated earlier revisions.

| Final check                            | Actual result                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint / strict TypeScript             | Passed                                                                                                                                |
| Full Vitest regression                 | **213 passed, 4 platform-specific skips; 217 total in 37 files**                                                                      |
| Production main/preload/renderer build | Passed; nonblocking Rollup annotation/chunk-size warnings                                                                             |
| Full source UI suite                   | **26 passed, 4.7 minutes**                                                                                                            |
| Final Windows x64 packaged suite       | **10 passed, 4.4 minutes**, sequentially after all installer work                                                                     |
| Windows NSIS + portable compilation    | Passed; unsigned                                                                                                                      |
| Six language catalogs                  | **849 UI keys each**, matching keys/placeholders; existing shared diagnostics retained                                                |
| Existing migration SQL                 | **1–6 unchanged** against the actual base Git reference; published **1–5 unchanged** against v0.3.0                                   |
| Current native gallery                 | **38 PNGs + one nine-frame labeled GIF**; real Electron with isolated records                                                         |
| Static website local QA                | Desktop 1440 px / mobile 390 px: no overflow, broken images/anchors, page errors or failed requests; FAQ and download navigation pass |

After the final restore/console dialog padding correction, production compilation and the affected native survival journey pass again in both source and packaged Windows (one case each). A final macro-name label correction then passes the 14 localization checks and actual source/packaged dialog assertions. The full-suite counts above describe the build before these final interface refinements. The automatic upgrade replay uses the final portable hash below. NSIS lifecycle and public legacy manual recovery use an earlier build, recorded by hash in the evidence; installer/updater logic is unchanged by the final dialog styling/label correction.

The new native survival journey runs production main/preload/core/SQLite/files: commented YAML edit/history restoration, native local datapack import, persisted player note, hash-verified incremental world-only restore preserving unrelated configuration with a safety ZIP, native `.minedock` export/preview and read-all notices. Existing creation/dialogs/six-language preferences, content plans/updates/rollback, files/worlds/imports/recovery/retention and updater rejection stay covered. External API/CDN fixtures are explicitly controlled; no Minecraft process/client is started by these UI tests.

The [public website](https://minedock-friends.arcane-rhea-3082.chatgpt.site) is deployed from saved Sites version 1, source `d0f39cfd373e663c8022d638b5a0a56105097bc9`. The actual production URL also passes the same 1440/390-pixel image/anchor/overflow/error and FAQ/download checks.

### Actual Windows lifecycle and upgrade

[Machine-readable evidence](validation-records/0.4.0-windows-native.json) records three distinct native paths:

1. **NSIS install / installed launch / uninstall:** native silent installer and uninstaller both exit 0 in an owned isolated installation. The installed app opens and saves a preference. Desktop and Start-menu shortcuts are created then removed, the app and registry entry disappear, and isolated settings/server/world/full-backup bytes remain identical. The pre-existing default user database was read-only fingerprinted and also remains identical. No other installation was uninstalled.
2. **Automatic packaged 0.4.0 → private 0.4.1 QA candidate:** old packaged code verifies the pinned publisher signature and actual portable bytes, starts the production helper, closes, replaces its executable, genuinely relaunches 0.4.1 and records `app.update.installed`. SQLite quick-check is `ok`; settings, server, world/properties, backup record/bytes and runtime reference remain. A real isolated copy of OpenJDK 21.0.12.1 retains its executable hash and successfully runs `-version` afterward. The newer version is only a private test binary; release-feed/metadata/artifact **transport** is controlled, while production updater/signature/hash/native replacement logic runs. At this checkpoint neither new version was publicly released.
3. **Genuine public 0.3.0 → 0.4.0 with manual recovery:** unchanged packaged files extracted from the verified public portable load schema 5 and perform production signed download verification. Its detached-PowerShell launcher fails before its helper runs on this host. The test explicitly executes that prepared native helper, then observes real 0.4.0 startup, schema **5→11**, quick-check `ok`, installation audit and preserved data/actual Java. **This is not a successful automatic legacy upgrade.** A first manual verified-package upgrade is required for users encountering the old launcher failure here.

The Windows fix uses a short hidden bootstrap and native `Start-Process -WindowStyle Hidden` for independent helper/installer lifetime. Native regression tests now use the production launcher, paths with spaces/apostrophes/literal `$`, failed launcher reporting and failed-relaunch rollback. The [replay script/instructions](development.md) reproduce the full application journey with isolated data.

### Candidate hashes and limits

Local final Windows x64 portable SHA-256: `7b516e03e6ff9278abe306eccbf0a8604cad532ebd046368bdeecbd00def9417`.
Local final Windows x64 NSIS SHA-256: `961ce45101780474e8e45c85336b5833cbe9259e793a011c5a18878090e60f3a`.
These earlier local candidate files were not uploaded as a release. [Current GitHub checks](https://github.com/Bobydeluxe/MineDock/pull/7/checks) identify their own exact source head; a configured six-platform matrix is not a new executed 0.4.0 matrix.

No live multiplayer, actual map rendering, other OS install/upgrade, ARM64 lifecycle, OS signing/notarization, JVM heap/swap or Windows ACL/firewall inspection is claimed. Incremental deletion/GC and legacy ZIP partial restore are unavailable. Pack release changes remain an explicit migration prerequisite. New graphical options cover bounded existing YAML/JSON primitives; complex structures remain textual. The GIF is a labeled slideshow of actual captures, not a continuous recording or game video. The security document is an internal developer review, not an independent audit. See [the ledger](survival-evolution.md) and [roadmap](roadmap.md).

## Charcoal dark-theme refinement, 8 October 2026

Owner feedback refined the dark surfaces, text, borders and overlays to neutral charcoal grays. A before/after computed-style comparison confirms **all 76 light-theme tokens unchanged**, including the console. All ten relevant identity/polish cases pass across the targeted run and isolated rerun; two initial cases had a concurrent test-server port collision and pass when run separately. The visual case checks 23 contrast/focus combinations per theme, eight server states, mod badges, four desktop sizes, focus return and reduced motion. Lint, strict TypeScript, production compilation and unsigned Windows x64 NSIS/portable packaging pass. Backend, layout, languages and public release version are unchanged.

The current local portable x64 SHA-256 is `4e898083d8692677e6bc6aa50b82ec592049002ff31adac9323265fba9620400`; NSIS x64 is `665e22b1b4a4b0c181bc0baee5284640c71436544e44ef454a3205deb8bb6826`. Current-head CI results are available in [PR #6 checks](https://github.com/Bobydeluxe/MineDock/pull/6/checks). Earlier full-suite evidence below describes the initial visual revision before this palette-only refinement.

The 22 current dark captures are refreshed; the six approved light images are retained byte-for-byte. The native before/after record again measures 181 rectangles across 26 views/states with zero differences beyond 0.5 CSS pixels. All 120 checked local documentation links resolve. Active capture views now wait for the real process sampler before recording metrics; this is a QA-tool change only.

## Initial visual identity review, 8 October 2026 (`863c6fc`)

This separate style revision is based on the validated mod-manager branch. The source remains 0.3.1 and no release is published. Windows 11 x64 / Node 24 / pnpm 11.19: local lint and strict TypeScript pass; the full unit run passes **183 cases with four platform-specific skips (187 total in 24 files)**. The final full source UI run passes **25 cases in 3.6 minutes**. The final packaged Windows suite passes **nine actual Electron cases in 3.1 minutes**, against the rebuilt executable after the last semantic badge correction. Production compilation and unsigned Windows x64 NSIS/portable packaging pass. Historical results remain labeled separately below.

The new visual case checks 23 foreground/background or focus combinations per theme, eight server states, mod states, secondary/disabled text, console levels, keyboard focus/return, reduced motion and native-layout boundaries at 760 × 520, 1360 × 900, 1920 × 1080 and 2560 × 1440. Text targets 4.5:1 and focus 3:1. A 4.33:1 light disabled-state contrast was found and corrected; the complete visual case then passed. Existing dialog, first-paint, small-window, nested focus, six-language, wizard and preference regressions are retained.

Native before/after captures measure 181 rectangles across 26 views/states, agreeing in layout properties within 0.5 CSS pixels. The current gallery uses actual Electron/SQLite services and isolated QA records. Mod binaries were actually downloaded and verified; active console/lifecycle data comes from an inert external Node fixture, not Minecraft. No gameplay, interactive OS installation, new six-platform native package matrix or OS signing is claimed. See [design, geometry and capture provenance](design/visual-review.md).

All 28 then-current native images were visually reviewed; eight historical comparison images are retained separately. All 119 checked local documentation links resolve. At that historical checkpoint the public release was v0.3.0; all twelve public package links return HTTP 200 with their expected content length. The original unsigned preview at `863c6fc` had portable x64 SHA-256 `c23975c97bbb06702c3fd1c5ef0b92e34f09ac0ac06fb27cb70620b5161c46e0` and NSIS x64 SHA-256 `31918b66ccad65a8db9882c96049a7fccc55c7bff8f85ed43b6ca62d1a1d1d0c`. Those local packages are superseded by the charcoal rebuild above; neither revision is uploaded as a release.

## Historical development mod manager, 4–8 October 2026

At this historical checkpoint, source was 0.3.1 while review was pending. Windows 11 x64 / Node 24 / pnpm 11.19: lint and strict TypeScript passed; the full unit run passed **183 cases with four OS-specific skips (187 total in 24 files)**. The full source UI suite passed **24 cases**. Windows NSIS and portable x64 compiled unsigned; the packaged suite included **nine actual Electron cases**, including the mod management journey. This checkpoint did not include a new public release or a new six-platform packaging matrix.

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

The six-platform native execution below belongs to **0.3.0**, not a new 0.3.1 matrix. At that checkpoint the public download remained 0.3.0; 0.3.1 was an unpublished source revision with a locally compiled Windows x64 package.

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
