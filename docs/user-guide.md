# A survival world with friends

This guide describes the public **MineDock 0.4.0** release. Download it from [GitHub Releases](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.4.0). English is the default; choose French, German, Spanish, Portuguese or Italian in Settings. MineDock stays on your computer and must remain open while it supervises servers and scheduled tasks.

## Create your first survival

1. Download the package matching your computer from [GitHub Releases](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.4.0). Windows offers Setup or portable. Follow the release's checksum and unsigned-package notes.
2. Open MineDock, choose your language/appearance and keep the proposed folders unless you have a reason to change them.
3. Choose **Create server**. Vanilla suits an unmodified world; Paper or Purpur supports plugins. Fabric, Forge and NeoForge support their corresponding mods. Your friends must use a matching Minecraft version and, for modded play, matching required client mods.
4. Choose the version and a reasonable memory allowance. Keep survival and normal difficulty. Review every setting before creating the server.
5. Personally read and accept the Minecraft EULA when asked. Choose **Start** and wait for the ready message. Copy the address from the server view.

On the same computer, a Java client usually connects through `localhost:PORT`. Friends on your home network use your computer's local address and the displayed game port. Internet access is a separate step below. MineDock never opens a router or firewall automatically. Bedrock engines and clients have different compatibility requirements; consult [engine support](engines.md).

## Upgrade an existing 0.3.x profile

Close MineDock, keep your existing server/storage folders, then open the verified 0.4.0 package under the same OS account. Your profile and SQLite database are reused; a database copy is saved before migration. Servers, preferences, backups, runtimes, player history and scheduled tasks are retained. The old Windows portable launcher can fail before its update helper starts; manually open the new verified portable or Setup package in that case. Never delete your data to upgrade.

## Add a mod, plugin or pack

Stop the server before changing content. In **Mods** or **Plugins**, search **Discover**, open a result and review its recommended compatible version. The preview names required dependencies; install the reviewed group together. Optional dependencies stay optional. Modrinth is the main provider; Hangar is a secondary plugin source. Installed content remains visible offline.

Use **Updates** to check explicitly. Locked versions are excluded from bulk updates. An archived project label reflects provider metadata; an old filename alone proves nothing. Manual files are labeled and stay under your control. If compatibility is unknown, investigate before starting or migrating. Keep the default safety-backup setting enabled.

In **Datapacks**, select the intended Java world before installing/importing. Activation, removal and updates affect that world. In **Resource packs**, install or import a ZIP, then select the server pack. A local file also needs a reachable HTTP(S) download URL for clients. MineDock computes its SHA-1, but you must ensure that the URL serves those exact bytes; importing a file does not host it.

## Invite an approved friend

Open **Players**, use the whitelist controls to add the exact Minecraft name and enable the whitelist while the supported server is running. MineDock sends the real server commands. The player detail view shows available identity, observed sessions, list status and a private note. Notes remain local. Missing UUIDs, skins or historical sessions stay unavailable; MineDock only knows connections it observed.

Kick, ban, pardon, OP and DeOP are secondary actions in the player view. Review their confirmation before sending. OP gives broad in-game administrative privileges.

## Back up and restore your world

Use **Backups → Create backup** for a full verified ZIP. Keep at least one copy on another disk. Scheduled backups run while MineDock is open. A mounted external disk/NAS can be selected as the backup folder; test its write access and space in Settings. MineDock uses the OS mount and does not log into SMB for you.

For a stopped server, **Incremental snapshot** stores a file inventory and shared hash-verified objects. Unchanged files reuse objects. Full ZIP backups remain available. Incremental snapshots currently have no automatic deletion/garbage collection, so watch storage usage.

To restore, stop the server, choose a backup or snapshot and review the replacement. Snapshot partial restoration can select the world, configuration, mods, plugins or datapacks. The preview lists replaced and removed files; a full safety ZIP of the current state is created first. Confirm the server name. Restoration of a world preserves other sections when they are outside the selected scope. Legacy ZIP backups currently restore the full server rather than one section. Read [backup details](backup-system.md) before restoring important data.

## Update Minecraft or change Paper/Purpur

Stop the server and open the migration assistant from its overview. Choose a target version or the Paper/Purpur counterpart. **Analyze** checks official engine/runtime availability and known content compatibility before any replacement. Review compatible, update-required, unknown and incompatible entries.

Unknown or incompatible content blocks applying a migration. A datapack/resource pack needing another release must be explicitly updated or removed before this assistant can proceed. Keep the separate Minecraft safety-backup policy enabled. The assistant preserves world and configuration files through a recoverable transaction; it cannot guarantee that every plugin or world behaves correctly after a major Minecraft update. Test a clone first. Downgrades are refused.

**Duplicate server** offers a complete copy or a new world with the same configuration/content/datapacks. MineDock chooses independent profile identifiers and available ports. The original remains available.

## Repair a crash

Open the health/crash view and read the actual report evidence. Missing dependencies, Java requirements, memory failures and known loader errors can produce deterministic advice. A content item mentioned in an exception is shown as a possible candidate, not a proven cause. Open its files or report, review logs and disable it only after confirmation. Keep a backup before experimenting; never delete your world as a first repair step.

High process RAM is not a JVM heap measurement. The performance panel shows actual CPU/working set and recognized Paper/Purpur TPS/MSPT responses; unavailable measurements remain blank. RAM/JVM presets are suggestions you explicitly apply. A larger memory limit does not automatically fix lag.

## Edit settings safely

Use search in server properties or the configuration panel. Common gameplay/network options stay accessible; technical options are secondary. Existing supported YAML/JSON scalar settings can be edited graphically. Complex lists, HOCON and TOML remain in the text editor. YAML comments are preserved. If another program changed the file, reload before editing.

Open **Versions** for a previous configuration and confirm restoration; MineDock saves the current file first. History has retention/size limits and is encrypted locally. **Security check** gives read-only advice about identity, whitelist, bind and RCON. It does not rewrite settings or inspect Windows ACLs.

## Check Internet access

First confirm that the running server accepts a local connection. **Test Internet access** can separately query an external observer after you explicitly approve sharing a public address and game port with mcstatus.io. Results include observation/cache times. A local success does not establish public access. Bedrock local UDP and unsupported addresses can remain unknown.

If public access fails, check the game-port rule in your OS firewall, the router's forwarding to your computer and whether the connection uses carrier-grade NAT. Only forward the game port you intend to expose. Keep RCON private and keep online identity verification enabled. No automatic firewall/router changes, tunnel or hosting service is included. See [remote access](remote-access.md).

## Install a server map

For compatible Paper/Purpur versions, open the BlueMap/Dynmap assistant, review the compatible plugin and required dependencies, and choose an unused local web port. BlueMap asset downloads need a separate explicit choice. MineDock prepares a loopback-only webserver configuration before installation. Start the server and allow the plugin to generate/render its map, then use **Open map**. The local map URL does not expose it to the Internet. Rendering must be checked with the actual plugin/server; configuration alone is not proof of a finished map.

## Move to another computer

Stop the server and export a `.minedock` package with the native file picker. Review what it includes; arbitrary plugin configurations require explicit opt-in, and worlds/player files can contain private information. Known secrets are excluded by default and managed RCON secrets are always regenerated.

On the other computer choose **Import MineDock package**, review the inventory and confirm. MineDock verifies hashes and prepares new paths, ports, an official engine and an appropriate runtime. This needs Internet access and any required personal EULA acceptance. It does not rewrite every third-party plugin's absolute path. Read the [package format and privacy policy](package-format.md) before sharing an archive publicly.

## New controls in the 0.4.1 review build

Navigation is Dashboard, Backups, your server entries and Settings. The upper breadcrumb/global-search bar and the dedicated Activity/Operations/Notifications navigation have been removed. Local page search still works. Open **Settings → Notifications** to choose desktop delivery and categories; expand **Notification history** to read or acknowledge alerts. **Recovery and background tasks** retains cancellation and reviewed recovery, while **History** retains searchable audit records. These Settings panels avoid permanently occupying the sidebar. Dark appearance uses neutral black/charcoal surfaces; light appearance remains available.

Public downloads are still 0.4.0. In the reviewed candidate, creation preselects a working recommended build. Use **Show all available builds / loader versions** to search older available releases. Fabric has separate loader and installer lists; the review includes both exact selections. A warning does not claim an older version is necessarily beta: it records the upstream stable flag. Refresh contacts upstream; an offline cached catalog is explicitly labeled. Availability does not guarantee that every historical game/mod combination works.

In **Server → Settings**, the **Server profile** name and chosen local image belong to MineDock. They do not rename the world or invent a Java server-name property. Choose a PNG/JPEG/WebP up to 5 MB and 4096 pixels per side; the native app saves a bounded local PNG. Reset restores the engine symbol.

Stop the server before editing actual properties. Choose a category or search by label/key/description, edit only the intended values, then **Review and save**. Inspect the diff and acknowledge world/network/identity risks. A full safety backup and encrypted history are recorded; changes apply on the next start. Unset inherited settings remain unset until edited. Discard or cancel a navigation/close warning to keep working. If another program edited the file, refresh and review again rather than overwriting it. RCON credentials use the secure workflow and are never shown in this editor.

Some Java properties were removed in later game releases; their controls are omitted rather than writing ignored values. Bedrock/PocketMine show fields supported by their actual files. Paper/Purpur advanced configuration first shows curated paths present in that version’s files; opt into other discovered scalars or use raw YAML for complex structures. Fabric has no invented universal mod-settings schema.
