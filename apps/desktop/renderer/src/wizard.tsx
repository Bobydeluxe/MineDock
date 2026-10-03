import { useState, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  Coffee,
  Download,
  Folder,
  Globe2,
  Layers,
  Server as ServerIcon,
  ShieldCheck,
  Sparkles,
  ChevronLeft,
  CircleCheck,
} from 'lucide-react';
import type {
  CreateServerInput,
  Server,
  Settings,
  Progress,
} from '../../../../packages/domain/types';
import { AppContext, useApp } from './context';
import { translator } from './i18n';
import { languages } from '../../../../packages/domain/languages';
import { localizeMessage } from '../../../../packages/domain/localization';
import { Dialog, Button, Field, Toggle, Loading, ErrorBox, useData, bytes } from './ui';

export function CreateServer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (server: Server) => void;
}) {
  const { api, t, run, busy, snapshot } = useApp();
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<Progress[]>([]);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'progress')
          setProgress((previous) =>
            [...previous.filter((p) => p.id !== event.progress.id), event.progress].slice(-6),
          );
      }),
    [api],
  );
  const [input, setInput] = useState<Omit<CreateServerInput, 'eula'> & { eula: boolean }>({
    name: '',
    engine: 'paper',
    version: '',
    memoryMin: 1024,
    memoryMax: 4096,
    port: Math.max(25565, ...snapshot.servers.map((s) => s.port + 1)),
    difficulty: 'normal',
    gamemode: 'survival',
    maxPlayers: 20,
    viewDistance: 10,
    simulationDistance: 8,
    pvp: true,
    whitelist: false,
    onlineMode: true,
    seed: '',
    motd: 'A MineDock server',
    autoStart: false,
    autoRestart: false,
    eula: false,
  });
  const versions = useData(() => api.versions(input.engine), [input.engine]);
  const selectedVersion = input.version || versions.data?.[0] || '';
  const update = <K extends keyof typeof input>(key: K, value: (typeof input)[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));
  const steps = [t('engine'), t('resources'), t('configuration'), t('ready')];
  const valid =
    step === 0
      ? input.name.trim().length > 0 && selectedVersion && !versions.loading
      : step === 1
        ? input.memoryMax >= input.memoryMin && input.memoryMin >= 256
        : step === 2
          ? input.port >= 1024 && input.port <= 65535 && input.maxPlayers > 0
          : input.eula;
  return (
    <Dialog title={t('newServer')} closeLabel={t('close')} onClose={onClose}>
      <div className="wizard-progress">
        {steps.map((label, i) => (
          <div key={label} className={step >= i ? 'current' : ''}>
            <span>{step > i ? <Check size={12} /> : i + 1}</span>
            {label}
          </div>
        ))}
      </div>
      <div className="dialog-body wizard-body">
        <h2>{t('createTitle')}</h2>
        <p className="muted">{t('createSub')}</p>
        {step === 0 && (
          <>
            <div className="engine-options">
              {(['paper', 'vanilla'] as const).map((engine) => (
                <button
                  key={engine}
                  type="button"
                  className={`engine-option ${input.engine === engine ? 'selected' : ''}`}
                  onClick={() => {
                    update('engine', engine);
                    update('version', '');
                  }}
                >
                  <span className="engine-icon">
                    {engine === 'paper' ? <Layers size={25} /> : <ServerIcon size={25} />}
                  </span>
                  <strong>
                    {engine === 'paper' ? 'Paper' : 'Vanilla'}
                    {engine === input.engine && <CircleCheck size={17} />}
                  </strong>
                  <p>{t(engine === 'paper' ? 'paperHelp' : 'vanillaHelp')}</p>
                </button>
              ))}
            </div>
            <Field label={t('name')}>
              <input
                autoFocus
                value={input.name}
                maxLength={60}
                placeholder={t('namePlaceholder')}
                onChange={(e) => update('name', e.target.value)}
              />
            </Field>
            {versions.error ? (
              <ErrorBox error={versions.error} retry={versions.reload} retryLabel={t('retry')} />
            ) : versions.loading ? (
              <Loading label={t('loading')} />
            ) : (
              <Field label={t('minecraftVersion')} hint={t('stableOnly')}>
                <select value={selectedVersion} onChange={(e) => update('version', e.target.value)}>
                  {versions.data?.map((v, i) => (
                    <option key={v} value={v}>
                      {v}
                      {i === 0 ? ` · ${t('latest')}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <div className="preset-grid">
              {[
                ['small', 2048],
                ['standard', 4096],
                ['powerful', 8192],
              ].map(([label, value]) => (
                <button
                  className={input.memoryMax === value ? 'selected' : ''}
                  type="button"
                  key={label}
                  onClick={() => {
                    update('memoryMax', Number(value));
                    update('memoryMin', Math.min(1024, Number(value)));
                  }}
                >
                  <MemoryIcon />
                  {t(label as 'small' | 'standard' | 'powerful')}
                  <strong>
                    {Number(value) / 1024} {t('gigabytes')}
                  </strong>
                </button>
              ))}
            </div>
            <div className="form-grid">
              <Field label={`${t('memoryMin')} (${t('megabytes')})`}>
                <input
                  type="number"
                  min={256}
                  max={131072}
                  step={256}
                  value={input.memoryMin}
                  onChange={(e) => update('memoryMin', Number(e.target.value))}
                />
              </Field>
              <Field label={`${t('memoryMax')} (${t('megabytes')})`}>
                <input
                  type="number"
                  min={512}
                  max={131072}
                  step={256}
                  value={input.memoryMax}
                  onChange={(e) => update('memoryMax', Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="info-note">
              <Coffee size={19} />
              <p>{t('ramHelp')}</p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="form-grid">
              <Field label={t('difficulty')}>
                <select
                  value={input.difficulty}
                  onChange={(e) => update('difficulty', e.target.value as typeof input.difficulty)}
                >
                  {(['peaceful', 'easy', 'normal', 'hard'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('gamemode')}>
                <select
                  value={input.gamemode}
                  onChange={(e) => update('gamemode', e.target.value as typeof input.gamemode)}
                >
                  {(['survival', 'creative', 'adventure', 'spectator'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('maxPlayers')}>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={input.maxPlayers}
                  onChange={(e) => update('maxPlayers', Number(e.target.value))}
                />
              </Field>
              <Field label={t('port')}>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={input.port}
                  onChange={(e) => update('port', Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label={t('motd')}>
              <input
                value={input.motd}
                maxLength={200}
                onChange={(e) => update('motd', e.target.value)}
              />
            </Field>
            <Toggle label={t('pvp')} checked={input.pvp} onChange={(v) => update('pvp', v)} />
            <Toggle
              label={t('whitelist')}
              checked={input.whitelist}
              onChange={(v) => update('whitelist', v)}
            />
            <details className="advanced">
              <summary>{t('advanced')}</summary>
              <div className="form-grid">
                <Field label={t('viewDistance')}>
                  <input
                    type="number"
                    min={2}
                    max={32}
                    value={input.viewDistance}
                    onChange={(e) => update('viewDistance', Number(e.target.value))}
                  />
                </Field>
                <Field label={t('simulationDistance')}>
                  <input
                    type="number"
                    min={2}
                    max={32}
                    value={input.simulationDistance}
                    onChange={(e) => update('simulationDistance', Number(e.target.value))}
                  />
                </Field>
              </div>
              <Field label={t('seed')}>
                <input value={input.seed} onChange={(e) => update('seed', e.target.value)} />
              </Field>
              <Toggle
                label={t('onlineMode')}
                checked={input.onlineMode}
                onChange={(v) => update('onlineMode', v)}
              />
              {!input.onlineMode && <p className="warning-text">{t('onlineWarning')}</p>}
              <Toggle
                label={t('autoStart')}
                checked={input.autoStart}
                onChange={(v) => update('autoStart', v)}
              />
              <Toggle
                label={t('autoRestart')}
                checked={input.autoRestart}
                onChange={(v) => update('autoRestart', v)}
              />
            </details>
          </>
        )}
        {step === 3 && (
          <>
            <div className="installation-summary">
              <div>
                <span>{t('name')}</span>
                <strong>{input.name}</strong>
              </div>
              <div>
                <span>{t('engine')}</span>
                <strong>
                  {input.engine === 'paper' ? 'Paper' : 'Vanilla'} · {selectedVersion}
                </strong>
              </div>
              <div>
                <span>{t('resources')}</span>
                <strong>
                  {input.memoryMax / 1024} {t('gigabytes')} RAM
                </strong>
              </div>
              <div>
                <span>{t('gameplay')}</span>
                <strong>
                  {t(input.gamemode)} · {t(input.difficulty)}
                </strong>
              </div>
              <div>
                <span>{t('port')}</span>
                <strong>{input.port}</strong>
              </div>
            </div>
            <div className="install-check">
              <Check size={16} />
              {t('automaticJava')}
            </div>
            <div className="install-check">
              <ShieldCheck size={16} />
              {t('automaticRcon')}
            </div>
            <p className="muted small-text">{t('installHelp')}</p>
            <label className="eula-check">
              <input
                type="checkbox"
                checked={input.eula}
                onChange={(e) => update('eula', e.target.checked)}
              />
              {t('eulaAccept')}
            </label>
            <a
              className="text-link"
              href="https://www.minecraft.net/eula"
              target="_blank"
              rel="noreferrer"
            >
              {t('eulaRead')} ↗
            </a>
            {progress.length > 0 && (
              <div className="inline-downloads">
                {progress.map((item) => (
                  <div key={item.id}>
                    <header>
                      <strong>{item.label}</strong>
                      <span>
                        {item.done
                          ? item.error
                            ? '✕'
                            : '✓'
                          : item.total
                            ? Math.round((item.received / item.total) * 100) + ' %'
                            : '…'}
                      </span>
                      {!item.done && (
                        <Button
                          variant="ghost"
                          disabled={!busy}
                          onClick={() => {
                            void api.cancelDownload(item.id);
                          }}
                        >
                          {t('cancel')}
                        </Button>
                      )}
                    </header>
                    <progress max={item.total || 1} value={item.received} />
                    <small>
                      {(item.error && localizeMessage(item.error, snapshot.settings.language)) ||
                        `${bytes(item.received)} / ${item.total ? bytes(item.total) : '…'} · ${bytes(item.speed)}/s`}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <footer className="dialog-footer">
        <Button onClick={step === 0 ? onClose : () => setStep(step - 1)} disabled={busy}>
          <ChevronLeft size={16} />
          {t(step === 0 ? 'cancel' : 'previous')}
        </Button>
        {step < 3 ? (
          <Button variant="primary" disabled={!valid || busy} onClick={() => setStep(step + 1)}>
            {t('next')}
            <ArrowRight size={16} />
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!valid || busy}
            onClick={() => {
              void run(() => api.create({ ...input, version: selectedVersion, eula: true })).then(
                (result) => {
                  if (result.ok) onCreated(result.value);
                },
              );
            }}
          >
            <Download size={16} />
            {t(busy ? 'creating' : 'create')}
          </Button>
        )}
      </footer>
    </Dialog>
  );
}
function MemoryIcon() {
  return <Sparkles size={17} />;
}
export function Onboarding() {
  const context = useApp();
  const { api, snapshot, run, busy } = context;
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings>(snapshot.settings);
  const t = translator(settings.language);
  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);
  const diagnostic = useData(() => api.diagnostic(), []);
  const titles = ['setupLanguage', 'setupDiagnostic', 'setupFolders', 'setupFinish'] as const;
  const folder = async (key: 'serverRoot' | 'backupRoot') => {
    const result = await run(() => api.selectFolder());
    if (result.ok && result.value) setSettings((s) => ({ ...s, [key]: result.value! }));
  };
  return (
    <AppContext value={{ ...context, snapshot: { ...snapshot, settings }, t }}>
      <Dialog title={t('setupTitle')} closeLabel={t('close')}>
        <div className="dialog-body onboarding">
          <div className="setup-icon">
            {step === 0 ? (
              <Globe2 size={30} />
            ) : step === 1 ? (
              <ServerIcon size={30} />
            ) : step === 2 ? (
              <Folder size={30} />
            ) : (
              <ShieldCheck size={30} />
            )}
          </div>
          <small className="eyebrow">{step + 1} / 4</small>
          <h2>{t(titles[step]!)}</h2>
          <p className="muted">{t('setupSub')}</p>
          {step === 0 && (
            <div className="language-options">
              {languages.map(({ code, name }) => (
                <Button
                  key={code}
                  lang={code}
                  aria-pressed={settings.language === code}
                  variant={settings.language === code ? 'primary' : 'default'}
                  onClick={() => setSettings((s) => ({ ...s, language: code }))}
                >
                  {name}
                </Button>
              ))}
            </div>
          )}
          {step === 1 &&
            (diagnostic.error ? (
              <ErrorBox
                error={diagnostic.error}
                retry={diagnostic.reload}
                retryLabel={t('retry')}
              />
            ) : !diagnostic.data ? (
              <Loading label={t('loading')} />
            ) : (
              <>
                <div className="diagnostic-grid">
                  {[
                    [t('operatingSystem'), diagnostic.data.platform],
                    [t('architecture'), diagnostic.data.arch],
                    [t('availableRam'), bytes(diagnostic.data.freeMemory)],
                    [t('availableDisk'), bytes(diagnostic.data.freeDisk)],
                    [
                      t('detectedJava'),
                      diagnostic.data.java.map((j) => `Java ${j.major}`).join(', ') || t('absent'),
                    ],
                    [t('dockerOptional'), t(diagnostic.data.docker ? 'available' : 'absent')],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="info-note">
                  <Coffee size={19} />
                  <p>{t('javaAutoHelp')}</p>
                </div>
              </>
            ))}
          {step === 2 && (
            <>
              {(['serverRoot', 'backupRoot'] as const).map((key) => (
                <Field key={key} label={t(key === 'serverRoot' ? 'serverFolder' : 'backupFolder')}>
                  <div className="input-button">
                    <input readOnly value={settings[key]} />
                    <Button
                      onClick={() => {
                        void folder(key);
                      }}
                    >
                      <Folder size={15} />
                      {t('choose')}
                    </Button>
                  </div>
                </Field>
              ))}
              <Field label={t('theme')}>
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, theme: e.target.value as Settings['theme'] }))
                  }
                >
                  {(['system', 'dark', 'light'] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {step === 3 && (
            <>
              <div className="info-note">
                <ShieldCheck size={20} />
                <p>{t('setupPrivacy')}</p>
              </div>
              <p className="muted">{t('localAdmin')}</p>
            </>
          )}
        </div>
        <footer className="dialog-footer">
          <Button disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
            {t('previous')}
          </Button>
          {step < 3 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              {t('next')}
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                void run(() => api.settings({ ...settings, onboarded: true }));
              }}
            >
              {t('setupStart')}
              <ArrowRight size={16} />
            </Button>
          )}
        </footer>
      </Dialog>
    </AppContext>
  );
}
