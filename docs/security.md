# Security boundaries

MineDock is local and runs with the current OS account permissions. It exposes no public administration API, tunnel or web panel. Its isolated renderer uses only validated named preload methods; main verifies the sender/frame/origin and validates all input. Server/installer processes use argument arrays and `shell: false`. The updater uses fixed native helper scripts only for operations requiring the OS installation flow.

The 0.5.0 development administration bridge accepts structured actions rather than arbitrary command fragments. Names, UUIDs, resource IDs, quantities, exact slots, coordinates, text/control characters and explicit IP inputs are validated; batches use at most 50 distinct exact names, never `@a`. Paper/Purpur requests use native namespaced roots, but native help/acknowledgements do not prove universal plugin semantics. Local audit omits private bodies/reasons/IPs/raw replies. Native Minecraft logs can retain their own output; private player notes/safety files still need OS profile protection.

Saved Java inventory writes require a fully stopped, non-orphaned server, matching UUID, recognized format and current hash. Compressed/decompressed NBT, tag/depth limits and SNBT/RCON response bounds prevent unbounded parsing. Unknown fields/modded items are preserved, unsupported layouts are read-only, and every change follows a full verified backup, synced verified player copy, persistent journal and verified staging file. Atomic replacement is checked and rollback refuses to overwrite a concurrent change. Uncertain journals block launch and mutation until preserved-backup recovery/reconciliation. Live inventory edits require an online player and native commands. On a running server, file writes remain forbidden even for disconnected players.

The historical 0.4.1 visual review adds local CSS tokens and edits original bundled SVG symbols; fonts use the native/system stack. It introduces no new renderer capabilities, remote font/CDN dependency, telemetry, credential setting or executable runtime library. Screenshot tooling uses ignored private QA storage and a test-only external child; it is not part of the packaged application. See [capture provenance](design/visual-review.md).

## 0.5.0 item image boundary

The item service exposes only named context/download/import/pack/mod/scope/purge/visual IPC and a hash-addressed PNG protocol. Renderer inputs cannot supply arbitrary paths or URLs. Explicit ownership/EULA confirmation gates official downloads; native file selection gates external packs. Exact Mojang SHA-1, Modrinth SHA-512 and skin SHA-256 bind private sources. HTTPS hosts/paths/redirects, byte/time limits, ZIP traversal/link/encryption/bomb rejection, CRC/dimension checks and model/frame caps are enforced. Mod archives are resources only, never executed or installed. Deduplication, four render workers, serial transfers, bounded queues, navigation/shutdown cancellation and separate derived/archive quotas bound work. Licence metadata is checked but is not proof of every embedded asset’s rights. Source/provenance hashes prevent stale cross-server images. Purging only app-owned cache files preserves servers, backups, SQLite and external resources. No launcher account files are read; image failure cannot mutate NBT or relax safety gates. [Full bounds, precedence, rights and residual limits](asset-policy.md).

## Files, archives and recovery

Relative paths reject traversal, null bytes, absolute paths, Windows ADS/device names and ambiguous trailing characters. `lstat`/`realpath` checks reject user links/junctions in server browsing, copies and ZIP imports. Verified macOS system aliases and ordinary Windows short-path names are normalized without accepting user-created links. Native selection approves a specific external source or export target; data/runtime/cache roots remain protected from overwriting.

ZIPs reject links, duplicate/case-colliding paths and Zip Slip; extraction is bounded and staged. Copies detect changing files. Server/archive operations normally allow at most 200,000 entries and 64 GB; the editor is limited to 2 MB. Modpacks impose tighter file/download limits. Official Java/PHP tar archives may contain validated relative library links confined to staging; device nodes, escaping/absolute links and duplicate files are rejected.

Destructive server/world/content/file operations require a stopped server, explicit confirmations where applicable and safety backups. Managed content operations affect tracked binaries; manual content/configuration is preserved. Retention protects manual/safety archives by default, verifies files before preview and requires fresh typed approval before deletion. Interrupted folder exchanges and purge batches have private persistent checkpoints. Uncertain copies are kept; unresolved server recovery blocks launch/mutation.

Installed engines, mods and plugins are executable code with OS account privileges. This is not a container sandbox for Minecraft. A local actor with filesystem access can modify files concurrently; checks do not isolate MineDock from that actor.

## Network and downloads

Only approved HTTPS sources are used; every redirect is rechecked and cross-host credentials are removed. Requests have bounded retries, timeouts and maximum sizes. Downloads go to partial files, verify official hashes when supplied and rename only after validation. Resume requires matching Range/entity validators and content ranges; otherwise it restarts cleanly. Providers refuse incompatible versions and restricted/missing download URLs. No site scraping or guessed CDN URLs are used. Mod downloads and every redirect must stay on the official Modrinth CDN, with SHA-512/SHA-1 verification, size limits and staging.

Minecraft can be reachable on the LAN when its bind is empty. RCON uses a dedicated random 256-bit password and MineDock connects through loopback. Never forward RCON to the Internet. For strictly local Java use, bind `server-ip=127.0.0.1`. MineDock does not modify firewalls or router rules. Crossplay reserves/checks its UDP port and does not disable Java online-mode.

## Secrets and privacy

RCON secrets are encrypted with Electron safeStorage when a suitable OS keychain is available. The headless/development fallback uses AES-256-GCM and a private local 32-byte key; Windows inherits user-profile ACLs. Protect the data directory and its encryption key.

Minecraft requires plaintext RCON configuration. The app hides that field, scrubs it from normal backups/ZIP exports and reinjects it on restore. Direct editor/export access to known authentication/secret files is refused. An explicitly approved original-server safety archive preserves original bytes privately, including original configuration secrets; treat it as sensitive. Arbitrary plugin configurations can also contain secrets in full backups.

Audit omits secret-bearing free-form command text. Application diagnostics redact known secrets, tokens and addresses. Player tables contain observed identity/session information; IP-ban UI exposes a count only. Minecraft and plugins own their original logs and can write sensitive data there. Unknown external text is not a guarantee of secret-free content.

## Application updates and signing

TLS alone never authorizes an update. The app verifies Ed25519 metadata against an embedded public key, stable version/dates, exact repository release URLs, native architecture/package type and signed SHA-256/size. Downloaded files are verified again before installation. Optional automatic checks are off by default; installation remains explicit and is blocked while servers or operations are active. It never updates a Minecraft server.

The publisher private key stays outside Git/packages and is configured as an encrypted CI secret. Platform certificates/passwords use CI secrets/environment variables only. No official Windows or Apple certificate is currently provided; unsigned builds are explicitly reported. Platform certificate verification/notarization cannot be claimed without those real credentials. See [distribution](distribution.md) and [update-system](update-system.md).

## Survival evolution review

Incremental manifests and `.minedock` archives validate paths, inventory bounds and SHA-256 before staged application. Snapshot objects are immutable and there is no automatic garbage collection. Packages exclude known secrets and arbitrary plugin configurations by default; plugin configuration requires explicit opt-in, managed RCON is always removed/regenerated, and worlds/player files may still contain private information. See [package policy](package-format.md).

Configuration history is encrypted and bounded; saves/restores require a fresh file hash and preserve a current copy. YAML parsing bounds aliases/depth and only safe scalar options enter the graphical editor. Map assistants prepare loopback binding, and only backend-validated loopback URLs can be opened. The optional fixed external reachability observer receives a public address/port only after explicit consent. Minecraft version checks use the official manifest; app updater consent remains independent.

The [internal security review](security-audit.md) records evidence and unresolved risks. It is not an independent audit. Windows helper execution now avoids `DETACHED_PROCESS`; the exact old/new packaged validation and public-0.3.0 limitation are recorded separately from unit helper tests.

## 0.4.1 additions

Profile images are chosen through the native file dialog; the renderer does not pass arbitrary file paths or remote URLs. PNG/JPEG/WebP containers are limited to 5 MB and 4096px per side before native decoding; the result is a local bounded 128px PNG. Core validates the persisted data URL, PNG header and nonzero bounded dimensions. Profile names are trimmed and limited to 60 characters. Profile identity is separate from a real world folder or MOTD.

Graphical properties exclude secret-like keys, including RCON passwords. Typed/domain validation rejects invented/removed properties, invalid numeric ranges, unsafe new world-folder names and resource URLs containing credentials. Network/RCON/online-mode/world edits require visible review. Save uses stopped-server locks, raw-file SHA checks before and after backup work, a full safety archive, encrypted history and atomic replacement. External programs should still be stopped while editing: the filesystem does not provide a universal compare-and-swap transaction with third-party writers.

The original user-supplied icon and generated landscape have explicit provenance; neither implies Mojang affiliation. Historical 0.4.0 executable assets are retained unchanged; 0.4.1 has its own signed metadata and checksums. Existing OS signing, networking, incremental object retention and multiplayer limitations remain.
