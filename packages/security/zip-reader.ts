import yauzl from 'yauzl';
import { DomainError } from '../domain/errors';
/** Read selected archive entries with bounded decompression, without extracting paths. */
export async function readZipEntries(
  filename: string,
  names: string[],
  maximum = 2 * 1024 ** 2,
  signal?: AbortSignal,
): Promise<Map<string, Buffer>> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error('Invalid ZIP file.'));
        return;
      }
      const result = new Map<string, Buffer>();
      let count = 0,
        bytes = 0,
        finished = false;
      const abort = () =>
        fail(signal?.reason ?? new DOMException('Operation cancelled.', 'AbortError'));
      const fail = (error: unknown) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', abort);
        zip.close();
        reject(error);
      };
      signal?.addEventListener('abort', abort, { once: true });
      zip.on('error', fail);
      zip.on('end', () => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', abort);
        resolve(result);
      });
      zip.on('entry', (entry: yauzl.Entry) => {
        if (++count > 100000) {
          fail(new DomainError('SIZE', 'The archive contains too many entries.'));
          return;
        }
        if (!names.includes(entry.fileName)) {
          zip.readEntry();
          return;
        }
        if (result.has(entry.fileName) || entry.uncompressedSize > maximum) {
          fail(new DomainError('SIZE', 'Invalid or oversized archive metadata.'));
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            fail(error ?? new Error('Unable to read ZIP entry.'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > maximum) {
              stream.destroy();
              fail(new DomainError('SIZE', 'Archive metadata exceeds the size limit.'));
            } else chunks.push(chunk);
          });
          stream.on('end', () => {
            if (finished) return;
            result.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      if (signal?.aborted) abort();
      else zip.readEntry();
    });
  });
}
