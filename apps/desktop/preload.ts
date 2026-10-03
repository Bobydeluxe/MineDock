import { contextBridge, ipcRenderer } from 'electron';
import type { Api, AppEvent } from '../../packages/domain/types';
const call = <T>(method: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke('minedock:' + method, ...args) as Promise<T>;
const api: Api = {
  snapshot: () => call('snapshot'),
  diagnostic: () => call('diagnostic'),
  settings: (v) => call('settings', v),
  selectFolder: () => call('selectFolder'),
  openFolder: (id) => call('openFolder', id),
  versions: (engine) => call('versions', engine),
  create: (input) => call('create', input),
  retryInstallation: (id) => call('retryInstallation', id),
  cancelDownload: (id) => call('cancelDownload', id),
  start: (id) => call('start', id),
  stop: (id) => call('stop', id),
  restart: (id) => call('restart', id),
  remove: (id, confirmation) => call('remove', id, confirmation),
  logs: (id) => call('logs', id),
  command: (id, command) => call('command', id, command),
  players: (id) => call('players', id),
  properties: (id) => call('properties', id),
  saveProperties: (id, props) => call('saveProperties', id, props),
  configureServer: (id, options) => call('configureServer', id, options),
  files: (id, path) => call('files', id, path),
  readFile: (id, path) => call('readFile', id, path),
  writeFile: (id, path, content) => call('writeFile', id, path, content),
  mkdir: (id, path) => call('mkdir', id, path),
  deleteFile: (id, path, confirm) => call('deleteFile', id, path, confirm),
  uploadFile: (id, path) => call('uploadFile', id, path),
  exportFile: (id, path) => call('exportFile', id, path),
  backup: (id) => call('backup', id),
  verifyBackup: (id) => call('verifyBackup', id),
  restore: (id, confirm) => call('restore', id, confirm),
  exportBackup: (id) => call('exportBackup', id),
  deleteBackup: (id, confirm) => call('deleteBackup', id, confirm),
  schedules: (input) => call('schedules', input),
  deleteSchedule: (id) => call('deleteSchedule', id),
  metrics: (id, hours) => call('metrics', id, hours),
  runtimes: () => call('runtimes'),
  installRuntime: (major) => call('installRuntime', major),
  search: (id, query) => call('search', id, query),
  installContent: (id, project) => call('installContent', id, project),
  content: (id) => call('content', id),
  toggleContent: (id, content) => call('toggleContent', id, content),
  onEvent: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, event: AppEvent): void => listener(event);
    ipcRenderer.on('minedock:event', receive);
    return () => ipcRenderer.removeListener('minedock:event', receive);
  },
};
contextBridge.exposeInMainWorld('minedock', api);
