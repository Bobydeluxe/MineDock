# MineDock validation

Validation is performed on Windows 11 x64. The current multilingual beta is **0.2.0**; see [the roadmap](roadmap.md) for its scope. The 0.1.0 baseline passed strict TypeScript, ESLint, 52 unit/integration tests, two UI journeys, Windows packaging and the packaged Electron first-launch test on 3 October 2026.

The 0.2.0 changes add English defaults, six complete UI/diagnostic catalogs, preference persistence checks, multilingual Electron navigation/reload/restart checks, and English project documentation.

## Version 0.2.0 release checks

Validated on **3 October 2026**, Windows 11 x64:

| Check                        | Result                                                   |
| ---------------------------- | -------------------------------------------------------- |
| Strict TypeScript            | Passed                                                   |
| ESLint                       | Passed                                                   |
| Vitest                       | 66 tests passed in 6 files                               |
| Playwright                   | Both UI journeys passed; all six languages checked       |
| Packaged Windows application | Onboarding, six languages and restart persistence passed |
| Windows packaging            | NSIS installer and portable x64 executable produced      |

The translation checks cover all 302 UI keys and 146 shared diagnostic messages for each language, including legacy French messages and interpolation values. English dashboard screenshots replace the earlier French screenshots.

## Test coverage

Unit/integration tests cover SQLite, encryption, contained paths and symlinks, property parsing, reserved ports, downloads/checksums/redirects, malicious ZIPs, fragmented RCON, Modrinth dependencies, live backup, restoration/rollback, schedules and crash restart limits. These tests use small purpose-built Node processes, not playable Minecraft servers.

The desktop UI journey uses the real Electron main/preload and temporary SQLite data: onboarding, diagnostics, preferences, empty dashboard, all six languages, persistence and renderer isolation. The second journey explicitly uses **demo mode**: creation, start, console, stop, backup, settings and restore. Screenshots also verify the final dark-theme colors.

## Real-service baseline

On 3 October 2026, `pnpm test:live` accessed official catalogs containing 103 Vanilla releases and 55 Paper versions, downloaded Temurin Java 21 and Paper **1.21.11 build 132**, verified hashes and launched the real Java/Paper bootstrap. It reached the EULA check with `eula=false`. A compatible Modrinth plugin search also returned real results.

The tested Paper JAR SHA-256 was:

```text
5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba
```

Machine results remain in the validation workstation's ignored `data/live-smoke/result.json`. No test accepts a real server's EULA on the owner's behalf. Localization changes do not represent a new gameplay validation.

## CI and limits

The [0.1.0 Validate workflow](https://github.com/Bobydeluxe/MineDock/actions/runs/37150089013) passed on Ubuntu, including dependency installation, lint, TypeScript, tests, build and both UI journeys under Xvfb. The [subsequent platform build workflow](https://github.com/Bobydeluxe/MineDock/actions/runs/37150702487) produced Windows, Linux and macOS packages successfully. Packaging does not itself verify downloaded Java runtimes or gameplay on those OSes.

- A real Minecraft client connection/gameplay session still requires validation after personal wizard EULA acceptance.
- Windows executables are unsigned. NSIS installation onto the host system is not performed by these smoke tests.
- Linux, macOS, arm64 and historical Minecraft versions require platform-specific gameplay/native integration validation.
- Power loss, disk-full conditions and very large servers have not undergone extended load testing.

Distributions include the project license and [third-party notices](THIRD_PARTY_NOTICES.md). Final Windows checksums are in `release/SHA256SUMS.txt`.
