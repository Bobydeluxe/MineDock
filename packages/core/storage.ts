import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Repository } from '../database/database';
import { OperationService } from './operations';
import { containedPath } from '../security/paths';
import { engineDefinition } from '../domain/engines';
import { DomainError } from '../domain/errors';
import {
  storageCategories,
  storageLocationSchema,
  type StorageCategory,
  type StorageOverview,
  type StorageReport,
  type StorageLocation,
} from '../domain/storage';
export class StorageService {
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
  ) {}
  overview(id: string): StorageOverview {
    this.repo.server(id);
    const reports = this.repo.db
      .prepare('SELECT metadata FROM storage_snapshots WHERE server_id=? ORDER BY at DESC LIMIT 90')
      .all(id)
      .map((row) => JSON.parse(String(row.metadata)) as StorageReport);
    return {
      latest: reports[0],
      history: reports
        .reverse()
        .map(({ at, serverBytes, totalBytes }) => ({ at, serverBytes, totalBytes })),
    };
  }
  async location(id: string, raw: StorageLocation): Promise<string> {
    const server = this.repo.server(id),
      input = storageLocationSchema.parse(raw);
    if (input.backupId) {
      const backup = this.repo.backup(input.backupId);
      if (backup.metadata.serverId !== id || path.basename(backup.path) !== input.relativePath)
        throw new DomainError('PATH', 'This backup does not belong to the selected server.');
      return containedPath(
        this.repo.settings().backupRoot,
        path.relative(this.repo.settings().backupRoot, backup.path),
      );
    }
    return containedPath(server.path, input.relativePath);
  }
  async scan(id: string): Promise<StorageReport> {
    const server = this.repo.server(id),
      definition = engineDefinition(server.engine);
    return this.jobs.run('storage.scan', 'Analyze storage', id, async (context) => {
      const report: StorageReport = {
        at: new Date().toISOString(),
        serverBytes: 0,
        totalBytes: 0,
        files: 0,
        excludedEntries: 0,
        categories: Object.fromEntries(
          storageCategories.map((category) => [category, 0]),
        ) as Record<StorageCategory, number>,
        largest: [],
      };
      let entries = 0;
      const worldFolders = new Set<string>();
      if (definition.edition === 'java') {
        for (const entry of await readdir(server.path, { withFileTypes: true })) {
          context.signal.throwIfAborted();
          if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
          try {
            if (
              (
                await lstat(await containedPath(server.path, path.join(entry.name, 'level.dat')))
              ).isFile()
            )
              worldFolders.add(entry.name.toLowerCase());
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') report.excludedEntries++;
          }
        }
        for (const name of [...worldFolders]) {
          worldFolders.add(name + '_nether');
          worldFolders.add(name + '_the_end');
        }
      }
      const categoryOf = (relative: string): StorageCategory => {
        const first = relative.split('/')[0]!.toLowerCase();
        if ((definition.edition === 'bedrock' && first === 'worlds') || worldFolders.has(first))
          return 'worlds';
        if (first === 'plugins' || first === 'mods' || first === 'logs') return first;
        if (first === 'cache' || first === '.cache') return 'cache';
        if (
          first === 'config' ||
          first === 'defaultconfigs' ||
          /\.(?:properties|ya?ml|json|toml|conf|xml)$/i.test(relative)
        )
          return 'config';
        return 'other';
      };
      const add = (
        relativePath: string,
        size: number,
        category: StorageCategory,
        modifiedAt: string,
        backupId?: string,
      ) => {
        if (++report.files > 200000 || !Number.isSafeInteger(report.totalBytes + size))
          throw new DomainError('SIZE', 'The storage scan exceeds its file or size limit.');
        report.totalBytes += size;
        report.categories[category] += size;
        if (!backupId) report.serverBytes += size;
        report.largest.push({ relativePath, size, category, modifiedAt, backupId });
        report.largest.sort(
          (a, b) => b.size - a.size || a.relativePath.localeCompare(b.relativePath),
        );
        if (report.largest.length > 20) report.largest.pop();
        context.phase('verifying', report.totalBytes);
      };
      const walk = async (relative: string, depth = 0): Promise<void> => {
        if (depth > 64)
          throw new DomainError('SIZE', 'The storage folder nesting exceeds its limit.');
        for (const entry of await readdir(await containedPath(server.path, relative, true), {
          withFileTypes: true,
        })) {
          context.signal.throwIfAborted();
          if (++entries > 200000)
            throw new DomainError('SIZE', 'The storage scan exceeds its entry limit.');
          if (entry.isSymbolicLink()) {
            report.excludedEntries++;
            continue;
          }
          const child = [relative, entry.name].filter(Boolean).join('/');
          try {
            const file = await containedPath(server.path, child),
              info = await lstat(file);
            if (info.isDirectory()) await walk(child, depth + 1);
            else if (info.isFile())
              add(child, info.size, categoryOf(child), info.mtime.toISOString());
            else report.excludedEntries++;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') report.excludedEntries++;
            else throw error;
          }
        }
      };
      context.phase('verifying');
      await walk('');
      for (const backup of this.repo.backups().filter((item) => item.serverId === id)) {
        context.signal.throwIfAborted();
        try {
          const file = await this.location(id, {
              relativePath: path.basename(this.repo.backup(backup.id).path),
              backupId: backup.id,
            }),
            info = await lstat(file);
          if (info.isFile())
            add(path.basename(file), info.size, 'backups', info.mtime.toISOString(), backup.id);
          else report.excludedEntries++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') report.excludedEntries++;
          else throw error;
        }
      }
      context.signal.throwIfAborted();
      this.repo.db.exec('BEGIN IMMEDIATE');
      try {
        this.repo.db
          .prepare('INSERT OR REPLACE INTO storage_snapshots VALUES(?,?,?)')
          .run(id, report.at, JSON.stringify(report));
        this.repo.db
          .prepare(
            'DELETE FROM storage_snapshots WHERE server_id=? AND at NOT IN (SELECT at FROM storage_snapshots WHERE server_id=? ORDER BY at DESC LIMIT 90)',
          )
          .run(id, id);
        this.repo.saveServer({ ...this.repo.server(id), diskBytes: report.serverBytes });
        this.repo.db.exec('COMMIT');
      } catch (error) {
        this.repo.db.exec('ROLLBACK');
        throw error;
      }
      return report;
    });
  }
}
