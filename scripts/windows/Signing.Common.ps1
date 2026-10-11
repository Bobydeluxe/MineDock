#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CertificateSha256([System.Security.Cryptography.X509Certificates.X509Certificate2] $Certificate) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Certificate.RawData))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Assert-MineDockCertificate($Certificate, [string] $ExpectedSha256, [switch] $RequirePrivateKey) {
    if ($ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Set MINEDOCK_WINDOWS_CERT_SHA256 to the public certificate SHA-256 fingerprint (64 hex characters).' }
    if ($Certificate.Subject -cne 'CN=MineDock') { throw 'The signing certificate subject must be CN=MineDock.' }
    if ((Get-CertificateSha256 $Certificate) -ne $ExpectedSha256.ToLowerInvariant()) { throw 'The signing certificate does not match the pinned identity.' }
    if ($Certificate.Subject -cne $Certificate.Issuer) { throw 'This signing configuration requires the owner self-signed certificate.' }
    if ($RequirePrivateKey -and !$Certificate.HasPrivateKey) { throw 'The certificate has no private key.' }
    if ($Certificate.NotBefore -gt (Get-Date) -or $Certificate.NotAfter -le (Get-Date)) { throw 'The signing certificate is expired or not yet valid.' }
    if ($Certificate.SignatureAlgorithm.Value -ne '1.2.840.113549.1.1.11') { throw 'The certificate must use SHA-256 with RSA.' }
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($Certificate)
    try { if (!$rsa -or $rsa.KeySize -lt 3072) { throw 'The signing certificate must use RSA with at least 3072 bits.' } }
    finally { if ($rsa) { $rsa.Dispose() } }
    $eku = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' })
    if ($eku.Count -ne 1 -or '1.3.6.1.5.5.7.3.3' -notin @($eku[0].EnhancedKeyUsages | ForEach-Object { $_.Value })) { throw 'The certificate must have the Code Signing extended key usage.' }
    $usage = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.15' })
    if ($usage.Count -ne 1 -or !($usage[0].KeyUsages -band [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature)) { throw 'The certificate must allow digital signatures.' }
}

function Open-MineDockPfx([string] $Path, [string] $ExpectedSha256) {
    if (!$env:WIN_CSC_KEY_PASSWORD) { throw 'The Windows PFX password environment variable is missing.' }
    $secure = ConvertTo-SecureString -String $env:WIN_CSC_KEY_PASSWORD -AsPlainText -Force
    try {
        # No persistent private key or trust-store installation during validation/CI.
        $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([IO.Path]::GetFullPath($Path), $secure, $flags)
        }
        else {
            $bytes = [Convert]::FromBase64String($Path)
            $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes, $secure, $flags)
        }
    }
    catch { throw 'Unable to open the signing PFX. Check its path, password and format.' }
    finally { $secure.Dispose() }
    try { Assert-MineDockCertificate $cert $ExpectedSha256 -RequirePrivateKey; return $cert }
    catch { $cert.Dispose(); throw }
}

function Set-PrivateSigningDirectory([string] $Path) {
    $directory = New-Item -ItemType Directory -Path $Path -ErrorAction Stop
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-Acl -LiteralPath $directory.FullName -AclObject $acl
    return $directory.FullName
}
