# Native desktop gallery

Actual compiled Electron captures, refreshed on 9 October 2026. **Players, Player details and Worlds now show the unreleased 0.5.0 development preview; other baseline views and the historical GIF show public 0.4.1.** The [nine new administration captures](player-world-050/README.md) record exact hashes and provenance: saved player files are synthetic QA, while world values come from a personally authorized real isolated Paper 1.21.11 server with no connected clients or added plugins. The public download remains 0.4.1. Dark surfaces stay neutral black and notifications stay in Settings. Baseline active process views use an inert Node child, not Minecraft gameplay.

| View            | Dark                                                | Light / other state                                                                      |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Dashboard       | [Stopped](dashboard.png)                            | [Light](dashboard-light.png), [active](dashboard-active.png), [empty](desktop-empty.png) |
| First start     | [Onboarding](onboarding-desktop.png)                |                                                                                          |
| Create server   | [Engine step](create-server.png)                    | [Light](create-server-light.png), [review](create-summary.png)                           |
| Server overview | [Stopped](server.png)                               | [Light](server-light.png), [active](server-active.png)                                   |
| Console         | [Stopped](console.png)                              | [Light](console-light.png), [active](console-active.png)                                 |
| Console tools   | [Historical log search](console-history.png)        | [Custom macro](console-macro.png)                                                        |
| Mods            | [Installed](mods.png)                               | [Light](mods-light.png), [actions menu](mod-menu.png)                                    |
| Plugins         | [Catalogue](plugins.png)                            |                                                                                          |
| Datapacks       | [World catalogue](datapacks.png)                    |                                                                                          |
| Resource packs  | [Catalogue](resourcepacks.png)                      |                                                                                          |
| Players         | [Local records](players.png)                        |                                                                                          |
| Player details  | [0.5.0 saved inventory profile](player-details.png) | [Ender Chest and slot inspection](player-world-050/README.md)                            |
| Worlds          | [0.5.0 native controls](worlds.png)                 | [Actual 1.21.11 rules](player-world-050/gamerules.png)                                   |
| Files           | [File browser](files.png)                           |                                                                                          |
| Backups         | [Verified archive](backups.png)                     |                                                                                          |
| Partial restore | [Exact replacement review](partial-restore.png)     |                                                                                          |
| Migration       | [Assistant](migration.png)                          |                                                                                          |
| Performance     | [Actual unavailable state](performance.png)         |                                                                                          |
| Configuration   | [Graphical options and history](configuration.png)  |                                                                                          |
| Notifications   | [History inside Settings](notifications.png)        | Preferences and category toggles remain in Settings                                      |
| Scheduler       | [Paused daily task](scheduler.png)                  |                                                                                          |
| Settings        | [Dark](settings.png)                                | [Light](settings-light.png)                                                              |
| Runtimes        | [Runtime administration](runtimes.png)              |                                                                                          |
| Import          | [Actual private-folder preview](import.png)         |                                                                                          |

Normal captures share a 1440 × 960 native content viewport. Settings may use a full-page image to include the existing lower sections. Older comparison images are retired from the current tree and remain available in immutable Git history. No secrets are displayed.

Additional real 0.4.1 views: [Fabric lists](fabric-versions.png), [Paper](paper-builds.png), [Purpur](purpur-builds.png), [Forge](forge-builds.png), [NeoForge](neoforge-builds.png), [general properties](server-settings.png), [light properties](server-settings-light.png), [gameplay](properties-gameplay.png), [network](properties-network.png), [world](properties-world.png). [Reference and current UI review](../design/reference-041/README.md).

## Reproduce the assets

Run `pnpm build`, then `pnpm screenshots`. This launches the actual compiled desktop and uses private data under ignored `data/visual-review`. First use downloads the documented compatible Modrinth files; there is no production demo provider. The fixture child provides real process/console activity but never a Minecraft game session. Capturing needs the native Electron display environment (Xvfb on Linux).

The administration views use the separate [0.5.0 capture workflow](player-world-050/README.md). Re-run that workflow after the baseline capture command so its affected gallery aliases retain the new player profile and real world controls. Starting the real world portion requires the owner's personally accepted EULA and explicit test authorization.

Run `python scripts/build-demo-gif.py` with Pillow available after capturing. It only resizes/encodes these PNGs and adds provenance captions. [The animated gallery](survival-demo.gif) is a slideshow of actual windows, not a continuous screen recording or gameplay video. A continuous recording was not produced in this environment; the captures and reproducible scripts satisfy the visual-demo fallback.
