# Native administration gallery — unreleased 0.5.0

These nine PNGs come from the actual compiled Electron application, real preload/core/SQLite and real local files. **They are a development preview, not the public 0.4.1 download or multiplayer gameplay.** [Hashes and per-image provenance](provenance.json).

| View                                           | Source                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Players](players.png)                         | Isolated stopped QA profile; actual usercache/NBT files                                                                             |
| [Player inventory profile](player-profile.png) | Synthetic saved Java DataVersion 4671 read by the production parser; 36+4+1+27 actual mapped slots                                  |
| [Slot inspection](inventory-slot.png)          | Actual fixture item ID/count/components and guarded offline controls                                                                |
| [Ender Chest](ender-chest.png)                 | Actual 27-slot saved NBT section                                                                                                    |
| [Selected-player actions](group-actions.png)   | Exact QA selection/preview; execution unavailable while stopped                                                                     |
| [Light profile](player-profile-light.png)      | Same real saved fixture; light appearance                                                                                           |
| [Compact profile](player-profile-compact.png)  | Native 900 × 760 viewport; internally scrolling profile without grid overflow                                                       |
| [World controls](world-controls.png)           | Real isolated Paper 1.21.11 build 132 / Java 21, personally accepted EULA, actual RCON reads, no added plugins or connected players |
| [Gamerules](gamerules.png)                     | Actual native 1.21.11 renamed rule values read from that server                                                                     |

Most captures use a native 1440 × 960 content viewport. Unavailable skins use the truthful fallback; item symbols do not pretend to be Minecraft textures. Saved health/items/session values are explicitly QA data, never evidence of a live client. Current weather remains unreadable and no toggle is inferred from invented state.

Reproduce with `pnpm build`, then `node scripts/capture-player-world.mjs --eula-accepted --world-profile <owned-isolated-validation-profile>`. The world profile is produced by `scripts/validate-player-world.mjs` using an already personally accepted EULA and verified Paper/Java inputs. No EULA is accepted implicitly. The helper stops its own world and removes only its own temporary player fixture.
