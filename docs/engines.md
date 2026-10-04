# Engine and runtime guide

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
