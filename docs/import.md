# Server, world and modpack imports

## Existing servers

Use the native folder selector. The read-only preview inspects launch artifacts, manifests, libraries/argument files, properties, logs where useful, worlds and manual content. It reports engine/version/loader/entrypoint/runtime requirements, ports and uncertain fields. Correct uncertain values before confirmation. Multiple Forge/NeoForge builds require a selection; a unique referenced argument file can disambiguate them. Critical source metadata is fingerprinted and a changed/expired preview must be repeated.

Copying into MineDock is the default. It leaves the source untouched and prepares a separate folder before registration. Managing the original is an explicit alternative: the original path is recorded as approved, an original byte-preserving archive is made before managed network/RCON changes, and removing its profile retains the external folder. Do not import a still-running source; occupied game/IPv6 ports are checked.

Java EULA consent is never inferred from ownership of a folder. Existing-original management requires already recorded consent in its own EULA file; new explicit consent can be recorded in a prepared copy. Unknown or incompatible entrypoints/architectures are refused rather than guessed.

## Worlds

Choose a folder, ZIP or Bedrock MCWORLD in a native dialog. The preview reads actual Java gzip NBT or Bedrock little-endian level metadata under limits. Known seeds preserve all 64 bits. Edition/layout mismatches, linked paths and unsafe archive entries are rejected. Unknown seed/version information is shown as unavailable.

Java main/nether/end folders are a logical dimension set when associated by name. Import, duplicate, safe rename, select and inactive-world deletion require a stopped server, exact confirmations and a safety backup. Duplication keeps dimensions together and removes Bukkit UUID/session lock reuse. Active worlds cannot be deleted through the world controls. Export uses a journaled atomic native destination and does not expose a RCON secret.

## Modrinth modpacks

The `.mrpack` preview validates format/version/Minecraft/loader, lists required and optional server files, hashes, permitted download hosts and overrides. Client-only files are excluded; the user chooses supported optional files. Quilt/multiple loaders, unsafe paths and blocked required downloads are refused. Archives are limited to 512 MB compressed; file/download/expanded limits are also enforced.

The summary and explicit Minecraft EULA approval precede server creation. Engine, pinned loader, hashed mod downloads and shared/server overrides are prepared together before commit. An approved private archive is retained for complete retry after interruption. Known Modrinth provenance is recorded; files without verified project metadata remain manual, with the manifest retained. Existing configurations/manual files are not arbitrarily removed.

CurseForge pack import is assessed in [marketplaces](marketplaces.md) and is not currently available. Automated tests never install a playable Minecraft fixture or accept a real EULA.
