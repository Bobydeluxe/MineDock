# Code signing policy

## Published status and future signing

MineDock **0.5.0 Windows downloads remain unsigned**. Existing releases, tags, checksums and Ed25519 metadata are never replaced. The repository is the official homepage and [GitHub Releases](https://github.com/Bobydeluxe/MineDock/releases) distributes packages.

The owner has chosen free **self-signed Windows Authenticode** for future reviewed builds. No SignPath, paid service, Microsoft Store publication or certificate-authority endorsement is used. Signing remains optional until the owner creates and configures a stable private identity. Disposable QA certificates are never release identities.

**Self-signed signing does not automatically prevent SmartScreen warnings or remove Unknown Publisher warnings on untrusted computers.** CN=MineDock is self-asserted, not a validated legal identity. A pinned certificate proves continuity with a known key; it does not establish public Windows trust or malware safety. See [Microsoft's explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation). Do not disable SmartScreen/Defender or install a root merely to run MineDock. No script or installer installs a trust root.

## Authority and release review

Bobydeluxe owns the repository and controls signing access. The 10 October 2026 membership inspection returned Bobydeluxe as the sole write/admin collaborator. Contributors propose PRs; coding assistance is not a signing authority. Branch protection and maintainer MFA were not established by that inspection. Enable MFA and protect release refs before enabling signing.

Review source, dependencies, build changes, commit and workflow provenance before authorizing signing/publication. Manual owner signing requires the default branch. Future tag signing requires explicit repository-variable opt-in and trusted v* tags; protect tag creation. Signing never itself publishes a release. No signing job runs on pull requests.

## Certificate, verification and release controls

The [Windows signing guide](windows-signing.md) documents native certificate generation, encrypted PFX export, owner secret setup, backup and rotation. Reuse the owner identity across releases; independently verify its public DER SHA-256 fingerprint. Never publish PFX/base64/private keys/passwords. Publish only public CER/fingerprint when announcing an actually signed future release.

Electron-builder uses native Microsoft SignTool, SHA-256 only and RFC 3161 timestamping. The packaged app, final NSIS Setup and Portable are verified on native x64/ARM64. Installer helpers can also receive a signature through electron-builder; third-party resources retain their licenses and are not represented as MineDock-authored code.

The verifier checks embedded CMS signature, Windows SIP PE digest, certificate constraints and configured fingerprint independently of chain trust. It separately reports Get-AuthenticodeSignature status and trust on that Windows installation. Distribution timestamp presence is required; the custom check does not independently validate the TSA chain or long-term validity after expiry. Never report an untrusted signature as publicly trusted.

Authenticode finishes before final package hashes and Ed25519 metadata. The updater's separate pinned Ed25519 key is unchanged. Generate SHA256SUMS and update metadata from exact signed files, verify downloads and never modify files afterwards. Do not silently replace released binaries.

## Privacy and licenses

Original source is MIT; [third-party notices](THIRD_PARTY_NOTICES.md) and [asset policy](asset-policy.md) describe other materials. Proprietary Minecraft resources are not MIT and are not bundled as signing assets. [Privacy Policy](PRIVACY_POLICY.md) and [network audit](privacy-audit.md) document online providers and local data. Correspondence handling requires maintainer confirmation; the released installer does not display the new policy and some provider requests have no separate opt-out. Signing does not certify compliance or change these facts.

Future release notes must state actual signing status, public fingerprint and coverage limits and link this policy and the privacy notice. Historical validation records retain their context; the former service-application plan is superseded by the owner's self-signing decision.
