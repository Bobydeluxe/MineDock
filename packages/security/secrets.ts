import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export interface SecretStore {
  encrypt(value: string): string;
  decrypt(value: string): string;
}
/** Fallback for development/headless tests; desktop injects OS safeStorage. */
export class LocalSecretStore implements SecretStore {
  private constructor(private readonly key: Buffer) {}
  static async open(root: string): Promise<LocalSecretStore> {
    const filename = path.join(root, '.secret-key');
    let key: Buffer;
    try {
      key = await readFile(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      key = randomBytes(32);
      await writeFile(filename, key, { flag: 'wx', mode: 0o600 });
    }
    if (key.length !== 32) throw new Error('The local encryption key is invalid.');
    return new LocalSecretStore(key);
  }
  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    return Buffer.concat([
      iv,
      cipher.update(value, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  }
  decrypt(value: string): string {
    const data = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(-16));
    return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString(
      'utf8',
    );
  }
}
export function redact(text: string): string {
  return text
    .replace(
      /(password|rcon\.password|token|secret|authorization)(\s*[=:]\s*|\s+)[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]');
}
