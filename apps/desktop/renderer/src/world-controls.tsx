import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from './context';
import { Button, Field, useData, ErrorBox } from './ui';
import { ResultList, useAdminText } from './administration-ui';
import type { Key } from './i18n';
import type { Server } from '../../../../packages/domain/types';
import {
  worldControlSchema,
  type WorldControl,
  type CommandResult,
} from '../../../../packages/domain/administration';
import { buildWorldCommands } from '../../../../packages/domain/admin-commands';
export function WorldControls({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp(),
    a = useAdminText();
  const [query, setQuery] = useState(false),
    [time, setTime] = useState(''),
    [customTime, setCustomTime] = useState(''),
    [weather, setWeather] = useState(''),
    [duration, setDuration] = useState(''),
    [difficulty, setDifficulty] = useState(''),
    [results, setResults] = useState<CommandResult[]>([]);
  const [ruleSearch, setRuleSearch] = useState(''),
    [category, setCategory] = useState(''),
    [draftRules, setDraftRules] = useState<Record<string, string>>({});
  const data = useData(
    () => api.worldControls(server.id, query),
    [server.id, server.status, query],
  );
  const active = server.status === 'running',
    actions = data.data?.actions ?? [];
  const prepared: WorldControl[] = [];
  if (time) {
    const value = time === 'custom' ? Number(customTime || NaN) : time;
    const parsed = worldControlSchema.safeParse({ action: 'time', value });
    if (parsed.success) prepared.push(parsed.data);
  }
  if (weather) {
    const parsed = worldControlSchema.safeParse({
      action: 'weather',
      value: weather,
      ...(duration ? { seconds: Number(duration) } : {}),
    });
    if (parsed.success) prepared.push(parsed.data);
  }
  if (difficulty) {
    const parsed = worldControlSchema.safeParse({ action: 'difficulty', value: difficulty });
    if (parsed.success) prepared.push(parsed.data);
  }
  const segment = (
    value: string,
    selected: string,
    update: (v: string) => void,
    keys: string[],
  ) => (
    <div className="world-segments">
      {keys.map((key) => (
        <button
          type="button"
          key={key}
          aria-pressed={selected === key}
          className={selected === key ? 'selected' : ''}
          disabled={!active || !actions.includes(value as WorldControl['action']) || busy}
          onClick={() => update(key)}
        >
          {a(key)}
        </button>
      ))}
    </div>
  );
  const send = async (inputs: WorldControl[]) => {
    const result: CommandResult[] = [];
    for (const input of inputs) {
      const replies = await api.applyWorldControl(server.id, input);
      result.push(...replies);
      if (replies.some((r) => r.state === 'failed')) break;
    }
    return result;
  };
  return (
    <section className="panel world-controls">
      <div className="section-heading">
        <div>
          <h2>{a('worldControls')}</h2>
          <p>{a('worldControlsHelp')}</p>
        </div>
        <Button
          disabled={busy || !active}
          onClick={() => {
            setQuery(true);
            data.reload();
          }}
        >
          <RefreshCw size={15} />
          {a('readCurrentValues')}
        </Button>
      </div>
      {data.error && <ErrorBox error={data.error} />}
      {!active && <p className="hint">{a('startServer')}</p>}
      <p className="hint">
        {a('currentValues')}:{' '}
        {data.data?.time !== undefined ? `${a('worldTime')} ${data.data.time}` : a('unavailable')}
        {data.data?.difficulty && ' · ' + t(data.data.difficulty as Key)}
        {data.data?.at && ' · ' + new Date(data.data.at).toLocaleTimeString()}
      </p>
      <div className="world-primary-controls">
        <section>
          <h3>{a('worldTime')}</h3>
          {segment('time', time, setTime, ['day', 'noon', 'night', 'midnight'])}
          <details>
            <summary>{a('customTime')}</summary>
            <Field label={a('ticks')}>
              <input
                type="number"
                min={0}
                max={2147483647}
                value={customTime}
                onChange={(e) => {
                  setCustomTime(e.target.value);
                  setTime('custom');
                }}
              />
            </Field>
          </details>
        </section>
        <section>
          <h3>{a('weather')}</h3>
          {segment(
            'weather',
            weather,
            setWeather,
            ['clearWeather', 'rain', 'thunder'].map((v) => (v === 'clearWeather' ? 'clear' : v)),
          )}
          <details>
            <summary>{a('weatherDuration')}</summary>
            <Field label={a('durationSeconds')}>
              <input
                type="number"
                min={1}
                max={1000000}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
          </details>
        </section>
        <fieldset className="world-difficulty">
          <legend>{t('difficulty')}</legend>
          {['peaceful', 'easy', 'normal', 'hard'].map((value) => (
            <label key={value}>
              <input
                type="radio"
                name={'world-difficulty-' + server.id}
                value={value}
                checked={difficulty === value}
                disabled={!active || busy}
                onChange={() => setDifficulty(value)}
              />
              {t(value as Key)}
            </label>
          ))}
        </fieldset>
      </div>
      {prepared.length > 0 && (
        <>
          <h3>{a('preparedCommands')}</h3>
          <pre className="command-preview">
            {prepared.flatMap((input) => buildWorldCommands(server, input)).join('\n')}
          </pre>
        </>
      )}
      <Button
        variant="primary"
        disabled={
          busy ||
          !active ||
          !prepared.length ||
          prepared.length !== [time, weather, difficulty].filter(Boolean).length
        }
        onClick={() => {
          void run(() => send(prepared)).then((r) => {
            if (r.ok) {
              setResults(r.value);
              setQuery(false);
              data.reload();
            }
          });
        }}
      >
        {a('applyChanges')}
      </Button>
      <ResultList results={results} />
      <details className="gamerule-controls">
        <summary>{a('gameRules')}</summary>
        <p className="hint">{a('gameRulesHelp')}</p>
        <div className="form-grid">
          <Field label={a('searchGameRules')}>
            <input value={ruleSearch} onChange={(e) => setRuleSearch(e.target.value)} />
          </Field>
          <Field label={a('category')}>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{a('allCategories')}</option>
              {['players', 'world', 'mobs', 'messages'].map((v) => (
                <option key={v} value={v}>
                  {a('category.' + v)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!data.data?.rules.length && <p>{a('rulesUnavailable')}</p>}
        {data.data?.rules
          .filter(
            (r) =>
              (!category || r.category === category) &&
              (r.id + ' ' + a('rule.' + r.key) + ' ' + a('ruleHelp.' + r.key))
                .toLowerCase()
                .includes(ruleSearch.toLowerCase()),
          )
          .map((rule) => (
            <article className="gamerule-row" key={rule.id}>
              <div>
                <strong>{a('rule.' + rule.key)}</strong>
                <p>{a('ruleHelp.' + rule.key)}</p>
                <code>{rule.id}</code>
                <p className="muted">
                  {a('currentValue')}:{' '}
                  {rule.value !== undefined ? String(rule.value) : a('unavailable')}
                </p>
              </div>
              <Field label={a('newValue')}>
                {rule.type === 'boolean' ? (
                  <select
                    value={draftRules[rule.id] ?? ''}
                    disabled={busy || !active}
                    onChange={(e) => setDraftRules({ ...draftRules, [rule.id]: e.target.value })}
                  >
                    <option value="">{a('chooseValue')}</option>
                    <option value="true">{a('enabled')}</option>
                    <option value="false">{a('disabled')}</option>
                  </select>
                ) : (
                  <input
                    type="number"
                    min={rule.min}
                    max={rule.max}
                    value={draftRules[rule.id] ?? ''}
                    disabled={busy || !active}
                    onChange={(e) => setDraftRules({ ...draftRules, [rule.id]: e.target.value })}
                  />
                )}
              </Field>
              <Button
                disabled={busy || !active || !draftRules[rule.id]}
                onClick={() => {
                  const input = {
                    action: 'gamerule' as const,
                    id: rule.id,
                    value:
                      rule.type === 'boolean'
                        ? draftRules[rule.id] === 'true'
                        : Number(draftRules[rule.id]),
                  };
                  void run(() => api.applyWorldControl(server.id, input)).then((r) => {
                    if (r.ok) {
                      setResults(r.value);
                      setQuery(false);
                      data.reload();
                    }
                  });
                }}
              >
                {a('applyChange')}
              </Button>
            </article>
          ))}
      </details>
      <WorldCommandForm server={server} actions={actions} />
      <details className="advanced-world-controls">
        <summary>{a('advancedWorldControls')}</summary>
        <p className="warning-text">{a('advancedWorldWarning')}</p>
        <WorldCommandForm server={server} actions={actions} advanced />
      </details>
    </section>
  );
}
function WorldCommandForm({
  server,
  actions,
  advanced = false,
}: {
  server: Server;
  actions: WorldControl['action'][];
  advanced?: boolean;
}) {
  const { api, t, run, busy } = useApp(),
    a = useAdminText();
  const options = actions.filter((v) =>
    (advanced
      ? ['summon', 'setblock', 'team', 'scoreboard', 'tick', 'reload']
      : ['announce', 'save', 'list', 'seed', 'worldborder', 'worldspawn', 'locate']
    ).includes(v),
  );
  const [action, setAction] = useState<WorldControl['action']>(advanced ? 'summon' : 'announce'),
    [text, setText] = useState(''),
    [id, setId] = useState(''),
    [x, setX] = useState(''),
    [y, setY] = useState(''),
    [z, setZ] = useState(''),
    [dimension, setDimension] = useState(''),
    [diameter, setDiameter] = useState(''),
    [kind, setKind] = useState('structure'),
    [mode, setMode] = useState('replace'),
    [player, setPlayer] = useState(''),
    [value, setValue] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [results, setResults] = useState<CommandResult[]>([]);
  const selected = options.includes(action) ? action : options[0];
  if (!selected) return null;
  const coordinates = {
    x: x ? Number(x) : NaN,
    y: y ? Number(y) : NaN,
    z: z ? Number(z) : NaN,
    ...(dimension ? { dimension } : {}),
  };
  const candidate = (() => {
    switch (selected) {
      case 'announce':
        return { action: selected, text };
      case 'worldborder':
        return {
          action: selected,
          diameter: Number(diameter || NaN),
          ...(x || z ? { center: { x: Number(x || NaN), z: Number(z || NaN) } } : {}),
        };
      case 'worldspawn':
        return { action: selected, coordinates };
      case 'locate':
        return { action: selected, kind, id };
      case 'summon':
        return { action: selected, id, coordinates };
      case 'setblock':
        return { action: selected, id, coordinates, mode };
      case 'tick':
        return { action: selected, mode, ...(mode === 'rate' ? { rate: Number(value) } : {}) };
      case 'team':
        return { action: selected, mode, team: id, ...(player ? { player } : {}) };
      case 'scoreboard':
        return {
          action: selected,
          mode,
          objective: id,
          ...(player ? { player } : {}),
          ...(value ? { value: Number(value) } : {}),
        };
      default:
        return { action: selected };
    }
  })();
  const parsed = worldControlSchema.safeParse(candidate);
  let preview: string[] = [];
  if (parsed.success)
    try {
      preview = buildWorldCommands(server, parsed.data);
    } catch {
      /* Invalid engine-specific variants remain disabled. */
    }
  const requiresConfirmation = advanced || ['worldborder', 'worldspawn'].includes(selected);
  const coords = ['worldspawn', 'summon', 'setblock'].includes(selected);
  const body = (
    <div className="world-command-form">
      <Field label={t('action')}>
        <select
          value={selected}
          onChange={(e) => {
            const next = e.target.value as WorldControl['action'];
            setAction(next);
            setMode(
              next === 'tick'
                ? 'freeze'
                : ['team', 'scoreboard'].includes(next)
                  ? 'add'
                  : 'replace',
            );
            setConfirmation('');
          }}
        >
          {options.map((v) => (
            <option key={v} value={v}>
              {a('worldAction.' + v)}
            </option>
          ))}
        </select>
      </Field>
      {selected === 'announce' && (
        <Field label={a('announcement')}>
          <textarea
            value={text}
            maxLength={500}
            rows={3}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      )}
      {['locate', 'summon', 'setblock', 'team', 'scoreboard'].includes(selected) && (
        <Field label={a(['team', 'scoreboard'].includes(selected) ? 'identifier' : 'resourceId')}>
          <input value={id} maxLength={150} onChange={(e) => setId(e.target.value)} />
        </Field>
      )}
      {selected === 'locate' && (
        <Field label={a('locateKind')}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {['structure', 'biome', 'poi'].map((v) => (
              <option key={v} value={v}>
                {a(v)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {coords && (
        <div className="coordinates-grid">
          {[
            ['X', x, setX],
            ['Y', y, setY],
            ['Z', z, setZ],
          ].map(([label, value, update]) => (
            <Field key={label as string} label={label as string}>
              <input
                type="number"
                value={value as string}
                onChange={(e) => (update as typeof setX)(e.target.value)}
              />
            </Field>
          ))}
        </div>
      )}
      {coords && !['bedrock', 'pocketmine'].includes(server.engine) && (
        <Field label={a('dimension')}>
          <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
            <option value="">{a('currentDimension')}</option>
            {['overworld', 'the_nether', 'the_end'].map((v) => (
              <option value={'minecraft:' + v} key={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      )}
      {selected === 'worldborder' && (
        <>
          <Field label={a('borderDiameter')}>
            <input
              type="number"
              min={1}
              max={59999968}
              value={diameter}
              onChange={(e) => setDiameter(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label={a('centerX')}>
              <input type="number" value={x} onChange={(e) => setX(e.target.value)} />
            </Field>
            <Field label={a('centerZ')}>
              <input type="number" value={z} onChange={(e) => setZ(e.target.value)} />
            </Field>
          </div>
        </>
      )}
      {['setblock', 'tick', 'team', 'scoreboard'].includes(selected) && (
        <Field label={a('operation')}>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {(selected === 'setblock'
              ? ['replace', 'destroy', 'keep']
              : selected === 'tick'
                ? ['freeze', 'unfreeze', 'rate']
                : selected === 'team'
                  ? ['add', 'remove', 'join', 'leave']
                  : ['add', 'remove', 'set']
            ).map((v) => (
              <option value={v} key={v}>
                {a('operation.' + v)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {['team', 'scoreboard'].includes(selected) && (
        <Field label={a('exactPlayer')}>
          <input value={player} maxLength={32} onChange={(e) => setPlayer(e.target.value)} />
        </Field>
      )}
      {((selected === 'tick' && mode === 'rate') ||
        (selected === 'scoreboard' && mode === 'set')) && (
        <Field label={a(selected === 'tick' ? 'tickRate' : 'score')}>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      {selected === 'save' && <p className="hint">{a('safeSaveHelp')}</p>}
      {selected === 'reload' && <p className="warning-text">{a('reloadWarning')}</p>}
      {preview.length > 0 && <pre className="command-preview">{preview.join('\n')}</pre>}
      {requiresConfirmation && (
        <>
          <p>
            {a('confirmServer')} <strong>{server.name}</strong>
          </p>
          <Field label={a('serverName')}>
            <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </Field>
        </>
      )}
      <Button
        variant={advanced ? 'danger' : 'primary'}
        disabled={
          busy ||
          server.status !== 'running' ||
          !parsed.success ||
          (!preview.length && selected !== 'save') ||
          (requiresConfirmation && confirmation !== server.name)
        }
        onClick={() => {
          if (parsed.success)
            void run(() => api.applyWorldControl(server.id, parsed.data, confirmation)).then(
              (r) => {
                if (r.ok) setResults(r.value);
              },
            );
        }}
      >
        {a('applyChange')}
      </Button>
      <ResultList results={results} />
    </div>
  );
  return advanced ? (
    body
  ) : (
    <details className="useful-world-controls">
      <summary>{a('usefulWorldControls')}</summary>
      {body}
    </details>
  );
}
