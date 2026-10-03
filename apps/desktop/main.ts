import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  powerSaveBlocker,
  Menu,
} from 'electron';
import path from 'node:path';
import { copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { AppCore } from '../../packages/core/app';
import { readableError } from '../../packages/domain/errors';
import { engineSchema } from '../../packages/domain/types';
import { containedPath } from '../../packages/security/paths';
import { LocalSecretStore, redact, type SecretStore } from '../../packages/security/secrets';

let core: AppCore | undefined;
let window: BrowserWindow | undefined;
let quitting = false;
let blocker: number | undefined;
const consoleBatches = new Map<string, import('../../packages/domain/types').LogLine[]>();
const consoleFlush = setInterval(() => {
  for (const [serverId, lines] of consoleBatches) {
    if (!window?.webContents.isDestroyed())
      window?.webContents.send('minedock:event', { type: 'logs', serverId, lines });
  }
  consoleBatches.clear();
}, 100);
consoleFlush.unref();
app.setName('MineDock');
app.setPath(
  'userData',
  process.env.MINEDOCK_DATA_DIR
    ? path.resolve(process.env.MINEDOCK_DATA_DIR)
    : path.join(app.getPath('appData'), 'MineDock'),
);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
app.on('second-instance', () => {
  window?.show();
  window?.focus();
});
const idSchema = z.string().uuid();
const text = z.string().max(4096);
const relative = z.string().max(1000);
const rendererFile = path.join(__dirname, 'renderer', 'index.html');
const devUrl =
  !app.isPackaged && process.env.VITE_DEV_SERVER_URL === 'http://127.0.0.1:5173'
    ? process.env.VITE_DEV_SERVER_URL
    : undefined;
function register(core: AppCore): void {
  const handle = (method: string, action: (...args: unknown[]) => unknown): void => {
    ipcMain.handle('minedock:' + method, async (event, ...args: unknown[]) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        event.senderFrame?.url !== (devUrl ? devUrl + '/' : pathToFileURL(rendererFile).href)
      )
        throw new Error('Origine IPC refusée.');
      try {
        return await action(...args);
      } catch (e) {
        core.logger.write(`${method}: ${String(e)}`, true);
        throw new Error(redact(readableError(e)));
      }
    });
  };
  const id = (value: unknown): string => idSchema.parse(value);
  handle('snapshot', () => core.snapshot());
  handle('diagnostic', () => core.diagnostic());
  handle('settings', (value) => core.settings(value as Parameters<AppCore['settings']>[0]));
  handle('versions', (value) => core.versions.versions(engineSchema.parse(value)));
  handle('create', (value) => core.create(value as Parameters<AppCore['create']>[0]));
  handle('retryInstallation', (value) => core.retryInstallation(id(value)));
  handle('cancelDownload', (value) => core.downloads.cancel(id(value)));
  for (const action of ['start', 'stop', 'restart'] as const)
    handle(action, (value) => core.exclusive(id(value), () => core.supervisor[action](id(value))));
  handle('remove', (value, confirm) => core.remove(id(value), text.parse(confirm)));
  handle('logs', (value) => core.supervisor.logs(id(value)));
  handle('players', (value) => core.supervisor.players(id(value)));
  handle('command', async (value, command) => {
    const cmd = text.parse(command);
    const serverId = id(value);
    // Lifecycle and save-hold commands belong to serialized services.
    if (/^\/?(?:stop|save-off|save-on)\s*$/i.test(cmd.trim()))
      throw new Error('Utilisez les boutons d’arrêt et de sauvegarde pour cette opération.');
    const response = await core.exclusive(serverId, () => core.supervisor.command(serverId, cmd));
    core.repo.audit('console.command', 'Commande exécutée.', serverId);
    return response;
  });
  handle('properties', (value) => core.properties(id(value)));
  handle('saveProperties', (value, props) =>
    core.saveProperties(id(value), z.record(z.string(), z.string()).parse(props)),
  );
  handle('configureServer', (value, options) =>
    core.configureServer(id(value), options as Parameters<AppCore['configureServer']>[1]),
  );
  handle('files', (value, file) =>
    core.files.list(core.repo.server(id(value)).path, relative.parse(file)),
  );
  handle('readFile', (value, file) =>
    core.files.read(core.repo.server(id(value)).path, relative.parse(file)),
  );
  handle('writeFile', (value, file, content) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.files.write(
        server.path,
        relative.parse(file),
        z
          .string()
          .max(2 * 1024 * 1024)
          .parse(content),
      );
      core.repo.audit('file.saved', relative.parse(file), server.id);
    }),
  );
  handle('mkdir', (value, file) =>
    core.exclusive(id(value), () =>
      core.files.mkdir(core.assertStopped(id(value)).path, relative.parse(file)),
    ),
  );
  handle('deleteFile', (value, file, confirm) =>
    core.exclusive(id(value), async () => {
      await core.backups.create(id(value), 'before_file_delete');
      await core.files.delete(
        core.assertStopped(id(value)).path,
        relative.parse(file),
        text.parse(confirm),
      );
      core.repo.audit('file.deleted', relative.parse(file), id(value));
    }),
  );
  handle('selectFolder', async () => {
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('openFolder', async (value) => {
    const error = await shell.openPath(value ? core.repo.server(id(value)).path : core.root);
    if (error) throw new Error(error);
  });
  handle('uploadFile', async (value, file) => {
    const serverId = id(value);
    core.assertStopped(serverId);
    const result = await dialog.showOpenDialog(window!, { properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return;
    await core.exclusive(serverId, () =>
      core.files.upload(
        core.assertStopped(serverId).path,
        relative.parse(file),
        result.filePaths[0]!,
      ),
    );
    core.repo.audit('file.uploaded', path.basename(result.filePaths[0]), serverId);
  });
  handle('exportFile', async (value, file) => {
    const source = await containedPath(core.repo.server(id(value)).path, relative.parse(file));
    if (path.basename(source) === 'server.properties')
      throw new Error(
        'Ce fichier contient un secret RCON et ne peut pas être exporté directement.',
      );
    const result = await dialog.showSaveDialog(window!, { defaultPath: path.basename(source) });
    if (result.filePath) await copyFile(source, result.filePath);
  });
  handle('backup', (value) => core.exclusive(id(value), () => core.backups.create(id(value))));
  handle('verifyBackup', (value) => core.backups.verify(id(value)));
  handle('restore', (value, confirm) => {
    const item = core.repo.backup(id(value));
    return core.exclusive(item.metadata.serverId, () =>
      core.backups.restore(id(value), text.parse(confirm)),
    );
  });
  handle('deleteBackup', (value, confirm) => {
    const item = core.repo.backup(id(value));
    return core.exclusive(item.metadata.serverId, () =>
      core.backups.delete(id(value), text.parse(confirm)),
    );
  });
  handle('exportBackup', async (value) => {
    const result = await dialog.showSaveDialog(window!, { defaultPath: `${id(value)}.zip` });
    if (result.filePath) await core.exportBackup(id(value), result.filePath);
  });
  handle('schedules', (value) =>
    core.scheduler.add(value as Parameters<typeof core.scheduler.add>[0]),
  );
  handle('deleteSchedule', (value) => core.repo.deleteSchedule(id(value)));
  handle('metrics', (value, hours) =>
    core.repo.metrics(id(value), z.number().min(1).max(168).parse(hours)),
  );
  handle('runtimes', () => core.runtime.list());
  handle('installRuntime', (major) => core.runtime.install(z.number().int().parse(major)));
  handle('search', (value, query) =>
    core.marketplace.search(core.repo.server(id(value)), z.string().max(120).parse(query)),
  );
  handle('content', (value) => core.repo.content(id(value)));
  handle('installContent', (value, project) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.backups.create(server.id, 'before_content');
      return core.marketplace.install(
        server,
        z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,100}$/)
          .parse(project),
      );
    }),
  );
  handle('toggleContent', (value, content) =>
    core.exclusive(id(value), () =>
      core.marketplace.toggle(core.assertStopped(id(value)), id(content)),
    ),
  );
}
function updateSleep(core: AppCore): void {
  const active = core.repo.settings().preventSleep && core.repo.servers().some((s) => s.pid);
  if (active && blocker === undefined) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!active && blocker !== undefined) {
    powerSaveBlocker.stop(blocker);
    blocker = undefined;
  }
}
if (single)
  void app
    .whenReady()
    .then(async () => {
      const root = process.env.MINEDOCK_DATA_DIR || path.join(app.getPath('userData'), 'data');
      const fallback = await LocalSecretStore.open(root).catch(async () => {
        const { mkdir } = await import('node:fs/promises');
        await mkdir(root, { recursive: true });
        return LocalSecretStore.open(root);
      });
      const encrypted =
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
      const secrets: SecretStore = {
        encrypt: (value) =>
          encrypted
            ? 'os:' + safeStorage.encryptString(value).toString('base64')
            : 'aes:' + fallback.encrypt(value),
        decrypt: (value) =>
          value.startsWith('os:')
            ? safeStorage.decryptString(Buffer.from(value.slice(3), 'base64'))
            : fallback.decrypt(value.startsWith('aes:') ? value.slice(4) : value),
      };
      core = await AppCore.open(root, secrets);
      Menu.setApplicationMenu(null);
      window = new BrowserWindow({
        width: 1360,
        height: 920,
        minWidth: 900,
        minHeight: 640,
        title: 'MineDock',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#101216',
        show: process.env.MINEDOCK_TEST !== '1',
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      register(core);
      window.webContents.setWindowOpenHandler(({ url }) => {
        const allowed = [
          'https://www.minecraft.net/eula',
          'https://docs.papermc.io/',
          'https://modrinth.com/',
        ];
        if (allowed.some((prefix) => url.startsWith(prefix))) void shell.openExternal(url);
        return { action: 'deny' };
      });
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      core.bus.subscribe((event) => {
        if (event.type === 'log') {
          const lines = consoleBatches.get(event.serverId) ?? [];
          lines.push(event.line);
          consoleBatches.set(event.serverId, lines.slice(-500));
        } else window?.webContents.send('minedock:event', event);
        if (event.type === 'server' || event.type === 'changed') updateSleep(core!);
      });
      if (devUrl) await window.loadURL(devUrl);
      else await window.loadFile(rendererFile);
      await core.autoStart();
    })
    .catch((e) => {
      console.error(e);
      dialog.showErrorBox('MineDock', readableError(e));
      app.exit(1);
    });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (quitting || !core) return;
  event.preventDefault();
  quitting = true;
  clearInterval(consoleFlush);
  void core
    .close()
    .then(() => app.quit())
    .catch((e) => {
      console.error(e);
      dialog.showErrorBox(
        'MineDock',
        'La fermeture a rencontré une erreur. Consultez les logs : ' + readableError(e),
      );
      app.exit(1);
    });
});
