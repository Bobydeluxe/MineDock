import { useState } from 'react';
import { Download, Puzzle, Search, RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import type { Server, Project, InstalledContent } from '../../../../packages/domain/types';
import type { MarketplaceId, ContentUpdate } from '../../../../packages/domain/content';
import { engineDefinition } from '../../../../packages/domain/engines';
import { useApp } from './context';
import { Button, Field, Empty, ErrorBox, Loading, Dialog, useData, bytes } from './ui';
import { Confirm } from './management';
import { CrossplayView } from './crossplay';
export function ContentView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [provider, setProvider] = useState<MarketplaceId>('modrinth');
  const [selection, setSelection] = useState<{ project: Project; item?: InstalledContent }>();
  const [history, setHistory] = useState<InstalledContent>();
  const [remove, setRemove] = useState<InstalledContent>();
  const [updates, setUpdates] = useState<ContentUpdate[]>();
  const installed = useData(() => api.content(server.id), [server.id]);
  const manual = useData(() => api.manualContent(server.id), [server.id]);
  const supported = engineDefinition(server.engine).capabilities.marketplace;
  const projects = useData(
    () => (supported ? api.search(server.id, search, provider) : Promise.resolve([])),
    [server.id, search, provider],
  );
  const settings = useData(() => api.marketplaceSettings(), []);
  const reload = () => {
    installed.reload();
    manual.reload();
    setUpdates(undefined);
  };
  const locked = busy || !!server.pid || server.status === 'installing';
  if (!engineDefinition(server.engine).contentFolder)
    return <Empty icon={<Puzzle />} title={t('vanillaPlugins')} />;
  return (
    <>
      {engineDefinition(server.engine).capabilities.crossplay && <CrossplayView server={server} />}
      {supported && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>{t('marketplaceTitle')}</h2>
              <p>{t('contentMarketplaceHelp')}</p>
            </div>
            <Puzzle size={25} />
          </div>
          <form
            className="marketplace-search"
            onSubmit={(event) => {
              event.preventDefault();
              if (query === search) projects.reload();
              else setSearch(query);
            }}
          >
            <select
              aria-label={t('provider')}
              value={provider}
              onChange={(event) => setProvider(event.target.value as MarketplaceId)}
            >
              <option value="modrinth">Modrinth</option>
              {['paper', 'purpur'].includes(server.engine) && (
                <option value="hangar">Hangar</option>
              )}
              {engineDefinition(server.engine).capabilities.mods && (
                <option value="curseforge">CurseForge</option>
              )}
            </select>
            <div className="search-input">
              <Search size={17} />
              <input
                aria-label={t('searchContent')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchContent')}
              />
            </div>
            <Button type="submit" variant="primary">
              {t('search')}
            </Button>
          </form>
          {provider === 'curseforge' && (
            <p className="muted small-text">
              {t(settings.data?.curseforgeConfigured ? 'curseforgeSideHelp' : 'curseforgeKeyHelp')}
            </p>
          )}
          {projects.error ? (
            <ErrorBox error={projects.error} retry={projects.reload} retryLabel={t('retry')} />
          ) : projects.loading ? (
            <Loading label={t('loading')} />
          ) : !projects.data?.length ? (
            <Empty icon={<Search />} title={t('noResults')} />
          ) : (
            <div className="plugin-grid">
              {projects.data.map((project) => {
                const current = installed.data?.find(
                  (item) =>
                    item.projectId === project.id && (item.provider ?? 'modrinth') === provider,
                );
                return (
                  <article key={project.id} className="plugin-card">
                    <div className="plugin-title">
                      <span className="plugin-icon">
                        <ContentIcon project={project} />
                      </span>
                      <div>
                        <h3>{project.title}</h3>
                        <small>{project.author}</small>
                      </div>
                    </div>
                    <p>{project.description}</p>
                    <footer>
                      <small>
                        {Intl.NumberFormat().format(project.downloads)} {t('downloads')}
                      </small>
                      <Button
                        disabled={locked || !!current}
                        onClick={() => setSelection({ project })}
                      >
                        <Download size={14} />
                        {t(current ? 'installed' : 'chooseVersion')}
                      </Button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{t('managedContent')}</h2>
            <p>{t('managedContentHelp')}</p>
          </div>
          <Button
            disabled={busy}
            onClick={() => {
              void run(() => api.contentUpdates(server.id)).then((result) => {
                if (result.ok) setUpdates(result.value);
              });
            }}
          >
            <RefreshCw size={15} />
            {t('checkUpdates')}
          </Button>
        </div>
        {installed.error && (
          <ErrorBox error={installed.error} retry={installed.reload} retryLabel={t('retry')} />
        )}
        {!installed.data?.length ? (
          <p className="muted">{t('noContent')}</p>
        ) : (
          installed.data.map((item) => {
            const update = updates?.find((value) => value.contentId === item.id);
            return (
              <div className="installed-row" key={item.id}>
                <Puzzle size={20} />
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.filename} · {item.versionName ?? item.versionId} ·{' '}
                    {item.provider ?? 'Modrinth'}
                  </small>
                  {update && <small title={update.error}>{t(update.status)}</small>}
                </div>
                <span className="badge">{t(item.enabled ? 'enabled' : 'disabled')}</span>
                <Button
                  disabled={locked}
                  onClick={() => {
                    void run(() => api.toggleContent(server.id, item.id)).then(reload);
                  }}
                >
                  {t('toggle')}
                </Button>
                <Button
                  disabled={locked}
                  onClick={() =>
                    setSelection({
                      project: {
                        id: item.projectId,
                        title: item.title,
                        description: '',
                        author: '',
                        downloads: 0,
                        categories: [],
                        provider: item.provider ?? 'modrinth',
                      },
                      item,
                    })
                  }
                >
                  {t('versions')}
                </Button>
                <Button
                  disabled={locked}
                  title={t('contentHistory')}
                  onClick={() => setHistory(item)}
                >
                  <RotateCcw size={16} />
                </Button>
                <Button
                  disabled={locked}
                  variant="danger"
                  title={t('uninstall')}
                  onClick={() => setRemove(item)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            );
          })
        )}
      </section>
      <section className="panel">
        <h2>{t('manualContent')}</h2>
        <p className="muted small-text">{t('manualContentHelp')}</p>
        {manual.error && (
          <ErrorBox error={manual.error} retry={manual.reload} retryLabel={t('retry')} />
        )}{' '}
        {!manual.data?.length ? (
          <p className="muted">{t('noContent')}</p>
        ) : (
          manual.data.map((item) => (
            <div className="installed-row" key={item.filename}>
              <Puzzle size={18} />
              <div>
                <strong>{item.filename}</strong>
                <small>
                  {bytes(item.size)} · {t('manual')}
                </small>
              </div>
              <span className="badge">{t(item.enabled ? 'enabled' : 'disabled')}</span>
            </div>
          ))
        )}
      </section>
      {selection && (
        <ContentVersions
          server={server}
          {...selection}
          onClose={() => setSelection(undefined)}
          onApplied={() => {
            setSelection(undefined);
            reload();
          }}
        />
      )}
      {history && (
        <ContentHistoryView
          server={server}
          item={history}
          onClose={() => setHistory(undefined)}
          onApplied={() => {
            setHistory(undefined);
            reload();
          }}
        />
      )}
      {remove && (
        <Confirm
          name={remove.title}
          help={t('uninstallContentHelp')}
          onClose={() => setRemove(undefined)}
          onConfirm={() => {
            void run(() => api.uninstallContent(server.id, remove.id, remove.title)).then(
              (result) => {
                if (result.ok) {
                  setRemove(undefined);
                  reload();
                }
              },
            );
          }}
        />
      )}
    </>
  );
}
function ContentIcon({ project }: { project: Project }) {
  const { api } = useApp();
  const icon = useData(
    () => (project.iconUrl ? api.contentIcon(project.iconUrl) : Promise.resolve(null)),
    [project.iconUrl],
  );
  return icon.data ? (
    <img src={icon.data} alt="" loading="lazy" width={36} height={36} />
  ) : (
    <Puzzle size={24} />
  );
}
function ContentVersions({
  server,
  project,
  item,
  onClose,
  onApplied,
}: {
  server: Server;
  project: Project;
  item?: InstalledContent;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { api, t, run, busy, snapshot } = useApp();
  const provider = project.provider ?? 'modrinth';
  const versions = useData(
    () => api.contentVersions(server.id, project.id, provider),
    [server.id, project.id, provider],
  );
  const [selected, setSelected] = useState(''),
    [confirm, setConfirm] = useState(false);
  const details = useData(
    () => (selected ? api.contentVersion(provider, selected) : Promise.resolve(null)),
    [provider, selected],
  );
  const value = details.data?.id === selected ? details.data : null;
  const compatible =
    (!value?.minimumJava || server.javaMajor >= value.minimumJava) &&
    value?.gameVersions.includes(server.version) &&
    engineDefinition(server.engine).contentLoaders.some((loader) => value.loaders.includes(loader));
  const apply = () => {
    void run(() =>
      item
        ? api.changeContentVersion(server.id, item.id, selected, item.title)
        : api.installContent(server.id, project.id, provider, selected),
    ).then((result) => {
      if (result.ok) onApplied();
    });
  };
  return (
    <>
      <Dialog
        title={`${project.title} · ${t('versions')}`}
        closeLabel={t('close')}
        onClose={onClose}
      >
        <div className="dialog-body">
          <p className="muted">{t('versionSelectionHelp')}</p>
          {provider === 'curseforge' && (
            <p className="muted small-text">{t('curseforgeSideHelp')}</p>
          )}
          {item && (
            <p>
              {t('installed')}: <strong>{item.versionName ?? item.versionId}</strong>
            </p>
          )}
          {versions.error ? (
            <ErrorBox error={versions.error} retry={versions.reload} retryLabel={t('retry')} />
          ) : versions.loading ? (
            <Loading label={t('loading')} />
          ) : (
            <Field label={t('availableVersion')}>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">{t('chooseVersion')}</option>
                {versions.data?.map((version) => (
                  <option value={version.id} key={version.id}>
                    {version.name} · {version.releaseType ?? 'release'}
                    {version.id === item?.versionId ? ` · ${t('installed')}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {selected &&
            (details.error ? (
              <ErrorBox error={details.error} retry={details.reload} retryLabel={t('retry')} />
            ) : details.loading ? (
              <Loading label={t('loading')} />
            ) : (
              value && (
                <>
                  <p>
                    <span className="badge">{t(compatible ? 'compatible' : 'incompatible')}</span>{' '}
                    Minecraft {value.gameVersions.join(', ')} · {value.loaders.join(', ')}
                  </p>
                  <p className="muted">
                    {value.publishedAt &&
                      new Date(value.publishedAt).toLocaleString(snapshot.settings.language)}
                  </p>
                  <h3>{t('dependencies')}</h3>
                  <p className="small-text">
                    {value.dependencies
                      .filter((dep) => dep.required)
                      .map((dep) => dep.projectId ?? dep.versionId)
                      .join(', ') || t('none')}
                  </p>
                  <h3>{t('changelog')}</h3>
                  <pre className="content-changelog">{value.changelog || t('noChangelog')}</pre>
                </>
              )
            ))}
        </div>
        <footer className="dialog-footer">
          <Button disabled={busy} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !compatible || !value?.files.length || selected === item?.versionId}
            onClick={() => (item ? setConfirm(true) : apply())}
          >
            <Download size={15} />
            {t(item ? 'applyVersion' : 'install')}
          </Button>
        </footer>
      </Dialog>
      {confirm && (
        <Confirm
          name={project.title}
          help={t('changeContentHelp')}
          onClose={() => setConfirm(false)}
          onConfirm={apply}
        />
      )}
    </>
  );
}
function ContentHistoryView({
  server,
  item,
  onClose,
  onApplied,
}: {
  server: Server;
  item: InstalledContent;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { api, t, run, busy, snapshot } = useApp();
  const history = useData(() => api.contentHistory(server.id, item.id), [server.id, item.id]);
  const [selected, setSelected] = useState<string>();
  return (
    <>
      <Dialog
        title={`${item.title} · ${t('contentHistory')}`}
        closeLabel={t('close')}
        onClose={onClose}
      >
        <div className="dialog-body">
          <p className="muted">{t('rollbackContentHelp')}</p>
          {history.error ? (
            <ErrorBox error={history.error} retry={history.reload} retryLabel={t('retry')} />
          ) : history.loading ? (
            <Loading label={t('loading')} />
          ) : !history.data?.length ? (
            <Empty icon={<RotateCcw />} title={t('noContentHistory')} />
          ) : (
            history.data.map((value) => (
              <div className="installed-row" key={value.id}>
                <div>
                  <strong>{value.item.versionName ?? value.item.versionId}</strong>
                  <small>{new Date(value.at).toLocaleString(snapshot.settings.language)}</small>
                </div>
                <Button disabled={busy} onClick={() => setSelected(value.id)}>
                  <RotateCcw size={15} />
                  {t('restore')}
                </Button>
              </div>
            ))
          )}
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose}>{t('close')}</Button>
        </footer>
      </Dialog>
      {selected && (
        <Confirm
          name={item.title}
          help={t('rollbackContentHelp')}
          onClose={() => setSelected(undefined)}
          onConfirm={() => {
            void run(() => api.rollbackContent(server.id, item.id, selected, item.title)).then(
              (result) => {
                if (result.ok) onApplied();
              },
            );
          }}
        />
      )}
    </>
  );
}
