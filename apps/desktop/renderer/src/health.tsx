import { useState, useEffect } from 'react';
import { useApp } from './context';
import { Button, Field, Toggle, Dialog, ErrorBox, useData, bytes } from './ui';
import type { Server } from '../../../../packages/domain/types';
import type { Key } from './i18n';
import { localizeMessage } from '../../../../packages/domain/localization';
export function HealthView({ server }: { server: Server }) {
  const { api, t, run, busy, snapshot } = useApp(),
    data = useData(() => api.health(server.id), [server.id, server.status]);
  const [crash, setCrash] = useState(false),
    report = useData(
      () => (crash ? api.crashReport(server.id) : Promise.resolve(null)),
      [crash, server.id],
    );
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
            <p key={i.code}>{t(('health.' + i.code) as Key)}</p>
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
          {report.error && <ErrorBox error={report.error} />}{' '}
          {report.data && (
            <>
              <p>{localizeMessage(report.data.diagnosis, snapshot.settings.language)}</p>
              <p>{t('health.evidenceHelp')}</p>
              {report.data.candidates.map((c) => (
                <p key={c.filename}>
                  {c.title} · {c.filename} · {t('health.possible')}
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
        </Dialog>
      )}
    </section>
  );
}
export function NotificationsView() {
  const { api, t, run, busy, snapshot } = useApp(),
    notices = useData(
      () => api.notices(),
      [snapshot.activity.length, snapshot.servers.map((s) => s.updatedAt).join()],
    ),
    settings = useData(() => api.healthSettings(), []);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'notice') notices.reload();
      }),
    [api, notices.reload],
  );
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <h2>{t('notifications')}</h2>
          <Button
            disabled={busy}
            onClick={() => {
              void run(() => api.readNotices()).then(notices.reload);
            }}
          >
            {t('health.readAll')}
          </Button>
        </div>
        {notices.error && <ErrorBox error={notices.error} />}{' '}
        {!notices.data?.length && <p>{t('noResults')}</p>}
        {notices.data?.map((n) => (
          <div className="installed-row" key={n.id}>
            <div>
              <strong>
                {t(('notice.' + n.code) as Key)}
                {n.count > 1 ? ` ×${n.count}` : ''}
              </strong>
              <small>
                {snapshot.servers.find((s) => s.id === n.serverId)?.name} ·{' '}
                {new Date(n.at).toLocaleString()}
              </small>
            </div>
            <Button
              disabled={busy || n.read}
              onClick={() => {
                void run(() => api.readNotices(n.id)).then(notices.reload);
              }}
            >
              {t(n.read ? 'health.read' : 'health.markRead')}
            </Button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{t('health.preferences')}</h2>
        {settings.data && (
          <>
            <Toggle
              label={t('health.native')}
              checked={settings.data.nativeNotifications}
              onChange={(value) => {
                void run(() =>
                  api.configureHealth({ ...settings.data!, nativeNotifications: value }),
                ).then(settings.reload);
              }}
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
                label={t(('notice.' + key) as Key)}
                checked={settings.data![key]}
                onChange={(value) => {
                  void run(() => api.configureHealth({ ...settings.data!, [key]: value })).then(
                    settings.reload,
                  );
                }}
              />
            ))}
            <details>
              <summary>{t('advanced')}</summary>
              {(['cpuPercent', 'memoryPercent', 'diskFreeGiB', 'backupAgeHours'] as const).map(
                (key) => (
                  <Field key={key} label={t(('health.' + key) as Key)}>
                    <input
                      type="number"
                      defaultValue={settings.data![key]}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== settings.data![key])
                          void run(() =>
                            api.configureHealth({ ...settings.data!, [key]: value }),
                          ).then(settings.reload);
                      }}
                    />
                  </Field>
                ),
              )}
            </details>
          </>
        )}
      </section>
    </>
  );
}
