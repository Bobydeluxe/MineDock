# Native administration gallery — unreleased 0.5.0

These ten PNGs come from the actual compiled Electron application, real preload/core/SQLite and real local files. **They are a development preview, not the public 0.4.1 download or multiplayer gameplay.** [Hashes and per-image provenance](provenance.json).

| View                                           | Source                                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Players](players.png)                         | Isolated stopped QA profile; actual usercache/NBT files                                                                                                        |
| [Player inventory profile](player-profile.png) | Synthetic saved Java DataVersion 5023 read by the production parser; 27 main + 9 hotbar, armor, offhand and Ender Chest slots; verified local Java 26.3 images |
| [Slot inspection](inventory-slot.png)          | Actual fixture item ID/count/components and guarded offline controls                                                                                           |
| [Ender Chest](ender-chest.png)                 | Actual 27-slot saved NBT section                                                                                                                               |
| [Selected-player actions](group-actions.png)   | Exact QA selection/preview; execution unavailable while stopped                                                                                                |
| [Visual item picker](item-picker.png)          | Exact Java 26.3 vanilla registry, localized names and real local client images; search and selected-item preview                                               |
| [Light profile](player-profile-light.png)      | Same real saved fixture; light appearance                                                                                                                      |
| [Compact profile](player-profile-compact.png)  | Native 900 × 760 viewport; internally scrolling profile without grid overflow                                                                                  |
| [World controls](world-controls.png)           | Real isolated Paper 1.21.11 build 132 / Java 21, personally accepted EULA, actual RCON reads, no added plugins or connected players                            |
| [Gamerules](gamerules.png)                     | Actual native 1.21.11 renamed rule values read from that server                                                                                                |

Most captures use a native 1440 × 960 content viewport. Minecraft item images are derived locally from the owner's Modrinth Java 26.3 client, whose complete SHA-1 matches official Mojang metadata. Unknown/custom items retain an explicitly unavailable image and their exact IDs. No extracted source textures or client JARs are distributed. These screenshots document the application's interface; they do not license the underlying game artwork under MIT. See the [asset policy](../../asset-policy.md).

Saved health/items/session values are explicitly synthetic QA data, never evidence of a live client. DataVersion 5023 is deliberately read-only for file edits. Existing supported-version edit/restore tests run separately. Current weather remains unreadable and no toggle is inferred from invented state.

Reproduce with `pnpm build`, set `MINEDOCK_ITEM_ASSET_QA_CLIENT` to your owned Java 26.3 client JAR, then run `node scripts/capture-player-world.mjs --eula-accepted --world-profile <owned-isolated-validation-profile>`. The world profile is produced by `scripts/validate-player-world.mjs` using an already personally accepted EULA and verified Paper/Java inputs. No EULA is accepted implicitly. The helper stops its own world and removes only its own temporary player fixture. Before/after review images are isolated in [clearly labeled design evidence](../../design/item-assets-050/README.md).
