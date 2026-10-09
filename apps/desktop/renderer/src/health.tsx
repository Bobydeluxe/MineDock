import { useState, useEffect } from 'react';
import { useApp } from './context';
import { Button, Field, Toggle, Dialog, ErrorBox, useData, bytes } from './ui';
import type { Server } from '../../../../packages/domain/types';
import type { Key } from './i18n';
import type { HealthSettings } from '../../../../packages/domain/health';
import { localizeMessage } from '../../../../packages/domain/localization';
import { Confirm } from './management';
export function HealthView({ server }: { server: Server }) {
  const { api, t, run, busy, snapshot } = useApp(),
    data = useData(() => api.health(server.id), [server.id, server.status]);
  const [crash, setCrash] = useState(false),
    report = useData(
      () => (crash ? api.crashReport(server.id) : Promise.resolve(null)),
      [crash, server.id],
    );
  const [disable, setDisable] = useState<string>();
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{t('health.title')}</h2>
        <Button onClick={data.reload}>{t('refresh')}</Button>
      </div>
      {data.error && <ErrorBox error={data.error} />}{' '}
      {data.data && (
        <>
          <span
            className={`badge ${data.data.state === 'problem' ? 'danger' : data.data.state === 'attention' ? 'warning' : 'enabled'}`}
          >
            {t(('health.' + data.data.state) as Key)}
          </span>
          {data.data.issues.map((i) => (
            <p key={i.code}>
              {t(('health.' + i.code) as Key)}
              {i.detail ? ' · ' + localizeMessage(i.detail, snapshot.settings.language) : ''}
            </p>
          ))}
          <small>
            {t('health.memoryHelp')} · {t('health.freeDisk')}:{' '}
            {data.data.diskFreeBytes === undefined
              ? t('unavailable')
              : bytes(data.data.diskFreeBytes)}
          </small>
        </>
      )}
      <Button disabled={busy} onClick={() => setCrash(true)}>
        {t('health.crashReport')}
      </Button>
      {crash && (
        <Dialog
          title={t('health.crashReport')}
          closeLabel={t('close')}
          onClose={() => setCrash(false)}
        >
          <div className="dialog-body">
            {report.error && <ErrorBox error={report.error} />}{' '}
            {report.data && (
              <>
                <p>{localizeMessage(report.data.diagnosis, snapshot.settings.language)}</p>
                <p>{t('health.evidenceHelp')}</p>
                {report.data.candidates.map((c) => (
                  <p key={c.filename}>
                    {c.title} · {c.filename} · {t('health.possible')}
                    {c.id && (
                      <>
                        <Button onClick={() => void run(() => api.modReveal(server.id, c.id!))}>
                          {t('openFolder')}
                        </Button>
                        <Button
                          disabled={busy || !!server.pid || server.status === 'installing'}
                          onClick={() => {
                            setCrash(false);
                            setDisable(c.id);
                          }}
                        >
                          {t('disable')}
                        </Button>
                      </>
                    )}
                  </p>
                ))}
                <Button
                  disabled={!report.data.path}
                  onClick={() => {
                    void run(() => api.revealCrash(server.id));
                  }}
                >
                  {t('openFolder')}
                </Button>
                <pre
                  className="console-output"
                  style={{ maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}
                >
                  {report.data.text || t('noResults')}
                </pre>
              </>
            )}
          </div>
        </Dialog>
      )}
      {disable && (
        <Confirm
          name={server.name}
          help={t('health.evidenceHelp')}
          onClose={() => setDisable(undefined)}
          onConfirm={() =>
            void run(() =>
              api.modBulk(server.id, {
                ids: [disable],
                action: 'disable',
                confirmation: server.name,
              }),
            ).then((r) => {
              if (r.ok) setDisable(undefined);
            })
          }
        />
      )}
    </section>
  );
}
export function NotificationSettings() {
  const { api, t, run, busy, snapshot } = useApp(),
    notices = useData(
      () => api.notices(),
      [snapshot.activity.length, snapshot.servers.map((s) => s.updatedAt).join()],
    ),
    settings = useData(() => api.healthSettings(), []);
  const [preferences, setPreferences] = useState<HealthSettings>();
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    if (settings.data) setPreferences(settings.data);
  }, [settings.data]);
  const configure = (patch: Partial<HealthSettings>) => {
    if (!preferences || updating || busy) return;
    const previous = preferences,
      next = { ...preferences, ...patch };
    setPreferences(next);
    setUpdating(true);
    void run(() => api.configureHealth(next))
      .then((result) => {
        setPreferences(result.ok && result.value ? result.value : previous);
        if (!result.ok) settings.reload();
      })
      .finally(() => setUpdating(false));
  };
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'notice') notices.reload();
      }),
    [api, notices.reload],
  );
  return (
    <section className="panel notification-settings">
      <h2>{t('notifications')}</h2>
      {settings.error && (
        <ErrorBox error={settings.error} retry={settings.reload} retryLabel={t('retry')} />
      )}
      {preferences && (
        <>
          <Toggle
            label={t('health.native')}
            disabled={busy || updating}
            checked={preferences.nativeNotifications}
            onChange={(value) => configure({ nativeNotifications: value })}
          />
          {(
            [
              'crash',
              'backupFailed',
              'offline',
              'update',
              'lowDisk',
              'playerJoin',
              'playerLeave',
            ] as const
          ).map((key) => (
            <Toggle
              key={key}
              disabled={busy || updating}
              label={t(('notice.' + key) as Key)}
              checked={preferences[key]}
              onChange={(value) => configure({ [key]: value })}
            />
          ))}
          <details>
            <summary>{t('advanced')}</summary>
            {(['cpuPercent', 'memoryPercent', 'diskFreeGiB', 'backupAgeHours'] as const).map(
              (key) => (
                <Field key={key} label={t(('health.' + key) as Key)}>
                  <input
                    type="number"
                    disabled={busy || updating}
                    defaultValue={preferences[key]}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value !== preferences[key]) configure({ [key]: value });
                    }}
                  />
                </Field>
              ),
            )}
          </details>
        </>
      )}
      <details className="notification-history">
        <summary>{t('settings.notificationHistory')}</summary>
        <Button
          disabled={busy || !notices.data?.some((notice) => !notice.read)}
          onClick={() => {
            void run(() => api.readNotices()).then(notices.reload);
          }}
        >
          {t('health.readAll')}
        </Button>
        {notices.error && (
          <ErrorBox error={notices.error} retry={notices.reload} retryLabel={t('retry')} />
        )}
        {notices.loading && <p>{t('loading')}</p>}
        {!notices.loading && !notices.error && !notices.data?.length && <p>{t('noResults')}</p>}
        {notices.data?.map((notice) => (
          <div className="installed-row" key={notice.id}>
            <div>
              <strong>
                {t(('notice.' + notice.code) as Key)}
                {notice.count > 1 ? ` ×${notice.count}` : ''}
              </strong>
              <small>
                {snapshot.servers.find((server) => server.id === notice.serverId)?.name} ·{' '}
                {new Date(notice.at).toLocaleString(snapshot.settings.language)}
              </small>
            </div>
            <Button
              disabled={busy || notice.read}
              onClick={() => {
                void run(() => api.readNotices(notice.id)).then(notices.reload);
              }}
            >
              {t(notice.read ? 'health.read' : 'health.markRead')}
            </Button>
          </div>
        ))}
      </details>
    </section>
  );
}
