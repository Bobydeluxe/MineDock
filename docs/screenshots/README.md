# Native desktop gallery

Current MineDock 0.4.1 review-build captures from the actual compiled Electron application, refreshed on 9 October 2026 for review; public downloads remain 0.4.0. There are **48 current PNGs and a labeled nine-frame GIF**. Storage is isolated, mods are real hash-verified downloads, and other administration records are QA fixtures. Active process/console data comes from an inert Node child, not Minecraft gameplay. Unavailable TPS/MSPT stays unavailable. See [provenance and before/after comparisons](../design/reference-041/README.md).

| View            | Dark                                               | Light / other state                                                                      |
| --------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Dashboard       | [Stopped](dashboard.png)                           | [Light](dashboard-light.png), [active](dashboard-active.png), [empty](desktop-empty.png) |
| First start     | [Onboarding](onboarding-desktop.png)               |                                                                                          |
| Create server   | [Engine step](create-server.png)                   | [Light](create-server-light.png), [review](create-summary.png)                           |
| Server overview | [Stopped](server.png)                              | [Light](server-light.png), [active](server-active.png)                                   |
| Console         | [Stopped](console.png)                             | [Light](console-light.png), [active](console-active.png)                                 |
| Console tools   | [Historical log search](console-history.png)       | [Custom macro](console-macro.png)                                                        |
| Mods            | [Installed](mods.png)                              | [Light](mods-light.png), [actions menu](mod-menu.png)                                    |
| Plugins         | [Catalogue](plugins.png)                           |                                                                                          |
| Datapacks       | [World catalogue](datapacks.png)                   |                                                                                          |
| Resource packs  | [Catalogue](resourcepacks.png)                     |                                                                                          |
| Players         | [Local records](players.png)                       |                                                                                          |
| Player details  | [Observed sessions and notes](player-details.png)  |                                                                                          |
| Worlds          | [Local metadata](worlds.png)                       |                                                                                          |
| Files           | [File browser](files.png)                          |                                                                                          |
| Backups         | [Verified archive](backups.png)                    |                                                                                          |
| Partial restore | [Exact replacement review](partial-restore.png)    |                                                                                          |
| Migration       | [Assistant](migration.png)                         |                                                                                          |
| Performance     | [Actual unavailable state](performance.png)        |                                                                                          |
| Configuration   | [Graphical options and history](configuration.png) |                                                                                          |
| Notifications   | [Grouped local notices](notifications.png)         |                                                                                          |
| Scheduler       | [Paused daily task](scheduler.png)                 |                                                                                          |
| Settings        | [Dark](settings.png)                               | [Light](settings-light.png)                                                              |
| Runtimes        | [Runtime administration](runtimes.png)             |                                                                                          |
| Import          | [Actual private-folder preview](import.png)        |                                                                                          |

Normal captures share a 1440 × 960 native content viewport. Settings may use a full-page image to include the existing lower sections. Comparison images under `docs/design/before` are historical evidence and are not presented as the current interface. No secrets are displayed.

Additional real candidate views: [Fabric lists](fabric-versions.png), [Paper](paper-builds.png), [Purpur](purpur-builds.png), [Forge](forge-builds.png), [NeoForge](neoforge-builds.png), [general properties](server-settings.png), [light properties](server-settings-light.png), [gameplay](properties-gameplay.png), [network](properties-network.png), [world](properties-world.png). [Named before/after comparison](../design/reference-041/README.md).

## Reproduce the assets

Run `pnpm build`, then `pnpm screenshots`. This launches the actual compiled desktop and uses private data under ignored `data/visual-review`. First use downloads the documented compatible Modrinth files; there is no production demo provider. The fixture child provides real process/console activity but never a Minecraft game session. Capturing needs the native Electron display environment (Xvfb on Linux).

Run `python scripts/build-demo-gif.py` with Pillow available after capturing. It only resizes/encodes these PNGs and adds provenance captions. [The animated gallery](survival-demo.gif) is a slideshow of actual windows, not a continuous screen recording or gameplay video. A continuous recording was not produced in this environment; the captures and reproducible scripts satisfy the visual-demo fallback.
