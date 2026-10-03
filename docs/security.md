# V1 security

## Boundaries

The application is local and runs with its OS account's permissions. It starts no web panel, public API, tunnel or network WebSocket. IPC validates renderer identity, main frame and exact URL; Zod validates input. Java starts through `spawn` with an argument array and `shell: false`.

Free-form RCON commands grant server administration, not shell injection. Stop/save-hold operations belong to serialized services. Persistent tasks serve the same local account; they are not a remote visitor interface.

## Files and archives

Absolute paths, `..`, null bytes, Windows ADS, device names and ambiguous paths are rejected. Existing parents are checked with `lstat`/`realpath`; symbolic links/junctions are blocked in file browsing and ZIP operations. Restores extract to staging and cannot overwrite outside it. Entry collisions are rejected, with size/file-count limits.

The OS account and installed Java plugins are trusted. Plugins execute with that account's privileges, as with native Minecraft servers; this is not Docker isolation. A local actor able to modify folders concurrently can act outside the application. Future isolation must address that explicitly.

## Network and downloads

HTTPS only, fixed official/CDN host allowlists, checks on every redirect, timeouts, maximum sizes, temporary files and checksums before rename. Catalog retry is bounded. Content installation respects version/loader/server-side requirements. Downloads never silently replace existing unmanaged plugins.

Minecraft is reachable on the LAN when `server-ip` is empty. Minecraft also uses this bind for RCON: **never forward the RCON port to the Internet**. MineDock connects through loopback with a random 256-bit password. Set `server-ip=127.0.0.1` for strictly local use. MineDock does not change firewalls or routers automatically.

## Secrets

SQLite's RCON secret is encrypted with Electron safeStorage when a suitable OS keychain is available. Fallback uses AES-256-GCM, a local 32-byte key and restrictive Unix permissions. On Windows it inherits user-profile ACLs. Preserve and protect the local key to recover secrets.

Minecraft requires a plaintext RCON password in `server.properties`. Folder permissions protect it; graphical/text editors hide it. MineDock backups remove `rcon.password` and restore reinjects it. Raw export of this file is refused. Plugin configurations may hold additional secrets, remain in complete backups and must be treated as sensitive.

Audit records exclude passwords and free-form command text that could contain secrets. Displayed console output is redacted. Original Minecraft logs belong to Java; MineDock cannot guarantee that a plugin never writes sensitive data there.

## Data and distribution

Server deletion preserves its folder in trash. Manual archives are not automatically purged. Backups precede major settings changes, file deletion, plugin installation and restores. Consistent SQLite snapshots run regularly. Do not remove the data folder containing the only encryption key.

Beta builds are unsigned. Remote accounts, RBAC and public tokens remain inactive pending implementation and dedicated review.
