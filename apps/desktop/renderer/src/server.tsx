import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeft,
  Copy,
  Users,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Terminal,
  Send,
  Search,
  RefreshCw,
  Archive,
  Folder,
  FileText,
  Upload,
  Plus,
  Download,
  Trash2,
  FolderOpen,
  Puzzle,
  Globe2,
  ShieldCheck,
} from 'lucide-react';
import type { Server, LogLine, FileEntry } from '../../../../packages/domain/types';
import { useApp } from './context';
import { Status, ServerActions } from './App';
import {
  Button,
  Field,
  Toggle,
  Empty,
  useData,
  ErrorBox,
  Loading,
  bytes,
  duration,
  Chart,
  Dialog,
} from './ui';
import { BackupsView, SchedulesView, PropertiesView, Confirm } from './management';
const tabs = [
  'overview',
  'console',
  'players',
  'world',
  'plugins',
  'files',
  'backups',
  'schedules',
  'analytics',
  'settings',
] as const;
export function ServerPage({ server, onRemoved }: { server: Server; onRemoved: () => void }) {
  const { t, api, snapshot, run, busy } = useApp();
  const [tab, setTab] = useState<(typeof tabs)[number]>('overview');
  const [remove, setRemove] = useState(false);
  const diagnostic = useData(() => api.diagnostic(), []);
  const metrics = useData(() => api.metrics(server.id, 1), [server.id]);
  const last = snapshot.backups.find((b) => b.serverId === server.id);
  return (
    <>
      <div className="page-heading server-page-heading">
        <div>
          <div className="eyebrow">
            <span />
            {t('servers')}
          </div>
          <div className="title-with-status">
            <h1>{server.name}</h1>
            <Status server={server} />
          </div>
          <p>
            {server.engine === 'paper' ? 'Paper' : 'Vanilla'}{' '}
            <span className="dot-separator">·</span> Minecraft {server.version}{' '}
            <span className="dot-separator">·</span> Java {server.javaMajor}
          </p>
        </div>
        <ServerActions server={server} />
      </div>
      {server.error && <ErrorBox error={server.error} />}
      <nav className="tabs" aria-label={t('serverDetails')}>
        {tabs.map((value) => (
          <button
            key={value}
            className={tab === value ? 'selected' : ''}
            onClick={() => setTab(value)}
          >
            {t(value)}
          </button>
        ))}
      </nav>
      {tab === 'overview' && (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">
                {t('players')}
                <Users size={18} />
              </div>
              <strong>
                {server.players.length}
                <small>/ {server.maxPlayers}</small>
              </strong>
              <div className="metric-footer">{t('connectedPlayers')}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">
                {t('cpu')}
                <Cpu size={18} />
              </div>
              <strong>
                {server.cpu.toFixed(1)}
                <small>%</small>
              </strong>
              <div className="metric-footer">{t('resources')}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">
                {t('memory')}
                <MemoryStick size={18} />
              </div>
              <strong>{bytes(server.memory)}</strong>
              <div className="metric-footer">
                {t('memoryAllocated')} · {server.memoryMax / 1024} Go
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">
                {t('uptime')}
                <Clock size={18} />
              </div>
              <strong>{duration(server.startedAt)}</strong>
              <div className="metric-footer">{t(server.status)}</div>
            </div>
          </div>
          <div className="overview-columns">
            <section className="panel">
              <div className="section-heading">
                <h2>{t('address')}</h2>
                <Globe2 size={18} />
              </div>
              {[
                [t('localAddress'), `localhost:${server.port}`],
                [t('lanAddress'), `${diagnostic.data?.lanIp ?? '…'}:${server.port}`],
              ].map(([label, value]) => (
                <div className="address-row" key={label}>
                  <div>
                    <small>{label}</small>
                    <code>{value}</code>
                  </div>
                  <Button
                    aria-label={t('copy')}
                    title={t('copy')}
                    disabled={value?.includes('…')}
                    onClick={() => {
                      void run(() => navigator.clipboard.writeText(value!), t('copied'));
                    }}
                  >
                    <Copy size={15} />
                  </Button>
                </div>
              ))}
              <p className="muted small-text">{t('localNetworkHelp')}</p>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>{t('serverDetails')}</h2>
                <HardDrive size={18} />
              </div>
              <div className="details-list">
                <div>
                  <span>{t('storage')}</span>
                  <strong>{bytes(server.diskBytes)}</strong>
                </div>
                <div>
                  <span>{t('lastBackup')}</span>
                  <strong>
                    {last
                      ? new Date(last.createdAt).toLocaleString(snapshot.settings.language)
                      : t('none')}
                  </strong>
                </div>
                <div>
                  <span>{t('version')}</span>
                  <strong>
                    {server.version} · build {server.build}
                  </strong>
                </div>
              </div>
              <Button className="full-width" onClick={() => setTab('console')}>
                <Terminal size={16} />
                {t('console')}
                <ArrowLeft size={14} className="rotate" />
              </Button>
            </section>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('latestSamples')}</h2>
              <Button variant="ghost" onClick={() => setTab('analytics')}>
                {t('analytics')}
              </Button>
            </div>
            {metrics.data?.length ? (
              <div className="chart-grid">
                <Chart label={t('cpu')} values={metrics.data.map((m) => m.cpu)} suffix="%" />
                <Chart
                  label={t('memory')}
                  color="#9ba8dd"
                  values={metrics.data.map((m) => m.memory / 1024 ** 3)}
                  suffix=" Go"
                />
              </div>
            ) : (
              <div className="muted compact-empty">{t('noMetrics')}</div>
            )}
          </section>
        </>
      )}
      {tab === 'console' && <ConsoleView server={server} />}
      {tab === 'players' && <PlayersView server={server} />}
      {tab === 'world' && <WorldView server={server} onSettings={() => setTab('settings')} />}
      {tab === 'plugins' && <PluginsView server={server} />}
      {tab === 'files' && <FilesView server={server} />}
      {tab === 'backups' && <BackupsView serverId={server.id} />}
      {tab === 'schedules' && <SchedulesView serverId={server.id} />}
      {tab === 'analytics' && <AnalyticsView serverId={server.id} />}
      {tab === 'settings' && (
        <>
          <PropertiesView server={server} />
          <section className="panel danger-panel">
            <h2>
              {t('delete')} · {server.name}
            </h2>
            <p>{t('deleteServerHelp')}</p>
            <Button
              variant="danger"
              disabled={busy || !!server.pid || server.status === 'installing'}
              onClick={() => setRemove(true)}
            >
              <Trash2 size={15} />
              {t('delete')}
            </Button>
          </section>
        </>
      )}
      {remove && (
        <Confirm
          name={server.name}
          help={t('deleteServerHelp')}
          onClose={() => setRemove(false)}
          onConfirm={() => {
            void run(() => api.remove(server.id, server.name)).then((r) => {
              if (r.ok) {
                setRemove(false);
                onRemoved();
              }
            });
          }}
        />
      )}
    </>
  );
}
function ConsoleView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [auto, setAuto] = useState(true);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const initial = useData(() => api.logs(server.id), [server.id]);
  useEffect(() => {
    if (initial.data)
      setLines((prev) =>
        [...new Map([...initial.data!, ...prev].map((l) => [l.seq, l])).values()].slice(-5000),
      );
  }, [initial.data]);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'log' && event.serverId === server.id)
          setLines((prev) => [...prev, event.line].slice(-5000));
        if (event.type === 'logs' && event.serverId === server.id)
          setLines((prev) => [...prev, ...event.lines].slice(-5000));
      }),
    [api, server.id],
  );
  const filtered = lines.filter(
    (l) =>
      (level === 'all' || level === l.level) && l.text.toLowerCase().includes(query.toLowerCase()),
  );
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 26,
    overscan: 15,
  });
  useEffect(() => {
    if (auto && filtered.length) virtual.scrollToIndex(filtered.length - 1, { align: 'end' });
  }, [filtered.length, auto, virtual]);
  const send = () => {
    const cmd = command.trim().replace(/^\//, '');
    if (!cmd) return;
    void run(() => api.command(server.id, cmd), t('commandSent')).then((result) => {
      if (!result.ok) return;
      setHistory((prev) => [cmd, ...prev].slice(0, 100));
      setHistoryIndex(-1);
      setCommand('');
      setLines((prev) =>
        [
          ...prev,
          {
            seq: -Date.now(),
            at: new Date().toISOString(),
            level: 'INFO' as const,
            text: `> ${cmd}\n${result.value}`,
          },
        ].slice(-5000),
      );
    });
  };
  return (
    <section className="panel console-panel">
      <div className="section-heading">
        <h2>{t('consoleTitle')}</h2>
        <Button
          variant="ghost"
          onClick={() => {
            void run(() =>
              navigator.clipboard.writeText(filtered.map((l) => `[${l.at}] ${l.text}`).join('\n')),
            );
          }}
        >
          <Copy size={15} />
          {t('exportLogs')}
        </Button>
      </div>
      {initial.error && (
        <ErrorBox error={initial.error} retry={initial.reload} retryLabel={t('retry')} />
      )}
      <div className="console-toolbar">
        <div className="search-input">
          <Search size={15} />
          <input
            aria-label={t('searchLogs')}
            placeholder={t('searchLogs')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label={t('allLevels')}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="all">{t('allLevels')}</option>
          {['INFO', 'WARN', 'ERROR', 'DEBUG', 'CHAT'].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <Toggle label={t('autoScroll')} checked={auto} onChange={setAuto} />
      </div>
      <div className="console-output" ref={parent} role="log" aria-label={t('console')}>
        <div style={{ height: virtual.getTotalSize(), position: 'relative', minWidth: '100%' }}>
          {virtual.getVirtualItems().map((item) => {
            const line = filtered[item.index]!;
            return (
              <div
                className={`log-line ${line.level}`}
                key={line.seq}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <time>{new Date(line.at).toLocaleTimeString()}</time>
                <span className="log-level">{line.level}</span>
                <span>{line.text.replace(/\n/g, ' · ')}</span>
              </div>
            );
          })}
        </div>
        {!filtered.length && (
          <div className="console-empty">
            <Terminal size={30} />
            <p>{t('consoleEmpty')}</p>
          </div>
        )}
      </div>
      <div className="quick-commands">
        <small>{t('quickCommands')}</small>
        {['list', 'save-all flush', 'time set day', 'weather clear'].map((c) => (
          <button key={c} onClick={() => setCommand(c)}>
            {c}
          </button>
        ))}
      </div>
      <form
        className="command-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Terminal size={18} />
        <input
          aria-label={t('command')}
          placeholder={t('command')}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const index = Math.min(historyIndex + 1, history.length - 1);
              setHistoryIndex(index);
              setCommand(history[index] ?? '');
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const index = Math.max(-1, historyIndex - 1);
              setHistoryIndex(index);
              setCommand(history[index] ?? '');
            }
          }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={busy || server.status !== 'running' || !command.trim()}
        >
          <Send size={15} />
          {t('send')}
        </Button>
      </form>
      <p className="muted small-text">{t('commandHelp')}</p>
    </section>
  );
}
function PlayersView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const online = useData(() => api.players(server.id), [server.id]);
  const [name, setName] = useState('');
  const [action, setAction] = useState('whitelist add');
  const execute = (cmd: string) => {
    void run(() => api.command(server.id, cmd)).then(() => online.reload());
  };
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <h2>
            {t('connectedPlayers')}
            <span className="count">{server.players.length}</span>
          </h2>
          <Button onClick={online.reload}>
            <RefreshCw size={15} />
            {t('refresh')}
          </Button>
        </div>
        {online.error && (
          <ErrorBox error={online.error} retry={online.reload} retryLabel={t('retry')} />
        )}
        {!server.players.length ? (
          <Empty icon={<Users size={30} />} title={t('noPlayers')} subtitle={t('noPlayersSub')} />
        ) : (
          server.players.map((player) => (
            <div className="player-row" key={player}>
              <span className="avatar">{player.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{player}</strong>
                <small className="green">{t('running')}</small>
              </div>
              <div className="actions">
                <Button disabled={busy} onClick={() => execute(`whitelist add ${player}`)}>
                  <ShieldCheck size={14} />
                  {t('whitelist')}
                </Button>
                <Button disabled={busy} onClick={() => execute(`kick ${player}`)}>
                  {t('kick')}
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => execute(`ban ${player}`)}>
                  {t('ban')}
                </Button>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <h2>{t('moderate')}</h2>
        <div className="form-grid">
          <Field label={t('playerName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
          </Field>
          <Field label={t('action')}>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {[
                ['whitelist add', 'whitelistAdd'],
                ['op', 'op'],
                ['deop', 'deop'],
                ['kick', 'kick'],
                ['ban', 'ban'],
              ].map(([cmd, label]) => (
                <option value={cmd} key={cmd}>
                  {t(label as 'op' | 'deop' | 'kick' | 'ban' | 'whitelistAdd')}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button
          variant="primary"
          disabled={busy || server.status !== 'running' || !/^[A-Za-z0-9_]{1,16}$/.test(name)}
          onClick={() => execute(`${action} ${name}`)}
        >
          {t('send')}
        </Button>
      </section>
    </>
  );
}
function WorldView({ server, onSettings }: { server: Server; onSettings: () => void }) {
  const { api, t, run, busy } = useApp();
  const properties = useData(() => api.properties(server.id), [server.id]);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{t('currentWorld')}</h2>
        <Globe2 size={20} />
      </div>
      {properties.error ? (
        <ErrorBox error={properties.error} retry={properties.reload} retryLabel={t('retry')} />
      ) : properties.loading ? (
        <Loading label={t('loading')} />
      ) : (
        <>
          <div className="world-card">
            <span className="world-icon">
              <Globe2 size={40} />
            </span>
            <div>
              <h2>{properties.data?.['level-name'] ?? 'world'}</h2>
              <p>
                {t('seed')} : {properties.data?.['level-seed'] || '—'}
              </p>
              <span className="badge">Minecraft {server.version}</span>
            </div>
          </div>
          <p className="muted">{t('worldHelp')}</p>
          <div className="actions">
            <Button
              variant="primary"
              disabled={busy || server.status === 'starting'}
              onClick={() => {
                void run(() => api.backup(server.id));
              }}
            >
              <Archive size={16} />
              {t('backup')}
            </Button>
            <Button
              onClick={() => {
                void run(() => api.openFolder(server.id));
              }}
            >
              <FolderOpen size={16} />
              {t('openFolder')}
            </Button>
            <Button onClick={onSettings}>{t('settings')}</Button>
          </div>
        </>
      )}
    </section>
  );
}
function FilesView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const [folder, setFolder] = useState('');
  const [editor, setEditor] = useState<{ path: string; content: string }>();
  const [newItem, setNewItem] = useState<'file' | 'folder'>();
  const [name, setName] = useState('');
  const [remove, setRemove] = useState<FileEntry>();
  const entries = useData(() => api.files(server.id, folder), [server.id, folder]);
  const stopped = !server.pid && server.status !== 'installing';
  const child = (name: string) => [folder, name].filter(Boolean).join('/');
  const open = (entry: FileEntry) => {
    if (entry.directory) setFolder(child(entry.name));
    else
      void run(() => api.readFile(server.id, child(entry.name))).then((result) => {
        if (result.ok) setEditor({ path: child(entry.name), content: result.value });
      });
  };
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{t('fileTitle')}</h2>
          <p>{t('fileSub')}</p>
        </div>
        <Button
          onClick={() => {
            void run(() => api.openFolder(server.id));
          }}
        >
          <FolderOpen size={15} />
          {t('openFolder')}
        </Button>
      </div>
      <div className="file-toolbar">
        <div className="file-breadcrumb">
          <Button
            variant="ghost"
            aria-label={t('parent')}
            disabled={!folder}
            onClick={() => setFolder(folder.split('/').slice(0, -1).join('/'))}
          >
            <ArrowLeft size={16} />
          </Button>
          <button onClick={() => setFolder('')}>{t('root')}</button>
          <span>/ {folder}</span>
        </div>
        <div className="actions">
          <Button
            disabled={busy || !stopped}
            onClick={() => {
              void run(() => api.uploadFile(server.id, folder)).then(() => entries.reload());
            }}
          >
            <Upload size={15} />
            {t('upload')}
          </Button>
          <Button
            disabled={!stopped}
            onClick={() => {
              setNewItem('folder');
              setName('');
            }}
          >
            <Folder size={15} />
            {t('newFolder')}
          </Button>
          <Button
            disabled={!stopped}
            onClick={() => {
              setNewItem('file');
              setName('');
            }}
          >
            <Plus size={15} />
            {t('newFile')}
          </Button>
        </div>
      </div>
      {entries.error ? (
        <ErrorBox error={entries.error} retry={entries.reload} retryLabel={t('retry')} />
      ) : entries.loading ? (
        <Loading label={t('loading')} />
      ) : !entries.data?.length ? (
        <Empty icon={<Folder />} title={t('emptyFolder')} />
      ) : (
        <div className="file-list">
          {entries.data.map((entry) => (
            <div className="file-row" key={entry.name}>
              <button onClick={() => open(entry)}>
                {entry.directory ? (
                  <Folder size={18} className="folder-icon" />
                ) : (
                  <FileText size={18} />
                )}
                <span>{entry.name}</span>
              </button>
              <span>{entry.directory ? '—' : bytes(entry.size)}</span>
              <time>{new Date(entry.modified).toLocaleDateString()}</time>
              <div className="actions">
                {!entry.directory && (
                  <Button
                    variant="ghost"
                    aria-label={t('export')}
                    title={t('export')}
                    onClick={() => {
                      void run(() => api.exportFile(server.id, child(entry.name)));
                    }}
                  >
                    <Download size={15} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-label={t('delete')}
                  title={t('delete')}
                  disabled={!stopped || busy}
                  onClick={() => setRemove(entry)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editor && (
        <Dialog title={editor.path} closeLabel={t('close')} onClose={() => setEditor(undefined)}>
          <div className="dialog-body editor-body">
            {!stopped && <p className="warning-text">{t('readOnly')}</p>}
            <textarea
              aria-label={t('fileContent')}
              className="code-editor"
              spellCheck={false}
              readOnly={!stopped || editor.path === 'server.properties'}
              value={editor.content}
              onChange={(e) => setEditor({ ...editor, content: e.target.value })}
            />
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setEditor(undefined)}>{t('close')}</Button>
            <Button
              variant="primary"
              disabled={!stopped || busy || editor.path === 'server.properties'}
              onClick={() => {
                void run(() => api.writeFile(server.id, editor.path, editor.content)).then(
                  (result) => {
                    if (result.ok) {
                      setEditor(undefined);
                      entries.reload();
                    }
                  },
                );
              }}
            >
              {t('save')}
            </Button>
          </footer>
        </Dialog>
      )}
      {newItem && (
        <Dialog
          title={t(newItem === 'file' ? 'newFile' : 'newFolder')}
          closeLabel={t('close')}
          onClose={() => setNewItem(undefined)}
        >
          <div className="dialog-body">
            <Field label={t('filename')}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={newItem === 'file' ? 'notes.txt' : 'config'}
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setNewItem(undefined)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || !name}
              onClick={() => {
                void run(() =>
                  newItem === 'file'
                    ? api.writeFile(server.id, child(name), '')
                    : api.mkdir(server.id, child(name)),
                ).then((r) => {
                  if (r.ok) {
                    setNewItem(undefined);
                    entries.reload();
                  }
                });
              }}
            >
              {t('create')}
            </Button>
          </footer>
        </Dialog>
      )}
      {remove && (
        <Confirm
          name={remove.name}
          help={t('deleteFileHelp')}
          onClose={() => setRemove(undefined)}
          onConfirm={() => {
            void run(() => api.deleteFile(server.id, child(remove.name), remove.name)).then((r) => {
              if (r.ok) {
                setRemove(undefined);
                entries.reload();
              }
            });
          }}
        />
      )}
    </section>
  );
}
function PluginsView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const installed = useData(() => api.content(server.id), [server.id]);
  const projects = useData(
    () => (server.engine === 'paper' ? api.search(server.id, search) : Promise.resolve([])),
    [server.id, search],
  );
  if (server.engine !== 'paper')
    return <Empty icon={<Puzzle size={32} />} title={t('vanillaPlugins')} />;
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{t('marketplaceTitle')}</h2>
            <p>{t('marketplaceSub')}</p>
          </div>
          <Puzzle size={25} />
        </div>
        <form
          className="marketplace-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (query === search) projects.reload();
            else setSearch(query);
          }}
        >
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label={t('searchPlugins')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlugins')}
            />
          </div>
          <Button type="submit" variant="primary">
            {t('search')}
          </Button>
        </form>
        {projects.error ? (
          <ErrorBox error={projects.error} retry={projects.reload} retryLabel={t('retry')} />
        ) : projects.loading ? (
          <Loading label={t('loading')} />
        ) : !projects.data?.length ? (
          <Empty icon={<Search />} title={t('noResults')} />
        ) : (
          <div className="plugin-grid">
            {projects.data.map((project) => (
              <article key={project.id} className="plugin-card">
                <div className="plugin-title">
                  <span className="plugin-icon">
                    <Puzzle size={24} />
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
                    disabled={
                      busy ||
                      !!server.pid ||
                      installed.data?.some((p) => p.projectId === project.id)
                    }
                    onClick={() => {
                      void run(() => api.installContent(server.id, project.id)).then(() =>
                        installed.reload(),
                      );
                    }}
                  >
                    <Download size={14} />
                    {t(
                      installed.data?.some((p) => p.projectId === project.id)
                        ? 'installed'
                        : 'install',
                    )}
                  </Button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>{t('installed')}</h2>
        {installed.error && (
          <ErrorBox error={installed.error} retry={installed.reload} retryLabel={t('retry')} />
        )}
        {!installed.data?.length ? (
          <p className="muted">{t('noContent')}</p>
        ) : (
          installed.data.map((item) => (
            <div className="installed-row" key={item.id}>
              <Puzzle size={20} />
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.filename} · {item.versionId}
                </small>
              </div>
              <span className="badge">{t(item.enabled ? 'enabled' : 'disabled')}</span>
              <Button
                disabled={busy || !!server.pid}
                onClick={() => {
                  void run(() => api.toggleContent(server.id, item.id)).then(() =>
                    installed.reload(),
                  );
                }}
              >
                {t('toggle')}
              </Button>
            </div>
          ))
        )}
      </section>
    </>
  );
}
function AnalyticsView({ serverId }: { serverId: string }) {
  const { api, t } = useApp();
  const [hours, setHours] = useState(1);
  const [live, setLive] = useState<import('../../../../packages/domain/types').Metric[]>([]);
  const metrics = useData(() => api.metrics(serverId, hours), [serverId, hours]);
  useEffect(() => {
    setLive([]);
  }, [hours]);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'metric' && event.serverId === serverId)
          setLive((prev) => [...prev, event.metric].slice(-120));
      }),
    [api, serverId],
  );
  const data = [...(metrics.data ?? []), ...live];
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{t('analytics')}</h2>
          <p>{t('analyticsHelp')}</p>
        </div>
        <select
          aria-label={t('analytics')}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {[
            [1, 'lastHour'],
            [6, 'sixHours'],
            [24, 'day'],
            [168, 'week'],
          ].map(([value, key]) => (
            <option key={value} value={value}>
              {t(key as 'lastHour' | 'sixHours' | 'day' | 'week')}
            </option>
          ))}
        </select>
      </div>
      {metrics.error ? (
        <ErrorBox error={metrics.error} retry={metrics.reload} retryLabel={t('retry')} />
      ) : metrics.loading ? (
        <Loading label={t('loading')} />
      ) : !data.length ? (
        <Empty icon={<Cpu size={32} />} title={t('noMetrics')} />
      ) : (
        <div className="chart-grid">
          <Chart label={t('cpu')} values={data.map((m) => m.cpu)} suffix="%" />
          <Chart
            label={t('memory')}
            values={data.map((m) => m.memory / 1024 ** 3)}
            color="#9ba8dd"
            suffix=" Go"
          />
          <Chart label={t('players')} values={data.map((m) => m.players)} color="#e4b879" />
        </div>
      )}
    </section>
  );
}
