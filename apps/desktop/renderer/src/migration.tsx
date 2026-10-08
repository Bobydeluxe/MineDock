import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type {
  MigrationTarget,
  MigrationReview,
  CloneInput,
} from '../../../../packages/domain/migration';
import { useApp } from './context';
import { Button, Dialog, Field, ErrorBox, useData } from './ui';
export function MigrationControls({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const [open, setOpen] = useState(false),
    [clone, setClone] = useState(false),
    [engine, setEngine] = useState<MigrationTarget['engine']>(
      server.engine as MigrationTarget['engine'],
    ),
    [version, setVersion] = useState(server.version),
    [review, setReview] = useState<MigrationReview>(),
    [confirmation, setConfirmation] = useState(''),
    [name, setName] = useState(server.name + ' copy'),
    [port, setPort] = useState(Math.min(server.port + 1, 65535)),
    [mode, setMode] = useState<CloneInput['mode']>('complete'),
    [latest, setLatest] = useState<string>();
  const versions = useData(
    () => (open ? api.versions(engine) : Promise.resolve([])),
    [open, engine],
  );
  const stopped = !server.pid && ['stopped', 'crashed'].includes(server.status),
    isJava = ['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge'].includes(server.engine);
  return (
    <section className="panel">
      <h2>{t('migration.title')}</h2>
      <p>{t('migration.help')}</p>
      {isJava && (
        <>
          <Button
            disabled={busy}
            onClick={() => {
              setOpen(true);
              setConfirmation('');
              setReview(undefined);
            }}
          >
            {t('migration.analyze')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void run(() => api.latestMinecraft(server.id)).then((r) => {
                if (r.ok && r.value) setLatest(r.value);
              });
            }}
          >
            {t('migration.latest')}
          </Button>
          {latest && <p>Minecraft {latest}</p>}
        </>
      )}
      <Button
        disabled={busy || !stopped}
        onClick={() => {
          setClone(true);
          setConfirmation('');
        }}
      >
        {t('migration.clone')}
      </Button>
      {open && (
        <Dialog
          title={t('migration.analyze')}
          closeLabel={t('close')}
          onClose={() => setOpen(false)}
        >
          <p>{t('migration.worldHelp')}</p>
          <Field label={t('engine')}>
            <select
              value={engine}
              onChange={(e) => {
                setEngine(e.target.value as MigrationTarget['engine']);
                setReview(undefined);
              }}
            >
              {(server.engine === 'paper' || server.engine === 'purpur'
                ? ['paper', 'purpur']
                : [server.engine]
              ).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('version')}>
            <select
              value={version}
              onChange={(e) => {
                setVersion(e.target.value);
                setReview(undefined);
              }}
            >
              {[...new Set([server.version, ...(versions.data ?? [])])].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {versions.error && <ErrorBox error={versions.error} />}
          <Button
            disabled={busy || !stopped}
            onClick={() => {
              void run(() => api.migrationReview(server.id, { engine, version })).then((r) => {
                if (r.ok) setReview(r.value);
              });
            }}
          >
            {t('migration.analyze')}
          </Button>
          {review && (
            <>
              <p>
                Java {review.javaMajor} ·{' '}
                {t(review.blocked ? 'migration.blocked' : 'migration.ready')}
              </p>
              {review.items.map((item, index) => (
                <div className="installed-row" key={index}>
                  <strong>{item.title}</strong>
                  <span
                    className={`badge ${item.status === 'incompatible' ? 'danger' : item.status === 'unknown' ? 'warning' : 'enabled'}`}
                  >
                    {t(
                      item.status === 'update'
                        ? 'updateAvailable'
                        : item.status === 'compatible'
                          ? 'compatible'
                          : item.status,
                    )}
                  </span>
                  <small>{item.version}</small>
                </div>
              ))}
              <Field label={t('confirmHelp')}>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={server.name}
                />
              </Field>
              <Button
                variant="danger"
                disabled={busy || review.blocked || confirmation !== server.name}
                onClick={() => {
                  void run(() => api.applyMigration(server.id, review.token, confirmation)).then(
                    (r) => {
                      if (r.ok) setOpen(false);
                    },
                  );
                }}
              >
                {t('migration.apply')}
              </Button>
            </>
          )}
        </Dialog>
      )}
      {clone && (
        <Dialog
          title={t('migration.clone')}
          closeLabel={t('close')}
          onClose={() => setClone(false)}
        >
          <Field label={t('name')}>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('port')}>
            <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </Field>
          <Field label={t('migration.cloneMode')}>
            <select value={mode} onChange={(e) => setMode(e.target.value as CloneInput['mode'])}>
              <option value="complete">{t('migration.complete')}</option>
              <option value="newWorld">{t('migration.newWorld')}</option>
            </select>
          </Field>
          <p>{t('migration.cloneHelp')}</p>
          <Field label={t('confirmHelp')}>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={server.name}
            />
          </Field>
          <Button
            disabled={busy || !name.trim() || confirmation !== server.name}
            onClick={() => {
              void run(() => api.cloneServer(server.id, { name, port, mode, confirmation })).then(
                (r) => {
                  if (r.ok) setClone(false);
                },
              );
            }}
          >
            {t('migration.clone')}
          </Button>
        </Dialog>
      )}
    </section>
  );
}
