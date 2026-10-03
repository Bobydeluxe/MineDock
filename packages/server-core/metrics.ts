import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pidusage from 'pidusage';
const exec = promisify(execFile);
const previous = new Map<number, { cpu: number; at: number }>();
/** Windows 11 no longer ships WMIC. Use the supported process API through PowerShell. */
export async function processUsage(pid: number): Promise<{ cpu: number; memory: number }> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid process identifier.');
  if (process.platform !== 'win32') return pidusage(pid);
  const result = await exec(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$p = Get-Process -Id ${pid} -ErrorAction Stop; @{ cpu = $p.CPU; memory = $p.WorkingSet64 } | ConvertTo-Json -Compress`,
    ],
    { windowsHide: true, timeout: 4500 },
  );
  const value = JSON.parse(result.stdout) as { cpu: number; memory: number };
  const at = Date.now();
  const prev = previous.get(pid);
  previous.set(pid, { cpu: value.cpu, at });
  return {
    cpu: prev ? Math.max(0, ((value.cpu - prev.cpu) * 100000) / Math.max(1, at - prev.at)) : 0,
    memory: value.memory,
  };
}
export function clearProcessUsage(pid?: number): void {
  if (pid) previous.delete(pid);
  else {
    previous.clear();
    pidusage.clear();
  }
}
