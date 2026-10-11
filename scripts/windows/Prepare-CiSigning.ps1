#Requires -Version 5.1
. "$PSScriptRoot\Signing.Common.ps1"
if (!$env:WINDOWS_CERTIFICATE -or !$env:WIN_CSC_KEY_PASSWORD) { throw 'Signing was requested: configure WINDOWS_CERTIFICATE and WINDOWS_CERTIFICATE_PASSWORD secrets.' }
if (!$env:RUNNER_TEMP -or !$env:GITHUB_OUTPUT) { throw 'This helper requires the GitHub Actions runner environment.' }
$directory = Set-PrivateSigningDirectory (Join-Path $env:RUNNER_TEMP ('minedock-signing-' + [Guid]::NewGuid().ToString('N')))
# Publish the cleanup path first, so even malformed certificates are removed in always().
"directory=$directory" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
try {
    $path = Join-Path $directory 'certificate.pfx'
    [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
    $certificate = Open-MineDockPfx $path $env:MINEDOCK_WINDOWS_CERT_SHA256
    $certificate.Dispose()
    "certificate=$path" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
    'enabled=true' | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
}
catch { throw 'CI signing certificate preparation failed. Check the encrypted PFX secret, password and public fingerprint variable.' }
