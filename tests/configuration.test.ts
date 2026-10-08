import { expect, it } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import { AppCore } from '../packages/core/app';
it('edits only real non-secret typed YAML settings, preserves comments and rejects stale previews', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    await mkdir(path.join(f.server.path, 'config'));
    const file = 'config/paper-global.yml';
    await writeFile(
      path.join(f.server.path, file),
      '# keep comment\nchunk-system:\n  io-threads: 2\npassword: private-value\n',
    );
    const doc = (await core.configuration.documents(f.server.id))[0]!;
    expect(doc.fields).toHaveLength(1);
    await core.configuration.edit(f.server.id, {
      file,
      key: ['chunk-system', 'io-threads'],
      value: 3,
      sha256: doc.sha256,
    });
    expect(await readFile(path.join(f.server.path, file), 'utf8')).toContain('# keep comment');
    await expect(
      core.configuration.edit(f.server.id, {
        file,
        key: ['chunk-system', 'io-threads'],
        value: 4,
        sha256: doc.sha256,
      }),
    ).rejects.toThrow('Refresh');
    const version = core.configuration.history(f.server.id)[0]!;
    expect(
      String(
        core.repo.db.prepare('SELECT content FROM config_versions WHERE id=?').get(version.id)
          ?.content,
      ),
    ).not.toContain('private-value');
    await core.configuration.restore(f.server.id, version.id, f.server.name);
    expect(await readFile(path.join(f.server.path, file), 'utf8')).toContain('io-threads: 2');
    expect(core.configuration.history(f.server.id)).toHaveLength(2);
  } finally {
    await core.close();
    await f.cleanup();
  }
});
it('bounds encrypted history and refuses invalid, traversal and secret edits', async () => {
  const f = await fixture();
  f.repo.close();
  const core = await AppCore.open(f.root, f.secrets);
  try {
    const file = 'purpur.yml';
    await writeFile(path.join(f.server.path, file), 'foo: 0\n');
    for (let i = 1; i <= 14; i++)
      await core.configuration.write(f.server.id, file, 'foo: ' + i + '\n');
    expect(core.configuration.history(f.server.id)).toHaveLength(10);
    await expect(core.configuration.write(f.server.id, file, 'broken: [')).rejects.toThrow(
      'Invalid YAML',
    );
    expect(core.configuration.history(f.server.id)).toHaveLength(10);
    await expect(core.configuration.write(f.server.id, '../escape.json', '{}')).rejects.toThrow();
    await expect(core.configuration.write(f.server.id, '.env', 'secret=1')).rejects.toThrow();
    expect((await core.configuration.audit(f.server.id)).findings).toContain('rconEnabled');
  } finally {
    await core.close();
    await f.cleanup();
  }
});
