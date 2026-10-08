import { useEffect, useState } from 'react';
import {
  Puzzle,
  Search,
  Star,
  Lock,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type { Server, InstalledContent } from '../../../../packages/domain/types';
import type {
  ModPlan,
  ModSelection,
  ModSearch,
  ModUpdateResult,
  ModRemoval,
  ModMigration,
  ModTarget,
} from '../../../../packages/domain/mods';
import type { Key } from './i18n';
import { useApp } from './context';
import { Button, Field, Dialog, Empty, ErrorBox, Loading, useData, bytes } from './ui';
import { EngineIcon } from './engine-icon';
import { Confirm } from './management';
import { CrossplayView } from './crossplay';
import { engineDefinition } from '../../../../packages/domain/engines';

function ModIcon({ url, title }: { url?: string; title: string }) {
  const { api } = useApp();
  const icon = useData(() => (url ? api.contentIcon(url) : Promise.resolve(null)), [url]);
  return (
    <span className="mod-icon">
      {icon.data ? <img src={icon.data} alt={title} loading="lazy" /> : <Puzzle size={25} />}
    </span>
  );
}
export function ModsView({ server }: { server: Server }) {
  const { api, t: appT, run, busy, snapshot } = useApp();
  const t = (key: Key) =>
    appT(key === 'mods' && !engineDefinition(server.engine).capabilities.mods ? 'plugins' : key);
  const [view, setView] = useState<'discover' | 'installed' | 'updates'>('discover'),
    [query, setQuery] = useState(''),
    [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<ModSearch>({
      sort: 'relevance',
      category: '',
      compatibleOnly: true,
      side: 'server',
    }),
    [offset, setOffset] = useState(0),
    [favorites, setFavorites] = useState(false),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<string>(),
    [plan, setPlan] = useState<ModPlan>(),
    [updates, setUpdates] = useState<ModUpdateResult>();
  const [unavailable, setUnavailable] = useState(false);
  const [identified, setIdentified] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useState<{
      action: 'enable' | 'disable' | 'uninstall';
      review: ModRemoval;
    }>(),
    [collection, setCollection] = useState(false),
    [migration, setMigration] = useState(false),
    [collectionName, setCollectionName] = useState('');
  const inventory = useData(
      () => api.modInventory(server.id),
      [server.id, server.version, server.engine],
    ),
    library = useData(() => api.modLibrary(), [server.id]);
  const search = useData(
    () =>
      view === 'discover' && !favorites
        ? api.modSearch(server.id, { ...filters, query: debounced, offset })
        : Promise.resolve({ items: [], total: 0, offset, offline: false }),
    [server.id, view, debounced, JSON.stringify(filters), offset, favorites],
  );
  const history = useData(() => api.modHistory(server.id), [server.id]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
      setOffset(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);
  const locked = busy || !!server.pid || server.status === 'installing';
  const reload = () => {
    inventory.reload();
    library.reload();
    history.reload();
    setSelected([]);
  };
  const changeFilter = (value: Partial<ModSearch>) => {
    setFilters((previous) => ({ ...previous, ...value }));
    setOffset(0);
  };
  const items = inventory.data?.installed ?? [],
    available = updates?.updates.filter((update) => update.status === 'updateAvailable') ?? [];
  const critical =
    inventory.data?.problems.filter((problem) => problem.severity === 'critical').length ?? 0;
  const createPlan = async (
    selections: ModSelection[],
    isCollection = false,
    allowPrerelease = false,
    bulkUpdate = false,
  ) => {
    const result = await run(() =>
      api.modPlan(server.id, { selections, collection: isCollection, allowPrerelease, bulkUpdate }),
    );
    if (result.ok) setPlan(result.value);
  };
  const reviewBulk = async (action: 'enable' | 'disable' | 'uninstall', ids = selected) => {
    const result = await run(() => api.modRemoval(server.id, ids));
    if (result.ok) setBulk({ action, review: result.value });
  };
  useEffect(() => {
    if (view === 'discover' && !favorites && (search.data || search.error))
      setUnavailable(!!search.data?.offline || !!search.error);
  }, [view, favorites, search.data, search.error]);
  useEffect(() => {
    if (updates) setUnavailable(updates.offline);
  }, [updates]);
  const offline = unavailable || search.data?.offline || !!search.error || updates?.offline;
  const discovery = favorites
    ? (library.data?.favorites ?? []).filter((item) =>
        (item.title + ' ' + item.description).toLowerCase().includes(debounced.toLowerCase()),
      )
    : (search.data?.items ?? []);
  return (
    <div className="mods-manager">
      <section className="panel mod-heading">
        <div className="section-heading">
          <div>
            <h2>{t('mods')}</h2>
            <p>
              Modrinth · <EngineIcon engine={server.engine} size={16} /> {server.engine}{' '}
              {server.version} {server.loaderVersion && `· ${server.loaderVersion}`} · Java{' '}
              {server.javaMajor}
            </p>
          </div>
          <span className={`badge ${critical ? 'danger' : ''}`}>
            {critical ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}{' '}
            {t(critical ? 'modCritical' : 'modHealthy')}
            {critical ? ` · ${critical}` : ''}
          </span>
        </div>
        {!!inventory.data?.problems.length && (
          <details className="mod-problems">
            <summary>
              {inventory.data.problems.length} {t('modProblems')}
            </summary>
            {inventory.data.problems.map((problem, index) => (
              <p key={index} className={problem.severity === 'critical' ? 'error-text' : 'muted'}>
                <strong>{problem.title}</strong> · {t(('modProblem.' + problem.code) as Key)}
                {problem.detail && ` · ${problem.detail}`}
              </p>
            ))}
          </details>
        )}
        {offline && (
          <p className="warning-text" role="status">
            {t('modOffline')}
          </p>
        )}
        <div role="tablist" aria-label={t('mods')} className="tabs">
          {(['discover', 'installed', 'updates'] as const).map((tab) => (
            <Button
              key={tab}
              role="tab"
              aria-selected={view === tab}
              variant="ghost"
              className={view === tab ? 'selected' : ''}
              onClick={() => setView(tab)}
            >
              {t(('modView.' + tab) as Key)}
              {tab === 'updates' && available.length > 0 ? ` (${available.length})` : ''}
            </Button>
          ))}
        </div>
      </section>
      {inventory.error && (
        <ErrorBox error={inventory.error} retry={inventory.reload} retryLabel={t('retry')} />
      )}
      {view === 'discover' && (
        <>
          <section className="panel">
            <div className="mod-search-bar">
              <Field label={t('searchContent')}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('modSearchPlaceholder')}
                />
              </Field>
              {!favorites && (
                <Field label={t('modSort')}>
                  <select
                    value={filters.sort}
                    onChange={(event) =>
                      changeFilter({ sort: event.target.value as ModSearch['sort'] })
                    }
                  >
                    {['relevance', 'downloads', 'follows', 'updated', 'newest'].map((value) => (
                      <option value={value} key={value}>
                        {t(('modSort.' + value) as Key)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Button aria-pressed={favorites} onClick={() => setFavorites(!favorites)}>
                <Star size={16} />
                {t('modFavorites')}
              </Button>
            </div>
            {!favorites && (
              <>
                <div className="mod-categories">
                  <span>{t('modRecommended')}</span>
                  {['optimization', 'management', 'adventure', 'worldgen', 'utility'].map(
                    (category) => (
                      <Button
                        key={category}
                        variant={filters.category === category ? 'primary' : 'ghost'}
                        onClick={() =>
                          changeFilter({ category: filters.category === category ? '' : category })
                        }
                      >
                        {t(('modCategory.' + category) as Key)}
                      </Button>
                    ),
                  )}
                </div>
                <details>
                  <summary>{t('advanced')}</summary>
                  <div className="form-grid">
                    <Field label={t('modCategory')}>
                      <select
                        value={filters.category}
                        onChange={(event) => changeFilter({ category: event.target.value })}
                      >
                        <option value="">{t('all')}</option>
                        {[
                          'optimization',
                          'management',
                          'adventure',
                          'worldgen',
                          'utility',
                          'technology',
                          'magic',
                          'storage',
                          'decoration',
                          'library',
                        ].map((category) => (
                          <option key={category} value={category}>
                            {t(('modCategory.' + category) as Key)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t('modSide')}>
                      <select
                        value={filters.side}
                        onChange={(event) =>
                          changeFilter({ side: event.target.value as ModSearch['side'] })
                        }
                      >
                        {['server', 'client', 'any'].map((side) => (
                          <option value={side} key={side}>
                            {t(('modSide.' + side) as Key)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!filters.compatibleOnly}
                        onChange={(event) =>
                          changeFilter({ compatibleOnly: !event.target.checked })
                        }
                      />
                      {t('modShowIncompatible')}
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!filters.recent}
                        onChange={(event) => changeFilter({ recent: event.target.checked })}
                      />
                      {t('modRecent')}
                    </label>
                    {!filters.compatibleOnly && (
                      <>
                        <Field label={t('version')}>
                          <input
                            value={filters.gameVersion ?? ''}
                            placeholder={server.version}
                            onChange={(event) =>
                              changeFilter({ gameVersion: event.target.value || undefined })
                            }
                          />
                        </Field>
                        <Field label={t('loader')}>
                          <select
                            value={filters.loader ?? ''}
                            onChange={(event) =>
                              changeFilter({
                                loader: event.target.value
                                  ? (event.target.value as ModSearch['loader'])
                                  : undefined,
                              })
                            }
                          >
                            <option value="">{t('all')}</option>
                            {['fabric', 'forge', 'neoforge'].map((loader) => (
                              <option key={loader} value={loader}>
                                {loader}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </>
                    )}
                  </div>
                </details>
              </>
            )}
          </section>
          {search.loading && !favorites ? (
            <Loading label={t('loading')} />
          ) : !discovery.length ? (
            <Empty icon={<Search />} title={t('noResults')} />
          ) : (
            <div className="mod-grid">
              {discovery.map((project) => {
                const installed = items.find((item) => item.projectId === project.id),
                  update = available.find((value) => value.contentId === installed?.id),
                  compatible = 'compatible' in project ? project.compatible : undefined;
                return (
                  <article className="mod-card panel" key={project.id}>
                    <div className="mod-card-heading">
                      <ModIcon url={project.iconUrl} title={project.title} />
                      <button className="mod-title" onClick={() => setDetail(project.id)}>
                        <strong>{project.title}</strong>
                        <small>{project.author}</small>
                      </button>
                      <Button
                        variant="ghost"
                        aria-label={t('modFavorite')}
                        aria-pressed={
                          !!library.data?.favorites.some((value) => value.id === project.id)
                        }
                        onClick={() => {
                          void run(() =>
                            api.modFavorite(
                              server.id,
                              project.id,
                              !library.data?.favorites.some((value) => value.id === project.id),
                            ),
                          ).then((result) => {
                            if (result.ok) library.reload();
                          });
                        }}
                      >
                        <Star size={16} />
                      </Button>
                    </div>
                    <p className="mod-description">{project.description}</p>
                    <div className="mod-meta">
                      <span>
                        {project.categories.find(
                          (category) =>
                            !['fabric', 'forge', 'neoforge', 'quilt'].includes(category),
                        ) ?? project.categories[0]}
                      </span>
                      <span>
                        {new Intl.NumberFormat(snapshot.settings.language, {
                          notation: 'compact',
                          maximumFractionDigits: 1,
                        }).format(project.downloads)}{' '}
                        {t('downloads')}
                      </span>
                    </div>
                    <div className="mod-card-footer">
                      <span
                        className={`badge ${installed ? (update ? 'update' : 'enabled') : compatible === true ? 'compatible' : compatible === false ? 'incompatible' : ''}`}
                      >
                        {t(
                          installed
                            ? update
                              ? 'updateAvailable'
                              : 'installed'
                            : compatible === false
                              ? 'incompatible'
                              : compatible === true
                                ? 'compatible'
                                : 'modCheckCompatibility',
                        )}
                      </span>
                      <Button
                        variant="primary"
                        disabled={locked || !!installed || compatible === false || offline}
                        onClick={() => {
                          void createPlan([{ projectId: project.id }]);
                        }}
                      >
                        {t('install')}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!favorites && !!search.data?.total && (
            <div className="mod-pagination">
              <Button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 24))}>
                {t('previous')}
              </Button>
              <span>
                {offset + 1}–{Math.min(offset + 24, search.data.total)} / {search.data.total}
              </span>
              <Button
                disabled={offset + 24 >= search.data.total}
                onClick={() => setOffset(offset + 24)}
              >
                {t('next')}
              </Button>
            </div>
          )}
          <details className="panel">
            <summary>{t('modCollections')}</summary>
            <Button
              disabled={!items.some((item) => item.provider !== 'local')}
              onClick={() => setCollection(true)}
            >
              {t('modCreateCollection')}
            </Button>
            {library.data?.collections.map((item) => (
              <div className="mod-collection" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.projects.length} {t('mods')}
                  </small>
                </div>
                <Button
                  disabled={locked || offline}
                  onClick={() => {
                    void createPlan(item.projects, true);
                  }}
                >
                  {t('modInstallCollection')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    void run(() => api.modDeleteCollection(item.id)).then((result) => {
                      if (result.ok) library.reload();
                    });
                  }}
                >
                  {t('delete')}
                </Button>
              </div>
            ))}
          </details>
        </>
      )}
      {view === 'installed' && (
        <section className="panel">
          <div className="section-heading">
            <h3>
              {t('modView.installed')} · {items.length}
            </h3>
            <div className="row-actions">
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() => api.modInventory(server.id, true)).then((result) => {
                    if (result.ok) inventory.reload();
                  });
                }}
              >
                <RefreshCw size={15} />
                {t('modRescan')}
              </Button>
              <Button disabled={!items.length || busy} onClick={() => setCollection(true)}>
                {t('modCreateCollection')}
              </Button>
            </div>
          </div>
          {!!selected.length && (
            <div className="mod-bulk">
              <strong>
                {selected.length} {t('modSelected')}
              </strong>
              {(['enable', 'disable', 'uninstall'] as const).map((action) => (
                <Button
                  key={action}
                  disabled={locked}
                  onClick={() => {
                    void reviewBulk(action);
                  }}
                >
                  {t(action === 'uninstall' ? 'uninstall' : action)}
                </Button>
              ))}
              <Button
                disabled={
                  locked ||
                  offline ||
                  !available.some((update) => selected.includes(update.contentId))
                }
                onClick={() => {
                  void createPlan(
                    available
                      .filter((update) => selected.includes(update.contentId))
                      .map((update) => ({
                        projectId: items.find((item) => item.id === update.contentId)!.projectId,
                        versionId: update.available!.id,
                      })),
                  );
                }}
              >
                {t('updateAvailable')}
              </Button>
            </div>
          )}
          {items.slice(page * 30, page * 30 + 30).map((item) => (
            <article className="mod-installed" key={item.id} data-enabled={item.enabled}>
              <input
                type="checkbox"
                aria-label={`${t('modSelect')} ${item.title}`}
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, item.id]
                      : previous.filter((id) => id !== item.id),
                  )
                }
              />
              <ModIcon url={item.iconUrl} title={item.title} />
              <div className="mod-installed-text">
                <strong>
                  {item.title} {item.pinned && <Lock size={14} aria-label={t('modPinned')} />}
                </strong>
                <small>
                  {item.versionName ?? item.versionId} · {item.loader ?? server.engine}{' '}
                  {item.gameVersion ?? server.version} ·{' '}
                  {item.source ?? item.provider ?? 'modrinth'}
                </small>
                <span
                  className={`badge ${
                    inventory.data?.problems.some(
                      (problem) =>
                        problem.filename === item.filename && problem.severity === 'critical',
                    )
                      ? 'danger'
                      : !item.enabled
                        ? 'disabled'
                        : available.some((update) => update.contentId === item.id)
                          ? 'update'
                          : 'enabled'
                  }`}
                >
                  {t(
                    inventory.data?.problems.some(
                      (problem) =>
                        problem.filename === item.filename && problem.severity === 'critical',
                    )
                      ? 'modProblemDetected'
                      : !item.enabled
                        ? 'disabled'
                        : available.some((update) => update.contentId === item.id)
                          ? 'updateAvailable'
                          : 'enabled',
                  )}
                </span>
                {item.automatic && <small>{t('modAutomatic')}</small>}
              </div>
              <details
                className="mod-menu"
                onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest('button'))
                    event.currentTarget.open = false;
                }}
              >
                <summary aria-label={`${t('modActions')} ${item.title}`}>
                  <MoreHorizontal size={20} />
                </summary>
                <div>
                  {item.provider !== 'local' && (
                    <>
                      <Button variant="ghost" onClick={() => setDetail(item.projectId)}>
                        {t('modDetails')}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          void run(() => api.modPin(server.id, item.id, !item.pinned)).then(
                            (result) => {
                              if (result.ok) reload();
                            },
                          );
                        }}
                      >
                        {t(item.pinned ? 'modUnpin' : 'modPin')}
                      </Button>
                      <Button variant="ghost" onClick={() => setDetail(item.projectId)}>
                        {t('modChangeVersion')}
                      </Button>
                      <Button variant="ghost" onClick={() => setDetail(item.projectId)}>
                        {t('modRollback')}
                      </Button>
                      <Button variant="ghost" onClick={() => setDetail(item.projectId)}>
                        {t('dependencies')}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    disabled={locked}
                    onClick={() => {
                      void reviewBulk(item.enabled ? 'disable' : 'enable', [item.id]);
                    }}
                  >
                    {t(item.enabled ? 'disable' : 'enable')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void run(() => api.modReveal(server.id, item.id));
                    }}
                  >
                    {t('modOpenFile')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={locked}
                    onClick={() => {
                      void reviewBulk('uninstall', [item.id]);
                    }}
                  >
                    {t('uninstall')}
                  </Button>
                </div>
              </details>
            </article>
          ))}
          {items.length > 30 && (
            <div className="mod-pagination">
              <Button disabled={!page} onClick={() => setPage(page - 1)}>
                {t('previous')}
              </Button>
              <span>
                {page + 1}/{Math.ceil(items.length / 30)}
              </span>
              <Button disabled={(page + 1) * 30 >= items.length} onClick={() => setPage(page + 1)}>
                {t('next')}
              </Button>
            </div>
          )}
          {!items.length && <Empty icon={<Puzzle />} title={t('noContent')} />}
          {!!inventory.data?.manual.length && (
            <details open>
              <summary>
                {t('modManual')} · {inventory.data.manual.length}
              </summary>
              {inventory.data.manual.map((item) => (
                <div className="mod-installed" key={item.filename}>
                  <ModIcon title={item.title} />
                  <div className="mod-installed-text">
                    <strong>{item.title}</strong>
                    <small>
                      {item.version} · {item.filename} · {bytes(item.size)}
                    </small>
                    <span>
                      {t(item.enabled ? 'enabled' : 'disabled')} · {t('modUnmanaged')}
                    </span>
                    {identified[item.filename] === false && <small>{t('modNotIdentified')}</small>}
                  </div>
                  <Button
                    disabled={locked}
                    onClick={() => {
                      void run(() => api.modManualToggle(server.id, item.filename)).then(
                        (result) => {
                          if (result.ok) reload();
                        },
                      );
                    }}
                  >
                    {t(item.enabled ? 'disable' : 'enable')}
                  </Button>
                  <Button
                    disabled={locked || offline}
                    onClick={() => {
                      void run(() => api.modIdentify(server.id, item.filename)).then((result) => {
                        if (result.ok)
                          setIdentified((previous) => ({
                            ...previous,
                            [item.filename]: result.value,
                          }));
                        if (result.ok && result.value) reload();
                      });
                    }}
                  >
                    {t('modIdentify')}
                  </Button>
                </div>
              ))}
            </details>
          )}
          <details>
            <summary>{t('contentHistory')}</summary>
            {history.data?.map((event) => (
              <p key={event.id}>
                <time>{new Date(event.at).toLocaleString()}</time> · {event.title} ·{' '}
                {t(('modEvent.' + event.action) as Key)} ·{' '}
                {event.previousVersion && `${event.previousVersion} → `}
                {event.version}
              </p>
            ))}
          </details>
          <details>
            <summary>{t('advanced')}</summary>
            <Button
              disabled={locked || !engineDefinition(server.engine).capabilities.mods}
              onClick={() => setMigration(true)}
            >
              {t('modMigration')}
            </Button>
          </details>
        </section>
      )}
      {view === 'updates' && (
        <section className="panel">
          <div className="section-heading">
            <h3>{t('modView.updates')}</h3>
            <Button
              disabled={busy}
              onClick={() => {
                void run(() => api.modUpdates(server.id)).then((result) => {
                  if (result.ok) setUpdates(result.value);
                });
              }}
            >
              <RefreshCw size={15} />
              {t('checkUpdates')}
            </Button>
          </div>
          {updates && (
            <>
              <p>
                {updates.updates.filter((update) => update.status === 'upToDate').length}{' '}
                {t('upToDate')} · {available.length} {t('updateAvailable')} ·{' '}
                {updates.updates.filter((update) => update.status === 'incompatible').length}{' '}
                {t('incompatible')}
              </p>
              <Button
                variant="primary"
                disabled={
                  locked ||
                  updates.offline ||
                  !available.some(
                    (update) => !items.find((item) => item.id === update.contentId)?.pinned,
                  )
                }
                onClick={() => {
                  void createPlan(
                    available
                      .filter(
                        (update) => !items.find((item) => item.id === update.contentId)?.pinned,
                      )
                      .map((update) => ({
                        projectId: items.find((item) => item.id === update.contentId)!.projectId,
                        versionId: update.available!.id,
                      })),
                    false,
                    false,
                    true,
                  );
                }}
              >
                {t('modUpdateAll')}
              </Button>
              {updates.updates.map((update) => {
                const item = items.find((item) => item.id === update.contentId);
                return (
                  item && (
                    <div className="mod-installed" key={item.id}>
                      <ModIcon url={item.iconUrl} title={item.title} />
                      <div className="mod-installed-text">
                        <strong>
                          {item.title} {item.pinned && <Lock size={14} />}
                        </strong>
                        <small>
                          {item.versionName ?? item.versionId}
                          {update.available && update.status === 'updateAvailable'
                            ? ` → ${update.available.name}`
                            : ''}
                        </small>
                        <span>
                          {t(
                            update.status === 'manual'
                              ? 'modUnmanaged'
                              : update.status === 'unknown'
                                ? 'unknown'
                                : update.status,
                          )}
                        </span>
                      </div>
                      {update.status === 'updateAvailable' && (
                        <Button
                          disabled={locked || updates.offline}
                          onClick={() => {
                            void createPlan([
                              { projectId: item.projectId, versionId: update.available!.id },
                            ]);
                          }}
                        >
                          {t('modUpdate')}
                        </Button>
                      )}
                    </div>
                  )
                );
              })}
            </>
          )}
        </section>
      )}
      {engineDefinition(server.engine).capabilities.crossplay && (
        <details className="panel optional-panel">
          <summary>{t('configureCrossplay')} · Geyser / Floodgate</summary>
          <CrossplayView server={server} />
        </details>
      )}
      {detail && (
        <ModDetails
          server={server}
          projectId={detail}
          item={items.find((item) => item.projectId === detail)}
          onClose={() => setDetail(undefined)}
          onPlan={createPlan}
          onRemove={(item) => {
            void reviewBulk('uninstall', [item.id]);
          }}
          onChanged={reload}
        />
      )}
      {plan && (
        <Dialog title={t('modReview')} closeLabel={t('close')} onClose={() => setPlan(undefined)}>
          <div className="dialog-body">
            <p>{t('modReviewHelp')}</p>
            {plan.entries.map((entry) => (
              <div className="mod-installed" key={entry.project.id}>
                <ModIcon url={entry.project.iconUrl} title={entry.project.title} />
                <div>
                  <strong>{entry.project.title}</strong>
                  <small>
                    {entry.version.name} · {t(('modPlan.' + entry.action) as Key)}
                    {entry.automatic ? ` · ${t('modAutomatic')}` : ''}
                  </small>
                </div>
              </div>
            ))}
            {!!plan.dependencies.length && (
              <details open>
                <summary>{t('dependencies')}</summary>
                {plan.dependencies.map((dependency, index) => (
                  <p key={index}>
                    {dependency.title} · {t(('modDependency.' + dependency.type) as Key)}
                    {dependency.installed ? ` · ${t('installed')}` : ''}
                  </p>
                ))}
              </details>
            )}
            {!!plan.warnings.length && (
              <p className="warning-text">
                {t('modCollectionFallback')} · {plan.warnings.join(', ')}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <Button disabled={busy} onClick={() => setPlan(undefined)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={locked}
              onClick={() => {
                void run(() => api.modApply(server.id, plan.token)).then((result) => {
                  if (result.ok) {
                    setPlan(undefined);
                    setDetail(undefined);
                    reload();
                    setUpdates(undefined);
                    setView('installed');
                  }
                });
              }}
            >
              {t('modInstallTogether')}
            </Button>
          </div>
        </Dialog>
      )}
      {bulk && (
        <ModBulkDialog
          server={server}
          review={bulk.review}
          action={bulk.action}
          onClose={() => setBulk(undefined)}
          onChanged={() => {
            setBulk(undefined);
            reload();
            setUpdates(undefined);
          }}
        />
      )}
      {collection && (
        <Dialog
          title={t('modCreateCollection')}
          closeLabel={t('close')}
          onClose={() => setCollection(false)}
        >
          <div className="dialog-body">
            <Field label={t('modCollectionName')}>
              <input
                maxLength={80}
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
              />
            </Field>
            <p>{t('modCollectionHelp')}</p>
            {items
              .filter(
                (item) =>
                  item.provider !== 'local' && (!selected.length || selected.includes(item.id)),
              )
              .map((item) => (
                <p key={item.id}>
                  {item.title} · {item.versionName ?? item.versionId}
                </p>
              ))}
          </div>
          <div className="dialog-footer">
            <Button
              variant="primary"
              disabled={
                busy ||
                !collectionName.trim() ||
                !items.some(
                  (item) =>
                    item.provider !== 'local' && (!selected.length || selected.includes(item.id)),
                )
              }
              onClick={() => {
                void run(() =>
                  api.modCollection({
                    name: collectionName.trim(),
                    projects: items
                      .filter(
                        (item) =>
                          item.provider !== 'local' &&
                          (!selected.length || selected.includes(item.id)),
                      )
                      .map((item) => ({ projectId: item.projectId, versionId: item.versionId })),
                  }),
                ).then((result) => {
                  if (result.ok) {
                    setCollection(false);
                    setCollectionName('');
                    library.reload();
                  }
                });
              }}
            >
              {t('save')}
            </Button>
          </div>
        </Dialog>
      )}
      {migration && (
        <ModMigrationDialog
          server={server}
          onClose={() => setMigration(false)}
          onChanged={() => {
            setMigration(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
function ModDetails({
  server,
  projectId,
  item,
  onClose,
  onPlan,
  onRemove,
  onChanged,
}: {
  server: Server;
  projectId: string;
  item?: InstalledContent;
  onClose: () => void;
  onPlan: (
    selections: ModSelection[],
    collection?: boolean,
    allowPrerelease?: boolean,
  ) => Promise<void>;
  onRemove: (item: InstalledContent) => void;
  onChanged: () => void;
}) {
  const { api, t, busy, run } = useApp(),
    detail = useData(() => api.modDetail(server.id, projectId), [server.id, projectId]),
    history = useData(
      () => (item ? api.contentHistory(server.id, item.id) : Promise.resolve([])),
      [server.id, item?.id],
    );
  const [channel, setChannel] = useState<'release' | 'beta' | 'alpha'>('release'),
    [versionId, setVersionId] = useState(''),
    [rollback, setRollback] = useState<string>();
  const versions =
      detail.data?.versions.filter(
        (version) => !version.releaseType || version.releaseType === channel,
      ) ?? [],
    chosen = versions.find((version) => version.id === versionId) ?? versions[0],
    project = detail.data?.project;
  const locked = busy || !!server.pid || server.status === 'installing';
  return (
    <>
      <Dialog
        title={project?.title ?? item?.title ?? t('modDetails')}
        closeLabel={t('close')}
        onClose={onClose}
      >
        <div className="dialog-body">
          {detail.loading && <Loading label={t('loading')} />}{' '}
          {detail.error && (
            <ErrorBox error={detail.error} retry={detail.reload} retryLabel={t('retry')} />
          )}
          {project && (
            <>
              <div className="mod-card-heading">
                <ModIcon url={project.iconUrl} title={project.title} />
                <div>
                  <h3>{project.title}</h3>
                  <p>
                    {project.author} · {new Intl.NumberFormat().format(project.downloads ?? 0)}{' '}
                    {t('downloads')}
                  </p>
                </div>
              </div>
              <p>{project.description}</p>
              <p className="muted">
                {project.categories?.join(' · ')} ·{' '}
                {project.updatedAt && new Date(project.updatedAt).toLocaleDateString()}
              </p>
              <details>
                <summary>{t('modDescription')}</summary>
                <pre className="mod-markdown">{project.body}</pre>
                <p>{project.gameVersions?.join(', ')}</p>
                <p>{project.loaders?.join(', ')}</p>
                <p>{project.environment ?? project.clientSide}</p>
              </details>
            </>
          )}
          {item && (
            <p>
              {t('installed')}: <strong>{item.versionName ?? item.versionId}</strong>
            </p>
          )}
          <Field label={t('modReleaseChannel')}>
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as typeof channel);
                setVersionId('');
              }}
            >
              <option value="release">{t('modStable')}</option>
              <option value="beta">Beta</option>
              <option value="alpha">Alpha</option>
            </select>
          </Field>
          {channel !== 'release' && <p className="warning-text">{t('modPrereleaseWarning')}</p>}
          <Field label={t('modChangeVersion')}>
            <select
              value={chosen?.id ?? ''}
              disabled={!versions.length}
              onChange={(event) => setVersionId(event.target.value)}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name} · {version.gameVersions.join(', ')} · {version.loaders.join(', ')}
                </option>
              ))}
            </select>
          </Field>
          {chosen && (
            <details open>
              <summary>{t('changelog')}</summary>
              <pre className="mod-markdown">{chosen.changelog || t('noChangelog')}</pre>
            </details>
          )}
          {item && (
            <>
              <details>
                <summary>{t('dependencies')}</summary>
                <ModDependencyTree server={server} item={item} />
              </details>
              <details open>
                <summary>{t('modRollback')}</summary>
                {history.data?.map((previous) => (
                  <div className="mod-collection" key={previous.id}>
                    <div>
                      <strong>{previous.item.versionName ?? previous.item.versionId}</strong>
                      <small>{new Date(previous.at).toLocaleString()}</small>
                    </div>
                    <Button
                      disabled={
                        locked ||
                        previous.item.gameVersion !== server.version ||
                        previous.item.loader !== server.engine
                      }
                      onClick={() => setRollback(previous.id)}
                    >
                      {t('restore')}
                    </Button>
                  </div>
                ))}
              </details>
            </>
          )}
        </div>
        <div className="dialog-footer">
          {item && (
            <Button variant="danger" disabled={locked} onClick={() => onRemove(item)}>
              {t('uninstall')}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={
              locked ||
              !chosen ||
              detail.data?.offline ||
              chosen.id === item?.versionId ||
              !project?.serverSide
            }
            onClick={() => {
              if (chosen)
                void onPlan([{ projectId, versionId: chosen.id }], false, channel !== 'release');
            }}
          >
            {t(item ? 'modUpdate' : 'install')}
          </Button>
        </div>
      </Dialog>
      {rollback && item && (
        <Confirm
          name={item.title}
          help={t('modRollbackHelp')}
          onClose={() => setRollback(undefined)}
          onConfirm={() => {
            void run(() => api.rollbackContent(server.id, item.id, rollback, item.title)).then(
              (result) => {
                if (result.ok) {
                  setRollback(undefined);
                  onChanged();
                  history.reload();
                  onClose();
                }
              },
            );
          }}
        />
      )}
    </>
  );
}
function ModDependencyTree({ server, item }: { server: Server; item: InstalledContent }) {
  const { api, t } = useApp(),
    inventory = useData(() => api.modInventory(server.id), [server.id, item.id]);
  const render = (value: InstalledContent, seen: string[], depth: number): React.ReactNode => (
    <div key={value.id} style={{ paddingLeft: depth ? 16 : 0 }}>
      <p>
        {depth ? '└ ' : ''}
        {value.title} {value.versionName}
        {value.automatic ? ` · ${t('modAutomatic')}` : ''}
      </p>
      {depth < 4 &&
        value.dependencies
          ?.filter((id) => !seen.includes(id))
          .map((id) => {
            const child = inventory.data?.installed.find((item) => item.projectId === id);
            return child ? (
              <details key={id} open={depth === 0}>
                <summary>{child.title}</summary>
                {render(child, [...seen, value.projectId], depth + 1)}
              </details>
            ) : (
              <p key={id}>
                {id} · {t('modProblem.dependency')}
              </p>
            );
          })}
    </div>
  );
  return render(item, [], 0);
}
function ModBulkDialog({
  server,
  review,
  action,
  onClose,
  onChanged,
}: {
  server: Server;
  review: ModRemoval;
  action: 'enable' | 'disable' | 'uninstall';
  onClose: () => void;
  onChanged: () => void;
}) {
  const { api, t, run, busy } = useApp(),
    [confirmation, setConfirmation] = useState(''),
    [orphans, setOrphans] = useState(false);
  return (
    <Dialog
      title={t(action === 'uninstall' ? 'uninstall' : action)}
      closeLabel={t('close')}
      onClose={onClose}
    >
      <div className="dialog-body">
        {review.selected.map((item) => (
          <p key={item.id}>
            <strong>{item.title}</strong> · {item.versionName ?? item.versionId}
          </p>
        ))}
        {action === 'uninstall' && (
          <>
            <p>{t('modRemovalHelp')}</p>
            {review.shared.map(({ item, users }) => (
              <p key={item.id}>
                {item.title} · {users} {t('modSharedKeep')}
              </p>
            ))}
            {!!review.unused.length && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={orphans}
                  onChange={(event) => setOrphans(event.target.checked)}
                />
                {t('modRemoveUnused')} · {review.unused.map((item) => item.title).join(', ')}
              </label>
            )}
            {!!review.blocked.length && (
              <p className="warning-text">
                {t('modRemovalBlocked')} · {review.blocked.join(', ')}
              </p>
            )}
          </>
        )}
        <Field label={`${t('typeToConfirm')} ${server.name}`}>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </Field>
        <p className="muted">{t('modBackupHelp')}</p>
      </div>
      <div className="dialog-footer">
        <Button disabled={busy} onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          variant={action === 'uninstall' ? 'danger' : 'primary'}
          disabled={
            busy ||
            confirmation !== server.name ||
            (action === 'uninstall' && !!review.blocked.length)
          }
          onClick={() => {
            void run(() =>
              api.modBulk(server.id, {
                ids: review.selected.map((item) => item.id),
                action,
                removeOrphans: orphans,
                confirmation,
              }),
            ).then((result) => {
              if (result.ok) onChanged();
            });
          }}
        >
          {t('modConfirm')}
        </Button>
      </div>
    </Dialog>
  );
}
function ModMigrationDialog({
  server,
  onClose,
  onChanged,
}: {
  server: Server;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { api, t, run, busy } = useApp(),
    [target, setTarget] = useState<ModTarget>({
      engine: server.engine as ModTarget['engine'],
      version: server.version,
    }),
    [review, setReview] = useState<ModMigration>(),
    [confirmation, setConfirmation] = useState('');
  const versions = useData(() => api.versions(target.engine), [target.engine]),
    builds = useData(
      () => api.builds(target.engine, target.version),
      [target.engine, target.version],
    );
  return (
    <Dialog title={t('modMigration')} closeLabel={t('close')} onClose={onClose}>
      <div className="dialog-body">
        <p>{t('modMigrationHelp')}</p>
        <Field label={t('loader')}>
          <select
            value={target.engine}
            onChange={(event) => {
              setTarget({
                ...target,
                engine: event.target.value as ModTarget['engine'],
                build: undefined,
                loaderVersion: undefined,
              });
              setReview(undefined);
            }}
          >
            {['fabric', 'forge', 'neoforge'].map((engine) => (
              <option key={engine} value={engine}>
                {engine}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('version')}>
          <select
            value={target.version}
            onChange={(event) => {
              setTarget({
                ...target,
                version: event.target.value,
                build: undefined,
                loaderVersion: undefined,
              });
              setReview(undefined);
            }}
          >
            <option value={server.version}>{server.version}</option>
            {versions.data
              ?.filter((version) => version !== server.version)
              .map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('loader')}>
          <select
            value={target.build ?? ''}
            onChange={(event) => {
              setTarget({
                ...target,
                build: event.target.value || undefined,
                loaderVersion:
                  target.engine === 'fabric' ? event.target.value || undefined : undefined,
              });
              setReview(undefined);
            }}
          >
            <option value="">{t('latest')}</option>
            {builds.data?.map((build) => (
              <option key={build} value={build}>
                {build}
              </option>
            ))}
          </select>
        </Field>
        <Button
          disabled={busy}
          onClick={() => {
            void run(() => api.modMigration(server.id, target)).then((result) => {
              if (result.ok) setReview(result.value);
            });
          }}
        >
          {t('modAnalyze')}
        </Button>
        {review && (
          <>
            <p>
              {review.compatible.length} {t('compatible')} · {review.replace.length}{' '}
              {t('updateAvailable')} · {review.incompatible.length} {t('incompatible')} ·{' '}
              {review.manual.length} {t('modManual')}
            </p>
            {review.incompatible.map((title) => (
              <p key={title} className="warning-text">
                {title}
              </p>
            ))}
            {review.manual.map((title) => (
              <p key={title} className="warning-text">
                {title}
              </p>
            ))}
            <Field label={`${t('typeToConfirm')} ${server.name}`}>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
          </>
        )}
      </div>
      <div className="dialog-footer">
        <Button
          variant="primary"
          disabled={
            busy ||
            confirmation !== server.name ||
            !review ||
            !!review.incompatible.length ||
            !!review.manual.length
          }
          onClick={() => {
            void run(() => api.modMigrate(server.id, target, confirmation)).then((result) => {
              if (result.ok) onChanged();
            });
          }}
        >
          {t('modMigrate')}
        </Button>
      </div>
    </Dialog>
  );
}
