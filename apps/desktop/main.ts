import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  powerSaveBlocker,
  Menu,
  Notification,
  nativeImage,
} from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { AppCore } from '../../packages/core/app';
import { profileImageSize } from '../../packages/security/profile-image';
import { testReachability } from '../../packages/networking/reachability';
import { readableError, structuredError } from '../../packages/domain/errors';
import { localizeMessage } from '../../packages/domain/localization';
import { engineSchema } from '../../packages/domain/types';
import {
  modSearchSchema,
  modPlanInputSchema,
  modBulkSchema,
  modCollectionSchema,
  modId,
  modTargetSchema,
} from '../../packages/domain/mods';
import { marketplaceSchema } from '../../packages/domain/content';
import { modpackSelectionSchema } from '../../packages/domain/modpacks';
import { fileActionSchema, extractArchiveSchema } from '../../packages/domain/files';
import { createServerSchema } from '../../packages/domain/types';
import { recoveryActionSchema } from '../../packages/domain/operations';
import { retentionPolicySchema, retentionPurgeSchema } from '../../packages/domain/retention';
import {
  worldActionSchema,
  worldImportSchema,
  existingWorldNameSchema,
} from '../../packages/domain/worlds';
import { containedPath } from '../../packages/security/paths';
import { LocalSecretStore, redact, type SecretStore } from '../../packages/security/secrets';
import { prepareUpdateLaunch, launchUpdate } from '../../packages/updates/install';
import { DomainError } from '../../packages/domain/errors';
import { packKindSchema, packRequestSchema, packActionSchema } from '../../packages/domain/packs';
import { healthSettingsSchema } from '../../packages/domain/health';
import { backupSafetySchema, restoreScopeSchema } from '../../packages/domain/snapshots';
import { migrationTargetSchema, cloneSchema } from '../../packages/domain/migration';
import { logSearchSchema, macroSchema } from '../../packages/domain/console';
import { translator } from './renderer/src/i18n';

let core: AppCore | undefined;
let window: BrowserWindow | undefined;
let quitting = false;
let unsavedChanges = false,
  reviewingClose = false;
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
        throw new Error('IPC origin rejected.');
      try {
        return { ok: true, value: await action(...args) };
      } catch (e) {
        core.logger.write(`${method}: ${String(e)}`, true);
        const error = structuredError(e);
        return { ok: false, error: { ...error, message: redact(error.message) } };
      }
    });
  };
  const id = (value: unknown): string => idSchema.parse(value);
  handle('snapshot', () => core.snapshot());
  handle('diagnostic', () => core.diagnostic());
  handle('settings', (value) => core.settings(value as Parameters<AppCore['settings']>[0]));
  handle('versions', (value) => core.versions.versions(engineSchema.parse(value)));
  handle('builds', (engine, version) =>
    core.versions.builds(
      engineSchema.parse(engine),
      z
        .string()
        .regex(/^[a-zA-Z0-9._-]{1,40}$/)
        .parse(version),
    ),
  );
  handle('installers', (engine) => core.versions.installers(engineSchema.parse(engine)));
  handle('engineCatalog', (engine, version, refresh, snapshots) =>
    core.versions.catalog(
      engineSchema.parse(engine),
      z
        .string()
        .regex(/^[a-zA-Z0-9._+-]{1,80}$/)
        .optional()
        .parse(version),
      z.boolean().optional().parse(refresh),
      z.boolean().optional().parse(snapshots),
    ),
  );
  handle('create', (value) => core.create(value as Parameters<AppCore['create']>[0]));
  handle('previewModpack', async () => {
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [{ name: 'Modrinth modpacks', extensions: ['mrpack'] }],
    });
    return result.canceled || !result.filePaths[0]
      ? null
      : core.modpacks.preview(result.filePaths[0]);
  });
  handle('createModpack', (selection, input) =>
    core.modpacks.create(modpackSelectionSchema.parse(selection), createServerSchema.parse(input)),
  );
  handle('retryInstallation', (value) => core.retryInstallation(id(value)));
  handle('worlds', (value) => core.worlds.list(id(value)));
  handle('worldAction', (value, raw) =>
    core.exclusive(id(value), async () => {
      const input = worldActionSchema.parse(raw);
      core.assertStopped(id(value));
      await core.worlds.act(id(value), input);
    }),
  );
  handle('previewWorldImport', async (value, archive) => {
    const serverId = id(value),
      zip = z.boolean().parse(archive);
    core.assertStopped(serverId);
    const result = await dialog.showOpenDialog(window!, {
      properties: [zip ? 'openFile' : 'openDirectory'],
      ...(zip ? { filters: [{ name: 'Minecraft worlds', extensions: ['zip', 'mcworld'] }] } : {}),
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return core.exclusive(serverId, () => core.worlds.preview(serverId, result.filePaths[0]!));
  });
  handle('importWorld', (value, raw) =>
    core.exclusive(id(value), async () => {
      const input = worldImportSchema.parse(raw);
      core.assertStopped(id(value));
      await core.worlds.import(id(value), input);
    }),
  );
  handle('exportWorld', async (value, raw) => {
    const serverId = id(value),
      name = existingWorldNameSchema.parse(raw);
    core.assertStopped(serverId);
    const result = await dialog.showSaveDialog(window!, {
      defaultPath: name + '.zip',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return;
    await core.exclusive(serverId, () => core.worlds.export(serverId, name, result.filePath!));
  });
  handle('cancelDownload', (value) => {
    core.downloads.cancel(id(value));
    core.jobs.cancel(id(value));
  });
  handle('operations', () => core.repo.operations());
  handle('cancelOperation', (value) => core.jobs.cancel(id(value)));
  handle('dismissOperation', (value) => core.jobs.dismiss(id(value)));
  handle('recoveryReview', (value) => core.recoveryReview(id(value)));
  handle('resolveOperation', (value, input) =>
    core.resolveOperation(id(value), recoveryActionSchema.parse(input)),
  );
  for (const action of ['start', 'stop', 'restart'] as const)
    handle(action, (value) =>
      core.exclusive(id(value), () => {
        if (
          action !== 'stop' &&
          core.repo
            .operations()
            .some(
              (operation) => operation.serverId === id(value) && operation.status === 'attention',
            )
        )
          throw new Error('Resolve interrupted operations before starting this server.');
        return core.supervisor[action](id(value));
      }),
    );
  handle('remove', (value, confirm) => core.remove(id(value), text.parse(confirm)));
  handle('logs', (value) => core.supervisor.logs(id(value)));
  handle('players', (value) => core.supervisor.players(id(value)));
  handle('command', async (value, command) => {
    const cmd = text.parse(command);
    const serverId = id(value);
    // Lifecycle and save-hold commands belong to serialized services.
    if (/^\/?(?:stop|save-off|save-on)\s*$/i.test(cmd.trim()))
      throw new Error('Use the stop and backup buttons for this operation.');
    const response = await core.exclusive(serverId, () => core.supervisor.command(serverId, cmd));
    core.repo.audit('console.command', 'Command executed.', serverId);
    return response;
  });
  handle('properties', (value) => core.properties(id(value)));
  handle('setUnsavedChanges', (dirty) => {
    unsavedChanges = z.boolean().parse(dirty);
  });
  handle('propertiesDocument', (value) => core.propertiesDocument(id(value)));
  handle('updateProfile', (value, input) =>
    core.updateProfile(id(value), input as { name: string; thumbnail?: string | null }),
  );
  handle('selectProfileIcon', async () => {
    const selected = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return undefined;
    const { readFile, stat } = await import('node:fs/promises');
    const file = selected.filePaths[0];
    if ((await stat(file)).size > 5 * 1024 * 1024)
      throw new Error('Choose an image smaller than 5 MB.');
    const buffer = await readFile(file);
    profileImageSize(buffer);
    const image = nativeImage.createFromBuffer(buffer),
      size = image.getSize();
    if (image.isEmpty() || !size.width || !size.height || size.width > 4096 || size.height > 4096)
      throw new Error('Choose an image up to 4096 pixels per side.');
    return image
      .resize({
        width: Math.max(1, Math.round((128 * size.width) / Math.max(size.width, size.height))),
        height: Math.max(1, Math.round((128 * size.height) / Math.max(size.width, size.height))),
        quality: 'best',
      })
      .toDataURL();
  });
  handle('saveProperties', (value, props, sha256) =>
    core.saveProperties(
      id(value),
      z.record(z.string(), z.string()).parse(props),
      z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional()
        .parse(sha256),
    ),
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
  handle('playerReport', (value) => core.players.report(id(value)));
  handle('performance', (value, hours) =>
    core.performance.report(id(value), z.number().int().min(1).max(168).parse(hours)),
  );
  handle('configDocuments', (value) => core.configuration.documents(id(value)));
  handle('exportPackage', async (value, sensitive, confirmation) => {
    const serverId = id(value);
    core.assertStopped(serverId);
    const includesSensitive = z.boolean().parse(sensitive),
      name = text.parse(confirmation);
    const result = await dialog.showSaveDialog(window!, {
      defaultPath: 'MineDock-server.minedock',
      filters: [{ name: 'MineDock package', extensions: ['minedock'] }],
    });
    if (!result.canceled && result.filePath)
      await core.packages.export(serverId, result.filePath, includesSensitive, name);
  });
  handle('previewPackage', async () => {
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [{ name: 'MineDock package', extensions: ['minedock'] }],
    });
    return result.canceled || !result.filePaths[0]
      ? null
      : core.packages.preview(result.filePaths[0]);
  });
  handle('importPackage', (input) => core.packages.import(input));
  handle('testReachability', (value, input) =>
    testReachability(core.repo.server(id(value)), input),
  );
  handle('mapPlan', (value, kind) => core.maps.plan(id(value), kind));
  handle('mapApply', (value, input) => core.maps.apply(id(value), input));
  handle('mapStatus', (value) => core.maps.status(id(value)));
  handle('openMap', async (value, kind) => {
    const status = (await core.maps.status(id(value))).find((item) => item.kind === kind);
    if (!status?.url) throw new DomainError('MAP', 'Configure a local map before opening it.');
    await shell.openExternal(status.url);
  });
  handle('configHistory', (value) => core.configuration.history(id(value)));
  handle('configAudit', (value) => core.configuration.audit(id(value)));
  handle('editConfig', (value, input) => core.configuration.edit(id(value), input));
  handle('restoreConfig', (value, version, confirmation) =>
    core.configuration.restore(id(value), id(version), text.parse(confirmation)),
  );
  handle('searchHistoricalLogs', (value, input) =>
    core.consoleTools.search(id(value), logSearchSchema.parse(input)),
  );
  handle('runMacro', (value, input) =>
    core.consoleTools.macro(id(value), macroSchema.parse(input)),
  );
  handle('saveMacro', (value, input) =>
    core.exclusive(id(value), async () =>
      core.consoleTools.save(id(value), macroSchema.parse(input)),
    ),
  );
  handle('latestMinecraft', (value) => core.migration.latest(id(value)));
  handle('migrationReview', (value, target) =>
    core.migration.review(id(value), migrationTargetSchema.parse(target)),
  );
  handle('applyMigration', (value, token, confirmation) =>
    core.migration.apply(id(value), id(token), text.parse(confirmation)),
  );
  handle('cloneServer', (value, input) =>
    core.exclusive('create', () =>
      core.exclusive(id(value), () => core.migration.clone(id(value), cloneSchema.parse(input))),
    ),
  );
  handle('incrementalSnapshots', (value) => core.incremental.list(id(value)));
  handle('createIncremental', (value) =>
    core.exclusive(id(value), () => core.incremental.create(id(value))),
  );
  handle('previewPartial', (value, snapshot, scope) =>
    core.incremental.preview(id(value), id(snapshot), restoreScopeSchema.parse(scope)),
  );
  handle('restorePartial', (value, token, confirmation) =>
    core.exclusive(id(value), () =>
      core.incremental.restore(id(value), id(token), text.parse(confirmation)),
    ),
  );
  handle('backupSafety', () => core.incremental.settings());
  handle('configureBackupSafety', (value) =>
    core.incremental.configure(backupSafetySchema.parse(value)),
  );
  handle('testBackupStorage', () => core.incremental.testStorage());
  handle('playerDetails', (value, name) =>
    core.players.details(id(value), z.string().max(32).parse(name)),
  );
  handle('playerNote', (value, name, note) =>
    core.exclusive(id(value), async () =>
      core.players.note(
        id(value),
        z.string().max(32).parse(name),
        z.string().max(4000).parse(note),
      ),
    ),
  );
  handle('playerSkin', async (value, name) => {
    const report = await core.players.report(id(value)),
      player = report.players.find((p) => p.name === z.string().max(32).parse(name));
    return player?.uuid && player.identityMode === 'online' && !player.identityConflict
      ? core.skins.get(player.uuid)
      : null;
  });
  handle('setWhitelist', (value, enabled) =>
    core.exclusive(id(value), async () => {
      const server = core.repo.server(id(value)),
        on = z.boolean().parse(enabled);
      if (!['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge'].includes(server.engine))
        throw new DomainError('CAPABILITY', 'Whitelist switching requires a Java server.');
      if (!core.supervisor.isRunning(server.id))
        throw new DomainError('RUNNING', 'Start the server before sending moderation commands.');
      const response = await core.supervisor.command(server.id, 'whitelist ' + (on ? 'on' : 'off'));
      if (/unknown|error|failed|incorrect/i.test(response))
        throw new DomainError('COMMAND', response);
      core.repo.saveServer({ ...server, whitelist: on });
      core.repo.audit(
        'player.whitelist.configured',
        on ? 'Whitelist enabled.' : 'Whitelist disabled.',
        server.id,
      );
    }),
  );
  handle('health', (value) => core.health.report(id(value)));
  handle('healthSettings', () => core.health.settings());
  handle('configureHealth', (value) => core.health.configure(healthSettingsSchema.parse(value)));
  handle('notices', () => core.health.notices());
  handle('readNotices', (value) => core.health.read(z.string().uuid().optional().parse(value)));
  handle('crashReport', (value) => core.health.crash(id(value)));
  handle('revealCrash', async (value) => {
    const server = core.repo.server(id(value)),
      report = await core.health.crash(server.id);
    if (report.path) shell.showItemInFolder(await containedPath(server.path, report.path));
  });
  handle('packSearch', (value, kind, query) =>
    core.packs.search(
      core.repo.server(id(value)),
      packKindSchema.parse(kind),
      z.string().max(120).parse(query),
    ),
  );
  handle('packInventory', (value, kind, world) =>
    core.packs.inventory(
      core.repo.server(id(value)),
      packKindSchema.parse(kind),
      z.string().max(120).optional().parse(world),
    ),
  );
  handle('packVersions', (value, kind, project) =>
    core.packs.versions(
      core.repo.server(id(value)),
      packKindSchema.parse(kind),
      modId.parse(project),
    ),
  );
  handle('packPlan', (value, input) =>
    core.packs.plan(core.repo.server(id(value)), packRequestSchema.parse(input)),
  );
  handle('packApply', (value, token) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.safetyBackup(server.id, 'before_packs');
      await core.packs.apply(server, id(token));
    }),
  );
  handle('packAction', (value, input) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      const action = packActionSchema.parse(input);
      await core.safetyBackup(server.id, 'before_packs');
      await core.packs.action(server, action);
    }),
  );
  handle('packImport', async (value, kind, world) => {
    const serverId = id(value);
    core.assertStopped(serverId);
    const packKind = packKindSchema.parse(kind),
      packWorld = z.string().max(120).optional().parse(world);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [{ name: 'Minecraft pack', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePaths[0]) return;
    await core.exclusive(serverId, async () => {
      const server = core.assertStopped(serverId);
      await core.safetyBackup(serverId, 'before_packs');
      await core.packs.import(server, packKind, result.filePaths[0]!, packWorld);
    });
  });
  handle('moderatePlayer', (value, input) =>
    core.exclusive(id(value), () =>
      core.players.moderate(id(value), input as Parameters<typeof core.players.moderate>[1]),
    ),
  );
  handle('writeFile', (value, file, content) =>
    core.configuration.write(
      id(value),
      relative.parse(file),
      z
        .string()
        .max(2 * 1024 * 1024)
        .parse(content),
    ),
  );
  handle('mkdir', (value, file) =>
    core.exclusive(id(value), () =>
      core.files.mkdir(core.assertStopped(id(value)).path, relative.parse(file)),
    ),
  );
  handle('deleteFile', (value, file, confirm) =>
    core.exclusive(id(value), async () => {
      core.fileOperations.protect(core.assertStopped(id(value)), relative.parse(file));
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
  handle('previewServerImport', async () => {
    const result = await dialog.showOpenDialog(window!, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return core.imports.preview(result.filePaths[0]);
  });
  handle('importServer', (input) =>
    core.exclusive('create', () =>
      core.imports.import(input as Parameters<typeof core.imports.import>[0]),
    ),
  );
  handle('openFolder', async (value) => {
    const error = await shell.openPath(value ? core.repo.server(id(value)).path : core.root);
    if (error) throw new Error(error);
  });
  handle('uploadFile', async (value, file) => {
    const serverId = id(value);
    core.assertStopped(serverId);
    const result = await dialog.showOpenDialog(window!, { properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return;
    await core.exclusive(serverId, () => {
      const server = core.assertStopped(serverId);
      core.fileOperations.protect(
        server,
        path.join(relative.parse(file), path.basename(result.filePaths[0]!)),
      );
      return core.files.upload(server.path, relative.parse(file), result.filePaths[0]!);
    });
    core.repo.audit('file.uploaded', path.basename(result.filePaths[0]), serverId);
  });
  handle('exportFile', async (value, file) => {
    const serverId = id(value),
      name = relative.parse(file);
    await containedPath(core.repo.server(serverId).path, name);
    const result = await dialog.showSaveDialog(window!, { defaultPath: path.basename(name) });
    if (!result.canceled && result.filePath)
      await core.exclusive(serverId, () =>
        core.fileOperations.export(serverId, name, result.filePath!),
      );
  });
  handle('backup', (value) => core.exclusive(id(value), () => core.backups.create(id(value))));
  handle('fileAction', (value, input) =>
    core.exclusive(id(value), () =>
      core.fileOperations.act(id(value), fileActionSchema.parse(input)),
    ),
  );
  handle('compressArchive', async (value, file) => {
    const serverId = id(value),
      name = relative.parse(file);
    core.assertStopped(serverId);
    const result = await dialog.showSaveDialog(window!, {
      defaultPath: (path.basename(name) || core.repo.server(serverId).name) + '.zip',
      filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return;
    await core.exclusive(serverId, () =>
      core.fileOperations.compress(serverId, name, result.filePath!),
    );
  });
  handle('extractArchive', async (value, raw) => {
    const serverId = id(value),
      input = extractArchiveSchema.parse(raw);
    core.assertStopped(serverId);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePaths[0]) return;
    await core.exclusive(serverId, () =>
      core.fileOperations.extract(serverId, result.filePaths[0]!, input),
    );
  });
  handle('verifyBackup', (value) => core.backups.verify(id(value)));
  handle('updateStatus', () => core.updates.status());
  handle('configureUpdates', (enabled) => core.updates.configure(z.boolean().parse(enabled)));
  handle('checkUpdates', () => core.exclusive('updates', () => core.updates.check()));
  handle('downloadUpdate', () => core.exclusive('updates', () => core.updates.download()));
  handle('installUpdate', (confirmation) =>
    core.exclusive('updates', async () => {
      const prepared = await core.updates.installationFile();
      if (text.parse(confirmation) !== 'MineDock ' + prepared.update.version)
        throw new DomainError('CONFIRM', 'Incorrect confirmation.');
      if (
        core.repo
          .servers()
          .some(
            (server) =>
              core.supervisor.isRunning(server.id) ||
              core.supervisor.isOrphaned(server.id) ||
              ['installing', 'starting', 'stopping', 'backing_up', 'restoring'].includes(
                server.status,
              ),
          ) ||
        core.repo
          .operations()
          .some((operation) =>
            ['pending', 'downloading', 'verifying', 'extracting', 'applying'].includes(
              operation.status,
            ),
          )
      )
        throw new DomainError(
          'UPDATE_INSTALL',
          'Stop every server and finish active operations before installing an application update.',
        );
      if (['deb', 'dmg'].includes(prepared.update.artifact.target)) {
        const error = await shell.openPath(prepared.file);
        if (error)
          throw new DomainError(
            'UPDATE_INSTALL',
            'The operating system could not open the verified package installer.',
          );
        core.repo.audit('app.update.installer_opened', prepared.update.version);
        return;
      }
      const destination =
        prepared.update.artifact.target === 'portable'
          ? process.env.PORTABLE_EXECUTABLE_FILE
          : prepared.update.artifact.target === 'appimage'
            ? process.env.APPIMAGE
            : prepared.update.artifact.target === 'maczip'
              ? path.resolve(path.dirname(app.getPath('exe')), '../..')
              : undefined;
      const plan = await prepareUpdateLaunch(
        await containedPath(core.root, 'updates'),
        prepared.file,
        prepared.update,
        destination,
      );
      if (plan.requestFile)
        core.repo.db
          .prepare(
            "INSERT INTO settings VALUES('pending-update',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run(
            JSON.stringify({
              request: plan.requestFile,
              result: plan.resultFile,
              version: prepared.update.version,
              previous: plan.previous,
            }),
          );
      await launchUpdate(plan);
      core.repo.audit('app.update.install_requested', prepared.update.version);
      setTimeout(() => app.quit(), 300);
    }),
  );
  handle('retentionPolicy', (value) => core.retention.policy(id(value)));
  handle('configureRetention', (value, input) =>
    core.exclusive(id(value), () =>
      Promise.resolve(core.retention.configure(id(value), retentionPolicySchema.parse(input))),
    ),
  );
  handle('previewRetention', (value) =>
    core.exclusive(id(value), () => core.retention.preview(id(value))),
  );
  handle('purgeRetention', (value, input) =>
    core.exclusive(id(value), () =>
      core.retention.purge(id(value), retentionPurgeSchema.parse(input)),
    ),
  );
  handle('restore', (value, confirm) => {
    const item = core.repo.backup(id(value));
    return core.exclusive(item.metadata.serverId, () => {
      core.assertStopped(item.metadata.serverId);
      return core.backups.restore(id(value), text.parse(confirm));
    });
  });
  handle('deleteBackup', (value, confirm) => {
    const item = core.repo.backup(id(value));
    return core.exclusive(item.metadata.serverId, () =>
      core.backups.delete(id(value), text.parse(confirm)),
    );
  });
  handle('exportBackup', async (value) => {
    const item = core.repo.backup(id(value));
    const result = await dialog.showSaveDialog(window!, { defaultPath: `${id(value)}.zip` });
    if (!result.canceled && result.filePath)
      await core.exclusive(item.metadata.serverId, () =>
        core.exportBackup(id(value), result.filePath!),
      );
  });
  handle('schedules', (value) =>
    core.scheduler.add(value as Parameters<typeof core.scheduler.add>[0]),
  );
  handle('deleteSchedule', (value) => core.repo.deleteSchedule(id(value)));
  handle('toggleSchedule', (value, enabled) =>
    core.scheduler.toggle(id(value), z.boolean().parse(enabled)),
  );
  handle('schedulePreview', (value) =>
    core.scheduler.preview(value as Parameters<typeof core.scheduler.preview>[0]),
  );
  handle('metrics', (value, hours) =>
    core.repo.metrics(id(value), z.number().min(1).max(168).parse(hours)),
  );
  handle('storageOverview', (value) => core.storage.overview(id(value)));
  handle('scanStorage', (value) => core.exclusive(id(value), () => core.storage.scan(id(value))));
  handle('revealStorageFile', async (value, input) => {
    const file = await core.storage.location(
      id(value),
      input as Parameters<typeof core.storage.location>[1],
    );
    shell.showItemInFolder(file);
  });
  handle('runtimes', () => core.runtime.list());
  handle('installRuntime', (major) =>
    core.exclusive('runtimes', () => core.runtime.install(z.number().int().parse(major))),
  );
  handle('runtimeEntries', () => core.runtimeMaintenance.list());
  handle('runtimeHealth', (value) =>
    core.runtimeMaintenance.health(z.string().min(1).max(160).parse(value)),
  );
  handle('repairRuntime', (input) =>
    core.exclusive('runtimes', () =>
      core.runtimeMaintenance.repair(input as Parameters<typeof core.runtimeMaintenance.repair>[0]),
    ),
  );
  handle('deleteRuntime', (input) =>
    core.exclusive('runtimes', () =>
      core.runtimeMaintenance.delete(input as Parameters<typeof core.runtimeMaintenance.delete>[0]),
    ),
  );
  handle('search', (value, query, provider) =>
    core.jobs.run('marketplace.search', 'Search marketplace', id(value), (context) =>
      catalog(provider).search(
        core.repo.server(id(value)),
        z.string().max(120).parse(query),
        context.signal,
      ),
    ),
  );
  handle('modSearch', (value, input) =>
    core.mods.search(core.repo.server(id(value)), modSearchSchema.parse(input)),
  );
  handle('modInventory', (value, force) =>
    core.mods.inventory(core.repo.server(id(value)), z.boolean().optional().parse(force)),
  );
  handle('modDetail', (value, project) =>
    core.mods.detail(core.repo.server(id(value)), modId.parse(project)),
  );
  handle('modPlan', (value, input) =>
    core.jobs.run('mods.plan', 'Review mods', id(value), (context) =>
      core.mods.plan(core.repo.server(id(value)), modPlanInputSchema.parse(input), context.signal),
    ),
  );
  handle('modApply', (value, token) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.safetyBackup(server.id, 'before_mods');
      return core.mods.apply(server, id(token));
    }),
  );
  handle('modUpdates', (value) =>
    core.jobs.run('mods.updates', 'Check mod updates', id(value), (context) =>
      core.mods.updates(core.repo.server(id(value)), context.signal),
    ),
  );
  handle('modPin', (value, content, pinned) =>
    core.exclusive(id(value), async () =>
      core.mods.pin(core.repo.server(id(value)), id(content), z.boolean().parse(pinned)),
    ),
  );
  handle('modRemoval', (value, ids) =>
    core.mods.removal(
      core.repo.server(id(value)),
      z.array(z.string().uuid()).min(1).max(300).parse(ids),
    ),
  );
  handle('modBulk', (value, raw) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value)),
        input = modBulkSchema.parse(raw);
      if (input.confirmation !== server.name)
        throw new DomainError('CONFIRM', 'Incorrect confirmation.');
      await core.safetyBackup(server.id, 'before_mods');
      return core.mods.bulk(server, input);
    }),
  );
  handle('modLibrary', () => core.mods.library());
  handle('modFavorite', (value, project, favorite) =>
    core.mods.favorite(
      core.repo.server(id(value)),
      modId.parse(project),
      z.boolean().parse(favorite),
    ),
  );
  handle('modCollection', (input) => core.mods.collection(modCollectionSchema.parse(input)));
  handle('modDeleteCollection', (value) => core.mods.deleteCollection(id(value)));
  handle('modHistory', (value) => core.mods.history(core.repo.server(id(value))));
  handle('modReveal', async (value, content) => {
    const server = core.repo.server(id(value)),
      item = core.repo.content(server.id).find((item) => item.id === id(content));
    if (!item) throw new DomainError('CONTENT', 'Managed content not found.');
    shell.showItemInFolder(
      await containedPath(
        path.join(server.path, 'mods'),
        item.filename + (item.enabled ? '' : '.disabled'),
      ),
    );
  });
  handle('modManualToggle', (value, filename) =>
    core.exclusive(id(value), () =>
      core.mods.manualToggle(core.assertStopped(id(value)), z.string().max(240).parse(filename)),
    ),
  );
  handle('modIdentify', (value, filename) =>
    core.exclusive(id(value), () =>
      core.mods.identify(core.assertStopped(id(value)), z.string().max(240).parse(filename)),
    ),
  );
  handle('modMigration', (value, target) =>
    core.jobs.run(
      'mods.migration',
      'Review Minecraft and loader compatibility',
      id(value),
      (context) =>
        core.mods.migration(
          core.repo.server(id(value)),
          modTargetSchema.parse(target),
          context.signal,
        ),
    ),
  );
  handle('modMigrate', (value, target, confirmation) =>
    core.migrateMods(id(value), modTargetSchema.parse(target), text.parse(confirmation)),
  );
  handle('marketplaceSettings', () => core.catalogs.settings());
  handle('contentIcon', (value) => core.icons.get(z.string().url().max(2000).parse(value)));
  handle('crossplayStatus', (value) => core.crossplay.status(core.repo.server(id(value))));
  handle('crossplayVersions', (value) =>
    core.jobs.run('crossplay.versions', 'Load crossplay versions', id(value), (context) =>
      core.crossplay.versions(core.repo.server(id(value)), context.signal),
    ),
  );
  handle('configureCrossplay', (value, input) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.backups.create(server.id, 'before_crossplay');
      await core.crossplay.configure(
        server,
        input as Parameters<typeof core.crossplay.configure>[1],
      );
    }),
  );
  handle('clearIconCache', () => core.icons.clean(true));
  handle('configureMarketplace', (input) =>
    core.catalogs.configure(input as Parameters<typeof core.catalogs.configure>[0]),
  );
  handle('content', (value) => core.repo.content(id(value)));
  const catalog = (provider: unknown) =>
    core.catalogs.catalog(marketplaceSchema.parse(provider ?? 'modrinth'));
  const identifier = z.string().regex(/^[a-zA-Z0-9_:+/.-]{1,150}$/);
  handle('contentVersions', (value, project, provider) =>
    core.jobs.run('marketplace.versions', 'Load content versions', id(value), (context) =>
      catalog(provider).versions(
        core.repo.server(id(value)),
        identifier.parse(project),
        context.signal,
      ),
    ),
  );
  handle('contentVersion', (provider, version) =>
    core.jobs.run('marketplace.version', 'Load version details', undefined, (context) =>
      catalog(provider).version(identifier.parse(version), context.signal),
    ),
  );
  handle('contentUpdates', (value) =>
    core.jobs.run('marketplace.updates', 'Check content updates', id(value), (context) =>
      core.marketplace.manager.updates(core.repo.server(id(value)), catalog, context.signal),
    ),
  );
  handle('contentHistory', (value, content) =>
    core.marketplace.manager.history(core.repo.server(id(value)), id(content)),
  );
  handle('manualContent', (value) => core.marketplace.manager.manual(core.repo.server(id(value))));
  handle('changeContentVersion', (value, content, version, confirm) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      const item = core.repo.content(server.id).find((item) => item.id === id(content));
      if (!item || item.title !== text.parse(confirm)) throw new Error('Incorrect confirmation.');
      await core.safetyBackup(server.id, 'before_content');
      return core.marketplace.manager.install(
        server,
        catalog(item.provider ?? 'modrinth'),
        item.projectId,
        identifier.parse(version),
        item.id,
      );
    }),
  );
  handle('uninstallContent', (value, content, confirm) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.safetyBackup(server.id, 'before_content');
      return core.marketplace.manager.uninstall(server, id(content), text.parse(confirm));
    }),
  );
  handle('rollbackContent', (value, content, history, confirm) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.safetyBackup(server.id, 'before_content');
      const item = core.repo.content(server.id).find((item) => item.id === id(content));
      await core.marketplace.manager.rollback(
        server,
        id(content),
        id(history),
        text.parse(confirm),
      );
      if (item && ['fabric', 'forge', 'neoforge'].includes(server.engine))
        core.mods.recordRollback(
          server,
          item,
          core.repo.content(server.id).find((value) => value.id === item.id)?.versionName,
        );
    }),
  );
  handle('installContent', (value, project, provider, version) =>
    core.exclusive(id(value), async () => {
      const server = core.assertStopped(id(value));
      await core.safetyBackup(server.id, 'before_content');
      return core.marketplace.manager.install(
        server,
        catalog(provider),
        identifier.parse(project),
        version === undefined ? undefined : identifier.parse(version),
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
      core.updates.configureHost({
        version: app.getVersion(),
        packaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch,
        target:
          process.platform === 'win32'
            ? process.env.PORTABLE_EXECUTABLE_FILE
              ? 'portable'
              : 'nsis'
            : process.platform === 'darwin'
              ? 'maczip'
              : process.env.APPIMAGE
                ? 'appimage'
                : 'deb',
      });
      await core.updates.recoverInstallation();
      Menu.setApplicationMenu(null);
      window = new BrowserWindow({
        width: 1360,
        height: 920,
        minWidth: 760,
        minHeight: 520,
        title: 'MineDock',
        icon: path.join(
          __dirname,
          'assets',
          process.platform === 'win32' ? 'icon.ico' : 'icon.png',
        ),
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
      window.on('close', (event) => {
        if (!unsavedChanges || quitting) return;
        event.preventDefault();
        if (reviewingClose) return;
        reviewingClose = true;
        const t = translator(core!.repo.settings().language);
        void dialog
          .showMessageBox(window!, {
            type: 'question',
            title: t('property.unsaved'),
            message: t('property.leaveHelp'),
            buttons: [t('cancel'), t('property.discard')],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          })
          .then(({ response }) => {
            reviewingClose = false;
            if (response === 1) {
              unsavedChanges = false;
              window?.close();
            }
          })
          .catch(() => {
            reviewingClose = false;
          });
      });
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
        if (
          event.type === 'notice' &&
          core?.health.settings().nativeNotifications &&
          Notification.isSupported()
        ) {
          const t = translator(core.repo.settings().language);
          new Notification({
            title: event.notice.serverId
              ? core.repo.server(event.notice.serverId).name
              : 'MineDock',
            body: t(('notice.' + event.notice.code) as Parameters<typeof t>[0]),
          }).show();
        }
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
      core.updates.startAutomaticChecks();
    })
    .catch((e) => {
      console.error(e);
      dialog.showErrorBox(
        'MineDock',
        localizeMessage(readableError(e), core?.repo.settings().language),
      );
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
        'An error occurred during shutdown. Check the logs: ' + readableError(e),
      );
      app.exit(1);
    });
});
