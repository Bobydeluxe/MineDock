import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { ModpackPreview, ModpackSelection } from '../../../../packages/domain/modpacks';
import { useApp } from './context';
import { Button, Dialog, Field, bytes } from './ui';
import { CreateServer } from './wizard';
export function ModpackDialog({
  preview,
  onClose,
  onCreated,
}: {
  preview: ModpackPreview;
  onClose: () => void;
  onCreated: (server: Server) => void;
}) {
  const { t, busy } = useApp();
  const [optional, setOptional] = useState<string[]>([]),
    [confirmation, setConfirmation] = useState(''),
    [selection, setSelection] = useState<ModpackSelection>();
  if (selection)
    return (
      <CreateServer modpack={{ preview, selection }} onClose={onClose} onCreated={onCreated} />
    );
  return (
    <Dialog title={t('importModpack')} closeLabel={t('close')} onClose={onClose}>
      <div className="dialog-body">
        <h2>
          {preview.name} · {preview.versionId}
        </h2>
        {preview.summary && <p>{preview.summary}</p>}
        <p>
          {' '}
          Minecraft {preview.minecraft} · {preview.engine} {preview.loader} · Java {preview.java} ·{' '}
          {bytes(preview.bytes)}
        </p>
        <p className="muted">{t('modpackImportHelp')}</p>
        <div className="modpack-files">
          {preview.files.map((file) => (
            <div className="modpack-file" key={file.path}>
              {file.side === 'optional' ? (
                <label>
                  <input
                    type="checkbox"
                    disabled={!file.available}
                    checked={optional.includes(file.path)}
                    onChange={(event) =>
                      setOptional(
                        event.target.checked
                          ? [...optional, file.path]
                          : optional.filter((name) => name !== file.path),
                      )
                    }
                  />
                  <span>{file.path}</span>
                </label>
              ) : (
                <span>{file.path}</span>
              )}
              <span className="muted small-text">
                {bytes(file.size)} ·{' '}
                {t(
                  file.side === 'required'
                    ? 'modpackRequired'
                    : file.side === 'optional'
                      ? 'modpackOptional'
                      : 'modpackExcluded',
                )}
                {!file.available && file.side !== 'unsupported' && <> · {t('notAvailable')}</>}
              </span>
            </div>
          ))}
        </div>
        {preview.overrides.length > 0 && (
          <details className="advanced">
            <summary>{t('modpackOverrides')}</summary>
            {preview.overrides.map((name) => (
              <p className="small-text" key={name}>
                {name}
              </p>
            ))}
          </details>
        )}
        {preview.ignoredOverrides.length > 0 && (
          <details className="advanced">
            <summary>{t('modpackIgnored')}</summary>
            <p className="warning-text">{t('modpackProtectedHelp')}</p>
            {preview.ignoredOverrides.map((name) => (
              <p className="small-text" key={name}>
                {name}
              </p>
            ))}
          </details>
        )}
        <p>
          {t('confirmHelp')} <strong>{preview.name}</strong>
        </p>
        <Field label={t('modpackName')}>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
      <footer className="dialog-footer">
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="primary"
          disabled={busy || confirmation !== preview.name}
          onClick={() =>
            setSelection({ token: preview.token, optionalFiles: optional, confirmation })
          }
        >
          {t('next')}
        </Button>
      </footer>
    </Dialog>
  );
}
