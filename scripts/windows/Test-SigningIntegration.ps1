#Requires -Version 5.1
# Explicit test only: the disposable identity is NEVER a production/release identity.
[CmdletBinding()]
param([switch] $Package)
. "$PSScriptRoot\Signing.Common.ps1"
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$directory = Join-Path $temporaryRoot ('minedock-signing-' + [Guid]::NewGuid().ToString('N'))
$certificate = $null
$thumbprint = $null
$passed = [Collections.Generic.List[string]]::new()
function Expect-Rejection([string] $Name, [scriptblock] $Check) {
    $rejected = $false
    try { & $Check | Out-Null } catch { $rejected = $true }
    if (!$rejected) { throw "Expected rejection: $Name" }
    $passed.Add($Name)
}
try {
    $random = [byte[]]::new(32)
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($random)
    $rng.Dispose()
    $env:WIN_CSC_KEY_PASSWORD = [Convert]::ToBase64String($random)
    $password = ConvertTo-SecureString $env:WIN_CSC_KEY_PASSWORD -AsPlainText -Force
    try { $identity = & "$PSScriptRoot\New-MineDockSigningCertificate.ps1" -OutputDirectory $directory -Password $password | ConvertFrom-Json }
    finally { $password.Dispose() }
    $thumbprint = $identity.certificateStoreThumbprint
    $env:MINEDOCK_WINDOWS_CERT_SHA256 = $identity.certificateSha256
    $env:WIN_CSC_LINK = $identity.pfxPath
    $passed.Add('RSA3072/SHA256/code-signing certificate and encrypted PFX/public CER export')
    $certificate = Open-MineDockPfx $identity.pfxPath $identity.certificateSha256
    $passed.Add('correct PFX password and pinned identity import without persistence')
    $certificate.Dispose()
    $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint"
    $wrongPassword = $env:WIN_CSC_KEY_PASSWORD
    $env:WIN_CSC_KEY_PASSWORD = 'wrong-password'
    Expect-Rejection 'wrong PFX password' { Open-MineDockPfx $identity.pfxPath $identity.certificateSha256 }
    $env:WIN_CSC_KEY_PASSWORD = $wrongPassword
    $wrongPassword = $null
    Expect-Rejection 'wrong pinned certificate' { Assert-MineDockCertificate $certificate ('0' * 64) }
    Expect-Rejection 'refuse overwriting the signing identity directory' { & "$PSScriptRoot\New-MineDockSigningCertificate.ps1" -OutputDirectory $directory }
    $fixture = Join-Path $directory 'fixture.exe'
    Add-Type -TypeDefinition 'public class MineDockSigningTest { public static void Main() { System.Console.WriteLine("Disposable MineDock signing test"); } }' -OutputAssembly $fixture -OutputType ConsoleApplication
    Expect-Rejection 'unsigned PE file' { & "$PSScriptRoot\Test-Authenticode.ps1" -Path $fixture }
    Set-AuthenticodeSignature -LiteralPath $fixture -Certificate $certificate -HashAlgorithm SHA256 | Out-Null
    $verified = & "$PSScriptRoot\Test-Authenticode.ps1" -Path $fixture | ConvertFrom-Json
    if (!$verified.cryptographicIntegrity -or $verified.trustedByThisWindowsInstallation) { throw 'Cryptographic integrity must pass without asserting default Windows trust.' }
    $passed.Add('SHA256 embedded signature and file digest valid; Windows trust remains false')
    Expect-Rejection 'required timestamp missing' { & "$PSScriptRoot\Test-Authenticode.ps1" -Path $fixture -RequireTimestamp }
    $bytes = [IO.File]::ReadAllBytes($fixture)
    $bytes[512] = $bytes[512] -bxor 1
    [IO.File]::WriteAllBytes($fixture, $bytes)
    Expect-Rejection 'modified PE content' { & "$PSScriptRoot\Test-Authenticode.ps1" -Path $fixture }
    $env:RUNNER_TEMP = $directory
    $env:GITHUB_OUTPUT = Join-Path $directory 'ci-output.txt'
    $env:WINDOWS_CERTIFICATE = [Convert]::ToBase64String([IO.File]::ReadAllBytes($identity.pfxPath))
    & "$PSScriptRoot\Prepare-CiSigning.ps1"
    $values = @{}
    Get-Content -LiteralPath $env:GITHUB_OUTPUT | ForEach-Object { $pair = $_.Split('=', 2); $values[$pair[0]] = $pair[1] }
    if ($values['enabled'] -ne 'true') { throw 'CI credential preparation failed.' }
    & "$PSScriptRoot\Remove-CiSigning.ps1" -Directory $values['directory']
    if (Test-Path -LiteralPath $values['directory']) { throw 'CI encrypted PFX cleanup failed.' }
    $passed.Add('CI base64 PFX preparation and confined cleanup')
    Expect-Rejection 'unsafe CI cleanup path' { & "$PSScriptRoot\Remove-CiSigning.ps1" -Directory $directory }
    if ($Package) {
        $env:MINEDOCK_WINDOWS_SIGNING_REQUIRED = 'true'
        node "$PSScriptRoot\..\test-windows-signing.mjs" $directory
        if ($LASTEXITCODE -ne 0) { throw 'Signed native package checks failed.' }
        $passed.Add('native app/NSIS/portable SHA256 RFC3161 signatures and packaged journeys')
    }
    [ordered]@{ architecture = $env:PROCESSOR_ARCHITECTURE; disposableIdentityOnly = $true; checksPassed = $passed.Count; checks = @($passed) } | ConvertTo-Json
}
finally {
    if ($certificate) { $certificate.Dispose() }
    if ($thumbprint -and (Test-Path -LiteralPath "Cert:\CurrentUser\My\$thumbprint")) { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint" -DeleteKey }
    $env:WIN_CSC_KEY_PASSWORD = $null
    $env:WINDOWS_CERTIFICATE = $null
    $env:RUNNER_TEMP = $temporaryRoot
    & "$PSScriptRoot\Remove-CiSigning.ps1" -Directory $directory
}
