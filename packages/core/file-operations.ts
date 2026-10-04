import { mkdir, stat, lstat, readdir, rename, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../database/database';
import { OperationService } from './operations';
import { containedPath, validateRelative, resolveSystemPath } from '../security/paths';
import { copyDirectory, copyRegularFile } from '../security/copy';
import { extractZip, zipDirectory } from '../backups/archive';
import { DomainError } from '../domain/errors';
import {
  fileActionSchema,
  extractArchiveSchema,
  type FileAction,
  type ExtractArchiveInput,
} from '../domain/files';
import type { Server } from '../domain/types';
import type { OperationContext } from '../domain/operations';
const exists = (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );
export class FileOperations {
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
    private readonly assertStopped: (id: string) => Server,
    private readonly backup: (id: string, reason: string) => Promise<unknown>,
  ) {}
  async cleanTemporaryArchives(): Promise<void> {
    for (const kind of ['archive-imports', 'archive-exports']) {
      const root = path.join(this.repo.root, 'cache', kind);
      await mkdir(root, { recursive: true });
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name))
          await rm(await containedPath(root, entry.name), { recursive: true, force: true });
      }
    }
  }
  protect(server: Server, relative: string, content = true): void {
    const fold = (value: string) => (process.platform === 'win32' ? value.toLowerCase() : value);
    const name = fold(validateRelative(relative).split(path.sep).join('/'));
    const essential = [
      'server.properties',
      'eula.txt',
      'server.jar',
      server.entrypoint,
      server.launchArgsFile,
      'user_jvm_args.txt',
    ]
      .filter((value): value is string => !!value)
      .map((value) => fold(value.replaceAll('\\', '/')));
    if (!name || essential.some((file) => file === name || file.startsWith(name + '/')))
      throw new DomainError('FILE', 'This essential launch or configuration path is protected.');
    if (
      content &&
      this.repo.content(server.id).some((item) => {
        const file = fold(
          (item.folder ?? 'plugins') + '/' + item.filename + (item.enabled ? '' : '.disabled'),
        );
        return name === file || file.startsWith(name + '/');
      })
    )
      throw new DomainError(
        'CONTENT',
        'Use managed content controls to change an installed mod or plugin.',
      );
  }
  async export(serverId: string, relative: string, target: string): Promise<void> {
    const server = this.repo.server(serverId),
      source = await containedPath(server.path, relative);
    if (
      /(?:^|[/\\])(?:server\.properties|saved-refresh-tokens\.json|\.env|credentials\.json|secrets\.json)$/i.test(
        relative,
      )
    )
      throw new DomainError('SECRET', 'Secret files cannot be exported directly.');
    if (!(await lstat(source)).isFile())
      throw new DomainError('FILE', 'Choose a regular file or export a folder as ZIP.');
    await this.jobs.run('files.export', 'Export file', serverId, async (context) => {
      await this.jobs.exportFile(context, target, async (staging) => {
        context.phase('applying');
        await copyRegularFile(source, staging, {
          signal: context.signal,
          progress: (bytes) => context.phase('applying', bytes),
        });
      });
    });
  }
  private async edit(
    server: Server,
    kind: string,
    action: (stage: string, context: OperationContext) => Promise<void>,
  ): Promise<void> {
    await this.backup(server.id, 'before_' + kind.replaceAll('.', '_'));
    await this.jobs.run(kind, 'Manage files', server.id, async (context) => {
      const stage = server.path + '.files-' + context.id + '.staging',
        previous = server.path + '.files-' + context.id + '.previous';
      context.checkpoint({
        destination: server.path,
        staging: stage,
        previous,
        hadDestination: true,
        beforeProfile: server,
        beforeContent: this.repo.content(server.id),
      });
      try {
        context.phase('extracting');
        await copyDirectory(server.path, stage, {
          signal: context.signal,
          progress: (bytes) => context.phase('extracting', bytes),
        });
        await action(stage, context);
        await this.jobs.swap(
          context,
          {
            destination: server.path,
            staging: stage,
            previous,
            beforeProfile: server,
            beforeContent: this.repo.content(server.id),
          },
          () => this.repo.audit(kind, server.name, server.id),
        );
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  async act(id: string, raw: FileAction): Promise<void> {
    const input = fileActionSchema.parse(raw),
      server = this.assertStopped(id);
    const source = validateRelative(input.source),
      destination = validateRelative(input.destination);
    this.protect(server, destination);
    this.protect(server, source, input.action !== 'copy');
    if (input.confirmation !== path.basename(source))
      throw new DomainError('CONFIRM', 'Incorrect source filename confirmation.');
    if (input.overwrite && input.overwriteConfirmation !== path.basename(destination))
      throw new DomainError('CONFIRM', 'Confirm the overwritten destination filename.');
    const relative = path.relative(source, destination);
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative)))
      throw new DomainError('PATH', 'A folder cannot be copied or moved into itself.');
    const reverse = path.relative(destination, source);
    if (!reverse.startsWith('..') && !path.isAbsolute(reverse))
      throw new DomainError('PATH', 'The destination must not contain the source.');
    await containedPath(server.path, source);
    await containedPath(server.path, destination);
    await this.edit(server, 'files.' + input.action, async (stage, context) => {
      const from = await containedPath(stage, source),
        to = await containedPath(stage, destination);
      if (await exists(to)) {
        if (!input.overwrite)
          throw new DomainError(
            'COLLISION',
            'The destination already exists. Confirm overwriting it explicitly.',
          );
        await rm(to, { recursive: true });
      }
      await mkdir(path.dirname(to), { recursive: true });
      if (input.action === 'copy') {
        if ((await lstat(from)).isDirectory())
          await copyDirectory(from, to, {
            signal: context.signal,
            progress: (bytes) => context.phase('extracting', bytes),
          });
        else
          await copyRegularFile(from, to, {
            signal: context.signal,
            progress: (bytes) => context.phase('extracting', bytes),
          });
      } else {
        context.signal.throwIfAborted();
        await rename(from, to);
      }
    });
  }
  async compress(id: string, relative: string, destination: string): Promise<void> {
    const server = this.assertStopped(id),
      source = await containedPath(server.path, relative, true),
      name = path.basename(source);
    const external = path.relative(server.path, resolveSystemPath(destination));
    if (!external.startsWith('..') && !path.isAbsolute(external))
      throw new DomainError('PATH', 'Export an archive outside its server folder.');
    await this.jobs.run('archive.export', 'Compress archive', id, async (context) => {
      const stage = path.join(this.repo.root, 'cache', 'archive-exports', context.id);
      await mkdir(stage, { recursive: true });
      try {
        context.phase('extracting');
        if ((await lstat(source)).isDirectory())
          await copyDirectory(source, path.join(stage, name), {
            signal: context.signal,
            progress: (bytes) => context.phase('extracting', bytes),
          });
        else {
          if (name.toLowerCase() === 'server.properties')
            throw new DomainError('SECRET', 'Use a backup export for server.properties.');
          await copyRegularFile(source, path.join(stage, name), { signal: context.signal });
        }
        await this.jobs.exportFile(
          context,
          destination,
          (temporary) =>
            zipDirectory(stage, temporary, undefined, {
              signal: context.signal,
              progress: (bytes) => context.phase('applying', bytes),
            }),
          () => this.repo.audit('archive.exported', relative || name, id),
        );
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  async extract(id: string, archive: string, raw: ExtractArchiveInput): Promise<void> {
    const input = extractArchiveSchema.parse(raw),
      server = this.assertStopped(id),
      destination = validateRelative(input.destination);
    const archiveInfo = await lstat(archive);
    if (
      !archiveInfo.isFile() ||
      archiveInfo.isSymbolicLink() ||
      resolveSystemPath(await realpath(archive)) !== resolveSystemPath(archive)
    )
      throw new DomainError('PATH', 'Choose a regular ZIP archive without symbolic links.');
    this.protect(server, destination);
    if (input.confirmation !== path.basename(destination))
      throw new DomainError('CONFIRM', 'Confirm the extraction folder name.');
    await this.edit(server, 'archive.extract', async (stage, context) => {
      const unpacked = path.join(this.repo.root, 'cache', 'archive-imports', context.id);
      await mkdir(unpacked, { recursive: true });
      try {
        await extractZip(archive, unpacked, 64 * 1024 ** 3, {
          signal: context.signal,
          progress: (bytes) => context.phase('extracting', bytes),
        });
        const merge = async (relative: string): Promise<void> => {
          for (const entry of await readdir(await containedPath(unpacked, relative, true), {
            withFileTypes: true,
          })) {
            context.signal.throwIfAborted();
            const child = path.join(relative, entry.name),
              file = path.join(destination, child);
            this.protect(server, file);
            const source = await containedPath(unpacked, child),
              target = await containedPath(stage, file);
            if (entry.isDirectory()) {
              if ((await exists(target)) && !(await stat(target)).isDirectory())
                throw new DomainError('COLLISION', 'A file blocks an extracted folder.');
              await mkdir(target, { recursive: true });
              await merge(child);
            } else {
              if (await exists(target)) {
                if (!input.overwrite)
                  throw new DomainError(
                    'COLLISION',
                    'An extracted file already exists. Confirm overwriting it explicitly.',
                  );
                if (!(await stat(target)).isFile())
                  throw new DomainError('COLLISION', 'A folder blocks an extracted file.');
                await rm(target);
              }
              await mkdir(path.dirname(target), { recursive: true });
              await copyRegularFile(source, target, { signal: context.signal });
            }
          }
        };
        await mkdir(await containedPath(stage, destination), { recursive: true });
        await merge('');
      } finally {
        await rm(unpacked, { recursive: true, force: true });
      }
    });
  }
}
