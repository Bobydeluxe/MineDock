# Server lifecycle

Installation creates a UUID, resolves an official version and pinned stable build, installs Java, verifies the JAR, writes properties and records explicit wizard EULA consent. Failed installations show their error. An incomplete server cannot start; retry keeps the same version/build.

Startup checks runtime, JAR, EULA, Minecraft port and RCON port. Java launches without a shell in the server folder; PID/start time are recorded. stdout/stderr are read and the actual `Done` marker changes status to Online. Startup is capped at five minutes. Heap limits come from the profile; no native CPU quota is claimed.

Shutdown tries RCON `save-all flush`, sends `stop` through stdin and waits thirty seconds. Forced termination is a last resort after that deadline; a second timeout bounds shutdown confirmation. Expected stops and crashes are distinguished.

Automatic restart waits fifteen then thirty seconds. Three crashes in ten minutes suspend recovery and generate an alert/audit. Recovery is configurable per server and uses the same exclusion as user actions. Diagnostics follow the selected application language; original Java output stays verbatim.

On closing MineDock, tasks/downloads stop, ongoing operations finish or cancel, processes stop and SQLite is backed up. Abrupt manager termination can leave Java alive. A persisted PID is never killed automatically because the OS may have reused it. The server remains blocked with an explanation until the old process is closed or the computer restarts.

Players are discovered through logs and RCON `list`. Connections authenticate, verify sizes, collect fragmented responses and bound timeouts. Minecraft `list` supplies neither UUID nor ping; V1 does not invent these values.
