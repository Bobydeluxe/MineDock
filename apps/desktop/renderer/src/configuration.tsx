import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { ConfigDocument, ConfigField } from '../../../../packages/domain/configuration';
import { useApp } from './context';
import { Button, Field, Toggle, useData, ErrorBox, Loading } from './ui';
import { Confirm } from './management';
import type { Key } from './i18n';
function Setting({
  server,
  document,
  field,
  reload,
}: {
  server: Server;
  document: ConfigDocument;
  field: ConfigField;
  reload: () => void;
}) {
  const { api, t, run, busy } = useApp(),
    [value, setValue] = useState(field.value);
  const label = field.key.join(' › '),
    stopped = !server.pid && server.status !== 'installing';
  return (
    <div className="info-row">
      <div style={{ flex: 1 }}>
        {typeof field.value === 'boolean' ? (
          <Toggle label={label} checked={Boolean(value)} disabled={!stopped} onChange={setValue} />
        ) : (
          <Field label={label}>
            <input
              disabled={!stopped}
              type={typeof field.value === 'number' ? 'number' : 'text'}
              min={field.min}
              max={field.max}
              value={String(value)}
              onChange={(e) =>
                setValue(typeof field.value === 'number' ? Number(e.target.value) : e.target.value)
              }
            />
          </Field>
        )}
      </div>
      <Button
        disabled={busy || !stopped || value === field.value}
        onClick={() =>
          void run(() =>
            api.editConfig(server.id, {
              file: document.file,
              key: field.key,
              value,
              sha256: document.sha256,
            }),
          ).then((r) => {
            if (r.ok) reload();
          })
        }
      >
        {t('save')}
      </Button>
    </div>
  );
}
export function ConfigurationControls({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp(),
    data = useData(() => api.configDocuments(server.id), [server.id]),
    history = useData(() => api.configHistory(server.id), [server.id]),
    audit = useData(() => api.configAudit(server.id), [server.id]),
    [search, setSearch] = useState(''),
    [all, setAll] = useState(false),
    [restore, setRestore] = useState<string>();
  const reload = () => {
    data.reload();
    history.reload();
    audit.reload();
  };
  return (
    <details className="panel">
      <summary>{t('config.title')}</summary>
      <p className="muted">{t('config.help')}</p>
      {['paper', 'purpur'].includes(server.engine) && (
        <>
          <p className="hint">{t('config.curatedHelp')}</p>
          <Toggle label={t('config.showAll')} checked={all} onChange={setAll} />
        </>
      )}
      <Field label={t('search')}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </Field>
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} retryLabel={t('retry')} />
      ) : data.loading ? (
        <Loading label={t('loading')} />
      ) : data.data?.length ? (
        data.data.map((doc) => (
          <details key={doc.file}>
            <summary>
              <code>{doc.file}</code>
            </summary>
            {(['gameplay', 'resources', 'world', 'network', 'advanced'] as const).map(
              (category) => (
                <details key={category} open={search ? true : undefined}>
                  <summary>{t(category as Key)}</summary>
                  {doc.fields
                    .filter(
                      (f) =>
                        f.category === category &&
                        (all ||
                          !!search ||
                          !['paper', 'purpur'].includes(server.engine) ||
                          f.curated) &&
                        f.key.join('.').toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((field) => (
                      <Setting
                        key={doc.sha256 + field.key.join('.')}
                        server={server}
                        document={doc}
                        field={field}
                        reload={reload}
                      />
                    ))}
                </details>
              ),
            )}
          </details>
        ))
      ) : (
        <p className="muted">{t('config.noFiles')}</p>
      )}
      <details>
        <summary>{t('config.history')}</summary>
        <p className="muted">{t('config.historyHelp')}</p>
        {history.error ? (
          <ErrorBox error={history.error} />
        ) : (
          history.data?.map((version) => (
            <div className="info-row" key={version.id}>
              <code>{version.file}</code>
              <span>{new Date(version.at).toLocaleString()}</span>
              <Button
                disabled={busy || !!server.pid || server.status === 'installing'}
                onClick={() => setRestore(version.id)}
              >
                {t('restore')}
              </Button>
            </div>
          ))
        )}
      </details>
      <details>
        <summary>{t('config.audit')}</summary>
        <p className="muted">{t('config.auditHelp')}</p>
        {audit.error ? (
          <ErrorBox error={audit.error} />
        ) : (
          <>
            <p>
              {t('port')}: {audit.data?.port}
            </p>
            {audit.data?.findings.map((code) => (
              <p key={code}>{t(('config.audit.' + code) as Key)}</p>
            ))}
          </>
        )}
      </details>
      {restore && (
        <Confirm
          name={server.name}
          help={t('config.restoreHelp')}
          onClose={() => setRestore(undefined)}
          onConfirm={() =>
            void run(() => api.restoreConfig(server.id, restore, server.name)).then((r) => {
              if (r.ok) {
                setRestore(undefined);
                reload();
              }
            })
          }
        />
      )}
    </details>
  );
}
