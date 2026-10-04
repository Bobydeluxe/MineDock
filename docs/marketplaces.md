# Marketplace providers

Modrinth, Hangar and CurseForge share typed project/version/file/dependency interfaces and the same managed-content transaction layer. Content compatibility is evaluated for the actual server engine, game version and loader; provider names/provenance stay visible.

- Modrinth: plugins and supported server mods, exact version IDs, server-side metadata, dependencies and supplied SHA-512/SHA-1 hashes.
- Hangar: compatible Paper-family plugins, author/description/icons, platform/version metadata, downloads and supplied dependencies/hashes.
- CurseForge: supported Forge/Fabric/NeoForge mods through the official API. The user configures an API key in Settings; it is encrypted with the local secret store, never bundled. Required/missing/restricted download URLs and distribution flags are honored. Missing keys produce an actionable configuration message.

The owner currently has no CurseForge API key. Live authenticated access therefore remains unvalidated; API parsing, compatibility, restriction and secret-storage behavior use isolated automated fixtures. MineDock does not scrape the website or construct forbidden download URLs. Follow the [official CurseForge API authentication and file documentation](https://docs.curseforge.com/rest-api/); third-party API access requires an appropriate key and applicable terms.

## CurseForge modpack assessment

This release supports Modrinth `.mrpack` import. CurseForge ZIP modpack import is not exposed as a working feature. A clean implementation would need to resolve each pinned project/file ID through authorized API access, honor file availability/download URL/distribution restrictions, determine safe server-side files and provide manual resolution for withheld files. A manifest alone is not permission to bypass those restrictions. The missing API key prevents live verification of that complete path, so it remains a documented extension rather than a simulated import.
