import { useEffect, useState } from 'react';
import { Search, Save, RotateCcw, ShieldCheck } from 'lucide-react';
import type { Server } from '../../../../packages/domain/types';
import {
  javaPropertyFields,
  propertyFields,
  validatePropertyChanges,
  type PropertyCategory,
} from '../../../../packages/domain/property-fields';
import { useApp } from './context';
import { Button, Field, Toggle, useData, ErrorBox, Loading, Dialog } from './ui';
import type { Key } from './i18n';
const categories: PropertyCategory[] = [
  'general',
  'gameplay',
  'world',
  'network',
  'resources',
  'resourcepacks',
  'advanced',
];
const labels: Record<string, Key> = {
  gamemode: 'gamemode',
  difficulty: 'difficulty',
  motd: 'motd',
  'max-players': 'maxPlayers',
  hardcore: 'hardcore',
  pvp: 'pvp',
  'white-list': 'whitelist',
  'allow-list': 'whitelist',
  'online-mode': 'onlineMode',
  'level-name': 'levelName',
  'level-seed': 'seed',
  'view-distance': 'viewDistance',
  'simulation-distance': 'simulationDistance',
  'spawn-protection': 'spawnProtection',
  'generate-structures': 'generateStructures',
  'enable-command-block': 'commandBlocks',
  'server-port': 'port',
};
export function PropertiesEditor({ server }: { server: Server }) {
  const { api, t, run, busy, registerUnsaved } = useApp();
  const data = useData(() => api.propertiesDocument(server.id), [server.id]);
  const [values, setValues] = useState<Record<string, string>>({}),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState<PropertyCategory>('general'),
    [review, setReview] = useState(false),
    [riskAccepted, setRiskAccepted] = useState(false);
  useEffect(() => {
    if (data.data) setValues(data.data.values);
  }, [data.data]);
  const initial = data.data?.values ?? {},
    fields = propertyFields(server, initial),
    changes = Object.fromEntries(Object.entries(values).filter(([k, v]) => initial[k] !== v)),
    dirty = Object.keys(changes).length > 0;
  const stopped = !server.pid && ['stopped', 'crashed'].includes(server.status);
  const risks = [...new Set(fields.filter((f) => f.key in changes && f.risk).map((f) => f.risk!))];
  const update = (key: string, value: string | undefined) => {
    setValues((v) => {
      const next = { ...v };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
    setRiskAccepted(false);
  };
  const label = (key: string) => t(labels[key] ?? (('property.' + key) as Key));
  const visible = fields.filter((f) =>
    search
      ? (label(f.key) + ' ' + f.key + ' ' + t(('property.help.' + f.category) as Key))
          .toLowerCase()
          .includes(search.toLowerCase())
      : f.category === category,
  );
  const unknown = Object.keys(initial).filter(
    (key) =>
      !fields.some((f) => f.key === key) &&
      (!javaPropertyFields.some((f) => f.key === key) ||
        ['bedrock', 'pocketmine'].includes(server.engine)) &&
      !/^rcon\.|password|secret|token|credential/i.test(key),
  );
  useEffect(
    () => registerUnsaved('properties:' + server.id, dirty),
    [registerUnsaved, server.id, dirty],
  );
  let invalid = false;
  try {
    validatePropertyChanges(server, initial, changes);
  } catch {
    invalid = true;
  }
  const save = () =>
    void run(() => api.saveProperties(server.id, changes, data.data!.sha256)).then((r) => {
      if (r.ok) {
        setReview(false);
        data.reload();
      }
    });
  return (
    <section className="properties-editor panel">
      <header className="section-heading">
        <div>
          <h2>{t('serverSettings')}</h2>
          <p>{t('property.editorHelp')}</p>
        </div>
        <div className="actions">
          <Button disabled={!dirty || busy} onClick={() => setValues({ ...initial })}>
            <RotateCcw size={15} />
            {t('property.discard')}
          </Button>
          <Button
            variant="primary"
            disabled={!dirty || invalid || busy || !stopped || data.loading || !!data.error}
            onClick={() => {
              setReview(true);
              setRiskAccepted(false);
            }}
          >
            <Save size={15} />
            {t('property.reviewSave')}
          </Button>
        </div>
      </header>
      {!stopped && <p className="warning-text">{t('property.stopFirst')}</p>}
      {dirty && (
        <p className="property-dirty" role="status">
          {t('property.unsaved')} · {Object.keys(changes).length}
        </p>
      )}
      {invalid && (
        <p className="warning-text" role="alert">
          {t('property.invalid')}
        </p>
      )}
      <Field label={t('property.search')}>
        <div className="search">
          <Search size={17} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Field>
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} retryLabel={t('retry')} />
      ) : data.loading ? (
        <Loading label={t('loading')} />
      ) : (
        <div className="properties-layout">
          <nav className="properties-categories" aria-label={t('serverSettings')}>
            {categories.map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={category === c && !search}
                className={category === c && !search ? 'selected' : ''}
                onClick={() => {
                  setCategory(c);
                  setSearch('');
                }}
              >
                {t(c as Key)}
                <span>
                  {fields.filter((f) => f.category === c).length +
                    (c === 'advanced' ? unknown.length : 0)}
                </span>
              </button>
            ))}
          </nav>
          <div className="property-controls">
            {visible.map((field) => (
              <div className="property-row" key={field.key}>
                <div>
                  <label htmlFor={'property-' + field.key}>{label(field.key)}</label>
                  <code>{field.key}</code>
                  <p className="hint">{t(('property.help.' + field.category) as Key)}</p>
                  {field.risk && (
                    <p className="warning-text">{t(('property.risk.' + field.risk) as Key)}</p>
                  )}
                  {!(field.key in initial) && <p className="hint">{t('property.inherited')}</p>}
                </div>
                {field.type === 'boolean' && !(field.key in initial) ? (
                  <select
                    id={'property-' + field.key}
                    aria-label={label(field.key)}
                    disabled={!stopped}
                    value={values[field.key] ?? ''}
                    onChange={(e) => update(field.key, e.target.value || undefined)}
                  >
                    <option value="">{t('property.inherited')}</option>
                    <option value="true">{t('enabled')}</option>
                    <option value="false">{t('disabled')}</option>
                  </select>
                ) : field.type === 'boolean' ? (
                  <Toggle
                    label={label(field.key)}
                    checked={values[field.key] === 'true'}
                    disabled={!stopped}
                    onChange={(v) => update(field.key, String(v))}
                  />
                ) : field.type === 'mode' || field.type === 'difficulty' ? (
                  <select
                    id={'property-' + field.key}
                    aria-label={label(field.key)}
                    disabled={!stopped}
                    value={values[field.key] ?? ''}
                    onChange={(e) => update(field.key, e.target.value)}
                  >
                    <option value="" disabled>
                      {t('property.inherited')}
                    </option>
                    {(field.type === 'mode'
                      ? [
                          'survival',
                          'creative',
                          'adventure',
                          ...(server.engine === 'bedrock' || server.engine === 'pocketmine'
                            ? []
                            : ['spectator']),
                        ]
                      : ['peaceful', 'easy', 'normal', 'hard']
                    ).map((v, i) => (
                      <option value={/^\d$/.test(initial[field.key] ?? '') ? String(i) : v} key={v}>
                        {t(v as Key)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={'property-' + field.key}
                    aria-label={label(field.key)}
                    disabled={!stopped}
                    type={field.type}
                    min={field.min}
                    max={field.max}
                    value={values[field.key] ?? ''}
                    placeholder={t('property.inherited')}
                    onChange={(e) => update(field.key, e.target.value)}
                  />
                )}
              </div>
            ))}
            {(category === 'advanced' || search) &&
              unknown
                .filter((key) =>
                  (key + ' ' + values[key]).toLowerCase().includes(search.toLowerCase()),
                )
                .map((key) => (
                  <Field key={key} label={key} hint={t('property.unknown')}>
                    <input
                      disabled={!stopped}
                      value={values[key] ?? ''}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </Field>
                ))}
            {category === 'network' && !search && (
              <p className="info-note">
                <ShieldCheck size={17} />
                {t('property.secretHelp')}
              </p>
            )}
            {category === 'resourcepacks' && !search && (
              <p className="info-note">{t('property.packHelp')}</p>
            )}
            {!visible.length && category !== 'advanced' && (
              <p className="muted">{t('property.noFields')}</p>
            )}
          </div>
        </div>
      )}
      {review && (
        <Dialog
          title={t('property.reviewSave')}
          closeLabel={t('close')}
          onClose={() => setReview(false)}
        >
          <div className="dialog-body">
            <p>{t('property.saveHelp')}</p>
            <div className="property-diff">
              {Object.entries(changes).map(([key, value]) => (
                <div key={key}>
                  <code>{key}</code>
                  <del>{initial[key] ?? t('property.inherited')}</del>
                  <ins>{value || '""'}</ins>
                </div>
              ))}
            </div>
            {risks.map((risk) => (
              <p key={risk} className="warning-text">
                {t(('property.risk.' + risk) as Key)}
              </p>
            ))}
            {!!risks.length && (
              <Toggle
                label={t('property.acceptRisks')}
                checked={riskAccepted}
                onChange={setRiskAccepted}
              />
            )}
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setReview(false)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || !dirty || (!!risks.length && !riskAccepted)}
              onClick={save}
            >
              {t('save')}
            </Button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
