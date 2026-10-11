import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = fileURLToPath(new URL('./windows/', import.meta.url));

function nativeCheck(script, args, env = process.env) {
  // Windows PowerShell 5.1 supplies the Windows PKI and .NET Framework SIP/CMS APIs.
  const powershell = path.join(
    env.SystemRoot || 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  try {
    return execFileSync(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(scripts, script),
        ...args,
      ],
      {
        env: {
          ...env,
          PSModulePath: path.join(
            env.SystemRoot || 'C:\\Windows',
            'System32/WindowsPowerShell/v1.0/Modules',
          ),
        },
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  } catch (error) {
    // Never echo the child environment, PFX bytes or passwords from native-tool errors.
    throw new Error(
      `Windows signing check ${script} failed (${error.code || error.status || 'native error'}). Inspect certificate validity, identity, password, timestamp and file integrity using the documented PowerShell checks.`,
    );
  }
}

export function validateWindowsCertificate(env = process.env) {
  return JSON.parse(nativeCheck('Test-SigningCertificate.ps1', [], env));
}

export async function verifyWindowsDistribution(directory, arch, env = process.env) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Unsupported Windows architecture.');
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const files = [
    `win${arch === 'arm64' ? '-arm64' : ''}-unpacked/MineDock.exe`,
    `MineDock-${version}-Setup-${arch}.exe`,
    `MineDock-${version}-Portable-${arch}.exe`,
  ];
  const results = files.map((file) =>
    JSON.parse(
      nativeCheck(
        'Test-Authenticode.ps1',
        ['-Path', path.resolve(directory, file), '-RequireTimestamp'],
        env,
      ),
    ),
  );
  for (const result of results) console.log(JSON.stringify(result));
  return results;
}
