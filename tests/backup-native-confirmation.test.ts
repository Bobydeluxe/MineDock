import { it, expect, vi } from 'vitest';
import { fixture } from './helpers';
import { BackupService, LocalBackupProvider } from '../packages/backups/service';
import type { ServerProcessSupervisor } from '../packages/server-core/supervisor';

it.each(['save-off', 'save-all', 'save-on'])(
  'refuses an unverifiable %s response and always attempts to resume saving',
  async (missing) => {
    const f = await fixture();
    let running = true;
    const command = vi.fn(async (_id: string, text: string) =>
      text.includes(missing)
        ? ''
        : text.includes('save-off')
          ? 'Automatic saving is now disabled'
          : text.includes('save-on')
            ? 'Automatic saving is now enabled'
            : 'Saving the game (this may take a moment!)Saved the game',
    );
    const stop = vi.fn(async () => {
      running = false;
      f.repo.saveServer({ ...f.repo.server(f.server.id), status: 'stopped' });
    });
    const runner = {
      isRunning: () => running,
      isOrphaned: () => false,
      command,
      stop,
    } as unknown as ServerProcessSupervisor;
    try {
      const backups = new BackupService(f.repo, runner, f.secrets, new LocalBackupProvider(f.repo));
      await expect(backups.create(f.server.id)).rejects.toThrow(
        missing === 'save-on' ? 'stopped for safety' : 'did not confirm',
      );
      expect(command).toHaveBeenCalledWith(f.server.id, 'minecraft:save-on');
      if (missing === 'save-on') {
        expect(stop).toHaveBeenCalledOnce();
        expect(f.repo.backups()).toHaveLength(1);
        expect(await backups.verify(f.repo.backups()[0]!.id)).toBe(true);
      } else expect(f.repo.backups()).toHaveLength(0);
    } finally {
      await f.cleanup();
    }
  },
);
