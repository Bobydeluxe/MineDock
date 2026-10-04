import { useEffect, useState } from 'react';
import type { RetentionPolicy, RetentionPreview } from '../../../../packages/domain/retention';
import { useApp } from './context';
import { Button, Field, Toggle, Loading, ErrorBox, useData, bytes } from './ui';
export function RetentionControls({ serverId }: { serverId: string }) {
  const { api, run, busy, t, snapshot } = useApp();
  const loaded = useData(() => api.retentionPolicy(serverId), [serverId]);
  const [policy, setPolicy] = useState<RetentionPolicy>();
  const [preview, setPreview] = useState<RetentionPreview>();
  const [confirmation, setConfirmation] = useState('');
  const [manualConfirmation, setManualConfirmation] = useState('');
  useEffect(() => {
    setPolicy(loaded.data);
    setPreview(undefined);
    setConfirmation('');
    setManualConfirmation('');
  }, [loaded.data]);
  const server = snapshot.servers.find((item) => item.id === serverId);
  const update = <K extends keyof RetentionPolicy>(key: K, value: RetentionPolicy[K]) => {
    setPolicy((current) => current && { ...current, [key]: value });
    setPreview(undefined);
  };
  return (
    <details className="panel retention-controls">
      <summary>{t('retentionTitle')}</summary>
      <p className="hint">{t('retentionHelp')}</p>
      {loaded.error ? (
        <ErrorBox error={loaded.error} retry={loaded.reload} retryLabel={t('retry')} />
      ) : !policy ? (
        <Loading label={t('loading')} />
      ) : (
        <>
          <Field label={t('retentionMode')}>
            <select
              value={policy.mode}
              onChange={(event) => update('mode', event.target.value as RetentionPolicy['mode'])}
            >
              <option value="disabled">{t('retentionDisabled')}</option>
              <option value="count">{t('retentionCount')}</option>
              <option value="days">{t('retentionDays')}</option>
              <option value="gfs">{t('retentionGfs')}</option>
            </select>
          </Field>
          {policy.mode === 'count' && (
            <Field label={t('retentionCount')}>
              <input
                type="number"
                min={1}
                max={10000}
                value={policy.count}
                onChange={(event) => update('count', Number(event.target.value))}
              />
            </Field>
          )}
          {policy.mode === 'days' && (
            <Field label={t('retentionDays')}>
              <input
                type="number"
                min={1}
                max={36500}
                value={policy.days}
                onChange={(event) => update('days', Number(event.target.value))}
              />
            </Field>
          )}
          {policy.mode === 'gfs' && (
            <>
              <p className="hint">{t('retentionGfsHelp')}</p>
              <div className="form-grid">
                {(['hourly', 'daily', 'weekly', 'monthly'] as const).map((key) => (
                  <Field key={key} label={t(('retention.' + key) as 'retention.hourly')}>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={policy[key]}
                      onChange={(event) => update(key, Number(event.target.value))}
                    />
                  </Field>
                ))}
              </div>
              <Field label={t('timezone')}>
                <input
                  value={policy.timezone}
                  onChange={(event) => update('timezone', event.target.value)}
                />
              </Field>
            </>
          )}
          <details>
            <summary>{t('advanced')}</summary>
            <Toggle
              label={t('retentionIncludeManual')}
              checked={policy.includeManual}
              onChange={(value) => update('includeManual', value)}
            />
            <p className="warning-text">{t('retentionManualWarning')}</p>
          </details>
          <div className="actions">
            <Button
              disabled={busy}
              onClick={() => {
                void run(() => api.configureRetention(serverId, policy)).then((result) => {
                  if (result.ok) {
                    setPreview(undefined);
                    loaded.reload();
                  }
                });
              }}
            >
              {t('save')}
            </Button>
            <Button
              disabled={
                busy ||
                policy.mode === 'disabled' ||
                JSON.stringify(policy) !== JSON.stringify(loaded.data)
              }
              onClick={() => {
                void run(() => api.previewRetention(serverId)).then((result) => {
                  if (result.ok) setPreview(result.value);
                });
              }}
            >
              {t('retentionPreview')}
            </Button>
          </div>
          {preview && (
            <section className="retention-preview">
              <h3>
                {preview.archives.length} {t('retentionArchives')} · {bytes(preview.bytes)}{' '}
                {t('retentionRecovered')}
              </h3>
              <p>
                {preview.protectedCount} {t('retentionProtected')} · {preview.unavailableCount}{' '}
                {t('retentionUnavailable')}
              </p>
              <ul>
                {preview.archives.map((item) => (
                  <li key={item.id}>
                    {item.name} ·{' '}
                    {new Date(item.createdAt).toLocaleString(snapshot.settings.language)} ·{' '}
                    {bytes(item.size)}
                  </li>
                ))}
              </ul>
              <Field label={t('name')} hint={server?.name}>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Field>
              {preview.policy.includeManual && (
                <Field label={t('retentionManualConfirmation')} hint="DELETE MANUAL BACKUPS">
                  <input
                    value={manualConfirmation}
                    onChange={(event) => setManualConfirmation(event.target.value)}
                  />
                </Field>
              )}
              <Button
                variant="danger"
                disabled={
                  busy ||
                  preview.archives.length === 0 ||
                  confirmation !== server?.name ||
                  (preview.policy.includeManual && manualConfirmation !== 'DELETE MANUAL BACKUPS')
                }
                onClick={() => {
                  void run(() =>
                    api.purgeRetention(serverId, {
                      token: preview.token,
                      confirmation,
                      manualConfirmation,
                    }),
                  ).then((result) => {
                    if (result.ok) {
                      setPreview(undefined);
                      setConfirmation('');
                      setManualConfirmation('');
                      loaded.reload();
                    }
                  });
                }}
              >
                {t('retentionPurge')}
              </Button>
            </section>
          )}
        </>
      )}
    </details>
  );
}
