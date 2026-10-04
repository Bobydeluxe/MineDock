import { useState } from 'react';
import { FolderInput } from 'lucide-react';
import type { Server } from '../../../../packages/domain/types';
import type { ImportServerPreview } from '../../../../packages/domain/imports';
import { engineIds, engineDefinition } from '../../../../packages/domain/engines';
import { useApp } from './context';
import { Button, Dialog, Field, Toggle } from './ui';
import { Confirm } from './management';
export function ImportServerDialog({
  preview,
  onClose,
  onCreated,
}: {
  preview: ImportServerPreview;
  onClose: () => void;
  onCreated: (server: Server) => void;
}) {
  const { api, t, run, busy } = useApp();
  const [name, setName] = useState(preview.name),
    [engine, setEngine] = useState<Server['engine']>(preview.engine ?? 'paper'),
    [version, setVersion] = useState(preview.version ?? ''),
    [loader, setLoader] = useState(preview.loaderVersion ?? ''),
    [entrypoint, setEntrypoint] = useState(preview.entrypoint ?? ''),
    [args, setArgs] = useState(preview.launchArgsFile ?? ''),
    [copy, setCopy] = useState(true),
    [acceptEula, setAcceptEula] = useState(false),
    [port, setPort] = useState(Number(preview.properties['server-port']) || 25565),
    [ipv6Port, setIpv6Port] = useState(Number(preview.properties['server-portv6']) || 19133),
    [advanced, setAdvanced] = useState(false),
    [minimum, setMinimum] = useState(1024),
    [maximum, setMaximum] = useState(4096),
    [confirm, setConfirm] = useState(false);
  const java = engineDefinition(engine).edition === 'java',
    valid =
      name.trim().length > 0 &&
      version.length > 0 &&
      !!(entrypoint || args) &&
      port >= 1024 &&
      port <= 65535 &&
      (!java || preview.eulaAccepted || (copy && acceptEula)) &&
      minimum <= maximum;
  return (
    <>
      <Dialog title={t('importServer')} closeLabel={t('close')} onClose={onClose}>
        <div className="dialog-body">
          <p className="muted">{t('importServerHelp')}</p>
          <code className="confirm-name">{preview.sourcePath}</code>
          <p className="muted small-text">
            {t(preview.confidence === 'detected' ? 'importDetected' : 'importUncertain')}
          </p>
          {preview.warnings.length > 0 && (
            <ul className="muted small-text">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="form-grid">
            <Field label={t('name')}>
              <input
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label={t('engine')}>
              <select
                value={engine}
                onChange={(event) => setEngine(event.target.value as Server['engine'])}
              >
                {engineIds.map((id) => (
                  <option value={id} key={id}>
                    {engineDefinition(id).displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('version')}>
              <input
                value={version}
                maxLength={40}
                onChange={(event) => setVersion(event.target.value)}
              />
            </Field>
            <Field label={t('port')}>
              <input
                type="number"
                min={1024}
                max={65535}
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="details-list">
            <div>
              <span>{t('worlds')}</span>
              <strong>{preview.worlds.join(', ') || t('none')}</strong>
            </div>
            <div>
              <span>{t('plugins')}</span>
              <strong>{preview.plugins}</strong>
            </div>
            <div>
              <span>{t('mods')}</span>
              <strong>{preview.mods}</strong>
            </div>
          </div>
          <Toggle label={t('copyImportedServer')} checked={copy} onChange={setCopy} />
          <p className="muted small-text">
            {t(copy ? 'copyImportedServerHelp' : 'originalImportedServerHelp')}
          </p>
          <Button variant="ghost" onClick={() => setAdvanced(!advanced)}>
            {t('advanced')}
          </Button>
          {advanced && (
            <div className="form-grid">
              {!!preview.launchOptions?.length && (
                <Field label={t('launchArgumentsFile')}>
                  <select
                    value={args}
                    onChange={(event) => {
                      const option = preview.launchOptions?.find(
                        (item) => item.launchArgsFile === event.target.value,
                      );
                      if (option) {
                        setEngine(option.engine);
                        setVersion(option.version);
                        setLoader(option.loaderVersion);
                        setArgs(option.launchArgsFile);
                        setEntrypoint('');
                      }
                    }}
                  >
                    <option value="">{t('none')}</option>
                    {preview.launchOptions.map((item) => (
                      <option key={item.launchArgsFile} value={item.launchArgsFile}>
                        {engineDefinition(item.engine).displayName} {item.loaderVersion} ·{' '}
                        {item.launchArgsFile}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={t('entrypoint')}>
                <select
                  value={entrypoint}
                  onChange={(event) => {
                    setEntrypoint(event.target.value);
                    setArgs('');
                  }}
                >
                  <option value="">{t('none')}</option>
                  {preview.entrypoints.map((file) => (
                    <option value={file} key={file}>
                      {file}
                    </option>
                  ))}
                </select>
              </Field>
              {java && (
                <>
                  <Field label={t('launchArgumentsFile')}>
                    <input
                      value={args}
                      maxLength={400}
                      onChange={(event) => setArgs(event.target.value)}
                    />
                  </Field>
                  <Field label={t('loaderVersion')}>
                    <input
                      value={loader}
                      onChange={(event) => setLoader(event.target.value)}
                      maxLength={80}
                    />
                  </Field>
                  <Field label={t('memoryMin')}>
                    <input
                      type="number"
                      min={256}
                      value={minimum}
                      onChange={(event) => setMinimum(Number(event.target.value))}
                    />
                  </Field>
                  <Field label={t('memoryMax')}>
                    <input
                      type="number"
                      min={512}
                      value={maximum}
                      onChange={(event) => setMaximum(Number(event.target.value))}
                    />
                  </Field>
                </>
              )}
              {!java && (
                <Field label={t('ipv6Port')}>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={ipv6Port}
                    onChange={(event) => setIpv6Port(Number(event.target.value))}
                  />
                </Field>
              )}
            </div>
          )}
          {java && !preview.eulaAccepted && (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={acceptEula}
                  onChange={(event) => setAcceptEula(event.target.checked)}
                />
                {t('eulaAccept')}
              </label>
              <p className="muted small-text">{t('importEulaHelp')}</p>
            </>
          )}
        </div>
        <footer className="dialog-footer">
          <Button disabled={busy} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={busy || !valid} onClick={() => setConfirm(true)}>
            <FolderInput size={16} />
            {t('importServer')}
          </Button>
        </footer>
      </Dialog>
      {confirm && (
        <Confirm
          name={name}
          help={t('importServerConfirm')}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            void run(() =>
              api.importServer({
                token: preview.token,
                name,
                engine,
                version,
                loaderVersion: loader || undefined,
                entrypoint: entrypoint || undefined,
                launchArgsFile: args || undefined,
                copy,
                acceptEula,
                port,
                ipv6Port: java ? undefined : ipv6Port,
                memoryMin: minimum,
                memoryMax: maximum,
                confirmation: name,
              }),
            ).then((result) => {
              if (result.ok) onCreated(result.value);
            });
          }}
        />
      )}
    </>
  );
}
