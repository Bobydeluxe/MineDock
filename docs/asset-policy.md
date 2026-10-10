# Minecraft item resources — MineDock 0.5.0

MineDock's code is MIT; Minecraft art is not. This independent tool is not approved by Mojang or Microsoft. No client JAR, raw game texture/model/language bundle or pre-rendered icon library is shipped in Git, installers or releases. Screenshots document the interface with disclosed saved-data fixtures; they do not relicense game artwork.

Minecraft's [content-creation guidance](https://help.minecraft.net/hc/en-us/articles/4408934440589-Content-Creation-and-Broadcasting-Terms-of-Use-and-Guidelines) allows community screenshots under its brand/usage conditions. We treat whole-interface review captures as documentation of this Minecraft-related tool, with original UI, source captions and no official endorsement. This does not authorize an extracted texture library or remove separate mod/skin rights.

## Source decision, reviewed 10 October 2026

The [Minecraft EULA](https://www.minecraft.net/en-us/eula) and [Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) retain game-content rights and restrict redistribution. We interpret their personal-use provisions as supporting an owner's explicitly requested official download and private local derivation. This is a project interpretation, not a legal assurance or blanket asset licence. Users must own Java, accept the applicable terms and have rights to additional resources.

The supplied [minecraft-assets mirror](https://github.com/InventivetalentDev/minecraft-assets) exposes extracted resources but establishes no separate permission to redistribute Mojang art. The [mcasset.cloud software licence](https://github.com/InventivetalentDev/mcasset.cloud/blob/main/LICENSE) licenses software, not game textures; its linked service terms could not be conclusively verified. Production does not scrape that service, clone branches or fetch its texture library. [GitHub terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) and [API limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) do not grant asset rights; REST quotas do not guarantee raw/CDN bandwidth.

**No Minecraft installation or launcher is required.** Expand **Download official images**, confirm Java ownership/EULA acceptance, and request the exact server release. Mojang's official manifest identifies `piston-meta.mojang.com` metadata and a content-addressed `piston-data.mojang.com` archive; size and full SHA-1 are checked. The archive stays in MineDock's private cache and is never installed or executed. This guided alternative transfers **one full client resource archive, at most 150 MiB**, then resolves models/textures only on demand. It does not download all game versions, sounds or launcher accounts. First setup needs Internet. **Find local Minecraft client** remains an optional exact-version/hash-verified alternative, without modifying the user's file.

Translations use the verified official asset index and only the requested language object from `resources.download.minecraft.net`, checked by SHA-1. Missing translations fall back to that release's English names and exact IDs. Saved head texture properties use only content-addressed `textures.minecraft.net` PNGs checked by SHA-256. Historical official HTTP skin URLs are upgraded to HTTPS before any request. Arbitrary NBT URLs and substitution with the viewer's skin are forbidden.

## Availability and resource layers

The exact-release [mcmeta registry](https://github.com/misode/mcmeta#repository-structure) is independent of art. Two fixed generated-report routes validate release/IDs and retain an integrity envelope. These community-generated vanilla reports are not a live modded-server registry or asset licence. Only those registry entries and IDs actually observed in this server's saved data populate the picker. Known absent vanilla IDs are disabled; custom/unknown observations still need server validation even when an image exists. Without metadata the list is explicitly partial. Bedrock/PocketMine never reuse Java resources.

Fabric/Forge/NeoForge can inspect installed mod JAR assets with recognized declared licences. No Java/classes are loaded, mod installed or server altered. Server-only/missing/unknown-licence resources keep exact IDs and unavailable images. Metadata licences do not guarantee identical rights for every embedded asset; separate restrictions still apply.

Optional **Mod resources** searches a supplied Modrinth project by exact Minecraft release and loader. It displays licence/version/size and requires consent. Recognized permissive/copyleft SPDX licences are accepted; unknown and all-rights-reserved declarations are refused. Primary archive project/version/URL, size and SHA-512 are verified; cached archives are rehashed. The [Modrinth API](https://docs.modrinth.com/api/) requires an identifiable User-Agent and documents rate limits; [terms](https://modrinth.com/legal/terms) and individual project licences apply. No HTML scraping or CurseForge import occurs.

Real test: [Adorn](https://github.com/Juuxel/Adorn), MIT, project `E6FUtRJh`, version `67OSh58o`, `5.0.1-fabric`, Java 1.20.1. Six actual models render: oak table/chair/drawer, stone torch/platform and trading station. This does not certify all mods or client-only renderers.

**Resource pack** explicitly selects a local ZIP after rights confirmation; its pack format must match a validated release. No server.properties URL is automatically fetched. Effective preview priority: **selected pack > opted-in private Modrinth resources > installed mods in filename order > Mojang base**. Names follow the layers; actual archive SHA-256 enters the image key. This documented preview stack does not claim to know each player's client pack order. Pack/mod/world/inventory/settings files are never overwritten for images.

## Honest rendering coverage

The key includes Java edition, exact release, namespace/ID, actual components, verified client hash, server/resource-layer hashes, language and renderer revision. Old `models/item` and modern `items` schemas are separate; there is no newer-release substitution.

| Category                                       | Coverage             | Boundary                                                                                                                                  |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Generated/handheld items, simple cuboid blocks | Supported            | Inheritance, layers, GUI transforms, UVs, depth/shading; not a full game renderer                                                         |
| Saved player heads                             | Partial              | Actual safe texture properties, 64×32/64×64 skins, legacy hat alpha and 3D front; name/UUID-only profiles unavailable                     |
| Mob heads                                      | Partial              | Skeleton, wither skeleton, zombie, creeper; piglin/dragon geometry unavailable                                                            |
| Banners                                        | Partial              | Actual base dye and ordered legacy/modern patterns, static cloth/pole; maximum 16 patterns                                                |
| Shields                                        | Partial              | Normal/decorated front and real base/patterns; full handle/back geometry not reproduced                                                   |
| Bow/crossbow                                   | Partial              | Neutral inventory bow, actual charged arrow/firework states; no invented pulling state                                                    |
| Compass/clock                                  | Unavailable          | No reliable world direction/time context                                                                                                  |
| Leather/potions                                | Partial              | Known dye/custom RGB and supported default modern presentations; effect-derived potion colour unavailable                                 |
| Trims/bundles/maps                             | Partial              | Supported modern trim palette/material, closed/coloured bundle, map item icon; no invented content selection or terrain                   |
| Animated PNGs                                  | Partial              | Validated .png.mcmeta and first declared representative frame; static preview                                                             |
| Conditional/composite/custom models            | Partial              | Bounded supported selectors and actual custom-model-data branches; unknown predicates, rotated elements/UVs and special engines fall back |
| Glint/durability                               | Supported when known | Static masked glint/bar require actual parsed fields                                                                                      |
| Mod/pack items                                 | Partial              | Safe licensed archives and supported JSON/PNG models; no executable client renderer                                                       |

Unavailable pictures use an original neutral symbol and exact ID. They never establish registry membership, editing permission or command success.

## Bounds, cancellation and offline use

Privileged deduplication, four render workers, one binary transfer at a time, eight queued transfers and 256 pending keys bound work. Server navigation and shutdown abort network requests. Memory/negative caches are bounded, missing entries expire after 60 seconds, and four leased client/resource contexts are retained. Layers refresh after 30 seconds: at most 64 installed JARs, 150 MiB each and 512 MiB inspected per stack.

ZIP reads reject links, traversal, duplicates, encryption and excessive entries; no paths are extracted. PNG CRC, maximum 512×512 pixels/512 KiB, model/JSON depth, elements, frames/durations and pattern limits are enforced. Metadata is capped at 2 MiB; binary reads enforce bytes/time/HTTPS redirects. Structured IPC accepts server/item/project IDs, never arbitrary URLs/paths. The isolated renderer only receives `minedock-item://cache/<sha256>.png`; no art HTTP, remote SVG or downloaded code executes there.

Derived PNG/registry/language/skin files use contained atomic writes, hash-bound provenance, **128 MiB / 5,000 files / 90 days**. Private official/mod archives have a separate **256 MiB** quota. Up to 32 optional local registrations are retained. **Clear image caches** removes app-owned resources/images, preserving servers, SQLite, backups, external client/pack files and installed mods. Refilling deleted official/mod resources needs Internet and consent again. Downloaded archives/local registrations support offline rendering; uncached languages/skins/sources may still require Internet. An attacker with the owner's OS privileges is outside this boundary.

## Actual representative validation

| Exact Java release | Registry IDs | Ready images |
| ------------------ | -----------: | -----------: |
| 1.20.1             |        1,255 |        21/33 |
| 1.21.1             |        1,333 |        22/33 |
| 1.21.4             |        1,385 |        27/33 |
| 26.3               |        1,658 |        28/33 |

**98/132** representative vanilla/component cases render, plus **6/6** real Adorn items. This is a sample, not exhaustive registry coverage. Fresh private official downloads prove no installed game is required. Unit/native UI fixtures use original QA art. Real screenshots separately use private official resources and disclosed saved NBT, not gameplay. See [validation](validation.md), [guide](player-world-administration.md) and [gallery](screenshots/player-world-050/README.md).

Included in MineDock 0.5.0. The owner authorized application publication on 10 October 2026. See [release validation](validation.md) for exact package sources, migration evidence and public integrity checks. Website legal drafts remain separately blocked.
