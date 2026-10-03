import { mkdir, stat, rename, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { redact } from '../security/secrets';
export class Logger {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly root: string) {}
  write(message: string, error = false): void {
    this.queue = this.queue
      .then(async () => {
        await mkdir(this.root, { recursive: true });
        const filename = path.join(this.root, error ? 'error.log' : 'application.log');
        try {
          if ((await stat(filename)).size > 5 * 1024 * 1024)
            await rename(filename, filename + '.1');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        await appendFile(filename, `${new Date().toISOString()} ${redact(message)}\n`);
      })
      .catch((e) => console.error('Application logger:', e));
  }
  async flush(): Promise<void> {
    await this.queue;
  }
}
