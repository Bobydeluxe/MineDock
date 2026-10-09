import { readdir, stat, readFile, rm, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { containedPath, atomicWrite } from '../security/paths';
import { parseProperties, serializeProperties } from '../domain/properties';
import { DomainError } from '../domain/errors';
import type { FileEntry } from '../domain/types';
import { parseDocument, LineCounter } from 'yaml';
const textExtensions = new Set([
  '.properties',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.conf',
  '.txt',
  '.log',
  '.xml',
]);
export class FileService {
  async list(root: string, relative: string): Promise<FileEntry[]> {
    const folder = await containedPath(root, relative, true);
    const entries: FileEntry[] = [];
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const filename = await containedPath(root, path.join(relative, entry.name));
      const info = await stat(filename);
      entries.push({
        name: entry.name,
        directory: entry.isDirectory(),
        size: info.size,
        modified: info.mtime.toISOString(),
      });
    }
    return entries.sort(
      (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
    );
  }
  async read(root: string, relative: string): Promise<string> {
    if (
      /(?:^|[/\\])(?:saved-refresh-tokens\.json|\.env|credentials\.json|secrets\.json)$/i.test(
        relative,
      )
    )
      throw new DomainError(
        'SECRET',
        'Authentication and secret files cannot be displayed in the editor.',
      );
    if (!textExtensions.has(path.extname(relative).toLowerCase()))
      throw new DomainError('FILE', 'This file type cannot be edited.');
    const filename = await containedPath(root, relative);
    const info = await stat(filename);
    if (info.size > 2 * 1024 * 1024)
      throw new DomainError('FILE', 'This file exceeds the editor limit (2 MB).');
    let text = await readFile(filename, 'utf8');
    if (path.basename(relative).toLowerCase() === 'server.properties') {
      const props = parseProperties(text);
      delete props['rcon.password'];
      text = serializeProperties(props);
    }
    return text;
  }
  async write(root: string, relative: string, content: string): Promise<void> {
    await this.validate(relative, content);
    await atomicWrite(await containedPath(root, relative), content);
  }
  async validate(relative: string, content: string): Promise<void> {
    if (
      /(?:^|[/\\])(?:saved-refresh-tokens\.json|\.env|credentials\.json|secrets\.json)$/i.test(
        relative,
      )
    )
      throw new DomainError('SECRET', 'Authentication and secret files cannot be edited here.');
    if (
      !textExtensions.has(path.extname(relative).toLowerCase()) ||
      Buffer.byteLength(content) > 2 * 1024 * 1024
    )
      throw new DomainError('FILE', 'File format or size is not allowed.');
    if (path.basename(relative).toLowerCase() === 'server.properties')
      throw new DomainError('FILE', 'Use the settings editor to change server.properties.');
    if (path.basename(relative).toLowerCase() === 'eula.txt')
      throw new DomainError('FILE', 'EULA consent is recorded during server creation.');
    if (path.extname(relative).toLowerCase() === '.json') {
      try {
        JSON.parse(content);
      } catch {
        throw new DomainError('JSON', 'Invalid JSON. The file was not changed.');
      }
    }
    if (/\.ya?ml$/i.test(relative)) {
      const counter = new LineCounter(),
        document = parseDocument(content, { lineCounter: counter });
      const error = document.errors[0];
      if (error) {
        const position = counter.linePos(error.pos[0]);
        throw new DomainError(
          'YAML',
          `Invalid YAML at line ${position.line}, column ${position.col}. The file was not changed.`,
        );
      }
    }
  }
  async mkdir(root: string, relative: string): Promise<void> {
    await mkdir(await containedPath(root, relative));
  }
  async delete(root: string, relative: string, confirmation: string): Promise<void> {
    if (confirmation !== path.basename(relative))
      throw new DomainError('CONFIRM', 'Incorrect confirmation name.');
    if (['server.properties', 'eula.txt', 'server.jar'].includes(relative.toLowerCase()))
      throw new DomainError('FILE', 'This essential file is protected.');
    await rm(await containedPath(root, relative), { recursive: true });
  }
  async upload(root: string, relative: string, source: string): Promise<void> {
    const target = await containedPath(root, path.join(relative, path.basename(source)));
    if (
      ['server.properties', 'server.jar', 'eula.txt'].includes(path.basename(source).toLowerCase())
    )
      throw new DomainError('FILE', 'This essential file is protected.');
    await copyFile(source, target, 1); // COPYFILE_EXCL: never silently overwrite.
  }
}
