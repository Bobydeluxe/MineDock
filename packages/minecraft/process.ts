import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { DomainError } from '../domain/errors';
/** Installer subprocesses use fixed argument arrays and an isolated staging directory. */
export async function installerProcess(
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal | undefined,
  log: (line: string) => void,
  timeout = 15 * 60 * 1000,
): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      timeout,
      killSignal: 'SIGKILL',
    });
    const streams = [
      createInterface({ input: child.stdout }),
      createInterface({ input: child.stderr }),
    ];
    let lines = 0;
    for (const stream of streams)
      stream.on('line', (line) => {
        if (++lines < 100000) log(line.slice(0, 16000));
      });
    child.once('error', reject);
    child.once('close', (code, termination) => {
      streams.forEach((stream) => stream.close());
      if (code === 0) resolve();
      else
        reject(
          new DomainError(
            'INSTALL',
            `Installer exited with ${code ?? termination}. Check the installation log.`,
          ),
        );
    });
  });
}
