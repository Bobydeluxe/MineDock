import { useEffect, useRef, useState } from 'react';
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
  Settings2,
  Check,
  Save,
  Globe2,
} from 'lucide-react';
import type { Server, Settings, Backup, ScheduleInput } from '../../../../packages/domain/types';
import { PRODUCT } from '../../../../packages/domain/types';
import { languages } from '../../../../packages/domain/languages';
import { localizeMessage } from '../../../../packages/domain/localization';
import { describeCron } from '../../../../packages/domain/cron-description';
import { engineDefinition } from '../../../../packages/domain/engines';
import { useApp } from './context';
import { activityLabel, type Key } from './i18n';
import { Button, Field, Toggle, Dialog, Empty, ErrorBox, useData, bytes } from './ui';
import { RuntimeControls } from './runtime-controls';
import { RecoveryDialog } from './recovery';
import { RetentionControls } from './retention';
import { UpdateControls } from './updates';
import { SnapshotControls } from './snapshots';
import { PropertiesEditor } from './properties-editor';
import { ProfileControls } from './profile';
import { PackageControls } from './packages';
import { NotificationSettings } from './health';
const scheduleDate = (at: string, language: string, timeZone: string) => {
  try {
    return new Date(at).toLocaleString(language, { timeZone });
  } catch {
    return new Date(at).toISOString();
  }
};
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
  const [trigger, setTrigger] = useState('all'),
    [format, setFormat] = useState('all');
  const backups = snapshot.backups.filter(
    (b) =>
      (!serverId || b.serverId === serverId) &&
      (trigger === 'all' || (trigger === 'manual' ? b.reason === 'manual' : b.reason !== 'manual')),
  );
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
      <div className="backup-filters">
        <div role="group" aria-label={t('backup')} className="console-category-tabs">
          {(['all', 'manual', 'automatic'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={trigger === v}
              className={trigger === v ? 'selected' : ''}
              onClick={() => setTrigger(v)}
            >
              {t(v === 'all' ? 'allLevels' : v === 'manual' ? 'manual' : 'backup.automatic')}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t('backup.format')} className="console-category-tabs">
          {(['all', 'full', 'incremental'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={format === v}
              className={format === v ? 'selected' : ''}
              onClick={() => setFormat(v)}
            >
              {t(v === 'all' ? 'allLevels' : v === 'full' ? 'backup.full' : 'snapshot.title')}
            </button>
          ))}
        </div>
      </div>
      {format !== 'incremental' && (
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
                      <span className="badge">{t('backup.full')}</span>
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
                          )[item.reason] ?? 'backup.automatic',
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
      )}
      {format !== 'full' &&
        trigger !== 'automatic' &&
        snapshot.servers.find((s) => s.id === selected) && (
          <SnapshotControls server={snapshot.servers.find((s) => s.id === selected)!} />
        )}
      {selected && <RetentionControls key={selected} serverId={selected} />}
      <PackageControls server={snapshot.servers.find((s) => s.id === selected)} />
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
  const [mode, setMode] = useState<'interval' | 'daily' | 'cron'>('interval');
  const [time, setTime] = useState('03:00');
  const [cron, setCron] = useState('0 4 * * *');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [warningTimes, setWarningTimes] = useState('600,300,60,30,10');
  const [warningMessage, setWarningMessage] = useState(
    '[MineDock] Restarting in {seconds} seconds.',
  );
  const input: ScheduleInput = {
    serverId,
    action,
    intervalMinutes: minutes,
    command,
    enabled: true,
    mode,
    time,
    cron,
    timezone,
    warnings: warningTimes
      .split(',')
      .filter((value) => value.trim())
      .map(Number),
    warningMessage,
  };
  const preview = useData(
    () => (adding ? api.schedulePreview(input) : Promise.resolve([])),
    [adding, mode, time, cron, timezone, minutes, action, command],
  );
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
                  {actionLabel(job.action)} ·{' '}
                  {job.mode === 'daily'
                    ? `${t('daily')} ${job.time}`
                    : job.mode === 'cron'
                      ? describeCron(job.cron ?? '', snapshot.settings.language)
                      : `${job.intervalMinutes} min`}
                </strong>
                <small>
                  {t('nextRun')} :{' '}
                  {scheduleDate(job.nextRun, snapshot.settings.language, job.timezone ?? timezone)}
                  {job.mode !== 'interval' && ` · ${job.timezone ?? timezone}`}
                </small>
                {job.lastError && (
                  <span className="warning-text">
                    {localizeMessage(job.lastError, snapshot.settings.language)}
                  </span>
                )}
              </div>
              <span className="badge">{t(job.enabled ? 'enabled' : 'disabled')}</span>
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() => api.toggleSchedule(job.id, !job.enabled));
                }}
              >
                {t(job.enabled ? 'pause' : 'resume')}
              </Button>
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
            <Field label={t('scheduleMode')}>
              <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="interval">{t('interval')}</option>
                <option value="daily">{t('daily')}</option>
                <option value="cron">{t('advanced')} · Cron</option>
              </select>
            </Field>
            {mode === 'interval' && (
              <Field label={t('interval')}>
                <input
                  type="number"
                  min={5}
                  max={525600}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </Field>
            )}
            {mode === 'daily' && (
              <Field label={t('dailyTime')}>
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </Field>
            )}
            {mode === 'cron' && (
              <Field
                label={t('cronExpression')}
                hint={describeCron(cron, snapshot.settings.language)}
              >
                <input value={cron} onChange={(event) => setCron(event.target.value)} />
              </Field>
            )}
            {mode !== 'interval' && (
              <Field label={t('timezone')}>
                <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
              </Field>
            )}
            {action === 'command' && (
              <Field label={t('command')}>
                <input value={command} onChange={(e) => setCommand(e.target.value)} />
              </Field>
            )}
            {action === 'restart' && (
              <details className="advanced">
                <summary>{t('advanced')}</summary>
                <Field label={t('restartWarnings')}>
                  <input
                    value={warningTimes}
                    onChange={(event) => setWarningTimes(event.target.value)}
                  />
                </Field>
                <Field label={t('warningMessage')}>
                  <input
                    value={warningMessage}
                    onChange={(event) => setWarningMessage(event.target.value)}
                  />
                </Field>
              </details>
            )}
            {preview.error ? (
              <ErrorBox error={preview.error} />
            ) : (
              <div className="details-list">
                <h3>{t('upcomingRuns')}</h3>
                {preview.data?.map((at) => (
                  <p key={at}>{scheduleDate(at, snapshot.settings.language, timezone)}</p>
                ))}
              </div>
            )}
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setAdding(false)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                minutes < 5 ||
                preview.loading ||
                !!preview.error ||
                (action === 'command' && !command.trim())
              }
              onClick={() => {
                void run(() => api.schedules(input)).then((result) => {
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
function RecoveryControls() {
  const { snapshot, t, api, run, busy } = useApp();
  const [review, setReview] = useState<string>();
  const active =
    snapshot.operations?.filter((operation) =>
      ['pending', 'downloading', 'verifying', 'extracting', 'applying', 'attention'].includes(
        operation.status,
      ),
    ) ?? [];
  return (
    <>
      <details className="panel recovery-controls">
        <summary>
          {t('settings.recovery')}
          {active.length > 0 && ` (${active.length})`}
        </summary>
        {active.length ? (
          active.map((operation) => (
            <div className="activity-row" key={operation.id}>
              <div>
                <strong>{operation.label}</strong>
                <small>
                  {new Date(operation.updatedAt).toLocaleString(snapshot.settings.language)} ·{' '}
                  {snapshot.servers.find((server) => server.id === operation.serverId)?.name}
                </small>
                {operation.error && (
                  <p className="warning-text">
                    {localizeMessage(operation.error, snapshot.settings.language)}
                  </p>
                )}
              </div>
              <span className="badge">{t(('operation.' + operation.status) as Key)}</span>
              {['pending', 'downloading', 'verifying', 'extracting', 'applying'].includes(
                operation.status,
              ) && (
                <Button
                  onClick={() => {
                    void api.cancelOperation(operation.id);
                  }}
                >
                  {t('cancel')}
                </Button>
              )}
              {operation.status === 'attention' && !operation.recoverable && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void run(() => api.dismissOperation(operation.id));
                  }}
                >
                  {t('acknowledge')}
                </Button>
              )}
              {operation.status === 'attention' && operation.recoverable && (
                <Button disabled={busy} onClick={() => setReview(operation.id)}>
                  {t('reviewRecovery')}
                </Button>
              )}
              {operation.preservedCopies?.map((copy) => (
                <small key={copy}>{copy}</small>
              ))}
            </div>
          ))
        ) : (
          <p className="muted">{t('settings.noRecovery')}</p>
        )}
      </details>
      {review && <RecoveryDialog id={review} onClose={() => setReview(undefined)} />}
    </>
  );
}
export function PropertiesView({ server }: { server: Server }) {
  return (
    <>
      <ProfileControls server={server} />
      <PropertiesEditor server={server} />
      <ServerOptionsView server={server} />
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
        {t('resources')}{' '}
        {engineDefinition(server.engine).runtimeType === 'java' && `· Java ${server.javaMajor}`}
      </h2>
      {engineDefinition(server.engine).capabilities.javaMemory && (
        <>
          <div className="form-grid">
            <Field label={`${t('memoryMin')} (${t('megabytes')})`}>
              <input
                type="number"
                min={256}
                step={256}
                disabled={!stopped}
                value={options.memoryMin}
                onChange={(e) =>
                  setOptions((prev) => ({ ...prev, memoryMin: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label={`${t('memoryMax')} (${t('megabytes')})`}>
              <input
                type="number"
                min={512}
                step={256}
                disabled={!stopped}
                value={options.memoryMax}
                onChange={(e) =>
                  setOptions((prev) => ({ ...prev, memoryMax: Number(e.target.value) }))
                }
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
                  (runtime) =>
                    runtime.major === server.javaMajor && runtime.path !== server.javaPath,
                )
                .map((runtime) => (
                  <option key={runtime.path} value={runtime.path}>
                    {runtime.path}
                  </option>
                ))}
            </select>
          </Field>
        </>
      )}
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
      {engineDefinition(server.engine).capabilities.javaMemory && (
        <p className="muted small-text">{t('ramHelp')}</p>
      )}
      <Button
        disabled={
          busy ||
          !stopped ||
          (engineDefinition(server.engine).runtimeType === 'java' && !options.javaPath)
        }
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
function HistoryControls() {
  const { snapshot, t } = useApp();
  const [query, setQuery] = useState('');
  const items = snapshot.activity.filter((a) =>
    `${localizeMessage(a.detail, snapshot.settings.language)} ${activityLabel(a.action, snapshot.settings.language)} ${a.action}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <details className="panel history-controls">
      <summary>{t('settings.history')}</summary>
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
              <strong>{localizeMessage(item.detail, snapshot.settings.language)}</strong>
              <small>
                {activityLabel(item.action, snapshot.settings.language)}
                {item.serverId &&
                  ` · ${snapshot.servers.find((s) => s.id === item.serverId)?.name ?? item.serverId}`}
              </small>
            </div>
            <time>{new Date(item.at).toLocaleString(snapshot.settings.language)}</time>
          </div>
        ))
      )}
    </details>
  );
}
export function SettingsView() {
  const { api, t, snapshot, run, busy } = useApp();
  const [settings, setSettings] = useState<Settings>(snapshot.settings);
  const persistedSettings = useRef(snapshot.settings);
  const marketplace = useData(() => api.marketplaceSettings(), []);
  const [historyLimit, setHistoryLimit] = useState(5);
  useEffect(() => {
    if (marketplace.data) setHistoryLimit(marketplace.data.historyLimit);
  }, [marketplace.data]);
  useEffect(() => {
    // An unrelated snapshot refresh must not erase an unsaved preference edit.
    const unchanged = (Object.keys(snapshot.settings) as (keyof Settings)[]).every(
      (key) => persistedSettings.current[key] === snapshot.settings[key],
    );
    if (unchanged) return;
    persistedSettings.current = snapshot.settings;
    setSettings(snapshot.settings);
  }, [snapshot.settings]);
  const folder = (key: 'serverRoot' | 'backupRoot') => {
    void run(() => api.selectFolder()).then((result) => {
      if (result.ok && result.value) setSettings((prev) => ({ ...prev, [key]: result.value! }));
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t('settings')}</h1>
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
                  {languages.map(({ code, name }) => (
                    <option value={code} key={code}>
                      {name}
                    </option>
                  ))}
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
          <NotificationSettings />
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
          <details className="panel optional-panel">
            <summary>{t('marketplaceSettings')}</summary>
            {marketplace.error && (
              <ErrorBox
                error={marketplace.error}
                retry={marketplace.reload}
                retryLabel={t('retry')}
              />
            )}
            <Field label={t('contentHistoryLimit')}>
              <input
                type="number"
                min={1}
                max={20}
                value={historyLimit}
                onChange={(event) => setHistoryLimit(Number(event.target.value))}
              />
            </Field>
            <p className="muted small-text">{t('contentHistoryLimitHelp')}</p>
            <div className="button-group">
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() => api.clearIconCache());
                }}
              >
                {t('clearIconCache')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() =>
                    api.configureMarketplace({
                      historyLimit,
                    }),
                  ).then((result) => {
                    if (result.ok) {
                      marketplace.reload();
                    }
                  });
                }}
              >
                {t('saveMarketplace')}
              </Button>
            </div>
          </details>
        </div>
        <div>
          <RuntimeControls />
          <UpdateControls />
          <RecoveryControls />
          <HistoryControls />
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
