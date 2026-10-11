#Requires -Version 5.1
[CmdletBinding()]
param(
    [string] $OutputDirectory = (Join-Path $env:LOCALAPPDATA 'MineDock\private-signing'),
    [Security.SecureString] $Password,
    [string] $ExistingThumbprint
)
. "$PSScriptRoot\Signing.Common.ps1"
if (Test-Path -LiteralPath $OutputDirectory) { throw 'The output directory already exists. Reuse your existing PFX; choose a new directory only for an intentional backup/rotation.' }
if (!$Password) { $Password = Read-Host 'Choose a strong PFX password (store it in your password manager)' -AsSecureString }
if ($Password.Length -lt 16) { throw 'Use a PFX password with at least 16 characters.' }
$directory = Set-PrivateSigningDirectory $OutputDirectory
$certificate = $null
try {
    if ($ExistingThumbprint) {
        $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$ExistingThumbprint"
        Assert-MineDockCertificate $certificate (Get-CertificateSha256 $certificate) -RequirePrivateKey
    }
    else {
        $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=MineDock' `
            -FriendlyName 'MineDock owner code signing (self-signed)' -CertStoreLocation 'Cert:\CurrentUser\My' `
            -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyUsage DigitalSignature `
            -KeyExportPolicy Exportable -NotBefore (Get-Date).AddMinutes(-5) -NotAfter (Get-Date).AddYears(2)
    }
    $fingerprint = Get-CertificateSha256 $certificate
    Assert-MineDockCertificate $certificate $fingerprint -RequirePrivateKey
    Export-PfxCertificate -Cert $certificate -FilePath (Join-Path $directory 'MineDock-signing.pfx') `
        -Password $Password -CryptoAlgorithmOption AES256_SHA256 | Out-Null
    Export-Certificate -Cert $certificate -FilePath (Join-Path $directory 'MineDock-signing.cer') -Type CERT | Out-Null
    [ordered]@{
        subject = $certificate.Subject
        certificateSha256 = $fingerprint
        expiresUtc = $certificate.NotAfter.ToUniversalTime().ToString('o')
        certificateStoreThumbprint = $certificate.Thumbprint
        pfxPath = (Join-Path $directory 'MineDock-signing.pfx')
        publicCertificatePath = (Join-Path $directory 'MineDock-signing.cer')
        trustedRootInstalled = $false
    } | ConvertTo-Json
}
finally { if ($certificate) { $certificate.Dispose() } }
