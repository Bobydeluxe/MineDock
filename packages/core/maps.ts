import { mkdir } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import type { AppCore } from './app';
import { mapKindSchema, mapApplySchema, type MapKind, type MapStatus } from '../domain/maps';
import { DomainError } from '../domain/errors';
import { atomicWrite, containedPath } from '../security/paths';
import { checkPort } from '../networking/network';
export class MapAssistant {
  private plans = new Map<string, { id: string; kind: MapKind; expires: number }>();
  constructor(private core: AppCore) {}
  async plan(id: string, raw: unknown) {
    const kind = mapKindSchema.parse(raw),
      server = this.core.repo.server(id);
    if (!['paper', 'purpur'].includes(server.engine))
      throw new DomainError(
        'CAPABILITY',
        'The map assistant currently supports Paper/Purpur plugins.',
      );
    const plan = await this.core.mods.plan(server, { selections: [{ projectId: kind }] });
    for (const [key, value] of this.plans) if (value.expires < Date.now()) this.plans.delete(key);
    if (this.plans.size >= 20) this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(plan.token, { id, kind, expires: Date.now() + 600000 });
    return plan;
  }
  async apply(id: string, raw: unknown) {
    const input = mapApplySchema.parse(raw);
    await this.core.exclusive(id, async () => {
      const server = this.core.assertStopped(id),
        plan = this.plans.get(input.token);
      if (!plan || plan.id !== id || plan.kind !== input.kind || plan.expires < Date.now())
        throw new DomainError('STALE', 'Review the map installation again.');
      if (input.confirmation !== server.name)
        throw new DomainError('CONFIRM', 'Incorrect confirmation.');
      if (
        (await this.core.reservedPorts()).has(input.port) ||
        !(await checkPort(input.port, 'tcp'))
      )
        throw new DomainError('PORT', 'This map port is already in use.');
      await this.core.safetyBackup(id, 'before_content');
      // Constrain the webserver before installing a plugin that might otherwise bind publicly.
      await this.configure(id, input.kind, input.port, input.acceptAssets);
      await this.core.mods.apply(this.core.repo.server(id), input.token);
      this.plans.delete(input.token);
      this.core.repo.audit('map.configured', input.kind + ' on loopback', id);
    });
  }
  async configure(id: string, kind: MapKind, port: number, acceptAssets: boolean) {
    const server = this.core.assertStopped(id);
    const folder = kind === 'bluemap' ? 'plugins/BlueMap' : 'plugins/dynmap';
    await mkdir(await containedPath(server.path, folder), { recursive: true });
    const read = async (file: string) => {
      try {
        return await this.core.files.read(server.path, file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return '';
        throw e;
      }
    };
    if (kind === 'bluemap') {
      for (const [file, values] of [
        [folder + '/webserver.conf', { ip: '"127.0.0.1"', port: String(port), enabled: 'true' }],
        [folder + '/core.conf', { 'accept-download': String(acceptAssets) }],
      ] as const) {
        let text = await read(file);
        for (const [key, value] of Object.entries(values)) {
          const line = new RegExp('^\\s*' + key + '\\s*[:=].*$', 'gm');
          text = line.test(text)
            ? text.replace(line, key + ': ' + value)
            : text + '\n' + key + ': ' + value + '\n';
        }
        await this.core.configuration.remember(id, file);
        await atomicWrite(await containedPath(server.path, file), text);
      }
    } else {
      const file = folder + '/configuration.txt',
        doc = parseDocument(await read(file));
      doc.toJS({ maxAliasCount: 20 });
      doc.set('webserver-bindaddress', '127.0.0.1');
      doc.set('webserver-port', port);
      doc.set('disable-webserver', false);
      await this.core.configuration.remember(id, file);
      await atomicWrite(await containedPath(server.path, file), doc.toString());
    }
  }
  async status(id: string): Promise<MapStatus[]> {
    const server = this.core.repo.server(id),
      items = this.core.repo.content(id);
    return Promise.all(
      (['bluemap', 'dynmap'] as const).map(async (kind) => {
        const installed = items.some(
          (item) => item.enabled && (item.projectId === kind || item.title.toLowerCase() === kind),
        );
        let port: number | undefined;
        try {
          const file =
            kind === 'bluemap'
              ? 'plugins/BlueMap/webserver.conf'
              : 'plugins/dynmap/configuration.txt';
          const text = await this.core.files.read(server.path, file);
          if (Buffer.byteLength(text) > 2 * 1024 * 1024)
            throw new Error('Configuration exceeds limit.');
          if (kind === 'bluemap' && /^\s*ip\s*[:=]\s*"127\.0\.0\.1"\s*$/m.test(text))
            port = Number(/^\s*port\s*[:=]\s*(\d+)\s*$/m.exec(text)?.[1]);
          else if (kind === 'dynmap') {
            const doc = parseDocument(text).toJS({ maxAliasCount: 20 });
            if (doc['webserver-bindaddress'] === '127.0.0.1' && !doc['disable-webserver'])
              port = Number(doc['webserver-port']);
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
            this.core.logger.write('Map configuration unavailable: ' + String(e), true);
        }
        return {
          kind,
          installed,
          url:
            installed && port && port >= 1024 && port <= 65535
              ? 'http://127.0.0.1:' + port + '/'
              : undefined,
        };
      }),
    );
  }
}
