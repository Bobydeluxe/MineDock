import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { PackKind, PackPlan, PackFile, PackAction } from '../../../../packages/domain/packs';
import { useApp } from './context';
import { Button, Field, useData, Loading, ErrorBox, Dialog, bytes } from './ui';
import { ContentIcon } from './content';
export function PacksView({ server, kind }: { server: Server; kind: PackKind }) {
  const { api, t, run, busy } = useApp();
  const [view, setView] = useState<'discover' | 'installed' | 'updates'>('discover'),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [world, setWorld] = useState(''),
    [plan, setPlan] = useState<PackPlan>(),
    [selection, setSelection] = useState<{ item: PackFile; action: PackAction['action'] }>(),
    [confirmation, setConfirmation] = useState(''),
    [url, setUrl] = useState('');
  const [updates, setUpdates] = useState<
    Record<string, { version?: string; id?: string; compatible?: boolean }>
  >({});
  const [checking, setChecking] = useState(false);
  const worlds = useData(() => api.worlds(server.id), [server.id]);
  const inventory = useData(
    () => api.packInventory(server.id, kind, world || undefined),
    [server.id, kind, world],
  );
  const projects = useData(
    () => api.packSearch(server.id, kind, search),
    [server.id, kind, search],
  );
  const [versionProject, setVersionProject] = useState<string>();
  const versions = useData(
    () =>
      versionProject ? api.packVersions(server.id, kind, versionProject) : Promise.resolve([]),
    [server.id, kind, versionProject],
  );
  const locked = busy || !!server.pid || !['stopped', 'crashed'].includes(server.status);
  const reload = () => {
    inventory.reload();
    setPlan(undefined);
    setSelection(undefined);
    setUpdates({});
  };
  const checkUpdates = async () => {
    setChecking(true);
    const result: typeof updates = {};
    const pending = [...(inventory.data?.installed ?? [])];
    try {
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (;;) {
            const pack = pending.shift();
            if (!pack) break;
            if (!pack.projectId) {
              result[pack.id] = {};
              continue;
            }
            try {
              const versions = await api.packVersions(server.id, kind, pack.projectId);
              const installed = versions.find((v) => v.id === pack.versionId);
              const latest = versions.find(
                (v) => v.releaseType !== 'alpha' && v.releaseType !== 'beta',
              );
              const newer =
                latest &&
                latest.id !== pack.versionId &&
                (!installed || Date.parse(latest.publishedAt) > Date.parse(installed.publishedAt));
              result[pack.id] = {
                compatible: !!installed,
                version: newer ? latest.name : undefined,
                id: newer ? latest.id : undefined,
              };
            } catch {
              result[pack.id] = {};
            }
          }
        }),
      );
      setUpdates(result);
    } finally {
      setChecking(false);
    }
  };
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{t(kind === 'datapack' ? 'datapacks' : 'resourcepacks')}</h2>
          <p>{t(kind === 'datapack' ? 'pack.worldHelp' : 'pack.urlHelp')}</p>
        </div>
        <Button
          disabled={locked}
          onClick={() => {
            void run(() => api.packImport(server.id, kind, world || undefined)).then(reload);
          }}
        >
          {t('upload')}
        </Button>
      </div>
      {kind === 'datapack' && (
        <Field label={t('world')}>
          <select value={world} onChange={(e) => setWorld(e.target.value)}>
            <option value="">{t('pack.activeWorld')}</option>
            {worlds.data?.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <nav className="tabs">
        <Button onClick={() => setView('discover')}>{t('modView.discover')}</Button>
        <Button onClick={() => setView('installed')}>{t('installed')}</Button>
        <Button onClick={() => setView('updates')}>{t('modView.updates')}</Button>
      </nav>
      {inventory.error && (
        <ErrorBox error={inventory.error} retry={inventory.reload} retryLabel={t('retry')} />
      )}
      {view === 'discover' && (
        <>
          <form
            className="marketplace-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (search === query) projects.reload();
              else setSearch(query);
            }}
          >
            <input
              aria-label={t('searchContent')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchContent')}
            />
            <Button type="submit">{t('search')}</Button>
          </form>
          {projects.loading ? (
            <Loading label={t('loading')} />
          ) : projects.error ? (
            <ErrorBox error={projects.error} retry={projects.reload} retryLabel={t('retry')} />
          ) : projects.data?.length ? (
            projects.data.map((p) => (
              <div className="installed-row" key={p.id}>
                <ContentIcon project={p} />
                <div>
                  <strong>{p.title}</strong>
                  <small>
                    {p.author} · {p.downloads.toLocaleString()} {t('downloads')}
                  </small>
                  <p>{p.description}</p>
                </div>
                <Button
                  disabled={locked}
                  onClick={() => {
                    setVersionProject(p.id);
                  }}
                >
                  {t('chooseVersion')}
                </Button>
              </div>
            ))
          ) : (
            <p>{t('noResults')}</p>
          )}
        </>
      )}
      {(view === 'installed' || view === 'updates') && (
        <>
          {view === 'updates' && (
            <>
              <p className="hint">{t('pack.updateHelp')}</p>
              <Button disabled={checking || inventory.loading} onClick={() => void checkUpdates()}>
                {t(checking ? 'loading' : 'checkUpdates')}
              </Button>
            </>
          )}
          {inventory.data?.problems.map((p) => (
            <ErrorBox key={p} error={p} />
          ))}
          {!inventory.data?.installed.length && <p className="muted">{t('noContent')}</p>}
          {inventory.data?.installed.map((item) => (
            <div className="installed-row" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.version ?? t('manual')} · {bytes(item.size)} · {item.filename}
                </small>
                <small>
                  {item.projectId ? 'Modrinth' : t('manual')} {item.world ? '· ' + item.world : ''}
                </small>
                {updates[item.id] && (
                  <small>
                    {updates[item.id]?.version
                      ? t('updateAvailable') + ': ' + updates[item.id]?.version
                      : updates[item.id]?.compatible === undefined
                        ? t('unknown')
                        : updates[item.id]?.compatible
                          ? t('compatible')
                          : t('incompatible')}
                  </small>
                )}
                <details>
                  <summary>{t('modDetails')}</summary>
                  <code>SHA-1: {item.sha1}</code>
                  <br />
                  <code>SHA-256: {item.sha256}</code>
                </details>
                <span className={`badge ${item.enabled ? 'enabled' : 'disabled'}`}>
                  {t(
                    inventory.data?.active === item.id
                      ? 'pack.selected'
                      : item.enabled
                        ? 'enabled'
                        : 'disabled',
                  )}
                </span>
              </div>
              <Button
                disabled={locked || !item.projectId}
                onClick={() => {
                  setVersionProject(item.projectId);
                }}
              >
                {t('chooseVersion')}
              </Button>
              {(kind === 'datapack'
                ? (['toggle', 'remove'] as const)
                : (['select', 'remove'] as const)
              ).map((action) => (
                <Button
                  key={action}
                  disabled={locked}
                  onClick={() => {
                    setConfirmation('');
                    setUrl(item.url ?? '');
                    setSelection({ item, action });
                  }}
                >
                  {t(
                    action === 'select'
                      ? 'pack.select'
                      : action === 'remove'
                        ? 'uninstall'
                        : 'toggle',
                  )}
                </Button>
              ))}
            </div>
          ))}
          <details>
            <summary>{t('manualContent')}</summary>
            <p>{t('pack.manualHelp')}</p>
            {inventory.data?.manual.map((item) => (
              <p key={item.filename}>
                {item.filename} · {bytes(item.size)}
              </p>
            ))}
          </details>
        </>
      )}
      {versionProject && (
        <Dialog
          title={t('chooseVersion')}
          closeLabel={t('close')}
          onClose={() => setVersionProject(undefined)}
        >
          <div className="dialog-body">
            {versions.loading && <Loading label={t('loading')} />}{' '}
            {versions.error && <ErrorBox error={versions.error} />}{' '}
            {versions.data?.map((v) => (
              <div className="installed-row" key={v.id}>
                <div>
                  <strong>{v.name}</strong>
                  <small>
                    {v.releaseType} · {new Date(v.publishedAt).toLocaleDateString()}
                  </small>
                </div>
                <Button
                  disabled={locked}
                  onClick={() => {
                    void run(() =>
                      api.packPlan(server.id, {
                        kind,
                        world: world || undefined,
                        projectId: versionProject,
                        versionId: v.id,
                      }),
                    ).then((r) => {
                      if (r.ok) {
                        setPlan(r.value);
                        setVersionProject(undefined);
                      }
                    });
                  }}
                >
                  {t('pack.review')}
                </Button>
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {plan && (
        <Dialog title={t('pack.review')} closeLabel={t('close')} onClose={() => setPlan(undefined)}>
          <div className="dialog-body">
            <p>{t('pack.backupHelp')}</p>
            {plan.entries.map((e) => (
              <p key={e.project.id}>
                {e.project.title} · {e.version.name} ·{' '}
                {t(
                  e.action === 'keep'
                    ? 'installed'
                    : e.action === 'update'
                      ? 'updateAvailable'
                      : 'install',
                )}
              </p>
            ))}
            {!!plan.optional.length && (
              <p>
                {t('pack.optional')}: {plan.optional.join(', ')}
              </p>
            )}
            <Button
              variant="primary"
              disabled={locked}
              onClick={() => {
                void run(() => api.packApply(server.id, plan.token)).then(reload);
              }}
            >
              {t('install')}
            </Button>
          </div>
        </Dialog>
      )}
      {selection && (
        <Dialog
          title={selection.item.title}
          closeLabel={t('close')}
          onClose={() => setSelection(undefined)}
        >
          <div className="dialog-body">
            <p>{t('pack.backupHelp')}</p>
            {selection.action === 'select' && (
              <Field label={t('pack.url')}>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                />
              </Field>
            )}
            <Field label={t('confirmHelp')}>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={server.name}
              />
            </Field>
            <Button
              disabled={locked || confirmation !== server.name}
              onClick={() => {
                void run(() =>
                  api.packAction(server.id, {
                    id: selection.item.id,
                    action: selection.action,
                    confirmation,
                    url: selection.action === 'select' ? url : undefined,
                  }),
                ).then(reload);
              }}
            >
              {t('save')}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
