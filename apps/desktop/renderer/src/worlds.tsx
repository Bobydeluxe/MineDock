import { useState } from 'react';
import {
  Globe2,
  RefreshCw,
  FolderInput,
  Download,
  Copy,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import type { Server } from '../../../../packages/domain/types';
import type {
  WorldAction,
  WorldImportPreview,
  WorldSummary,
} from '../../../../packages/domain/worlds';
import { useApp } from './context';
import { Button, Field, Dialog, useData, Loading, ErrorBox, Empty, bytes } from './ui';
export function WorldsView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const data = useData(() => api.worlds(server.id), [server.id]);
  const [change, setChange] = useState<{ world: WorldSummary; action: WorldAction['action'] }>();
  const [preview, setPreview] = useState<WorldImportPreview>();
  const [newName, setNewName] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const stopped =
    !server.pid &&
    !['running', 'starting', 'stopping', 'installing', 'restoring', 'backing_up'].includes(
      server.status,
    );
  const close = () => {
    setChange(undefined);
    setPreview(undefined);
    setConfirmation('');
    setNewName('');
  };
  const pick = (archive: boolean) => {
    void run(() => api.previewWorldImport(server.id, archive)).then((result) => {
      if (result.ok && result.value) {
        setPreview(result.value);
        setNewName(result.value.name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'imported');
        setConfirmation('');
      }
    });
  };
  const actionLabel = (action: WorldAction['action']) =>
    t(
      action === 'duplicate'
        ? 'worldDuplicate'
        : action === 'rename'
          ? 'worldRename'
          : action === 'delete'
            ? 'worldDelete'
            : 'worldSelect',
    );
  const needsName = preview || change?.action === 'duplicate' || change?.action === 'rename';
  const expected = preview ? newName : change?.world.name;
  const validName =
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(newName) && !/_(?:nether|the_end)$/.test(newName);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{t('worlds')}</h2>
          <p>{t('worldManagerHelp')}</p>
        </div>
        <Button disabled={busy} onClick={data.reload}>
          <RefreshCw size={15} />
          {t('refresh')}
        </Button>
      </div>
      {!stopped && <p className="warning-text">{t('stopBeforeEditing')}</p>}
      <div className="actions">
        <Button disabled={busy || !stopped} onClick={() => pick(false)}>
          <FolderInput size={15} />
          {t('worldImportFolder')}
        </Button>
        <Button disabled={busy || !stopped} onClick={() => pick(true)}>
          <FolderInput size={15} />
          {t('worldImportArchive')}
        </Button>
      </div>
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} retryLabel={t('retry')} />
      ) : data.loading ? (
        <Loading label={t('loading')} />
      ) : !data.data?.length ? (
        <Empty icon={<Globe2 />} title={t('noWorlds')} />
      ) : (
        data.data.map((world) => (
          <article className="world-card managed-world" key={world.name}>
            <span className="world-icon">
              <Globe2 size={28} />
            </span>
            <div className="world-details">
              <h3>
                {world.name} {world.active && <span className="badge">{t('worldActive')}</span>}
              </h3>
              <p>
                {bytes(world.bytes)} · {world.files} {t('files')} ·{' '}
                {new Date(world.modified).toLocaleString()}
              </p>
              <p className="muted small-text">
                {t('worldDimensions')}: {world.folders.join(', ')}
                <br />
                {t('seed')}: {world.seed ?? '—'}
                {world.version && <> · Minecraft {world.version}</>}
                <br />
                {t('lastBackup')}:{' '}
                {world.lastBackup ? new Date(world.lastBackup).toLocaleString() : '—'}
                {world.lastPlayed && (
                  <>
                    <br />
                    {t('lastPlayed')}: {new Date(world.lastPlayed).toLocaleString()}
                  </>
                )}
              </p>
              {world.metadataError && (
                <p className="warning-text small-text">{t('metadataUnavailable')}</p>
              )}
              <div className="actions">
                <Button
                  disabled={busy || !stopped}
                  onClick={() => {
                    void run(() => api.exportWorld(server.id, world.name));
                  }}
                >
                  <Download size={14} />
                  {t('export')}
                </Button>
                {(['duplicate', 'rename', 'select', 'delete'] as const).map((action) => (
                  <Button
                    variant={action === 'delete' ? 'danger' : 'default'}
                    disabled={
                      busy ||
                      !stopped ||
                      (world.active && (action === 'select' || action === 'delete'))
                    }
                    key={action}
                    onClick={() => {
                      setChange({ world, action });
                      setNewName('');
                      setConfirmation('');
                    }}
                  >
                    {action === 'duplicate' ? (
                      <Copy size={14} />
                    ) : action === 'rename' ? (
                      <Pencil size={14} />
                    ) : action === 'select' ? (
                      <Check size={14} />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    {actionLabel(action)}
                  </Button>
                ))}
              </div>
            </div>
          </article>
        ))
      )}
      {(change || preview) && (
        <Dialog
          title={preview ? t('worldImportFolder') : actionLabel(change!.action)}
          closeLabel={t('close')}
          onClose={close}
        >
          <div className="dialog-body">
            <p className="muted">{t(preview ? 'worldImportHelp' : 'worldModifyHelp')}</p>
            {preview && (
              <>
                <p>
                  {preview.edition === 'java' ? 'Java Edition' : 'Bedrock Edition'} ·{' '}
                  {bytes(preview.bytes)} · {preview.files} {t('files')}
                </p>
                <p>
                  {t('worldDimensions')}: {preview.folders.join(', ')}
                  <br />
                  {t('seed')}: {preview.seed ?? '—'}
                </p>
                {preview.warnings.length > 0 && (
                  <p className="warning-text">{t('worldVersionWarning')}</p>
                )}
              </>
            )}
            {needsName && (
              <Field label={t('worldNewName')} hint={t('worldNameHelp')}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  maxLength={60}
                />
              </Field>
            )}
            <p>
              {t('confirmHelp')} <strong>{expected}</strong>
            </p>
            <Field label={t('worldName')}>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Button onClick={close}>{t('cancel')}</Button>
            <Button
              variant={change?.action === 'delete' ? 'danger' : 'primary'}
              disabled={
                busy ||
                !stopped ||
                !expected ||
                confirmation !== expected ||
                (!!needsName && !validName)
              }
              onClick={() => {
                void run(() =>
                  preview
                    ? api.importWorld(server.id, {
                        token: preview.token,
                        name: newName,
                        confirmation,
                      })
                    : api.worldAction(server.id, {
                        action: change!.action,
                        name: change!.world.name,
                        newName: needsName ? newName : undefined,
                        confirmation,
                      }),
                ).then((result) => {
                  if (result.ok) {
                    close();
                    data.reload();
                  }
                });
              }}
            >
              {t('next')}
            </Button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
