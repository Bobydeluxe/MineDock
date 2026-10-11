# Free Windows self-signed signing

Optional infrastructure for **future builds**. Published 0.5.0 stays unsigned and unchanged; these scripts create no release/tag. No paid service, SignPath, Store or website is used.

**Self-signed certificates are not publicly trusted by default. SmartScreen and Unknown Publisher warnings can remain.** No Microsoft or CA validation is claimed. Do not disable Windows protections or install a root merely to run MineDock. See [Microsoft's explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Generate the owner identity once

Open **Windows PowerShell 5.1** in a reviewed checkout. Administrator rights are not required:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\New-MineDockSigningCertificate.ps1
```

The execution-policy option applies only to this reviewed script process; it does not change the machine policy or disable SmartScreen/Defender. Enter a strong password of at least 16 characters at the hidden prompt; save it in a password manager. The script creates a fresh, restricted `%LOCALAPPDATA%\MineDock\private-signing` directory, accessible to the current account and SYSTEM, with:

- `MineDock-signing.pfx`: encrypted private key, AES256/SHA256 export protection; keep private.
- `MineDock-signing.cer`: public certificate, safe to inspect/publish deliberately.
- Public console output: certificate DER SHA-256 fingerprint, expiry and paths. Save the fingerprint for CI; it is not a password.

Identity: `CN=MineDock`, RSA 3072, SHA256-with-RSA, DigitalSignature key usage, Code Signing EKU, exportable private key, **two-year validity**. The private identity also remains in `Cert:\CurrentUser\My`; no trusted-root certificate is installed. An existing output directory is refused to prevent accidental regeneration. **Reuse this PFX across releases.** For another protected export of the same identity, use `-ExistingThumbprint` and a new `-OutputDirectory`. The store's SHA-1 thumbprint is only a lookup identifier; CI pins the public DER **SHA-256** fingerprint.

Back up the encrypted PFX on offline encrypted storage and keep the password separately. Test restoring it on a controlled build account. Anyone with both can impersonate the key. Ignore rules exclude PFX/P12/private keys/base64 files and `private-signing/`; they do not protect secrets pasted into commits, issues or command history. Never upload private signing/test directories.

## Sign locally

Use a fresh private build checkout/output, separate from previously published files. Read the password securely:

```powershell
$env:WIN_CSC_LINK = Join-Path $env:LOCALAPPDATA 'MineDock\private-signing\MineDock-signing.pfx'
$env:MINEDOCK_WINDOWS_CERT_SHA256 = 'PUBLIC_64_HEX_SHA256_FINGERPRINT_FROM_SETUP'
$env:MINEDOCK_WINDOWS_SIGNING_REQUIRED = 'true'
$securePassword = Read-Host 'PFX password' -AsSecureString
$credential = [Management.Automation.PSCredential]::new('signing', $securePassword)
try {
    $env:WIN_CSC_KEY_PASSWORD = $credential.GetNetworkCredential().Password
    pnpm build:windows
    if ($LASTEXITCODE -ne 0) { throw 'Packaging/signature verification failed.' }
} finally {
    $env:WIN_CSC_KEY_PASSWORD = $null
    $securePassword.Dispose()
    $credential = $null
}
```

Run natively on Windows x64 or ARM64 with matching Node 24. `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD` and electron-builder `CSC_LINK`/`CSC_KEY_PASSWORD` aliases remain supported. The certificate may be a local PFX path or base64 PFX, never a remote URL. Credentials remain in environment variables, not serialized package configuration. Processes with sufficient permissions can inspect environment/memory: protect the build account and clear credentials after use.

Explicit signing fails for missing/invalid credentials, pin, subject, EKU, key constraints, validity or signature. Ordinary development packaging without credentials remains unsigned. Signed distributions require online timestamping; `ELECTRON_BUILDER_OFFLINE=true` is refused.

Electron-builder v26 invokes Microsoft SignTool for the packaged app, NSIS uninstaller/Setup and Portable, using `/fd sha256`, `/tr` RFC 3161 and `/td sha256`. Default endpoint: `http://timestamp.digicert.com`; override with `MINEDOCK_WINDOWS_TIMESTAMP_URL` for another HTTP(S) RFC 3161 service. Timestamp availability is external; a failure blocks the signed distribution. Untimestamped offline fixtures are test files, never release builds.

## Optional GitHub Actions

After reviewing/merging the signing PR, use **Settings → Secrets and variables → Actions**:

| Name                               | Type                         | Value                                                |
| ---------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `WINDOWS_CERTIFICATE`              | Encrypted secret             | Base64 of the encrypted owner PFX                    |
| `WINDOWS_CERTIFICATE_PASSWORD`     | Encrypted secret             | PFX password                                         |
| `MINEDOCK_WINDOWS_CERT_SHA256`     | Repository variable          | Public 64-character SHA-256 certificate fingerprint  |
| `MINEDOCK_WINDOWS_SIGNING_ENABLED` | Optional repository variable | `true` only to enable reviewed future v* tag signing |

With authenticated GitHub CLI, send base64 directly without displaying it:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes($env:WIN_CSC_LINK)) |
    gh secret set WINDOWS_CERTIFICATE --repo Bobydeluxe/MineDock
gh secret set WINDOWS_CERTIFICATE_PASSWORD --repo Bobydeluxe/MineDock
# Enter the password at gh's hidden prompt; never use a literal --body password.
gh variable set MINEDOCK_WINDOWS_CERT_SHA256 --repo Bobydeluxe/MineDock --body 'PUBLIC_64_HEX_FINGERPRINT'
```

Alternatively use GitHub's private settings UI. Never send secrets in chat/issues or enable command tracing. Base64 PFX is **private key material**, despite encryption.

Run **Actions → Build distribution artifacts → Run workflow**, select **main**, enable **windows_signing**. Only owner default-branch dispatches or explicitly opted-in future v* tags access Windows signing secrets. No PR/fork event exists. Manual requests from another branch fail before reading owner secrets. Protect default branch/tags, use MFA and review executable workflow/dependency changes; administrators/trusted workflow code can access repository secrets.

CI decodes the PFX in a restricted runner-temp directory, imports ephemerally for validation, passes credentials to native packaging and deletes the temporary PFX in `always()` before uploads. Electron-builder manages its own temporary files. Deletion removes filesystem references; it does not promise forensic SSD/memory erasure. Missing/invalid secrets fail explicitly requested signing. Unsigned jobs do not read Windows secrets. CI never generates a production identity.

The separate manual **windows_signing_self_test** option creates an explicitly disposable QA identity and temporary signed packages, runs native tests on x64/ARM64 and discards all private material/packages. It then performs normal distribution packaging. This option defaults off in ordinary CI/tag runs; it never sets the owner's production identity. QA packages are not uploaded as owner-signed releases.

## Verify before hashing

In Windows PowerShell 5.1, with the public fingerprint variable set:

```powershell
.\scripts\windows\Test-Authenticode.ps1 -Path @(
    '.\release\win-unpacked\MineDock.exe',
    '.\release\MineDock-0.5.0-Setup-x64.exe',
    '.\release\MineDock-0.5.0-Portable-x64.exe'
) -RequireTimestamp
```

Names above describe a private development build, **not permission to replace 0.5.0**. Use the future version's names; ARM64 uses `win-arm64-unpacked` and `-arm64.exe`.

The verifier checks embedded CMS using `SignedCms.CheckSignature(true)`, SHA-256 algorithm identifiers, native `CryptSIPVerifyIndirectData` PE digest, exact subject, fingerprint and certificate constraints. Full-file SHA-256 is reported separately. Windows chain status is independent: `cryptographicIntegrity=true` can coexist with `trustedByThisWindowsInstallation=false` and `NotTrusted`/`UnknownError`. Local trust says nothing about other PCs.

Authenticode excludes defined PE fields/signature storage from its digest; full-file SHA-256 and Ed25519 metadata bind **all** distributed bytes. The custom verifier requires RFC 3161 attribute presence, but does not independently validate the TSA chain or long-term validity after expiry. It requires the owner certificate currently valid. Windows policy determines actual chain trust.

Order: **build → Authenticode/timestamp → signature verification → packaged tests → final SHA256SUMS and `pnpm updates:sign` → public download verification**. The separate Ed25519 key/pin remains unchanged. Never sign/edit after hashing; if future pre-publication bytes change, regenerate their checksums/metadata. Never replace published files. The workflow builds artifacts without publishing a release.

## Expiry and rotation

Rotate intentionally before the two-year expiry. A valid trusted timestamp can support later Windows verification subject to TSA/chain/OS policy; it does not establish public trust for self-signed publishers. This build verifier rejects expired identities. Retain historical public CER/fingerprints and release provenance.

Generate a replacement into a new protected directory, back it up, independently verify its fingerprint, update secret/password/pin together and test all four Windows packages. Announce the key change in future release notes. Rotation does not transfer trust/reputation. On compromise, disable tag-signing opt-in, remove secrets, stop publication, document affected releases and rotate through review. Self-signed certificates have no general public CA revocation service.

## Native tests and references

```powershell
.\scripts\windows\Test-SigningIntegration.ps1
# Explicit larger native test, after pnpm build:
.\scripts\windows\Test-SigningIntegration.ps1 -Package
```

Tests exercise generation/export/import, incorrect password/pin, overwrite refusal, unsigned/tampered PE rejection, timestamp requirements, independent trust and CI preparation/cleanup. They remove their private key/certificate and confined temp directory, never trust roots. See [executed validation](validation-records/windows-self-signing.json) for coverage and limitations.

Primary references: [New-SelfSignedCertificate](https://learn.microsoft.com/en-us/powershell/module/pki/new-selfsignedcertificate), [SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool), [electron-builder](https://www.electron.build/code-signing-win), [Windows SIP digest verification](https://learn.microsoft.com/en-us/windows/win32/api/mssip/nf-mssip-cryptsipverifyindirectdata), [SignedCms signature-only verification](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.pkcs.signedcms.checksignature).
