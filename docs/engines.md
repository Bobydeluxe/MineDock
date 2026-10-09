# Engine and runtime guide

The unreleased 0.5.0 [player/world administration guide](player-world-administration.md#engine-and-version-boundaries) describes native command availability and inventory boundaries separately from installation support. All eight engines remain available; Java NBT storage is never assumed for Bedrock or PocketMine.

| Engine                   | Edition / runtime          | Managed content                                 | Important limits                                                              |
| ------------------------ | -------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Vanilla                  | Java / Temurin             | No marketplace plugins/mods                     | Official Mojang release metadata and Java requirement                         |
| Paper                    | Java / Temurin             | Bukkit/Spigot/Paper plugins                     | Stable pinned Paper builds; Paper Java recommendations                        |
| Purpur                   | Java / Temurin             | Compatible Paper/Bukkit plugins                 | Official Purpur builds, shown as Purpur                                       |
| Fabric                   | Java / Temurin             | Fabric server mods                              | Separate loader and installer selections                                      |
| Forge                    | Java / Temurin             | Forge server mods                               | Official Java installer, generated libraries/argument files                   |
| NeoForge                 | Java / Temurin             | NeoForge server mods                            | Separate official catalog/version mapping and generated arguments             |
| Bedrock Dedicated Server | Bedrock / native binary    | No Java plugin marketplace                      | Official Windows/Linux packages, currently x64; no macOS/ARM fallback         |
| PocketMine-MP            | Bedrock protocol / PHP ZTS | Manually supplied compatible PocketMine plugins | Release number differs from supported Bedrock version; upstream support ended |

The capability registry controls runtime/heap fields, mods/plugins, crossplay, RCON, properties, worlds and players. Bedrock/PocketMine do not display Java heap controls. A native runtime package must match the current architecture; absence is reported rather than silently installing x64 on ARM64.

Minecraft Java metadata supplies Java requirements. Historical fallback mappings and Paper recommendations are separate. Managed Temurin supports versions 8/11/16/17/21/25 when official native packages exist. PocketMine reads its release `build_info.json`, provisions the specified official PHP minor release, requires ZTS and checks the actual executable architecture/version. Repair stages verified files; running/referenced-runtime guards apply to replacement/deletion.

Installation pins the resolved build/loader/installer before downloading. Forge/NeoForge installers run with captured output, cancellation and a timeout in the prepared server folder. Launch uses generated arguments rather than pretending every engine is `java -jar server.jar`. Native Bedrock uses its executable; PocketMine uses PHP and its PHAR. Incomplete installations cannot start; retry uses the recorded selections.

Crossplay uses compatible Geyser/Floodgate distributions for Paper/Purpur, Fabric and NeoForge when upstream supports the chosen game version. Forge is not offered an incompatible variant. Geyser releases may be labeled beta by upstream. Configuration preserves existing YAML and Java online-mode, reserves UDP and takes a safety backup. An installed/configured crossplay service is not proof of a Bedrock client connection.

As checked on 4 October 2026, [PocketMine-MP upstream](https://github.com/pmmp/PocketMine-MP) has announced end of support. Its final selected release 5.44.3 reports Minecraft Bedrock 1.26.30, while the checked BDS catalog reports 1.26.52.3. These are observations from the official catalog check, not interchangeable version numbers. Availability can change; the app queries upstream and reports failures.

See [validation](validation.md) for actual OS/runtime results. Automated installer/lifecycle fixtures are not gameplay validation or a guarantee that all historical engine versions work.

## Full catalogs in MineDock 0.4.1

Official catalogs pass through validated IPC into the same create/migration picker. One-hour memory/disk cache preserves timestamps; refresh explicitly retries upstream and a saved offline fallback is labeled. No fixed top-N filter is applied to engine builds or Fabric installers. PocketMine follows upstream release pagination. BDS only offers the current officially linked OS binary; historical Microsoft binaries are not invented.

Fabric uses https://meta.fabricmc.net/v2/versions/game, /loader/{minecraft} and /installer. Loader and installer are selected independently and retained in the profile and exact build identity loader@installer. Upstream stable flags determine badges; false can also describe an older release. Paper uses the Fill v3 version/build endpoints and STABLE channel for the beginner recommendation; explicitly selected listed builds remain exact. Purpur uses its v2 version/build lists; Forge and NeoForge use complete official Maven metadata, preserving full build IDs. Their recommendation policy excludes named alpha/beta builds and is not an upstream certification. Vanilla release/snapshot options come from Mojang's manifest; runtime and server hash come from that version's metadata.

Changing Minecraft retains a loader/installer choice until the catalog proves it compatible, otherwise asks for review. Paper/Purpur build IDs are scoped to Minecraft and reset when that scope changes. The selected build is passed into the actual installer, retry and migration plan; no automatic Minecraft/world upgrade is introduced.

The 9 October live probe found 253 Fabric loaders and 67 installers for Minecraft 1.21.11; 92 Paper, 33 Purpur, 31 Forge and 45 NeoForge builds for that game version; 349 stable PocketMine releases. Counts are dated observations, not hardcoded UI data. [Validation](validation.md) records the exact older Fabric installer/loader execution and hashes.
