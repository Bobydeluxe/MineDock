# Content catalogues

Modrinth is the only catalogue for managed mods. Its official API supplies project metadata, server environments, exact versions, dependencies and hashes. Fabric, Forge and NeoForge use their actual Minecraft version and loader. There is no provider selector in the Mods screen and no API key configuration.

Plugins keep Modrinth and Hangar on supported engines; Geyser/Floodgate use their official crossplay catalogue. The shared content service keeps staged transactions, verified rollback and recovery across these flows.

Search uses official facets and pagination. Metadata is cached for five minutes with a maximum of 2,000 entries; stale cached information is labeled offline. Installed records remain local. Explicit update checks use the official hash batch endpoint, restricted to stable releases and the server's Minecraft/loader pair.

See the official [search API](https://docs.modrinth.com/api/operations/searchprojects/) and [batch update API](https://docs.modrinth.com/api/operations/getlatestversionsfromhashes/). No website scraping is used. See [mod management](mods.md) and [imports](import.md).
