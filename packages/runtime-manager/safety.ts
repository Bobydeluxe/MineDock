import path from 'node:path';
import { Repository } from '../database/database';
import { DomainError } from '../domain/errors';
export function guardRuntimeFolder(
  repo: Repository,
  folder: string,
  additional?: (folder: string) => void,
  operationId?: string,
): void {
  for (const operation of repo.operations()) {
    const checkpoint =
      operation.id === operationId ? undefined : repo.operationCheckpoint(operation.id);
    if (checkpoint && path.resolve(checkpoint.destination) === path.resolve(folder))
      throw new DomainError(
        'RECOVERY',
        'Resolve the pending runtime recovery before changing its folder.',
      );
  }
  for (const server of repo.servers()) {
    const relative = path.relative(folder, server.runtimePath ?? server.javaPath);
    if (
      !relative.startsWith('..') &&
      !path.isAbsolute(relative) &&
      (server.pid || ['installing', 'starting', 'running', 'stopping'].includes(server.status))
    )
      throw new DomainError(
        'RUNTIME_IN_USE',
        'Stop every server using this runtime before replacing it.',
      );
  }
  additional?.(folder);
}
