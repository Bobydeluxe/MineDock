# Local and network access

V1 exposes no remote administration panel. The administrator is the OS account running the desktop. There is no fake login, unprotected QR link, tunnel or production web server.

On the same computer, use `localhost:port`. On the LAN, use the displayed local IPv4 address and allow Minecraft traffic if prompted by your firewall. MineDock does not configure the firewall or router. Displayed addresses are not public addresses.

Never forward RCON to the Internet. `server-ip=127.0.0.1` restricts the server to this computer. An empty bind address permits LAN access and requires a trusted network.

A future remote panel would reuse DTOs/services with Argon2id login, per-server roles, expiring sessions, CSRF protection, rate limits, TLS and authenticated WebSockets. This layer must exist before exposing administration to a network. Playit, Geyser, Docker and cloud features are separate extensions, inactive in V1.
