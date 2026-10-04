# Contributing to MineDock

Use Node 24+ and pnpm 11+. Run `pnpm install --frozen-lockfile`, then `pnpm dev` for actual desktop services or `pnpm dev:mock` for the clearly labeled demonstration.

Before submitting a change, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and the relevant UI tests. Native package changes also need `pnpm test:packaged` against a freshly compiled package. Record the OS, architecture and exact source tested. See [development](docs/development.md) and [validation](docs/validation.md).

UI changes should retain keyboard access, small-window scrolling, light/dark readability and all six languages. New English keys must have real FR/DE/ES/PT/IT translations with matching placeholders. Use the shared `Dialog` and `EngineIcon` components. `pnpm screenshots` regenerates the README captures from the explicitly labeled demo; keep captions clear about sample data.

Keep main-process operations behind the typed IPC boundary. Preserve existing database migrations; append a migration when required. Use existing safety backups, operation checkpoints and recovery guards for file mutations. Do not add production demo fallbacks or assume an unavailable upstream architecture works.

Tests use temporary, owned data. Official downloads and runtime probes are opt-in. Never accept a real Minecraft EULA or start a playable server on another person's behalf. Do not commit API keys, signing keys/certificates, private backups, server data or unredacted logs.

A pull request should describe the user-visible problem, the final behavior and the validation actually performed. Include updated captures for visible changes and explain remaining platform or external-service limits. New original code/assets follow the project MIT license; document provenance for any third-party assets.
