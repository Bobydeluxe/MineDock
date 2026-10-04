import { it, expect } from 'vitest';
import { mkdir, writeFile, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixture } from './helpers';
import { extractRuntimeTar } from '../packages/security/runtime-tar';
import { resolveSystemPath } from '../packages/security/paths';
import { AppCore } from '../packages/core/app';

function archive(entries: { name: string; type?: string; link?: string; text?: string }[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512),
      data = Buffer.from(entry.text ?? '');
    header.write(entry.name, 0, 100);
    header.write('0000755\0', 100, 8);
    header.write('0000000\0', 108, 8);
    header.write('0000000\0', 116, 8);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12);
    header.write('00000000000\0', 136, 12);
    header.fill(32, 148, 156);
    header.write(entry.type ?? '0', 156, 1);
    if (entry.link) header.write(entry.link, 157, 100);
    header.write('ustar\0', 257, 6);
    header.write('00', 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    chunks.push(header);
    if (data.length) chunks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}
it('accepts ordinary official-runtime tar paths and rejects absolute/escaping links, devices and duplicate files before extraction', async () => {
  const f = await fixture();
  try {
    const destination = path.join(f.root, 'tar-output'),
      filename = path.join(f.root, 'runtime.tar');
    await mkdir(destination);
    await writeFile(
      filename,
      archive([
        { name: './', type: '5' },
        { name: './runtime/', type: '5' },
        { name: './runtime/file', text: 'native bytes' },
      ]),
    );
    await extractRuntimeTar(filename, destination);
    expect(await readFile(path.join(destination, 'runtime/file'), 'utf8')).toBe('native bytes');
    for (const entries of [
      [{ name: 'runtime/link', type: '2', link: '/etc/passwd' }],
      [{ name: 'runtime/lib/link', type: '2', link: '../../../outside' }],
      [{ name: 'runtime/hard', type: '1', link: '../outside' }],
      [{ name: 'runtime/device', type: '3' }],
      [
        { name: 'runtime/file', text: 'first' },
        { name: 'runtime/file', text: 'second' },
      ],
    ]) {
      await writeFile(filename, archive(entries));
      await expect(extractRuntimeTar(filename, destination)).rejects.toThrow(
        /Unsafe|Duplicate|allowed/,
      );
      expect(await readFile(path.join(destination, 'runtime/file'), 'utf8')).toBe('native bytes');
    }
    const signal = new AbortController();
    signal.abort();
    await expect(extractRuntimeTar(filename, destination, signal.signal)).rejects.toThrow();
    expect(await readdir(destination)).toEqual(['runtime']);
  } finally {
    await f.cleanup();
  }
});
it.skipIf(process.platform === 'win32')(
  'extracts only contained native library symlinks and hard links',
  async () => {
    const f = await fixture();
    try {
      const destination = path.join(f.root, 'tar-output'),
        filename = path.join(f.root, 'runtime.tar');
      await mkdir(destination);
      await writeFile(
        filename,
        archive([
          { name: 'runtime/', type: '5' },
          { name: 'runtime/lib/', type: '5' },
          { name: 'runtime/file', text: 'library' },
          { name: 'runtime/lib/link', type: '2', link: '../file' },
          { name: 'runtime/hard', type: '1', link: 'runtime/file' },
        ]),
      );
      await extractRuntimeTar(filename, destination);
      expect(await realpath(path.join(destination, 'runtime/lib/link'))).toBe(
        path.join(destination, 'runtime/file'),
      );
      expect(await readFile(path.join(destination, 'runtime/hard'), 'utf8')).toBe('library');
    } finally {
      await f.cleanup();
    }
  },
);
it.skipIf(process.platform !== 'darwin')(
  'normalizes verified macOS system aliases for legacy data and native export paths',
  async () => {
    const f = await fixture(),
      alias = f.root.replace(/^\/private\/var\//, '/var/');
    const core = await AppCore.open(alias, f.secrets);
    try {
      expect(core.root).toBe(f.root);
      expect(resolveSystemPath(alias)).toBe(f.root);
      const backup = await core.backups.create(f.server.id),
        target = path.join(alias, 'selected.zip');
      await core.exportBackup(backup.id, target);
      expect((await readFile(target)).length).toBe(backup.size);
    } finally {
      await core.close();
      await f.cleanup();
    }
  },
);

it.skipIf(process.platform !== 'win32')(
  'normalizes native temporary-directory short aliases without relaxing link checks',
  async () => {
    const f = await fixture();
    try {
      const alias = path.join(os.tmpdir(), path.basename(f.root));
      expect(resolveSystemPath(alias)).toBe(f.root);
      expect(resolveSystemPath(alias, 'new.zip')).toBe(path.join(f.root, 'new.zip'));
    } finally {
      await f.cleanup();
    }
  },
);
