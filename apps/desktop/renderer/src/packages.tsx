import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { PackagePreview } from '../../../../packages/domain/package';
import { useApp } from './context';
import { Button, Field, Toggle, Dialog, bytes } from './ui';
import { Confirm } from './management';
export function PackageControls({ server }: { server?: Server }) {
  const { api, t, run, busy } = useApp(),
    [sensitive, setSensitive] = useState(false),
    [exporting, setExporting] = useState(false),
    [preview, setPreview] = useState<PackagePreview>(),
    [name, setName] = useState(''),
    [eula, setEula] = useState(false),
    [confirmation, setConfirmation] = useState('');
  return (
    <details className="panel">
      <summary>{t('package.title')}</summary>
      <p>{t('package.help')}</p>
      {server && (
        <>
          <Toggle checked={sensitive} onChange={setSensitive} label={t('package.sensitive')} />
          <Button
            disabled={busy || !!server.pid || server.status === 'installing'}
            onClick={() => setExporting(true)}
          >
            {t('package.export')}
          </Button>
        </>
      )}
      <Button
        disabled={busy}
        onClick={() =>
          void run(() => api.previewPackage()).then((r) => {
            if (r.ok && r.value) {
              setPreview(r.value);
              setName(r.value.name);
              setEula(false);
              setConfirmation('');
            }
          })
        }
      >
        {t('package.import')}
      </Button>
      {exporting && server && (
        <Confirm
          name={server.name}
          help={sensitive ? t('package.sensitive') : t('package.help')}
          onClose={() => setExporting(false)}
          onConfirm={() =>
            void run(() => api.exportPackage(server.id, sensitive, server.name)).then((r) => {
              if (r.ok) setExporting(false);
            })
          }
        />
      )}{' '}
      {preview && (
        <Dialog
          title={t('package.import')}
          closeLabel={t('close')}
          onClose={() => setPreview(undefined)}
        >
          <div className="dialog-body">
            <p>
              {preview.engine} {preview.version} · Java {preview.javaRequired || t('none')} ·{' '}
              {preview.sourcePlatform}
            </p>
            <p>
              {preview.files} {t('files')} · {bytes(preview.bytes)} · {preview.content}{' '}
              {t('plugins')}
            </p>
            <p>
              {t('world')}: {preview.worlds.join(', ') || t('none')}
            </p>
            <p>
              {t('port')}: {preview.port} · {preview.memoryMax} MiB
            </p>
            <p className="muted">{t('package.trust')}</p>
            {preview.includesSensitiveConfiguration && <p>{t('package.containsSensitive')}</p>}
            <Field label={t('name')}>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Toggle checked={eula} onChange={setEula} label={t('package.accept')} />
            <Field label={t('confirmHelp')}>
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Button
              variant="primary"
              disabled={busy || !name.trim() || !eula || confirmation !== name}
              onClick={() =>
                void run(() =>
                  api.importPackage({ token: preview.token, name, confirmation, acceptEula: true }),
                ).then((r) => {
                  if (r.ok) setPreview(undefined);
                })
              }
            >
              {t('package.import')}
            </Button>
          </footer>
        </Dialog>
      )}
    </details>
  );
}
