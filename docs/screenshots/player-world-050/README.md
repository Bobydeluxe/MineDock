# Native administration gallery — 0.5.0

Fourteen captures use the actual compiled Electron app, preload/core/SQLite and local files. **MineDock 0.5.0 interface with explicitly disclosed saved QA data; these captures do not demonstrate multiplayer gameplay.** [Per-image SHA-256 and provenance](provenance.json).

| View                                    | Actual source                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Players](players.png)                  | Isolated stopped QA profile, actual usercache/NBT                                                                          |
| [Inventory profile](player-profile.png) | Synthetic saved DataVersion 5023, 27+9 slots, armor/offhand/Ender Chest; private official Java 26.3 images                 |
| [Item details](inventory-slot.png)      | Actual saved fixture ID/count/components and guarded controls                                                              |
| [Head](head.png)                        | Actual stored official texture property for a fixed QA UUID, never the viewer's skin; legacy skin normalized               |
| [Banner](banner.png)                    | Saved white base, red top stripe and blue border in order                                                                  |
| [Shield](shield.png)                    | Saved red base and ordered patterns; front panel preview                                                                   |
| [Mod item](mod-item.png)                | Actual Adorn 5.0.1-fabric MIT oak-table model, exact Java 1.20.1 private resources; observed ID in synthetic NBT           |
| [Picker](item-picker.png)               | Exact Java 26.3 registry and localized/private images, paged selection                                                     |
| [Ender Chest](ender-chest.png)          | Actual saved 27-slot section                                                                                               |
| [Group preview](group-actions.png)      | Exact QA selection, execution disabled while stopped                                                                       |
| [Light](player-profile-light.png)       | Same disclosed saved fixture, light appearance                                                                             |
| [Compact](player-profile-compact.png)   | Native 900×760 viewport, internal scrolling                                                                                |
| [World controls](world-controls.png)    | Real isolated Paper 1.21.11 build 132 / Java 21, personally accepted EULA, actual RCON reads, no connected players/plugins |
| [Gamerules](gamerules.png)              | Actual native renamed 1.21.11 rule values                                                                                  |

Most views use 1440×960 native content; the Adorn detail uses 1800×1200. Downloaded sources are private, exact-version/hash verified and neither installed nor executed. No raw texture/JAR is distributed. Game thumbnails are not MIT assets; see [rights and coverage](../../asset-policy.md).

The owner explicitly approved publication of these whole-interface captures on GitHub and the existing MineDock site on 10 October 2026. These interface features are included in MineDock 0.5.0.

Saved health/items/session values are synthetic QA, not live player evidence. Future DataVersion 5023 remains read-only; supported-version edit/restore transactions are tested separately. Current weather is unavailable rather than inferred.

Reproduce after build with node scripts/capture-player-world.mjs --official-private --eula-accepted --world-profile <owned-isolated-profile>. This requires actual Java ownership and personally accepted terms, not implicit EULA acceptance. Optional local-client capture remains available. The helper stops only its own server and removes only its temporary fixture. [Historical before/after](../../design/item-assets-050/README.md).
