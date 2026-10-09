import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import type { AppCore } from './app';
import type { SecretStore } from '../security/secrets';
import { containedPath, validateRelative } from '../security/paths';
import { parseProperties } from '../domain/properties';
import {
  configEditSchema,
  type ConfigDocument,
  type ConfigVersion,
  type ConfigAudit,
  type ConfigField,
} from '../domain/configuration';
import { DomainError } from '../domain/errors';
import { paperSettings } from '../domain/paper-settings';
const secret = /password|secret|token|credential|private.?key|authentication|session/i;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export class ConfigurationService {
  constructor(
    private core: AppCore,
    private secrets: SecretStore,
  ) {}
  async remember(id: string, file: string) {
    validateRelative(file);
    if (
      !/\.(?:properties|ya?ml|json|toml|conf|txt)$/i.test(file) ||
      /(?:^|[\\/])(?:eula.txt|.*\.log)$/i.test(file)
    )
      return;
    const server = this.core.repo.server(id);
    let content: string;
    try {
      content = await this.core.files.read(server.path, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const checksum = hash(content);
    const last = this.core.repo.db
      .prepare(
        'SELECT sha256 FROM config_versions WHERE server_id=? AND file=? ORDER BY rowid DESC LIMIT 1',
      )
      .get(id, file);
    if (last?.sha256 === checksum) return;
    this.core.repo.db
      .prepare('INSERT INTO config_versions VALUES(?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        id,
        file,
        new Date().toISOString(),
        checksum,
        this.secrets.encrypt(content),
        Buffer.byteLength(content),
      );
    this.core.repo.db
      .prepare(
        'DELETE FROM config_versions WHERE server_id=? AND file=? AND id NOT IN (SELECT id FROM config_versions WHERE server_id=? AND file=? ORDER BY rowid DESC LIMIT 10)',
      )
      .run(id, file, id, file);
    this.core.repo.db
      .prepare(
        'DELETE FROM config_versions WHERE server_id=? AND id NOT IN (SELECT id FROM config_versions WHERE server_id=? ORDER BY rowid DESC LIMIT 200)',
      )
      .run(id, id);
    this.core.repo.db
      .prepare('DELETE FROM config_versions WHERE at<?')
      .run(new Date(Date.now() - 90 * 86400000).toISOString());
    while (
      Number(
        this.core.repo.db
          .prepare('SELECT COALESCE(SUM(bytes),0) total FROM config_versions WHERE server_id=?')
          .get(id)?.total,
      ) >
      20 * 1024 * 1024
    )
      this.core.repo.db
        .prepare(
          'DELETE FROM config_versions WHERE id=(SELECT id FROM config_versions WHERE server_id=? ORDER BY rowid LIMIT 1)',
        )
        .run(id);
  }
  history(id: string): ConfigVersion[] {
    this.core.repo.server(id);
    return this.core.repo.db
      .prepare(
        'SELECT id,file,at FROM config_versions WHERE server_id=? ORDER BY rowid DESC LIMIT 200',
      )
      .all(id)
      .map((r) => ({ id: String(r.id), file: String(r.file), at: String(r.at) }));
  }
  async write(id: string, file: string, content: string) {
    await this.core.exclusive(id, async () => {
      const server = this.core.assertStopped(id);
      this.core.fileOperations.protect(server, file);
      // Validate in a private temporary scope first, so invalid input creates no history.
      await this.core.files.validate(file, content);
      await this.remember(id, file);
      await this.core.files.write(server.path, file, content);
      this.core.repo.audit('file.saved', file, id);
    });
  }
  async restore(id: string, version: string, confirmation: string) {
    const server = this.core.assertStopped(id);
    if (confirmation !== server.name) throw new DomainError('CONFIRM', 'Incorrect confirmation.');
    const row = this.core.repo.db
      .prepare('SELECT file,content,sha256 FROM config_versions WHERE id=? AND server_id=?')
      .get(version, id);
    if (!row) throw new DomainError('CONFIG', 'Configuration version was not found.');
    const text = this.secrets.decrypt(String(row.content));
    if (hash(text) !== row.sha256)
      throw new DomainError('INTEGRITY', 'Configuration history is damaged.');
    // Both paths save the current version before applying the selected version.
    if (String(row.file) === 'server.properties') {
      const values = parseProperties(text);
      for (const key of Object.keys(values)) if (secret.test(key)) delete values[key];
      await this.core.saveProperties(id, values);
    } else await this.write(id, String(row.file), text);
  }
  private async candidates(id: string) {
    const server = this.core.repo.server(id),
      files = new Set<string>();
    if (['paper', 'purpur'].includes(server.engine))
      [
        'config/paper-global.yml',
        'config/paper-world-defaults.yml',
        'bukkit.yml',
        'spigot.yml',
      ].forEach((f) => files.add(f));
    if (server.engine === 'purpur') files.add('purpur.yml');
    if (['fabric', 'forge', 'neoforge'].includes(server.engine)) {
      try {
        for (const e of (
          await readdir(await containedPath(server.path, 'config'), { withFileTypes: true })
        ).slice(0, 100))
          if (e.isFile() && /\.(json|ya?ml)$/i.test(e.name)) files.add('config/' + e.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return [...files];
  }
  async documents(id: string): Promise<ConfigDocument[]> {
    const server = this.core.repo.server(id),
      result: ConfigDocument[] = [];
    for (const file of await this.candidates(id)) {
      let text: string;
      try {
        text = await this.core.files.read(server.path, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const doc = /\.json$/i.test(file)
        ? JSON.parse(text)
        : parseDocument(text).toJS({ maxAliasCount: 20 });
      const fields: ConfigField[] = [];
      const walk = (value: unknown, keys: string[]) => {
        if (
          keys.length > 12 ||
          fields.length >= 300 ||
          keys.some((k) => secret.test(k) || ['__proto__', 'constructor', 'prototype'].includes(k))
        )
          return;
        if (
          ['string', 'number', 'boolean'].includes(typeof value) &&
          keys.length &&
          keys.at(-1) !== '_version'
        ) {
          const label = keys.join('.');
          fields.push({
            ...(paperSettings[file + ':' + label]
              ? { curated: true, ...paperSettings[file + ':' + label] }
              : {}),
            key: keys,
            value: value as string | number | boolean,
            category: /network|packet|connection|proxy|join/i.test(label)
              ? 'network'
              : /tick|thread|chunk|distance|limit/i.test(label)
                ? 'resources'
                : /spawn|world|dimension|seed/i.test(label)
                  ? 'world'
                  : /pvp|mob|villager|game|damage|weather/i.test(label)
                    ? 'gameplay'
                    : 'advanced',
          });
        } else if (value && typeof value === 'object' && !Array.isArray(value))
          for (const [k, v] of Object.entries(value)) walk(v, [...keys, k]);
      };
      walk(doc, []);
      result.push({ file, sha256: hash(text), fields });
    }
    return result;
  }
  async edit(id: string, raw: unknown) {
    const input = configEditSchema.parse(raw);
    await this.core.exclusive(id, async () => {
      const server = this.core.assertStopped(id),
        documents = await this.documents(id),
        document = documents.find((d) => d.file === input.file),
        field = document?.fields.find((f) => JSON.stringify(f.key) === JSON.stringify(input.key));
      if (!document || document.sha256 !== input.sha256 || !field)
        throw new DomainError('STALE', 'Refresh configuration before editing.');
      if (typeof field.value !== typeof input.value)
        throw new DomainError('CONFIG', 'The setting type cannot be changed.');
      if (typeof input.value === 'number' && Math.abs(input.value) > 1000000000)
        throw new DomainError('CONFIG', 'The setting value is out of range.');
      if (
        typeof input.value === 'number' &&
        field.curated &&
        (!Number.isInteger(input.value) ||
          (field.min !== undefined && input.value < field.min) ||
          (field.max !== undefined && input.value > field.max))
      )
        throw new DomainError('CONFIG', 'The setting value is out of range.');
      const original = await this.core.files.read(server.path, input.file);
      let output: string;
      if (/\.json$/i.test(input.file)) {
        const doc = JSON.parse(original);
        let target = doc;
        for (const key of input.key.slice(0, -1)) target = target[key];
        target[input.key.at(-1)!] = input.value;
        output = JSON.stringify(doc, null, 2) + '\n';
      } else {
        const doc = parseDocument(original);
        doc.setIn(input.key, input.value);
        output = doc.toString();
      }
      this.core.fileOperations.protect(server, input.file);
      await this.core.files.validate(input.file, output);
      await this.remember(id, input.file);
      await this.core.files.write(server.path, input.file, output);
      this.core.repo.audit('config.edited', input.file + ': ' + input.key.join('.'), id);
    });
  }
  async audit(id: string): Promise<ConfigAudit> {
    const server = this.core.repo.server(id),
      props = parseProperties(
        await readFile(await containedPath(server.path, 'server.properties'), 'utf8'),
      ),
      findings: ConfigAudit['findings'] = [];
    if (props['online-mode'] === 'false') findings.push('offlineIdentity');
    const bind = props['server-ip'] ?? '';
    if (!bind || bind === '0.0.0.0') findings.push('publicBind');
    if ((props['white-list'] ?? props['allow-list']) !== 'true') findings.push('whitelistOff');
    if (props['enable-rcon'] === 'true')
      findings.push(props['rcon.password'] ? 'rconEnabled' : 'rconMissing');
    if (process.platform === 'win32') findings.push('permissionsUnknown');
    else if ((await stat(server.path)).mode & 0o002) findings.push('permissionsOpen');
    return { findings, port: server.port, bind };
  }
}
