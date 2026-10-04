import { useState } from 'react';
import { useApp } from './context';
import { Button, Dialog, Field, Toggle } from './ui';
import type { FileAction } from '../../../../packages/domain/files';
export function FileTools({
  id,
  path,
  disabled,
  reload,
}: {
  id: string;
  path: string;
  disabled: boolean;
  reload: () => void;
}) {
  const { api, t, run, busy } = useApp();
  const [open, setOpen] = useState(false),
    [action, setAction] = useState<FileAction['action']>('copy'),
    [destination, setDestination] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [overwrite, setOverwrite] = useState(false),
    [overwriteConfirmation, setOverwriteConfirmation] = useState('');
  const sourceName = path.split('/').at(-1)!;
  return (
    <>
      <Button
        variant="ghost"
        disabled={disabled || busy}
        onClick={() => {
          setOpen(true);
          setDestination(path);
          setConfirmation('');
          setOverwrite(false);
          setOverwriteConfirmation('');
        }}
      >
        {t('manageFiles')}
      </Button>
      {open && (
        <Dialog title={sourceName} closeLabel={t('close')} onClose={() => setOpen(false)}>
          <div className="dialog-body">
            <p>{t('fileActionHelp')}</p>
            <Field label={t('action')}>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as FileAction['action'])}
              >
                <option value="copy">{t('fileCopy')}</option>
                <option value="move">{t('fileMove')}</option>
                <option value="rename">{t('fileRename')}</option>
              </select>
            </Field>
            <Field label={t('destinationPath')} hint={t('relativePathHelp')}>
              <input value={destination} onChange={(event) => setDestination(event.target.value)} />
            </Field>
            <Field label={t('confirmHelp') + ' ' + sourceName}>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            <Toggle label={t('overwriteFiles')} checked={overwrite} onChange={setOverwrite} />
            {overwrite && (
              <Field label={t('confirmHelp') + ' ' + (destination.split('/').at(-1) ?? '')}>
                <input
                  value={overwriteConfirmation}
                  onChange={(event) => setOverwriteConfirmation(event.target.value)}
                />
              </Field>
            )}
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button
              variant={overwrite ? 'danger' : 'primary'}
              disabled={
                busy ||
                !destination ||
                destination === path ||
                confirmation !== sourceName ||
                (overwrite && overwriteConfirmation !== destination.split('/').at(-1))
              }
              onClick={() => {
                void run(() =>
                  api.fileAction(id, {
                    action,
                    source: path,
                    destination,
                    confirmation,
                    overwrite,
                    overwriteConfirmation,
                  }),
                ).then((result) => {
                  if (result.ok) {
                    setOpen(false);
                    reload();
                  }
                });
              }}
            >
              {t('save')}
            </Button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
export function ArchiveTools({
  id,
  folder,
  disabled,
  reload,
}: {
  id: string;
  folder: string;
  disabled: boolean;
  reload: () => void;
}) {
  const { api, t, run, busy } = useApp();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [overwrite, setOverwrite] = useState(false);
  return (
    <>
      <Button
        disabled={disabled || busy}
        onClick={() => {
          void run(() => api.compressArchive(id, folder));
        }}
      >
        {t('compressZip')}
      </Button>
      <Button
        disabled={disabled || busy}
        onClick={() => {
          setOpen(true);
          setName('imported');
          setConfirmation('');
          setOverwrite(false);
        }}
      >
        {t('extractZip')}
      </Button>
      {open && (
        <Dialog title={t('extractZip')} closeLabel={t('close')} onClose={() => setOpen(false)}>
          <div className="dialog-body">
            <p>{t('fileActionHelp')}</p>
            <Field label={t('destinationPath')} hint={t('relativePathHelp')}>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Toggle label={t('overwriteFiles')} checked={overwrite} onChange={setOverwrite} />
            <Field label={t('confirmHelp') + ' ' + (name.split('/').at(-1) ?? '')}>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button
              variant={overwrite ? 'danger' : 'primary'}
              disabled={busy || !name || confirmation !== name.split('/').at(-1)}
              onClick={() => {
                void run(() =>
                  api.extractArchive(id, {
                    destination: [folder, name].filter(Boolean).join('/'),
                    overwrite,
                    confirmation,
                  }),
                ).then((result) => {
                  if (result.ok) {
                    setOpen(false);
                    reload();
                  }
                });
              }}
            >
              {t('selectArchive')}
            </Button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
