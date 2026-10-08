import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { PartialPreview, RestoreScope } from '../../../../packages/domain/snapshots';
import { useApp } from './context';
import { Button, Toggle, Field, Dialog, ErrorBox, useData, bytes } from './ui';
import type { Key } from './i18n';
export function SnapshotControls({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp(),
    data = useData(() => api.incrementalSnapshots(server.id), [server.id]),
    settings = useData(() => api.backupSafety(), []);
  const [scope, setScope] = useState<RestoreScope>('world'),
    [preview, setPreview] = useState<PartialPreview>(),
    [confirmation, setConfirmation] = useState(''),
    [storage, setStorage] = useState<number>();
  const stopped = !server.pid && ['stopped', 'crashed'].includes(server.status);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{t('snapshot.title')}</h2>
          <p>{t('snapshot.help')}</p>
        </div>
        <Button
          disabled={busy || !stopped}
          onClick={() => {
            void run(() => api.createIncremental(server.id)).then(data.reload);
          }}
        >
          {t('snapshot.create')}
        </Button>
      </div>
      {data.error && <ErrorBox error={data.error} />}
      <Field label={t('snapshot.scope')}>
        <select value={scope} onChange={(e) => setScope(e.target.value as RestoreScope)}>
          {(['all', 'world', 'config', 'mods', 'plugins', 'datapacks'] as const).map((s) => (
            <option key={s} value={s}>
              {t(('snapshot.' + s) as Key)}
            </option>
          ))}
        </select>
      </Field>
      {data.data?.map((item) => (
        <div className="installed-row" key={item.id}>
          <div>
            <strong>{new Date(item.at).toLocaleString()}</strong>
            <small>
              {t('snapshot.logical')}: {bytes(item.logicalBytes)} · {t('snapshot.newBytes')}:{' '}
              {bytes(item.storedBytes)} · {item.files} {t('files')}
            </small>
          </div>
          <Button
            disabled={busy || !stopped}
            onClick={() => {
              setConfirmation('');
              void run(() => api.previewPartial(server.id, item.id, scope)).then((r) => {
                if (r.ok) setPreview(r.value);
              });
            }}
          >
            {t('snapshot.preview')}
          </Button>
        </div>
      ))}
      <details>
        <summary>{t('snapshot.safety')}</summary>
        {settings.data && (
          <>
            <Toggle
              label={t('snapshot.beforeContent')}
              checked={settings.data.beforeContent}
              onChange={(value) => {
                void run(() =>
                  api.configureBackupSafety({ ...settings.data!, beforeContent: value }),
                ).then(settings.reload);
              }}
            />
            <Toggle
              label={t('snapshot.beforeMinecraft')}
              checked={settings.data.beforeMinecraft}
              onChange={(value) => {
                void run(() =>
                  api.configureBackupSafety({ ...settings.data!, beforeMinecraft: value }),
                ).then(settings.reload);
              }}
            />
          </>
        )}
        <p>{t('snapshot.nasHelp')}</p>
        <Button
          disabled={busy}
          onClick={() => {
            void run(() => api.testBackupStorage()).then((r) => {
              if (r.ok) setStorage(r.value.freeBytes);
            });
          }}
        >
          {t('snapshot.testStorage')}
        </Button>
        {storage !== undefined && (
          <p>
            {t('health.freeDisk')}: {bytes(storage)}
          </p>
        )}
      </details>
      {preview && (
        <Dialog
          title={t('snapshot.preview')}
          closeLabel={t('close')}
          onClose={() => setPreview(undefined)}
        >
          <p>{t('snapshot.restoreHelp')}</p>
          <strong>{t('snapshot.replaced')}</strong>
          <ul>
            {preview.replaced.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <details>
            <summary>
              {t('files')} ({preview.paths.length})
            </summary>
            <pre style={{ maxHeight: 240, overflow: 'auto' }}>{preview.paths.join('\n')}</pre>
          </details>
          <Field label={t('confirmHelp')}>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={server.name}
            />
          </Field>
          <Button
            disabled={busy || confirmation !== server.name}
            variant="danger"
            onClick={() => {
              void run(() => api.restorePartial(server.id, preview.token, confirmation)).then(
                (r) => {
                  if (r.ok) {
                    setPreview(undefined);
                    data.reload();
                  }
                },
              );
            }}
          >
            {t('restore')}
          </Button>
        </Dialog>
      )}
    </section>
  );
}
