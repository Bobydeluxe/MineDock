import { useState } from 'react';
import { Globe2, Check } from 'lucide-react';
import type { Server } from '../../../../packages/domain/types';
import { useApp } from './context';
import { Button, Field, Toggle, ErrorBox, Loading, useData } from './ui';
import { Confirm } from './management';
export function CrossplayView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const status = useData(() => api.crossplayStatus(server.id), [server.id]);
  const [editing, setEditing] = useState(false),
    [port, setPort] = useState(19132),
    [floodgate, setFloodgate] = useState(false),
    [geyserVersion, setGeyserVersion] = useState(''),
    [floodgateVersion, setFloodgateVersion] = useState(''),
    [confirm, setConfirm] = useState(false);
  const versions = useData(
    () => (editing ? api.crossplayVersions(server.id) : Promise.resolve(null)),
    [server.id, editing],
  );
  const locked = busy || !!server.pid || server.status === 'installing';
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Geyser / Floodgate</h2>
          <p>{t('crossplayHelp')}</p>
        </div>
        <Globe2 size={22} />
      </div>
      {status.error ? (
        <ErrorBox error={status.error} retry={status.reload} retryLabel={t('retry')} />
      ) : status.loading ? (
        <Loading label={t('loading')} />
      ) : (
        <>
          <div className="details-list">
            <div>
              <span>Geyser</span>
              <strong>{t(status.data?.geyserInstalled ? 'installed' : 'notInstalled')}</strong>
            </div>
            <div>
              <span>Floodgate</span>
              <strong>{t(status.data?.floodgateInstalled ? 'installed' : 'notInstalled')}</strong>
            </div>
            <div>
              <span>{t('configuration')}</span>
              <strong>{t(status.data?.configured ? 'configured' : 'notConfigured')}</strong>
            </div>
            {status.data?.port && (
              <div>
                <span>{t('bedrockPort')}</span>
                <strong>
                  {status.data.port} UDP · {status.data.authType}
                </strong>
              </div>
            )}
          </div>
          {status.data?.error && <ErrorBox error={status.data.error} />}
          <p className="muted small-text">{t('crossplayVerificationHelp')}</p>
        </>
      )}
      {!editing ? (
        <Button
          disabled={locked}
          onClick={() => {
            setPort(status.data?.port ?? 19132);
            setFloodgate(status.data?.authType === 'floodgate');
            setEditing(true);
          }}
        >
          {t('configureCrossplay')}
        </Button>
      ) : (
        <>
          {versions.error ? (
            <ErrorBox error={versions.error} retry={versions.reload} retryLabel={t('retry')} />
          ) : versions.loading ? (
            <Loading label={t('loading')} />
          ) : !versions.data?.geyser.length ? (
            <p className="muted">{t('noSupportedGeyser')}</p>
          ) : (
            <>
              <div className="form-grid">
                <Field label={t('bedrockPort')}>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={port}
                    onChange={(event) => setPort(Number(event.target.value))}
                  />
                </Field>
                <Field label="Geyser">
                  <select
                    value={geyserVersion}
                    onChange={(event) => setGeyserVersion(event.target.value)}
                  >
                    <option value="">{t('chooseVersion')}</option>
                    {versions.data.geyser.map((version) => (
                      <option value={version.id} key={version.id}>
                        {version.name} · {version.releaseType}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Toggle label={t('useFloodgate')} checked={floodgate} onChange={setFloodgate} />
              <p className="muted small-text">{t('floodgateHelp')}</p>
              {floodgate && (
                <Field label="Floodgate">
                  <select
                    value={floodgateVersion}
                    onChange={(event) => setFloodgateVersion(event.target.value)}
                  >
                    <option value="">{t('chooseVersion')}</option>
                    {versions.data.floodgate.map((version) => (
                      <option value={version.id} key={version.id}>
                        {version.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <p className="muted small-text">{t('crossplayDependenciesHelp')}</p>
              <Button
                variant="primary"
                disabled={
                  locked ||
                  !geyserVersion ||
                  (floodgate && !floodgateVersion) ||
                  port < 1024 ||
                  port > 65535
                }
                onClick={() => setConfirm(true)}
              >
                <Check size={15} />
                {t('configureCrossplay')}
              </Button>
            </>
          )}
          <Button disabled={busy} onClick={() => setEditing(false)}>
            {t('cancel')}
          </Button>
        </>
      )}
      {confirm && (
        <Confirm
          name={server.name}
          help={t('crossplayConfirmHelp')}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            void run(() =>
              api.configureCrossplay(server.id, {
                port,
                floodgate,
                geyserVersion,
                floodgateVersion: floodgate ? floodgateVersion : undefined,
                confirmation: server.name,
              }),
            ).then((result) => {
              if (result.ok) {
                setConfirm(false);
                setEditing(false);
                status.reload();
              }
            });
          }}
        />
      )}
    </section>
  );
}
