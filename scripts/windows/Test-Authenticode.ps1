#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string[]] $Path,
    [string] $ExpectedCertificateSha256 = $env:MINEDOCK_WINDOWS_CERT_SHA256,
    [switch] $RequireTimestamp
)
. "$PSScriptRoot\Signing.Common.ps1"
Add-Type -AssemblyName System.Security
if (!('MineDock.Signing.AuthenticodeIntegrity' -as [type])) {
    Add-Type -Path "$PSScriptRoot\AuthenticodeIntegrity.cs" -ReferencedAssemblies System.Security
}
foreach ($file in $Path) {
    $resolved = (Resolve-Path -LiteralPath $file).Path
    $integrity = [MineDock.Signing.AuthenticodeIntegrity]::Verify($resolved)
    try {
        Assert-MineDockCertificate $integrity.Certificate $ExpectedCertificateSha256
        if ($RequireTimestamp -and !$integrity.Rfc3161TimestampPresent) { throw 'A required RFC 3161 timestamp is missing.' }
        $windows = Get-AuthenticodeSignature -LiteralPath $resolved
        [ordered]@{
            path = $resolved
            subject = $integrity.Certificate.Subject
            certificateSha256 = (Get-CertificateSha256 $integrity.Certificate)
            digestAlgorithm = 'SHA256'
            cryptographicIntegrity = $true
            rfc3161TimestampPresent = $integrity.Rfc3161TimestampPresent
            # Presence is checked; this script does not independently validate the TSA chain/expiry.
            windowsStatus = $windows.Status.ToString()
            trustedByThisWindowsInstallation = ($windows.Status.ToString() -eq 'Valid')
            fileSha256 = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
        } | ConvertTo-Json -Compress
    }
    finally { $integrity.Certificate.Dispose() }
}
