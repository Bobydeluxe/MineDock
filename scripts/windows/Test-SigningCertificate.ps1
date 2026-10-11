#Requires -Version 5.1
param([string] $CertificatePath = $env:WIN_CSC_LINK)
. "$PSScriptRoot\Signing.Common.ps1"
$certificate = Open-MineDockPfx $CertificatePath $env:MINEDOCK_WINDOWS_CERT_SHA256
try {
    [ordered]@{ subject = $certificate.Subject; certificateSha256 = (Get-CertificateSha256 $certificate); expiresUtc = $certificate.NotAfter.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
}
finally { $certificate.Dispose() }
