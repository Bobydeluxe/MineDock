#Requires -Version 5.1
param([string] $Directory)
$ErrorActionPreference = 'Stop'
if (!$Directory) { return }
if (!$env:RUNNER_TEMP) { throw 'Missing runner temporary directory.' }
$root = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
$target = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
if (!$target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($target) -notmatch '^minedock-signing-[a-f0-9]{32}$') { throw 'Refusing to remove a path outside the dedicated signing directory.' }
if (Test-Path -LiteralPath $target) {
    if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a signing directory reparse point.' }
    Remove-Item -LiteralPath $target -Recurse -Force
}
