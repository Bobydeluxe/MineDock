# Public Windows signing certificate

This is MineDock's stable owner **self-signed** code-signing certificate, created on 11 October 2026 for future reviewed Windows builds. It is public key material only. **Published MineDock 0.5.0 Windows downloads remain unsigned.** Publishing this certificate does not sign an application.

[Download the public DER certificate](MineDock-windows-2026.cer) · [Signing and verification guide](../windows-signing.md) · [Code signing policy](../code-signing-policy.md)

| Property                            | Value                           |
| ----------------------------------- | ------------------------------- |
| Subject / issuer                    | `CN=MineDock` (self-signed)     |
| Public key                          | RSA 3072 bits                   |
| Certificate signature               | SHA-256 with RSA                |
| Intended use                        | Code Signing, Digital Signature |
| Valid from (UTC)                    | 11 October 2026, 15:42:14       |
| Valid until (UTC)                   | 11 October 2028, 15:47:14       |
| Contains a private key              | No                              |
| Public CA / Microsoft certification | None                            |

Public certificate DER SHA-256 fingerprint:

```text
0f8c09238269ccf126182ec3efad795ce745d3e00f18ca03142d1557b8175395
```

The GitHub Actions repository variable `MINEDOCK_WINDOWS_CERT_SHA256` is pinned to this value. As verified on 11 October 2026, both encrypted Windows signing secrets are configured and automatic signing is enabled for future `v*` version tags. The [owner-certificate native build](https://github.com/Bobydeluxe/MineDock/actions/runs/38156282426) records actual verification; no application release is published by that workflow. No password, encrypted PFX or private key is published in repository files or release assets.

## Inspect without installing trust

Save the `.cer`, then use Windows PowerShell from its directory:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\MineDock-windows-2026.cer
certutil -dump .\MineDock-windows-2026.cer
```

The file is the exact DER certificate, so its file SHA-256 equals the certificate fingerprint above. These commands inspect it without importing it into a certificate store. The fingerprint is different from an executable's full-file SHA-256 and from the updater's separate Ed25519 public key.

For a future **actually signed** Windows build, follow [signature verification](../windows-signing.md#verify-before-hashing) to check the expected certificate, embedded signature and file digest; use that release's checksums and signed updater metadata to verify the final distributed bytes. A matching certificate alone does not prove that a binary was signed or that it is safe.

Self-signed certificates do not establish public Windows trust or automatically remove SmartScreen/Unknown Publisher warnings. `CN=MineDock` is self-asserted; no Microsoft or recognized certificate authority has validated it. Do not disable Windows protections or install this certificate as a trusted root merely to run MineDock. See [Microsoft's SmartScreen explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

Keep historical public certificates/fingerprints when rotating the owner key; announce any replacement explicitly in future release notes. Private backup, expiry and compromise procedures are in the signing guide.
