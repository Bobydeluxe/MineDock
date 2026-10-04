import { spawn } from 'node:child_process';
import { writeFile, lstat, realpath, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors';
import { containedPath } from '../security/paths';
import type { VerifiedUpdate } from '../domain/updates';
const windowsHelper = String.raw`param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
$taskRequest = Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json
$taskSource = [IO.Path]::GetFullPath($taskRequest.source)
$taskDestination = [IO.Path]::GetFullPath($taskRequest.destination)
$taskNext = $taskDestination + '.minedock-next-' + $taskRequest.id
$taskPrevious = $taskDestination + '.minedock-previous-' + $taskRequest.id
function Get-TaskHash([string]$Filename) {
  $taskHash = [Security.Cryptography.SHA256]::Create()
  $taskStream = [IO.File]::OpenRead($Filename)
  try { return [BitConverter]::ToString($taskHash.ComputeHash($taskStream)).Replace('-','').ToLowerInvariant() }
  finally { $taskStream.Dispose(); $taskHash.Dispose() }
}
try {
  for ($taskWait = 0; $taskWait -lt 120; $taskWait++) {
    if (-not (Get-Process -Id $taskRequest.parentPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 1
  }
  if (Get-Process -Id $taskRequest.parentPid -ErrorAction SilentlyContinue) { throw 'MineDock did not close in time.' }
  if ((Get-TaskHash $taskSource) -ne $taskRequest.sha256) { throw 'Update checksum failed.' }
  if ((Test-Path -LiteralPath $taskNext) -or (Test-Path -LiteralPath $taskPrevious)) { throw 'An update staging file already exists.' }
  Copy-Item -LiteralPath $taskSource -Destination $taskNext -ErrorAction Stop
  if ((Get-TaskHash $taskNext) -ne $taskRequest.sha256) { throw 'Prepared update checksum failed.' }
  Move-Item -LiteralPath $taskDestination -Destination $taskPrevious -ErrorAction Stop
  try { Move-Item -LiteralPath $taskNext -Destination $taskDestination -ErrorAction Stop }
  catch { Move-Item -LiteralPath $taskPrevious -Destination $taskDestination -ErrorAction Stop; throw }
  Start-Process -FilePath $taskDestination -WindowStyle Hidden
  @{status='completed'; previous=$taskPrevious} | ConvertTo-Json | Set-Content -LiteralPath $taskRequest.result -Encoding utf8
} catch {
  $taskFailure = $_.Exception.Message
  if ((Test-Path -LiteralPath $taskPrevious) -and -not (Test-Path -LiteralPath $taskNext)) {
    try {
      if (Test-Path -LiteralPath $taskDestination) { Move-Item -LiteralPath $taskDestination -Destination $taskNext -ErrorAction Stop }
      Move-Item -LiteralPath $taskPrevious -Destination $taskDestination -ErrorAction Stop
    } catch { $taskFailure += ' The previous copy needs manual recovery.' }
  }
  @{status='failed'; message=$taskFailure} | ConvertTo-Json | Set-Content -LiteralPath $taskRequest.result -Encoding utf8
}
`;
const unixHelper = String.raw`#!/bin/sh
set -eu
kind=$1
source=$2
destination=$3
next=$4
previous=$5
expected=$6
parent_pid=$7
result=$8
failed() {
  if [ -e "$previous" ]; then
    if [ ! -e "$destination" ]; then mv "$previous" "$destination" || true
    elif [ ! -e "$next" ]; then
      mv "$destination" "$next" && mv "$previous" "$destination" || true
    fi
  fi
  printf '{"status":"failed","message":"Native update replacement failed; review the preserved copies."}\n' > "$result"
}
trap failed EXIT
attempt=0
while kill -0 "$parent_pid" 2>/dev/null; do
  attempt=$((attempt+1))
  [ "$attempt" -lt 120 ] || exit 1
  sleep 1
done
if [ "$kind" = appimage ]; then
  actual=$(sha256sum -- "$source" | cut -d ' ' -f 1)
else
  actual=$(/usr/bin/shasum -a 256 "$source" | cut -d ' ' -f 1)
fi
[ "$actual" = "$expected" ]
[ ! -e "$next" ] && [ ! -e "$previous" ]
if [ "$kind" = appimage ]; then
  cp -- "$source" "$next"
  chmod --reference="$destination" "$next"
  prepared=$(sha256sum -- "$next" | cut -d ' ' -f 1)
  [ "$prepared" = "$expected" ]
else
  mkdir "$next"
  /usr/bin/ditto -x -k "$source" "$next"
  [ -d "$next/MineDock.app" ]
fi
mv "$destination" "$previous"
if [ "$kind" = appimage ]; then
  if ! mv "$next" "$destination"; then mv "$previous" "$destination"; exit 1; fi
else
  if ! mv "$next/MineDock.app" "$destination"; then mv "$previous" "$destination"; exit 1; fi
  rmdir "$next"
fi
if [ "$kind" = appimage ]; then "$destination" >/dev/null 2>&1 &
else /usr/bin/open -n "$destination"
fi
printf '{"status":"completed"}\n' > "$result"
trap - EXIT
`;
export interface InstallLaunch {
  command: string;
  args: string[];
  requestFile?: string;
  resultFile?: string;
  previous?: string;
}
/** Destination is supplied by Electron's native executable/bundle paths, never by IPC. */
export async function prepareUpdateLaunch(
  root: string,
  source: string,
  update: VerifiedUpdate,
  destination?: string,
  parentPid = process.pid,
): Promise<InstallLaunch> {
  const target = update.artifact.target;
  if (target === 'nsis') {
    if (process.platform !== 'win32')
      throw new DomainError('UPDATE_PLATFORM', 'This installer requires Windows.');
    return { command: source, args: [] };
  }
  if (target === 'deb' || target === 'dmg')
    throw new DomainError(
      'UPDATE_INSTALL',
      'Open this verified package with the operating system installer.',
    );
  if (!destination)
    throw new DomainError(
      'UPDATE_INSTALL',
      'The current application location is unavailable. Reinstall from the verified package.',
    );
  const expectedPlatform =
    target === 'portable' ? 'win32' : target === 'appimage' ? 'linux' : 'darwin';
  if (process.platform !== expectedPlatform)
    throw new DomainError(
      'UPDATE_PLATFORM',
      'The update installer does not match this operating system.',
    );
  const canonical = path.resolve(destination),
    info = await lstat(canonical);
  if (
    info.isSymbolicLink() ||
    path.resolve(await realpath(canonical)) !== canonical ||
    (target === 'maczip' ? !info.isDirectory() || !canonical.endsWith('.app') : !info.isFile())
  )
    throw new DomainError(
      'UPDATE_INSTALL',
      'The current application location cannot be replaced safely.',
    );
  await access(path.dirname(canonical), constants.W_OK);
  const id = randomUUID(),
    helper = await containedPath(root, 'helper-' + id + (target === 'portable' ? '.ps1' : '.sh')),
    requestFile = await containedPath(root, 'request-' + id + '.json'),
    resultFile = await containedPath(root, 'result-' + id + '.json'),
    previous = canonical + '.minedock-previous-' + id,
    next = canonical + '.minedock-next-' + id;
  await writeFile(
    requestFile,
    JSON.stringify({
      id,
      source,
      destination: canonical,
      parentPid,
      sha256: update.artifact.sha256,
      version: update.version,
      result: resultFile,
      previous,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  await writeFile(helper, target === 'portable' ? windowsHelper : unixHelper, {
    flag: 'wx',
    mode: 0o700,
  });
  if (target === 'portable')
    return {
      command: path.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        helper,
        '-RequestPath',
        requestFile,
      ],
      requestFile,
      resultFile,
      previous,
    };
  return {
    command: '/bin/sh',
    args: [
      helper,
      target,
      source,
      canonical,
      next,
      previous,
      update.artifact.sha256,
      String(parentPid),
      resultFile,
    ],
    requestFile,
    resultFile,
    previous,
  };
}
export async function launchUpdate(plan: InstallLaunch): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(plan.command, plan.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
