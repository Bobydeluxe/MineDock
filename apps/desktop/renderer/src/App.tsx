import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  LayoutDashboard,
  Server as ServerIcon,
  Archive,
  Activity,
  Settings2,
  Plus,
  Search,
  ChevronRight,
  ArrowUpRight,
  Cpu,
  Users,
  MemoryStick,
  HardDrive,
  ShieldCheck,
  Terminal,
  Play,
  Square,
  CircleCheck,
  X,
  Download,
  LoaderCircle,
  FolderInput,
} from 'lucide-react';
import type { Snapshot, Server, Progress } from '../../../../packages/domain/types';
import { PRODUCT } from '../../../../packages/domain/types';
import { api } from './api';
import { translator, activityLabel } from './i18n';
import { localizeMessage } from '../../../../packages/domain/localization';
import { defaultLanguage } from '../../../../packages/domain/languages';
import { engineDefinition } from '../../../../packages/domain/engines';
import { AppContext, useApp, type Run } from './context';
import { Button, Empty, Loading, ErrorBox, bytes, duration, Dialog, Field } from './ui';
import { CreateServer, Onboarding } from './wizard';
import { EngineIcon } from './engine-icon';
import { ImportServerDialog } from './imports';
import type { ImportServerPreview } from '../../../../packages/domain/imports';
import type { ModpackPreview } from '../../../../packages/domain/modpacks';
import { ModpackDialog } from './modpacks';
import { ServerPage } from './server';
import { BackupsView, ActivityView, SettingsView, OperationsView } from './management';
type Page = 'dashboard' | 'backups' | 'activity' | 'settings' | 'operations';
export function Status({ server }: { server: Server }) {
  const { t } = useApp();
  return (
    <span className={`status ${server.status}`}>
      <i />
      {t(server.status)}
    </span>
  );
}
export function ServerActions({ server, compact = false }: { server: Server; compact?: boolean }) {
  const { api, t, run, busy } = useApp();
  if (server.installationComplete === false)
    return (
      <Button
        disabled={busy || server.status === 'installing'}
        onClick={() => {
          void run(() => api.retryInstallation(server.id));
        }}
      >
        <Download size={15} />
        {t('retry')}
      </Button>
    );
  const active = ['running', 'starting', 'backing_up'].includes(server.status);
  const transitional = ['installing', 'stopping', 'restoring', 'backing_up'].includes(
    server.status,
  );
  return (
    <div className="actions">
      <Button
        variant={active ? 'default' : 'primary'}
        disabled={busy || transitional}
        onClick={() => {
          void run(() => (active ? api.stop(server.id) : api.start(server.id)));
        }}
      >
        {active ? <Square size={14} /> : <Play size={14} />}
        {t(active ? 'stop' : 'start')}
      </Button>
      {!compact && (
        <Button
          disabled={busy || transitional}
          onClick={() => {
            void run(() => api.restart(server.id));
          }}
        >
          {t('restart')}
        </Button>
      )}
      <Button
        title={t('backup')}
        aria-label={t('backup')}
        disabled={
          busy ||
          transitional ||
          server.status === 'starting' ||
          (active && !engineDefinition(server.engine).capabilities.liveBackup)
        }
        onClick={() => {
          void run(() => api.backup(server.id));
        }}
      >
        <Archive size={15} />
        {!compact && t('backup')}
      </Button>
    </div>
  );
}
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean }>();
  const [page, setPage] = useState<Page>('dashboard');
  const [selected, setSelected] = useState<string>();
  const [create, setCreate] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportServerPreview>();
  const [packPreview, setPackPreview] = useState<ModpackPreview>();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [palette, setPalette] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const refresh = useCallback(async () => {
    if (api) {
      const state = await api.snapshot();
      setSnapshot(state);
      setError('');
    }
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, [refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = api?.onEvent((event) => {
      if (event.type === 'server')
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                servers: prev.servers.some((s) => s.id === event.server.id)
                  ? prev.servers.map((s) => (s.id === event.server.id ? event.server : s))
                  : [...prev.servers, event.server],
              }
            : prev,
        );
      if (event.type === 'activity')
        setSnapshot((prev) =>
          prev ? { ...prev, activity: [event.activity, ...prev.activity].slice(0, 200) } : prev,
        );
      if (event.type === 'changed') {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void refresh().catch((e) => setError(String(e)));
        }, 200);
      }
      if (event.type === 'progress')
        setProgress((prev) =>
          [...prev.filter((p) => p.id !== event.progress.id), event.progress].slice(-8),
        );
    });
    return () => {
      off?.();
      clearTimeout(timer);
    };
  }, [refresh]);
  const language = snapshot?.settings.language ?? defaultLanguage;
  const t = translator(language);
  useEffect(() => {
    const theme = snapshot?.settings.theme ?? 'system';
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (query.matches ? 'dark' : 'light') : theme;
      document.documentElement.lang = language;
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [snapshot?.settings.theme, language]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(undefined), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === ',') {
        e.preventDefault();
        setSelected(undefined);
        setPage('settings');
      }
      if (e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setCreate(true);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const run: Run = async (action, message) => {
    setToast(undefined);
    setBusy(true);
    try {
      const value = await action();
      await refresh();
      setToast({ text: message ?? '', error: false });
      return { ok: true, value };
    } catch (e) {
      setToast({ text: (e as Error).message ?? String(e), error: true });
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };
  if (!api)
    return (
      <div className="standalone">
        <Box size={48} />
        <h1>{PRODUCT.name}</h1>
        <p>{t('desktopOnly')}</p>
      </div>
    );
  if (error && !snapshot)
    return (
      <ErrorBox
        error={error}
        retry={() => {
          void refresh().catch((e) => setError(String(e)));
        }}
        retryLabel={t('retry')}
      />
    );
  if (!snapshot) return <Loading label={t('loading')} />;
  const selectedServer = snapshot.servers.find((s) => s.id === selected);
  const navigate = (value: Page) => {
    setSelected(undefined);
    setPage(value);
  };
  return (
    <AppContext
      value={{
        api,
        snapshot,
        t,
        run,
        busy,
        refresh,
        error: toast?.error ? toast.text : undefined,
        dismissError: () => setToast(undefined),
      }}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('dashboard');
            }}
          >
            <span className="brand-mark">
              <Box size={24} strokeWidth={1.7} />
            </span>
            {PRODUCT.name}
            <span className="brand-version">BETA</span>
          </a>
          <div className="workspace">
            <span className="workspace-icon">
              <HardDrive size={17} />
            </span>
            <div>
              <strong>{t('localFirst')}</strong>
              <small>
                <i />
                {t('local')}
              </small>
            </div>
            <ChevronRight size={15} />
          </div>
          <nav aria-label={t('dashboard')}>
            <Button
              className={!selectedServer && page === 'dashboard' ? 'nav active' : 'nav'}
              variant="ghost"
              onClick={() => navigate('dashboard')}
            >
              <LayoutDashboard size={18} />
              {t('dashboard')}
            </Button>
            <Button
              className={!selectedServer && page === 'backups' ? 'nav active' : 'nav'}
              aria-label={t('backups')}
              variant="ghost"
              onClick={() => navigate('backups')}
            >
              <Archive size={18} />
              {t('backups')}
              <span className="nav-count">{snapshot.backups.length}</span>
            </Button>
            <Button
              className={!selectedServer && page === 'activity' ? 'nav active' : 'nav'}
              variant="ghost"
              onClick={() => navigate('activity')}
            >
              <Activity size={18} />
              {t('activity')}
            </Button>
            <Button
              variant="ghost"
              className={!selectedServer && page === 'operations' ? 'nav active' : 'nav'}
              aria-label={t('operations')}
              onClick={() => navigate('operations')}
            >
              <Download size={18} />
              {t('operations')}
              {snapshot.operations?.some((operation) => operation.status === 'attention') && (
                <span className="nav-count">!</span>
              )}
            </Button>
          </nav>
          <div className="sidebar-heading">
            {t('servers')}
            <Button
              variant="ghost"
              aria-label={t('newServer')}
              title={t('newServer')}
              onClick={() => setCreate(true)}
            >
              <Plus size={15} />
            </Button>
          </div>
          <nav className="server-nav" aria-label={t('servers')}>
            {snapshot.servers.map((s) => (
              <Button
                key={s.id}
                variant="ghost"
                className={`nav server-link ${selected === s.id ? 'active' : ''}`}
                onClick={() => setSelected(s.id)}
              >
                <span className="sidebar-engine">
                  <EngineIcon engine={s.engine} size={24} />
                  <i className={`server-dot ${s.status}`} aria-hidden="true" />
                </span>
                <span>{s.name}</span>
                {s.status === 'running' && <span className="nav-count">{s.players.length}</span>}
              </Button>
            ))}
            {snapshot.servers.length === 0 && (
              <small className="sidebar-empty">0 · {t('servers')}</small>
            )}
          </nav>
          <div className="sidebar-bottom">
            <Button
              variant="ghost"
              className={!selectedServer && page === 'settings' ? 'nav active' : 'nav'}
              onClick={() => navigate('settings')}
            >
              <Settings2 size={18} />
              {t('settings')}
            </Button>
            <div className="local-badge">
              <ShieldCheck size={15} />
              <span>Local-first · v{PRODUCT.version}</span>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              {PRODUCT.name}
              <ChevronRight size={13} />
              <strong>{selectedServer?.name ?? t(page)}</strong>
            </div>
            <div className="topbar-right">
              <span className="host-status">
                <i />
                {t('local')}
              </span>
              <Button
                variant="ghost"
                aria-label={t('search')}
                title={`${t('search')} · Ctrl+K`}
                onClick={() => setPalette(true)}
              >
                <Search size={16} />
                <kbd>Ctrl K</kbd>
              </Button>
            </div>
          </header>
          {snapshot.mock && <div className="demo-banner">{t('mock')}</div>}
          <main tabIndex={-1}>
            {error && (
              <ErrorBox
                error={error}
                retry={() => {
                  void refresh().catch((e) => setError(String(e)));
                }}
                retryLabel={t('retry')}
              />
            )}
            {selectedServer ? (
              <ServerPage
                key={selectedServer.id}
                server={selectedServer}
                onRemoved={() => navigate('dashboard')}
              />
            ) : page === 'dashboard' ? (
              <Dashboard
                onCreate={() => setCreate(true)}
                onImport={() => {
                  void run(() => api!.previewServerImport()).then((result) => {
                    if (result.ok && result.value) setImportPreview(result.value);
                  });
                }}
                onModpack={() => {
                  void run(() => api!.previewModpack()).then((result) => {
                    if (result.ok && result.value) setPackPreview(result.value);
                  });
                }}
                onOpen={setSelected}
                onActivity={() => navigate('activity')}
              />
            ) : page === 'backups' ? (
              <BackupsView />
            ) : page === 'activity' ? (
              <ActivityView />
            ) : page === 'operations' ? (
              <OperationsView />
            ) : (
              <SettingsView />
            )}
          </main>
        </div>
        {create && (
          <CreateServer
            onClose={() => {
              if (!busy) setCreate(false);
            }}
            onCreated={(s) => {
              setCreate(false);
              setSelected(s.id);
            }}
          />
        )}
        {!snapshot.settings.onboarded && <Onboarding />}
        {packPreview && (
          <ModpackDialog
            preview={packPreview}
            onClose={() => {
              if (!busy) setPackPreview(undefined);
            }}
            onCreated={(server) => {
              setPackPreview(undefined);
              setSelected(server.id);
            }}
          />
        )}
        {importPreview && (
          <ImportServerDialog
            preview={importPreview}
            onClose={() => {
              if (!busy) setImportPreview(undefined);
            }}
            onCreated={(server) => {
              setImportPreview(undefined);
              setSelected(server.id);
            }}
          />
        )}
        {toast && (
          <div
            role={toast.error ? 'alert' : 'status'}
            className={`toast ${toast.error ? 'error' : ''}`}
          >
            <CircleCheck size={18} />
            <span>{toast.text ? localizeMessage(toast.text, language) : t('success')}</span>
            <Button variant="ghost" aria-label={t('close')} onClick={() => setToast(undefined)}>
              <X size={16} />
            </Button>
          </div>
        )}
        {progress.some((p) => !p.done || p.error) && (
          <div className="download-panel">
            {progress
              .filter((p) => !p.done || p.error)
              .map((p) => (
                <div key={p.id}>
                  <header>
                    <Download size={15} />
                    <strong>{p.label}</strong>
                    <Button
                      variant="ghost"
                      aria-label={t('cancel')}
                      onClick={() => {
                        if (p.done) setProgress((prev) => prev.filter((v) => v.id !== p.id));
                        else void api?.cancelDownload(p.id);
                      }}
                    >
                      <X size={15} />
                    </Button>
                  </header>
                  <progress max={p.total || 1} value={p.received} />
                  <small>
                    {(p.error && localizeMessage(p.error, language)) ||
                      `${bytes(p.received)} / ${p.total ? bytes(p.total) : '…'} · ${bytes(p.speed)}/s`}
                  </small>
                </div>
              ))}
          </div>
        )}
        {busy && (
          <div className="busy-indicator" role="status">
            <LoaderCircle size={14} className="spin" />
            {t('loading')}
          </div>
        )}
        {palette && (
          <Dialog title={t('search')} closeLabel={t('close')} onClose={() => setPalette(false)}>
            <div className="dialog-body">
              <Field label={t('servers')}>
                <input
                  autoFocus
                  value={paletteSearch}
                  onChange={(e) => setPaletteSearch(e.target.value)}
                  placeholder={t('searchServers')}
                />
              </Field>
              {snapshot.servers
                .filter((s) => s.name.toLowerCase().includes(paletteSearch.toLowerCase()))
                .map((s) => (
                  <Button
                    key={s.id}
                    className="palette-item"
                    onClick={() => {
                      setSelected(s.id);
                      setPalette(false);
                    }}
                  >
                    <ServerIcon size={16} />
                    {s.name}
                    <ChevronRight size={14} />
                  </Button>
                ))}
              <Button
                className="palette-item"
                onClick={() => {
                  setCreate(true);
                  setPalette(false);
                }}
              >
                <Plus size={16} />
                {t('newServer')}
              </Button>
              <Button
                className="palette-item"
                onClick={() => {
                  navigate('settings');
                  setPalette(false);
                }}
              >
                <Settings2 size={16} />
                {t('settings')}
              </Button>
            </div>
          </Dialog>
        )}
      </div>
    </AppContext>
  );
}
function Dashboard({
  onCreate,
  onImport,
  onModpack,
  onOpen,
  onActivity,
}: {
  onCreate: () => void;
  onImport: () => void;
  onModpack: () => void;
  onOpen: (id: string) => void;
  onActivity: () => void;
}) {
  const { snapshot, t } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const servers = snapshot.servers.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || s.status === filter),
  );
  const running = snapshot.servers.filter((s) => s.status === 'running');
  const statistics = [
    {
      icon: ServerIcon,
      label: 'activeServers' as const,
      value: running.length,
      unit: `/ ${snapshot.servers.length}`,
      className: 'green',
    },
    {
      icon: Users,
      label: 'connectedPlayers' as const,
      value: snapshot.servers.reduce((n, s) => n + s.players.length, 0),
      unit: '',
      className: 'blue',
    },
    {
      icon: MemoryStick,
      label: 'allocatedMemory' as const,
      value: bytes(snapshot.servers.reduce((n, s) => n + s.memory, 0)),
      unit: '',
      className: 'purple',
    },
    {
      icon: HardDrive,
      label: 'storage' as const,
      value: bytes(snapshot.servers.reduce((n, s) => n + s.diskBytes, 0)),
      unit: '',
      className: 'orange',
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            {t('serverManager')}
          </div>
          <h1>{t('welcome')}</h1>
          <p>{t('welcomeSub')}</p>
        </div>
        <div className="actions">
          <Button onClick={onImport}>
            <FolderInput size={17} />
            {t('importServer')}
          </Button>
          <Button onClick={onModpack}>
            <FolderInput size={17} />
            {t('importModpack')}
          </Button>
          <Button variant="primary" onClick={onCreate}>
            <Plus size={17} />
            {t('newServer')}
          </Button>
        </div>
      </div>
      <div className="metric-grid">
        {statistics.map((stat) => (
          <div className="metric-card" key={stat.label}>
            <div className="metric-label">
              <span>{t(stat.label)}</span>
              <stat.icon className={stat.className} size={18} />
            </div>
            <strong>
              {stat.value}
              <small>{stat.unit}</small>
            </strong>
            <div className="metric-footer">
              {stat.label === 'activeServers' ? (
                <>
                  <i className="live-dot" />
                  {t('local')}
                </>
              ) : stat.label === 'allocatedMemory' ? (
                <>{t('resources')}</>
              ) : stat.label === 'storage' ? (
                <>
                  {snapshot.backups.length} {t('backups').toLowerCase()}
                </>
              ) : (
                <>{t('allServers')}</>
              )}
            </div>
          </div>
        ))}
      </div>
      <section className="server-section">
        <div className="section-heading">
          <div>
            <h2>
              {t('yourServers')}
              <span className="count">{snapshot.servers.length}</span>
            </h2>
            <p>{t('manageServers')}</p>
          </div>
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label={t('searchServers')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchServers')}
            />
          </div>
        </div>
        <div className="filters">
          {[
            ['all', 'allServers'],
            ['running', 'running'],
            ['stopped', 'stopped'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? 'selected' : ''}
              onClick={() => setFilter(value!)}
            >
              {t(label as 'allServers' | 'running' | 'stopped')}
            </button>
          ))}
        </div>
        {snapshot.servers.length === 0 ? (
          <Empty icon={<Box size={40} />} title={t('noServers')} subtitle={t('noServersSub')}>
            <Button variant="primary" onClick={onCreate}>
              <Plus size={16} />
              {t('firstServer')}
            </Button>
          </Empty>
        ) : servers.length === 0 ? (
          <Empty icon={<Search />} title={t('noFilteredServers')} />
        ) : (
          <div className="server-grid">
            {servers.map((server) => (
              <article className="server-card" key={server.id}>
                <div className="server-card-header">
                  <EngineIcon engine={server.engine} size={44} />
                  <span>{engineDefinition(server.engine).displayName}</span>
                  <Status server={server} />
                </div>
                <div className="server-card-body">
                  <button className="server-name" onClick={() => onOpen(server.id)}>
                    <h3>{server.name}</h3>
                    <ArrowUpRight size={17} />
                  </button>
                  <p className="server-engine">
                    {server.engine === 'pocketmine'
                      ? `${server.version} · Minecraft Bedrock ${server.minecraftVersion ?? t('unavailable')}`
                      : `Minecraft ${server.version}`}
                  </p>
                  <div className="card-stats">
                    <div>
                      <Users size={14} />
                      <strong>
                        {server.players.length}
                        <span> / {server.maxPlayers}</span>
                      </strong>
                    </div>
                    <div>
                      <MemoryStick size={14} />
                      <strong>{server.memory ? bytes(server.memory) : '—'}</strong>
                    </div>
                    <div>
                      <Cpu size={14} />
                      <strong>
                        {server.cpu.toFixed(1)}
                        <span>%</span>
                      </strong>
                    </div>
                  </div>
                  {engineDefinition(server.engine).capabilities.javaMemory && (
                    <div className="memory-bar">
                      <span
                        style={{
                          width:
                            Math.min(100, (server.memory / (server.memoryMax * 1024 ** 2)) * 100) +
                            '%',
                        }}
                      />
                    </div>
                  )}
                  <div className="server-card-address">
                    <code>localhost:{server.port}</code>
                    <span>{duration(server.startedAt)}</span>
                  </div>
                  <div className="card-footer">
                    <ServerActions server={server} compact />
                    <Button
                      variant="ghost"
                      title={t('open')}
                      aria-label={t('open')}
                      onClick={() => onOpen(server.id)}
                    >
                      <Terminal size={16} />
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="dashboard-bottom">
        <section className="panel activity-preview">
          <div className="section-heading">
            <h2>{t('recentActivity')}</h2>
            <Button variant="ghost" onClick={onActivity}>
              {t('viewAll')}
              <ArrowUpRight size={14} />
            </Button>
          </div>
          {snapshot.activity.length ? (
            snapshot.activity.slice(0, 4).map((a) => (
              <div className="activity-row" key={a.id}>
                <span className={`activity-icon ${a.success ? '' : 'failed'}`}>
                  <Activity size={15} />
                </span>
                <div>
                  <strong>{localizeMessage(a.detail, snapshot.settings.language)}</strong>
                  <small>{activityLabel(a.action, snapshot.settings.language)}</small>
                </div>
                <time>
                  {new Date(a.at).toLocaleTimeString(snapshot.settings.language, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            ))
          ) : (
            <div className="muted compact-empty">{t('noActivity')}</div>
          )}
        </section>
        <section className="local-panel">
          <ShieldCheck size={26} />
          <h3>{t('localNote')}</h3>
          <p>{t('localNoteSub')}</p>
          <div className="local-panel-bottom">
            SQLite <span>·</span> Java <span>·</span> {t('local')}
            <span className="local-lock">
              <ShieldCheck size={15} />
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
