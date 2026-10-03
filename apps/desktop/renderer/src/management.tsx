import { useEffect, useState } from 'react';
import {
  Archive,
  Download,
  ShieldCheck,
  RotateCcw,
  Trash2,
  Plus,
  Clock,
  Activity,
  Folder,
  Coffee,
  Settings2,
  Check,
  Save,
  Globe2,
} from 'lucide-react';
import type { Server, Settings, Backup, ScheduleInput } from '../../../../packages/domain/types';
import { PRODUCT } from '../../../../packages/domain/types';
import { useApp } from './context';
import type { Key } from './i18n';
import { Button, Field, Toggle, Dialog, Empty, ErrorBox, Loading, useData, bytes } from './ui';
export function Confirm({
  name,
  help,
  onClose,
  onConfirm,
}: {
  name: string;
  help: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t, busy } = useApp();
  const [value, setValue] = useState('');
  return (
    <Dialog title={t('confirmTitle')} closeLabel={t('close')} onClose={onClose}>
      <div className="dialog-body">
        <p className="muted">{help}</p>
        <p>{t('confirmHelp')}</p>
        <code className="confirm-name">{name}</code>
        <Field label={t('name')}>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
      <footer className="dialog-footer">
        <Button disabled={busy} onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button variant="danger" disabled={value !== name || busy} onClick={onConfirm}>
          {t('next')}
        </Button>
      </footer>
    </Dialog>
  );
}
export function BackupsView({ serverId }: { serverId?: string }) {
  const { api, t, snapshot, run, busy } = useApp();
  const [selected, setSelected] = useState(serverId ?? snapshot.servers[0]?.id ?? '');
  const [confirmation, setConfirmation] = useState<{
    item: Backup;
    action: 'restore' | 'delete';
  }>();
  const backups = snapshot.backups.filter((b) => !serverId || b.serverId === serverId);
  const create = () => {
    if (selected) void run(() => api.backup(selected));
  };
  const name = confirmation
    ? confirmation.action === 'restore'
      ? (snapshot.servers.find((s) => s.id === confirmation.item.serverId)?.name ?? '')
      : confirmation.item.name
    : '';
  return (
    <>
      <div className="section-heading page-section-heading">
        <div>
          <h2>{t('backupTitle')}</h2>
          <p>{t('backupSub')}</p>
        </div>
        <div className="actions">
          {!serverId && snapshot.servers.length > 0 && (
            <select
              aria-label={t('servers')}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {snapshot.servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <Button variant="primary" disabled={busy || !selected} onClick={create}>
            <Plus size={16} />
            {t('backup')}
          </Button>
        </div>
      </div>
      <section className="panel">
        {!backups.length ? (
          <Empty icon={<Archive size={32} />} title={t('noBackups')} />
        ) : (
          <div className="backup-list">
            {backups.map((item) => {
              const server = snapshot.servers.find((s) => s.id === item.serverId);
              return (
                <article className="backup-row" key={item.id}>
                  <span className="backup-icon">
                    <Archive size={21} />
                  </span>
                  <div className="backup-info">
                    <strong>{item.name}</strong>
                    <small>
                      {new Date(item.createdAt).toLocaleString(snapshot.settings.language)}{' '}
                      <span>·</span> Minecraft {item.version} <span>·</span> {bytes(item.size)}
                    </small>
                    <span className="badge">
                      {t(
                        (
                          {
                            manual: 'manual',
                            scheduled: 'scheduled',
                            before_restore: 'before_restore',
                            before_settings: 'before_settings',
                            before_content: 'before_content',
                            before_file_delete: 'before_file_delete',
                          } as Record<string, Key>
                        )[item.reason] ?? 'manual',
                      )}
                    </span>
                  </div>
                  <div className="actions">
                    <Button
                      title={t('verify')}
                      aria-label={t('verify')}
                      disabled={busy}
                      onClick={() => {
                        void run(async () => {
                          if (!(await api.verifyBackup(item.id)))
                            throw new Error(t('integrityFailed'));
                        }, t('integrityOk'));
                      }}
                    >
                      <ShieldCheck size={15} />
                    </Button>
                    <Button
                      title={t('export')}
                      aria-label={t('export')}
                      disabled={busy}
                      onClick={() => {
                        void run(() => api.exportBackup(item.id));
                      }}
                    >
                      <Download size={15} />
                    </Button>
                    <Button
                      disabled={busy || !!server?.pid || server?.status === 'installing'}
                      onClick={() => setConfirmation({ item, action: 'restore' })}
                    >
                      <RotateCcw size={14} />
                      {t('restore')}
                    </Button>
                    <Button
                      variant="ghost"
                      title={t('delete')}
                      aria-label={t('delete')}
                      disabled={busy}
                      onClick={() => setConfirmation({ item, action: 'delete' })}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {confirmation && (
        <Confirm
          name={name}
          help={confirmation.action === 'restore' ? t('restoreHelp') : t('confirmHelp')}
          onClose={() => setConfirmation(undefined)}
          onConfirm={() => {
            void run(() =>
              confirmation.action === 'restore'
                ? api.restore(confirmation.item.id, name)
                : api.deleteBackup(confirmation.item.id, name),
            ).then((r) => {
              if (r.ok) setConfirmation(undefined);
            });
          }}
        />
      )}
    </>
  );
}
export function SchedulesView({ serverId }: { serverId: string }) {
  const { api, t, snapshot, run, busy } = useApp();
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<ScheduleInput['action']>('backup');
  const [minutes, setMinutes] = useState(360);
  const [command, setCommand] = useState('');
  const jobs = snapshot.schedules.filter((s) => s.serverId === serverId);
  const actionLabel = (value: string): string =>
    t(
      value === 'command'
        ? 'command'
        : value === 'backup'
          ? 'backup'
          : (value as 'restart' | 'start' | 'stop'),
    );
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{t('scheduleTitle')}</h2>
            <p>{t('scheduleSub')}</p>
          </div>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            {t('addSchedule')}
          </Button>
        </div>
        <p className="muted small-text">{t('restartWarning')}</p>
        {!jobs.length ? (
          <Empty icon={<Clock size={30} />} title={t('noSchedules')} />
        ) : (
          jobs.map((job) => (
            <div className="schedule-row" key={job.id}>
              <span className="schedule-icon">
                <Clock size={19} />
              </span>
              <div>
                <strong>
                  {actionLabel(job.action)} · {job.intervalMinutes} min
                </strong>
                <small>
                  {t('nextRun')} :{' '}
                  {new Date(job.nextRun).toLocaleString(snapshot.settings.language)}
                </small>
                {job.lastError && <span className="warning-text">{job.lastError}</span>}
              </div>
              <Button
                variant="ghost"
                aria-label={t('delete')}
                title={t('delete')}
                disabled={busy}
                onClick={() => {
                  void run(() => api.deleteSchedule(job.id));
                }}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))
        )}
      </section>
      {adding && (
        <Dialog title={t('addSchedule')} closeLabel={t('close')} onClose={() => setAdding(false)}>
          <div className="dialog-body">
            <Field label={t('action')}>
              <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
                {['backup', 'restart', 'start', 'stop', 'command'].map((value) => (
                  <option key={value} value={value}>
                    {actionLabel(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('interval')}>
              <input
                type="number"
                min={5}
                max={525600}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </Field>
            {action === 'command' && (
              <Field label={t('command')}>
                <input value={command} onChange={(e) => setCommand(e.target.value)} />
              </Field>
            )}
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setAdding(false)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || minutes < 5 || (action === 'command' && !command.trim())}
              onClick={() => {
                void run(() =>
                  api.schedules({
                    serverId,
                    action,
                    intervalMinutes: minutes,
                    command,
                    enabled: true,
                  }),
                ).then((result) => {
                  if (result.ok) setAdding(false);
                });
              }}
            >
              {t('save')}
            </Button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
const properties: {
  key: string;
  label: Key;
  section: Key;
  type: 'number' | 'text' | 'boolean' | 'mode' | 'difficulty';
  min?: number;
  max?: number;
}[] = [
  { key: 'gamemode', label: 'gamemode', section: 'gameplay', type: 'mode' },
  { key: 'difficulty', label: 'difficulty', section: 'gameplay', type: 'difficulty' },
  { key: 'pvp', label: 'pvp', section: 'gameplay', type: 'boolean' },
  { key: 'hardcore', label: 'hardcore', section: 'gameplay', type: 'boolean' },
  { key: 'enable-command-block', label: 'commandBlocks', section: 'gameplay', type: 'boolean' },
  {
    key: 'max-players',
    label: 'maxPlayers',
    section: 'players',
    type: 'number',
    min: 1,
    max: 1000,
  },
  { key: 'white-list', label: 'whitelist', section: 'players', type: 'boolean' },
  { key: 'level-name', label: 'levelName', section: 'world', type: 'text' },
  { key: 'level-seed', label: 'seed', section: 'world', type: 'text' },
  { key: 'generate-structures', label: 'generateStructures', section: 'world', type: 'boolean' },
  {
    key: 'view-distance',
    label: 'viewDistance',
    section: 'resources',
    type: 'number',
    min: 2,
    max: 32,
  },
  {
    key: 'simulation-distance',
    label: 'simulationDistance',
    section: 'resources',
    type: 'number',
    min: 2,
    max: 32,
  },
  { key: 'server-port', label: 'port', section: 'network', type: 'number', min: 1024, max: 65535 },
  { key: 'online-mode', label: 'onlineMode', section: 'network', type: 'boolean' },
  { key: 'motd', label: 'motd', section: 'general', type: 'text' },
  {
    key: 'spawn-protection',
    label: 'spawnProtection',
    section: 'general',
    type: 'number',
    min: 0,
    max: 1000,
  },
];
export function PropertiesView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const data = useData(() => api.properties(server.id), [server.id]);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data.data) setValues(data.data);
  }, [data.data]);
  const update = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const stopped = !server.pid && server.status !== 'installing';
  return (
    <>
      <div className="section-heading page-section-heading">
        <div>
          <h2>{t('serverSettings')}</h2>
          <p>{t('propertiesHelp')}</p>
        </div>
        <Button
          variant="primary"
          disabled={busy || !stopped || data.loading || !!data.error}
          onClick={() => {
            void run(() => api.saveProperties(server.id, values)).then((r) => {
              if (r.ok) data.reload();
            });
          }}
        >
          <Save size={15} />
          {t('save')}
        </Button>
      </div>
      <ServerOptionsView server={server} />
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} retryLabel={t('retry')} />
      ) : data.loading ? (
        <Loading label={t('loading')} />
      ) : (
        <div className="properties-grid">
          {(['general', 'gameplay', 'players', 'world', 'resources', 'network'] as Key[]).map(
            (section) => (
              <section className="panel" key={section}>
                <h2>{t(section)}</h2>
                {properties
                  .filter((p) => p.section === section)
                  .map((prop) =>
                    prop.type === 'boolean' ? (
                      <Toggle
                        key={prop.key}
                        label={t(prop.label)}
                        disabled={!stopped}
                        checked={values[prop.key] === 'true'}
                        onChange={(v) => update(prop.key, String(v))}
                      />
                    ) : (
                      <Field
                        key={prop.key}
                        label={t(prop.label)}
                        hint={prop.type === 'text' ? prop.key : undefined}
                      >
                        {prop.type === 'mode' || prop.type === 'difficulty' ? (
                          <select
                            disabled={!stopped}
                            value={values[prop.key] ?? ''}
                            onChange={(e) => update(prop.key, e.target.value)}
                          >
                            {(prop.type === 'mode'
                              ? ['survival', 'creative', 'adventure', 'spectator']
                              : ['peaceful', 'easy', 'normal', 'hard']
                            ).map((v) => (
                              <option key={v} value={v}>
                                {t(v as Key)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            disabled={!stopped}
                            type={prop.type}
                            min={prop.min}
                            max={prop.max}
                            value={values[prop.key] ?? ''}
                            onChange={(e) => update(prop.key, e.target.value)}
                          />
                        )}
                      </Field>
                    ),
                  )}
              </section>
            ),
          )}
          <section className="panel full-row">
            <details className="advanced">
              <summary>{t('advanced')}</summary>
              <div className="form-grid">
                {Object.entries(values)
                  .filter(
                    ([key]) =>
                      !properties.some((p) => p.key === key) &&
                      !key.startsWith('rcon.') &&
                      key !== 'enable-rcon',
                  )
                  .map(([key, value]) => (
                    <Field key={key} label={key}>
                      <input
                        disabled={!stopped}
                        value={value}
                        onChange={(e) => update(key, e.target.value)}
                      />
                    </Field>
                  ))}
              </div>
            </details>
          </section>
        </div>
      )}
    </>
  );
}
function ServerOptionsView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp();
  const [options, setOptions] = useState({
    memoryMin: server.memoryMin,
    memoryMax: server.memoryMax,
    autoStart: server.autoStart,
    autoRestart: server.autoRestart,
    javaPath: server.javaPath,
  });
  const runtimes = useData(() => api.runtimes(), [server.id]);
  const stopped = !server.pid && server.status !== 'installing';
  return (
    <section className="panel">
      <h2>
        {t('resources')} · Java {server.javaMajor}
      </h2>
      <div className="form-grid">
        <Field label={`${t('memoryMin')} (Mo)`}>
          <input
            type="number"
            min={256}
            step={256}
            disabled={!stopped}
            value={options.memoryMin}
            onChange={(e) => setOptions((prev) => ({ ...prev, memoryMin: Number(e.target.value) }))}
          />
        </Field>
        <Field label={`${t('memoryMax')} (Mo)`}>
          <input
            type="number"
            min={512}
            step={256}
            disabled={!stopped}
            value={options.memoryMax}
            onChange={(e) => setOptions((prev) => ({ ...prev, memoryMax: Number(e.target.value) }))}
          />
        </Field>
      </div>
      <Field label={t('runtimes')}>
        <select
          disabled={!stopped}
          value={options.javaPath}
          onChange={(e) => setOptions((prev) => ({ ...prev, javaPath: e.target.value }))}
        >
          <option value={server.javaPath}>{server.javaPath || t('notInstalled')}</option>
          {runtimes.data
            ?.filter(
              (runtime) => runtime.major === server.javaMajor && runtime.path !== server.javaPath,
            )
            .map((runtime) => (
              <option key={runtime.path} value={runtime.path}>
                {runtime.path}
              </option>
            ))}
        </select>
      </Field>
      <Toggle
        disabled={!stopped}
        label={t('autoStart')}
        checked={options.autoStart}
        onChange={(value) => setOptions((prev) => ({ ...prev, autoStart: value }))}
      />
      <Toggle
        disabled={!stopped}
        label={t('autoRestart')}
        checked={options.autoRestart}
        onChange={(value) => setOptions((prev) => ({ ...prev, autoRestart: value }))}
      />
      <p className="muted small-text">{t('ramHelp')}</p>
      <Button
        disabled={busy || !stopped || !options.javaPath}
        onClick={() => {
          void run(() => api.configureServer(server.id, options));
        }}
      >
        <Save size={15} />
        {t('saveServerOptions')}
      </Button>
    </section>
  );
}
export function ActivityView() {
  const { snapshot, t } = useApp();
  const [query, setQuery] = useState('');
  const items = snapshot.activity.filter((a) =>
    `${a.detail} ${a.action}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            {t('activity')}
          </div>
          <h1>{t('activityTitle')}</h1>
          <p>{t('activitySub')}</p>
        </div>
      </div>
      <section className="panel">
        <Field label={t('search')}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        {!items.length ? (
          <Empty icon={<Activity size={28} />} title={t('noActivity')} />
        ) : (
          items.map((item) => (
            <div className="activity-row" key={item.id}>
              <span className={`activity-icon ${item.success ? '' : 'failed'}`}>
                <Activity size={16} />
              </span>
              <div>
                <strong>{item.detail}</strong>
                <small>
                  {item.action}
                  {item.serverId &&
                    ` · ${snapshot.servers.find((s) => s.id === item.serverId)?.name ?? item.serverId}`}
                </small>
              </div>
              <time>{new Date(item.at).toLocaleString(snapshot.settings.language)}</time>
            </div>
          ))
        )}
      </section>
    </>
  );
}
export function SettingsView() {
  const { api, t, snapshot, run, busy } = useApp();
  const [settings, setSettings] = useState<Settings>(snapshot.settings);
  const runtimes = useData(() => api.runtimes(), []);
  useEffect(() => setSettings(snapshot.settings), [snapshot.settings]);
  const folder = (key: 'serverRoot' | 'backupRoot') => {
    void run(() => api.selectFolder()).then((result) => {
      if (result.ok && result.value) setSettings((prev) => ({ ...prev, [key]: result.value! }));
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            {t('settings')}
          </div>
          <h1>{t('settings')}</h1>
          <p>{t('localFirst')}</p>
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            void run(() => api.settings(settings));
          }}
        >
          <Check size={16} />
          {t('save')}
        </Button>
      </div>
      <div className="settings-layout">
        <div>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('general')}</h2>
              <Settings2 size={19} />
            </div>
            <div className="form-grid">
              <Field label={t('language')}>
                <select
                  value={settings.language}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, language: e.target.value as Settings['language'] }))
                  }
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label={t('theme')}>
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, theme: e.target.value as Settings['theme'] }))
                  }
                >
                  {(['system', 'dark', 'light'] as const).map((v) => (
                    <option value={v} key={v}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Toggle
              label={t('preventSleep')}
              checked={settings.preventSleep}
              onChange={(v) => setSettings((s) => ({ ...s, preventSleep: v }))}
            />
            <p className="muted small-text">{t('preventSleepHelp')}</p>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('folders')}</h2>
              <Folder size={19} />
            </div>
            {(['serverRoot', 'backupRoot'] as const).map((key) => (
              <Field key={key} label={t(key === 'serverRoot' ? 'serverFolder' : 'backupFolder')}>
                <div className="input-button">
                  <input readOnly value={settings[key]} />
                  <Button onClick={() => folder(key)}>{t('choose')}</Button>
                </div>
              </Field>
            ))}
            <p className="muted small-text">{t('folderHelp')}</p>
            <Button
              onClick={() => {
                void run(() => api.openFolder());
              }}
            >
              <Folder size={15} />
              {t('openFolder')}
            </Button>
          </section>
        </div>
        <div>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('runtimes')}</h2>
              <Coffee size={20} />
            </div>
            <p className="muted small-text">{t('runtimeHelp')}</p>
            {runtimes.error && (
              <ErrorBox error={runtimes.error} retry={runtimes.reload} retryLabel={t('retry')} />
            )}
            {[8, 11, 17, 21, 25].map((major) => {
              const installed = runtimes.data?.filter((r) => r.major === major);
              return (
                <div className="runtime-row" key={major}>
                  <span className="runtime-icon">
                    <Coffee size={20} />
                  </span>
                  <div>
                    <strong>Java {major}</strong>
                    <small>
                      {installed?.length
                        ? t(
                            installed.some((r) => r.source === 'managed')
                              ? 'managed'
                              : 'systemRuntime',
                          )
                        : t('notInstalled')}
                    </small>
                  </div>
                  {installed?.length ? (
                    <ShieldCheck size={18} className="green" />
                  ) : (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        void run(() => api.installRuntime(major)).then(() => runtimes.reload());
                      }}
                    >
                      <Download size={14} />
                      {t('install')}
                    </Button>
                  )}
                </div>
              );
            })}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('about')}</h2>
              <Globe2 size={19} />
            </div>
            <p>
              <strong>{PRODUCT.name}</strong> · v{PRODUCT.version}
            </p>
            <p className="muted">{t('license')}</p>
            <p className="muted small-text">{t('credits')}</p>
            <p className="muted small-text">{t('updatesNote')}</p>
          </section>
        </div>
      </div>
    </>
  );
}
