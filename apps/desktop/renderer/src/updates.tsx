import { useState, useEffect } from 'react';
import { useApp } from './context';
import { Button, Toggle, Field, Dialog, ErrorBox, Loading, useData, bytes } from './ui';
export function UpdateControls() {
  const { api, t, run, busy, snapshot } = useApp();
  const status = useData(() => api.updateStatus(), [snapshot.activity[0]?.id]);
  const [automaticChecks, setAutomaticChecks] = useState<boolean>();
  useEffect(() => setAutomaticChecks(status.data?.automaticChecks), [status.data?.automaticChecks]);
  const [confirm, setConfirm] = useState(false),
    [phrase, setPhrase] = useState('');
  const available = status.data?.available;
  const label = available ? 'MineDock ' + available.version : '';
  return (
    <section className="panel update-controls">
      <h2>{t('appUpdates')}</h2>
      <p className="hint">{t('appUpdatesHelp')}</p>
      {status.error ? (
        <ErrorBox error={status.error} retry={status.reload} retryLabel={t('retry')} />
      ) : !status.data ? (
        <Loading label={t('loading')} />
      ) : (
        <>
          <p>
            {t('installedVersion')} · {status.data.currentVersion}
          </p>
          <Toggle
            label={t('automaticUpdateChecks')}
            checked={automaticChecks ?? status.data.automaticChecks}
            disabled={busy}
            onChange={(enabled) => {
              setAutomaticChecks(enabled);
              void run(() => api.configureUpdates(enabled)).then((result) => {
                if (!result.ok) setAutomaticChecks(status.data?.automaticChecks);
                status.reload();
              });
            }}
          />
          {!status.data.trustedKeyConfigured && (
            <p className="warning-text">{t('updateKeyMissing')}</p>
          )}
          {status.data.lastChecked && (
            <p className="hint">
              {t('lastUpdateCheck')} ·{' '}
              {new Date(status.data.lastChecked).toLocaleString(snapshot.settings.language)}
            </p>
          )}
          {status.data.error && <ErrorBox error={status.data.error} />}
          {status.data.lastChecked && !available && !status.data.error && (
            <p className="hint" role="status">
              {t('upToDate')}
            </p>
          )}
          <div className="actions">
            <Button
              disabled={busy || !status.data.trustedKeyConfigured}
              onClick={() => {
                void run(() => api.checkUpdates()).then(() => status.reload());
              }}
            >
              {t('checkAppUpdates')}
            </Button>
          </div>
          {available && (
            <>
              <h3>
                {t('verifiedUpdate')} · {available.version}
              </h3>
              <p className="hint">
                {available.artifact.platform}/{available.artifact.arch} ·{' '}
                {available.artifact.target} · {bytes(available.artifact.size)}
              </p>
              <p className="update-notes">{available.notes}</p>
              {status.data.downloaded ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setPhrase('');
                    setConfirm(true);
                  }}
                >
                  {t(
                    ['deb', 'dmg'].includes(available.artifact.target)
                      ? 'openUpdateInstaller'
                      : 'restartInstallUpdate',
                  )}
                </Button>
              ) : (
                <Button
                  disabled={busy || !status.data.packaged}
                  onClick={() => {
                    void run(() => api.downloadUpdate()).then(() => status.reload());
                  }}
                >
                  {t('downloadVerifiedUpdate')}
                </Button>
              )}
              {!status.data.packaged && <p className="hint">{t('packagedUpdateRequired')}</p>}
            </>
          )}
        </>
      )}
      {confirm && available && (
        <Dialog
          title={t('installAppUpdate')}
          closeLabel={t('close')}
          onClose={() => setConfirm(false)}
        >
          <div className="dialog-body">
            <p>{t('installAppUpdateHelp')}</p>
            <p>
              {t(
                ['deb', 'dmg'].includes(available.artifact.target)
                  ? 'systemUpdateInstallerHelp'
                  : 'restartUpdateHelp',
              )}
            </p>
            <Field label={t('updateConfirmation')} hint={label}>
              <input value={phrase} onChange={(event) => setPhrase(event.target.value)} />
            </Field>
            <Button
              variant="primary"
              disabled={busy || phrase !== label}
              onClick={() => {
                void run(() => api.installUpdate(phrase)).then((result) => {
                  if (result.ok) setConfirm(false);
                });
              }}
            >
              {t('installAppUpdate')}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
