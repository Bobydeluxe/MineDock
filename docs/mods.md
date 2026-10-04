# Mods, plugins and version history

Open a server content panel while stopped. Capabilities select `mods/` for Fabric/Forge/NeoForge and `plugins/` for supported plugin engines. Choose a provider, search a project, review compatible versions, dependencies and changelog/date, then explicitly install the selected version. Datapacks/resources are recognized content categories, but a general datapack/resource installer is not offered in this release.

The provider abstraction returns actual project/version/file/hash metadata. Installation checks Minecraft version, engine/loader, server-side availability and required dependencies. Dependency resolution is bounded, detects cycles/conflicts and pins exact selections. CurseForge may not state reliable server-side compatibility; the UI reports that uncertainty instead of declaring a client mod safe.

Managed records retain provenance, installed version, Minecraft/loader requirement, filenames, enable state and dependencies. Manual files are listed separately; MineDock does not infer that every JAR belongs to its database. Required managed dependencies cannot be removed/disabled while dependent content needs them. Mutations stage a copy, verify downloads and atomically exchange the prepared content/server folder with recorded recovery.

Update checks classify managed content as current, update available, incompatible or unknown. Manual files remain unmanaged. Updates are never silently applied. Before a version change, the previous binary is hashed and retained; history defaults to five versions and can be configured up to twenty. Rollback verifies the stored file before replacement. Uninstall removes only tracked binaries and preserves configurations/manual files.

Remote icons are cached approved HTTPS raster images with file/dimension limits and bounded cache size. SVG/unknown hosts are refused; a fallback is shown. Settings can clear the icon cache.

See [marketplaces](marketplaces.md) for provider prerequisites, [imports](import.md) for `.mrpack`, and [recovery](recovery.md) for interrupted content changes.
