# Contributing

Read [development](docs/development.md), [architecture](docs/architecture.md) and [security](docs/security.md). Keep UI, services and system access separate. Validate incoming data. Never construct shell commands from user input or access files outside an authorized root.

English is the primary language for code, documentation, issues and pull requests. Add application text to all six language catalogs as described in [localization](docs/localization.md). Preserve Minecraft commands, property names, external output and user content.

Schema changes require a new migration. Destructive actions require suitable UI confirmation. Add behavioral tests for lifecycle, archives and security boundaries.

Before submitting, run `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:ui` and `pnpm build`. Never commit server data, secrets, downloaded runtimes or build artifacts.
