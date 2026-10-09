import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  ArrowRight,
  Check,
  Coffee,
  Download,
  Folder,
  Server as ServerIcon,
  Globe2,
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
import type { ModpackPreview, ModpackSelection } from '../../../../packages/domain/modpacks';
import { AppContext, useApp } from './context';
import { translator } from './i18n';
import { languages } from '../../../../packages/domain/languages';
import { localizeMessage } from '../../../../packages/domain/localization';
import {
  engines,
  engineIds,
  engineDefinition,
  type Edition,
} from '../../../../packages/domain/engines';
import { Dialog, Button, Field, Toggle, Loading, ErrorBox, useData, bytes } from './ui';
import { EngineIcon } from './engine-icon';
import { EngineVersionPicker } from './engine-versions';
import { supportsJavaProperty } from '../../../../packages/domain/property-fields';
import type { Key } from './i18n';

const engineDescriptions: Record<Server['engine'], Key> = {
  vanilla: 'engineVanilla',
  paper: 'enginePaper',
  purpur: 'enginePurpur',
  fabric: 'engineFabric',
  forge: 'engineForge',
  neoforge: 'engineNeoForge',
  bedrock: 'engineBedrock',
  pocketmine: 'enginePocketmine',
};

export function CreateServer({
  onClose,
  onCreated,
  modpack,
}: {
  onClose: () => void;
  onCreated: (server: Server) => void;
  modpack?: { preview: ModpackPreview; selection: ModpackSelection };
}) {
  const { api, t, run, busy, snapshot } = useApp();
  const [step, setStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
    if (step > 0) headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  const diagnostic = useData(() => api.diagnostic(), []);
  const defaultPort = (edition: Edition) => {
    const protocol = edition === 'java' ? 'tcp' : 'udp';
    const reserved = new Set(
      snapshot.servers
        .filter((s) => engineDefinition(s.engine).protocol === protocol)
        .flatMap((s) => [s.port, ...(s.ipv6Port ? [s.ipv6Port] : [])]),
    );
    let port = edition === 'java' ? 25565 : 19132;
    while (
      (reserved.has(port) || (edition === 'bedrock' && reserved.has(port + 1))) &&
      port < (edition === 'bedrock' ? 65534 : 65535)
    )
      port++;
    return port;
  };
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
    name: modpack?.preview.name.slice(0, 60) ?? '',
    engine: modpack?.preview.engine ?? 'paper',
    version: modpack?.preview.minecraft ?? '',
    memoryMin: 1024,
    memoryMax: 4096,
    port: defaultPort('java'),
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
  const selectedVersion = input.version;
  const definition = engineDefinition(input.engine);
  const hasLoader = ['fabric', 'forge', 'neoforge'].includes(input.engine);
  const [catalogReady, setCatalogReady] = useState(false);
  const engineAvailable = (engine: Server['engine']) =>
    engine !== 'bedrock' ||
    !diagnostic.data ||
    (['win32', 'linux'].includes(diagnostic.data.platform) && diagnostic.data.arch === 'x64');
  const [edition, setEdition] = useState<Edition>(definition.edition);
  const loaderVersion = input.loaderVersion;
  const installerVersion = input.installerVersion;
  const update = <K extends keyof typeof input>(key: K, value: (typeof input)[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));
  const steps = [t('engine'), t('resources'), t('configuration'), t('review')];
  const titles: Key[] = [
    'engineStepTitle',
    'resourceStepTitle',
    'configStepTitle',
    'reviewStepTitle',
  ];
  const descriptions: Key[] = [
    'engineStepHelp',
    'resourceStepHelp',
    'configStepHelp',
    'reviewStepHelp',
  ];
  const portConflict = snapshot.servers.some(
    (s) =>
      engineDefinition(s.engine).protocol === definition.protocol &&
      [s.port, s.ipv6Port].some(
        (port) =>
          port === input.port ||
          (definition.protocol === 'udp' && port !== undefined && port === input.ipv6Port),
      ),
  );
  const valid =
    step === 0
      ? input.name.trim().length > 0 &&
        engineAvailable(input.engine) &&
        selectedVersion &&
        catalogReady
      : step === 1
        ? !definition.capabilities.javaMemory ||
          (Number.isInteger(input.memoryMax) &&
            Number.isInteger(input.memoryMin) &&
            input.memoryMax >= Math.max(512, input.memoryMin) &&
            input.memoryMin >= 256 &&
            input.memoryMax <= 131072)
        : step === 2
          ? Number.isInteger(input.port) &&
            input.port >= 1024 &&
            input.port <= 65535 &&
            !portConflict &&
            Number.isInteger(input.maxPlayers) &&
            input.maxPlayers > 0 &&
            input.maxPlayers <= 1000 &&
            (definition.protocol !== 'udp' ||
              (Number.isInteger(input.ipv6Port) &&
                input.ipv6Port! >= 1024 &&
                input.ipv6Port! <= 65535 &&
                input.ipv6Port !== input.port))
          : input.eula;
  return (
    <Dialog
      title={t('newServer')}
      closeLabel={t('close')}
      onClose={onClose}
      className="create-dialog"
    >
      <ol className="wizard-progress" aria-label={t('newServer')}>
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? 'step' : undefined}
            className={step >= i ? 'current' : ''}
          >
            <span>{step > i ? <Check size={12} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div ref={bodyRef} className="dialog-body wizard-body">
        <h2 ref={headingRef} tabIndex={-1}>
          {t(titles[step]!)}
        </h2>
        <p className="muted step-description">{t(descriptions[step]!)}</p>
        {modpack && (
          <p className="info-note">
            {modpack.preview.name} · {modpack.preview.versionId} — {t('modpackPinnedHelp')}
          </p>
        )}
        {step === 0 && (
          <>
            <div className="edition-options" role="group" aria-label={t('edition')}>
              {(['java', 'bedrock'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={!!modpack}
                  aria-pressed={edition === value}
                  onClick={() => {
                    setEdition(value);
                    setInput((previous) => ({
                      ...previous,
                      engine: value === 'java' ? 'paper' : 'bedrock',
                      version: '',
                      build: undefined,
                      loaderVersion: undefined,
                      installerVersion: undefined,
                      port: defaultPort(value),
                      ipv6Port: value === 'bedrock' ? defaultPort(value) + 1 : undefined,
                    }));
                  }}
                >
                  {value === 'java' ? 'Java Edition' : 'Bedrock Edition'}
                </button>
              ))}
            </div>
            <div className="engine-selection-layout">
              <div className="engine-options">
                {engineIds
                  .filter(
                    (id) =>
                      engines[id].edition === edition &&
                      (!modpack || id === modpack.preview.engine),
                  )
                  .map((engine) => (
                    <button
                      key={engine}
                      type="button"
                      disabled={!!modpack || !engineAvailable(engine)}
                      aria-pressed={input.engine === engine}
                      aria-label={engines[engine].displayName}
                      className={`engine-option ${input.engine === engine ? 'selected' : ''}`}
                      onClick={() => {
                        update('engine', engine);
                        update('version', '');
                        update('build', undefined);
                        update('loaderVersion', undefined);
                        update('installerVersion', undefined);
                      }}
                    >
                      <EngineIcon engine={engine} size={38} />
                      <strong>
                        {engines[engine].displayName}
                        {engine === input.engine && <CircleCheck size={17} />}
                      </strong>
                      <p>
                        {t(engineDescriptions[engine])}
                        {!engineAvailable(engine) && <> · {t('unavailable')}</>}
                      </p>
                    </button>
                  ))}
              </div>
              <aside className="engine-information">
                <EngineIcon engine={input.engine} size={42} />
                <h3>{definition.displayName}</h3>
                <p>{t(engineDescriptions[input.engine])}</p>
                <ul>
                  {definition.capabilities.mods && <li>{t('mods')}</li>}
                  {definition.capabilities.plugins && <li>{t('plugins')}</li>}
                  <li>
                    {definition.runtimeType === 'java'
                      ? 'Java'
                      : definition.runtimeType === 'php'
                        ? 'PHP'
                        : 'Bedrock Edition'}
                  </li>
                  <li>{t('backup')}</li>
                </ul>
              </aside>
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
            <EngineVersionPicker
              engine={input.engine}
              value={{
                version: input.version,
                build: input.build,
                loaderVersion: input.loaderVersion,
                installerVersion: input.installerVersion,
              }}
              locked={!!modpack}
              onReady={setCatalogReady}
              onChange={(choice) => setInput((previous) => ({ ...previous, ...choice }))}
            />
          </>
        )}
        {step === 1 && definition.capabilities.javaMemory && (
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
                  {value === 4096 && <small>{t('recommended')}</small>}
                  <strong>
                    {Number(value) / 1024} {t('gigabytes')}
                  </strong>
                </button>
              ))}
            </div>
            <details className="advanced memory-custom">
              <summary>{t('memoryCustom')}</summary>
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
            </details>
            {diagnostic.data && (
              <p className="hint">
                {t('availableRam')} · {bytes(diagnostic.data.freeMemory)}
              </p>
            )}
            {diagnostic.data && input.memoryMax * 1024 ** 2 > diagnostic.data.freeMemory && (
              <p className="warning-text" role="status">
                {t('memoryWarning')}
              </p>
            )}
            <div className="info-note">
              <Coffee size={19} />
              <p>{t('ramHelp')}</p>
            </div>
          </>
        )}
        {step === 1 && !definition.capabilities.javaMemory && (
          <div className="info-note">
            <Download size={20} />
            <p>{t(definition.runtimeType === 'php' ? 'phpHelp' : 'nativeHelp')}</p>
          </div>
        )}
        {step === 2 && (
          <>
            <h3 className="form-section-title">{t('basicSettings')}</h3>
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
              {definition.protocol === 'udp' && (
                <Field label={t('ipv6Port')}>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={input.ipv6Port ?? 19133}
                    onChange={(event) => update('ipv6Port', Number(event.target.value))}
                  />
                </Field>
              )}
            </div>
            <Field label={t('motd')}>
              <input
                value={input.motd}
                maxLength={200}
                onChange={(e) => update('motd', e.target.value)}
              />
            </Field>
            {portConflict && (
              <p className="warning-text" role="alert">
                {t('portInUse')}
              </p>
            )}
            {definition.edition === 'java' && supportsJavaProperty(input.version, 'pvp') && (
              <Toggle label={t('pvp')} checked={input.pvp} onChange={(v) => update('pvp', v)} />
            )}
            <Toggle
              label={t('whitelist')}
              checked={input.whitelist}
              onChange={(v) => update('whitelist', v)}
            />
            <details className="advanced">
              <summary>{t('advanced')}</summary>
              {definition.capabilities.javaMemory && (
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
              )}
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
            <div className="review-engine">
              <EngineIcon engine={input.engine} size={48} />
              <div>
                <strong>{input.name}</strong>
                <p className="muted">
                  {definition.displayName} · {selectedVersion}
                </p>
              </div>
            </div>
            <div className="installation-summary">
              <div>
                <span>{t('runtimeLabel')}</span>
                <strong>
                  {definition.runtimeType === 'java'
                    ? modpack
                      ? `Java ${modpack.preview.java}`
                      : 'Java'
                    : definition.runtimeType === 'php'
                      ? 'PHP ZTS'
                      : t('none')}
                  {definition.runtimeType !== 'native' && ` · ${t('runtimeAutomatic')}`}
                </strong>
              </div>
              {hasLoader && (
                <div>
                  <span>{t('loaderVersion')}</span>
                  <strong>{loaderVersion}</strong>
                </div>
              )}
              {installerVersion && (
                <div>
                  <span>{t('installerVersion')}</span>
                  <strong>{installerVersion}</strong>
                </div>
              )}
              {input.build && (
                <div>
                  <span>{t('version')}</span>
                  <strong>{input.build}</strong>
                </div>
              )}
              <div>
                <span>{t('includedContent')}</span>
                <strong>
                  {modpack
                    ? `${modpack.preview.name} · ${modpack.preview.files.filter((file) => file.side === 'required' || modpack.selection.optionalFiles.includes(file.path)).length} ${t('files').toLowerCase()}`
                    : t('noExtraContent')}
                </strong>
              </div>
              <div>
                <span>{t('name')}</span>
                <strong>{input.name}</strong>
              </div>
              <div>
                <span>{t('engine')}</span>
                <strong>
                  {definition.displayName} · {selectedVersion}
                </strong>
              </div>
              <div>
                <span>{t('resources')}</span>
                <strong>
                  {definition.capabilities.javaMemory
                    ? `${input.memoryMax / 1024} ${t('gigabytes')} RAM`
                    : definition.runtimeType === 'php'
                      ? 'PHP'
                      : 'Native'}
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
                <strong>
                  {input.port} {definition.protocol.toUpperCase()}
                  {definition.protocol === 'udp' && ` · IPv6 ${input.ipv6Port}`}
                </strong>
              </div>
            </div>
            {!input.onlineMode && <p className="warning-text">{t('onlineWarning')}</p>}
            {input.engine === 'pocketmine' && (
              <p className="warning-text">{t('pocketmineSupport')}</p>
            )}
            {definition.runtimeType === 'java' && (
              <div className="install-check">
                <Check size={16} />
                {t('automaticJava')}
              </div>
            )}
            {definition.capabilities.rcon && (
              <div className="install-check">
                <ShieldCheck size={16} />
                {t('automaticRcon')}
              </div>
            )}
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
              const request = {
                ...input,
                version: selectedVersion,
                loaderVersion,
                installerVersion,
                eula: true as const,
              };
              void run(() =>
                modpack ? api.createModpack(modpack.selection, request) : api.create(request),
              ).then((result) => {
                if (result.ok) onCreated(result.value);
              });
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
          <p className="setup-progress">{step + 1} / 4</p>
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
