# Minecraft item images — unreleased MineDock 0.5.0

MineDock's code is MIT. Minecraft game textures, models, names and other game content are not relicensed by this repository. MineDock is an independent community tool, not an official Minecraft product, and is not approved by or associated with Mojang or Microsoft.

## Delivery decision, reviewed 10 October 2026

The [Minecraft EULA](https://www.minecraft.net/en-us/eula) retains ownership of game content and restricts distribution of game files. The [Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) also reserve asset rights and prohibit redistributing game files. These terms do not establish a general texture-redistribution licence for MineDock. **Our implementation choice is private local derivation from the user's own client**, rather than distributing extracted game assets. This is a conservative project interpretation, not an endorsement or a legal opinion.

The owner's [minecraft-assets reference](https://github.com/InventivetalentDev/minecraft-assets) describes extracted client resources. The [mcasset.cloud software licence](https://github.com/InventivetalentDev/mcasset.cloud/blob/main/LICENSE) is MIT for that software; it does not relicense Mojang's extracted art. MineDock neither scrapes mcasset.cloud nor downloads its textures in production.

No raw Minecraft texture/model/language bundle, client JAR or pre-rendered game-icon library is checked into Git, put into an installer, or uploaded as a release asset. Review screenshots show the running MineDock interface and explicitly identified saved-data fixtures. Their embedded game thumbnails remain Minecraft content; the MIT code licence does not grant separate extraction or reuse rights.

## User workflow and provenance

In a Java inventory or item browser, choose **Find local Minecraft client**. MineDock checks conventional Minecraft/Modrinth locations for the **exact server release ID**, then offers a native JAR chooser. It reads the archive's `version.json`, finds that exact release in Mojang's official HTTPS manifest, and verifies the full client against its official SHA-1. It does not launch the client, install an additional server, accept an EULA, inspect launcher accounts, or write into the launcher installation. First registration requires access to official metadata. Already registered clients and cached images work offline.

The private profile stores at most 32 version/path/hash registrations. Models and textures are read on demand from these archives; the whole game is never copied into MineDock. Locally installed language objects are bounded, path-contained and checked against their indexed SHA-1. Missing translations fall back to the exact client's English name and exact ID. A manually chosen standalone JAR without an installed language index uses English names.

## Availability is separate from artwork

The [mcmeta project](https://github.com/misode/mcmeta#repository-structure) publishes version-tagged reports generated from official Minecraft data. MineDock uses only the exact `<release>-registries/version.json` and `item/data.json` metadata, validates the reported release and resource IDs, and stores an integrity-checked version-bound envelope. This is trusted community-generated vanilla registry metadata, **not** an official live server/mod registry or an asset licence.

The browser combines that vanilla baseline with IDs actually read from this server's saved player data. Known absent vanilla IDs remain visible as historical observations but are disabled in the browser. Unknown/custom IDs retain their exact data and are marked as requiring server validation. Without registry metadata the browser explicitly remains partial. Texture filenames never create giveable entries. The existing structured command preview and actual native response still determine execution; a mod/datapack can change availability.

## Resolution and supported presentations

The context is `Java + exact Minecraft release + namespace/ID + item components + verified client hash + language + renderer revision`. Fabric loader/installer versions do not replace the Minecraft release ID. There is no fallback to a newer game release. Bedrock and PocketMine do not reuse Java assets or registry data.

The resolver handles the old `models/item` layout and modern `items` presentation definitions separately. Supported paths include inherited generated/handheld flat layers, bounded composite presentations, constant/dye tints, explicit custom potion colours, default presentation potion colours, trim-material selection, and simple cuboid block models with GUI transforms, UVs, textures, depth and face shading. The latter are genuine model renders, not single-face block swatches. Static thumbnails use the exact local client's resources; they are not a complete Minecraft renderer.

Unsupported context-dependent/special entities, rotated model elements/UVs, animated textures, uncertain legacy tinting, potion-effect colour calculation, custom model overrides and unknown mod namespaces use an original neutral question symbol and exact ID. No similar vanilla image is substituted. Player heads, shields, banners, compass/use-state variants and resource-pack/mod-JAR overrides are not claimed generally supported. Glint indication and durability bars require actual parsed enchantments and actual damage/max-damage fields; missing metadata is never inferred from the picture. NBT read/edit permissions do not depend on image availability.

## Bounds and security

The privileged service deduplicates work, renders at most four requests concurrently, limits its queue, keeps at most 512 visual results/negative entries, 32 registry contexts, 18 language contexts and four leased client archives, and switches caches by exact context. Missing resources/registries are negatively cached for 60 seconds. Supported images are 64 × 64 pixels. Source PNGs are decoded with CRC checking, at most 512 × 512 and 512 KiB; JSON, model recursion/elements and ZIP entries are bounded. Client files must be regular, unlinked archives under 150 MiB with a verified official hash. Paths are never extracted from a JAR into arbitrary folders.

The disk cache uses containment checks, atomic writes, a 128 MiB / 5,000-file budget and 90-day expiry. Registrations are retained separately. Metadata requests allow only official Mojang metadata and the fixed mcmeta registry routes, recheck redirects, cap responses at 2 MiB, use 12-second timeouts and one bounded retry, and cancel on shutdown. There are no texture HTTP requests per slot. Renderer IPC supplies a server ID and bounded item state, never an arbitrary path/URL. Images use a narrowly validated `minedock-item://cache/<sha256>.png` protocol, without item data URLs or renderer Internet access. Cache bytes are revalidated before serving. This does not isolate the app from an attacker with the owner's OS/filesystem privileges.

## Validation and release status

The reproducible private probe checks official clients and exact registries for **1.20.1, 1.21.1, 1.21.4 and 26.3**. Those checks do not imply that every historical release or every special item works. The user owns the 26.3 client installed through Modrinth. Older official clients used by the probe stay in ignored QA storage, with hashes recorded rather than game resources committed. Unit tests use original solid-colour QA art, never copyrighted fixtures. The optional native real-art test requires an owned local client and is explicitly skipped when unavailable.

| Exact Java release | Verified vanilla IDs | Ready images in 24 representative cases | Examples and boundaries                                                                                                               |
| ------------------ | -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1.20.1             | 1,255                | 14                                      | Sword, pickaxe, apple, ingot, iron boots and real 3D stone/log/crafting table; mace and sulfur absent                                 |
| 1.21.1             | 1,333                | 15                                      | The same common items plus mace; sulfur absent; uncertain legacy leather/potion/egg tinting remains unavailable                       |
| 1.21.4             | 1,385                | 15                                      | Common flat/3D models plus layered leather, potion and egg presentations; sulfur absent; dynamic bundle/bow/compass unavailable       |
| 26.3               | 1,658                | 17                                      | Common flat/3D items, dyed leather, potion and sulfur model; special head/banner/shield/chest and dynamic variants remain unavailable |

These are **61 successful images out of 96 probes**, not an exhaustive registry render pass. Default presentations do not certify every component variant, custom potion effect, map content, use-state or resource pack. [Exact examples and client hashes](validation-records/0.5.0-item-assets-probes.json).

See [current validation](validation.md), [the player guide](player-world-administration.md) and [native screenshot provenance](screenshots/player-world-050/README.md). This remains PR #9 review work; public downloads are 0.4.1. No 0.5.0 merge, tag, release or replacement of published executables is authorized by this enhancement.
