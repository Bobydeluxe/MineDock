import { useEffect, useState } from 'react';
import { Box, AlertTriangle } from 'lucide-react';
import { localizeMessage } from '../../../../packages/domain/localization';
import { useApp } from './context';
import { Button, Field, Dialog, useData } from './ui';
import type { Key } from './i18n';
import type { Server } from '../../../../packages/domain/types';
import {
  playerActionSchema,
  type PlayerAction,
  type PlayerActionResult,
  type CommandResult,
} from '../../../../packages/domain/administration';
import {
  buildPlayerCommand,
  administrationCapabilities,
} from '../../../../packages/domain/admin-commands';
export function useAdminText() {
  const { t } = useApp();
  return (key: string) => t(('admin.' + key) as Key);
}
export function ResultList({ results }: { results: (CommandResult & { name?: string })[] }) {
  const a = useAdminText();
  const { snapshot } = useApp();
  return (
    <div className="admin-results" role="status">
      {results.map((r, i) => (
        <article key={r.at + i} className={'admin-result ' + r.state}>
          <strong>
            {r.name && r.name + ' · '}
            {a(r.state)}
          </strong>
          <p>{localizeMessage(r.response, snapshot.settings.language)}</p>
        </article>
      ))}
    </div>
  );
}
export function ItemPicker({
  server,
  value,
  onChange,
}: {
  server: Server;
  value: string;
  onChange: (value: string) => void;
}) {
  const a = useAdminText(),
    { api } = useApp(),
    data = useData(() => api.itemCatalog(server.id), [server.id]);
  const [search, setSearch] = useState(''),
    [namespace, setNamespace] = useState('');
  const entries = (data.data?.entries ?? []).filter(
    (item) =>
      (!namespace || item.namespace === namespace) &&
      (item.id + ' ' + item.name).includes(search.toLowerCase()),
  );
  return (
    <div className="item-picker">
      <Field label={a('itemId')}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="minecraft:stone"
          maxLength={150}
        />
      </Field>
      <details>
        <summary>{a('browseItems')}</summary>
        <p className="hint">{a('catalogHelp')}</p>
        <div className="form-grid">
          <Field label={a('searchItems')}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label={a('namespace')}>
            <select value={namespace} onChange={(e) => setNamespace(e.target.value)}>
              <option value="">{a('allNamespaces')}</option>
              {[...new Set((data.data?.entries ?? []).map((i) => i.namespace))].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
        {!data.loading && !entries.length && <p>{a('noCatalogItems')}</p>}
        <div className="item-catalog-list">
          {entries.slice(0, 100).map((item) => (
            <Button
              key={item.id}
              onClick={() => onChange(item.id)}
              aria-pressed={value === item.id}
            >
              <Box size={16} />
              <span>
                {item.name}
                <small>{item.id}</small>
              </span>
            </Button>
          ))}
        </div>
      </details>
    </div>
  );
}
export function PlayerActionComposer({
  server,
  names,
  uuid,
  group = false,
  onChanged,
  onlineNames,
}: {
  server: Server;
  names: string[];
  uuid?: string;
  group?: boolean;
  onChanged?: () => void;
  onlineNames?: string[];
}) {
  const { api, t, run, busy, snapshot } = useApp(),
    a = useAdminText();
  const [action, setAction] = useState<PlayerAction['action']>('message');
  const [text, setText] = useState(''),
    [item, setItem] = useState(''),
    [count, setCount] = useState('1'),
    [mode, setMode] = useState('survival');
  const [destination, setDestination] = useState(''),
    [coordinateMode, setCoordinateMode] = useState(false),
    [x, setX] = useState(''),
    [y, setY] = useState(''),
    [z, setZ] = useState(''),
    [dimension, setDimension] = useState('');
  const [effect, setEffect] = useState(''),
    [seconds, setSeconds] = useState('60'),
    [amplifier, setAmplifier] = useState('0'),
    [unit, setUnit] = useState('levels'),
    [channel, setChannel] = useState('title');
  const [section, setSection] = useState('inventory'),
    [slot, setSlot] = useState('0'),
    [confirmation, setConfirmation] = useState(''),
    [review, setReview] = useState<PlayerAction>(),
    [results, setResults] = useState<PlayerActionResult[]>([]),
    [cancelled, setCancelled] = useState(false);
  const discovered = useData(
    () => api.administrationCapabilities(server.id),
    [server.id, server.status, server.startedAt],
  );
  const capabilities = discovered.data ?? administrationCapabilities(server),
    allowed = group
      ? capabilities.actions.filter((v) =>
          [
            'message',
            'teleport',
            'gamemode',
            'give',
            'effect',
            'effectClear',
            'whitelistAdd',
            'whitelistRemove',
            'kick',
          ].includes(v),
        )
      : capabilities.actions.filter((v) => v !== 'kill');
  const requiresOnline = ![
    'ban',
    'pardon',
    'op',
    'deop',
    'whitelistAdd',
    'whitelistRemove',
  ].includes(action);
  const selectionOnline = names.every((name) => (onlineNames ?? server.players).includes(name));
  const coordinates = {
    x: x.trim() ? Number(x) : NaN,
    y: y.trim() ? Number(y) : NaN,
    z: z.trim() ? Number(z) : NaN,
    ...(dimension ? { dimension } : {}),
  };
  const candidate = (() => {
    switch (action) {
      case 'give':
      case 'clear':
        return { action, item, count: Number(count) };
      case 'replace':
        return { action, slot: { section, index: Number(slot) }, item, count: Number(count) };
      case 'message':
        return { action, text };
      case 'teleport':
        return { action, ...(coordinateMode ? { coordinates } : { destination }) };
      case 'gamemode':
        return { action, mode };
      case 'kick':
      case 'ban':
        return { action, ...(text.trim() ? { reason: text } : {}) };
      case 'effect':
        return { action, effect, seconds: Number(seconds), amplifier: Number(amplifier) };
      case 'effectClear':
        return { action, ...(effect ? { effect } : {}) };
      case 'experience':
        return { action, amount: Number(count), unit };
      case 'spawnpoint':
        return { action, coordinates };
      case 'title':
        return { action, channel, text };
      default:
        return { action };
    }
  })();
  const parsed = playerActionSchema.safeParse(candidate);
  let preview = '';
  if (parsed.success)
    try {
      preview = names.map((name) => buildPlayerCommand(server, name, parsed.data)).join('\n');
    } catch {
      /* Unsupported variants remain disabled. */
    }
  const requiresCoordinates = action === 'spawnpoint' || (action === 'teleport' && coordinateMode);
  const activeBatch = snapshot.operations?.find(
    (o) =>
      o.serverId === server.id &&
      o.kind === 'players.batch' &&
      !['completed', 'failed', 'cancelled', 'attention'].includes(o.status),
  );
  useEffect(() => {
    setResults([]);
  }, [action]);
  const textField = (
    <Field
      label={a(
        action === 'message' ? 'privateMessage' : action === 'title' ? 'titleText' : 'reason',
      )}
    >
      <textarea value={text} maxLength={500} rows={3} onChange={(e) => setText(e.target.value)} />
    </Field>
  );
  return (
    <div className="player-action-composer">
      <Field label={t('action')}>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as PlayerAction['action'])}
        >
          {allowed
            .filter((value) => !group || value !== 'kick' || action === 'kick')
            .map((value) => (
              <option value={value} key={value}>
                {a('action.' + value)}
              </option>
            ))}
        </select>
      </Field>
      {['give', 'clear', 'replace'].includes(action) && (
        <ItemPicker server={server} value={item} onChange={setItem} />
      )}
      {['give', 'clear', 'replace', 'experience'].includes(action) && (
        <Field label={a(action === 'experience' ? 'experienceAmount' : 'quantity')}>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            min={action === 'experience' ? -100000 : 1}
            max={action === 'clear' ? 2304 : action === 'experience' ? 100000 : 64}
          />
        </Field>
      )}
      {['message', 'title', 'kick', 'ban'].includes(action) && textField}
      {action === 'clear' && (
        <p className="warning-text">
          <AlertTriangle size={16} /> {a('filteredClearHelp')}
        </p>
      )}
      {action === 'replace' && (
        <div className="form-grid">
          <Field label={a('section')}>
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              {['inventory', 'armor', 'offhand', 'ender'].map((v) => (
                <option value={v} key={v}>
                  {a(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={a('slotIndex')}>
            <input
              type="number"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              min={0}
              max={
                section === 'armor' ? 3 : section === 'offhand' ? 0 : section === 'ender' ? 26 : 35
              }
            />
          </Field>
        </div>
      )}
      {action === 'teleport' && (
        <>
          <Field label={a('destination')}>
            <select
              value={coordinateMode ? 'coordinates' : 'player'}
              onChange={(e) => setCoordinateMode(e.target.value === 'coordinates')}
            >
              <option value="player">{a('destinationPlayer')}</option>
              <option value="coordinates">{a('coordinates')}</option>
            </select>
          </Field>
          {!coordinateMode && (
            <Field label={a('destinationPlayer')}>
              <input
                value={destination}
                maxLength={32}
                onChange={(e) => setDestination(e.target.value)}
              />
            </Field>
          )}
        </>
      )}
      {requiresCoordinates && (
        <>
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
          {capabilities.edition === 'java' && (
            <Field label={a('dimension')}>
              <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
                <option value="">{a('currentDimension')}</option>
                {['overworld', 'the_nether', 'the_end'].map((v) => (
                  <option key={v} value={'minecraft:' + v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}
      {action === 'gamemode' && (
        <Field label={t('gamemode')}>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {['survival', 'creative', 'adventure', 'spectator'].map((v) => (
              <option value={v} key={v}>
                {t(v as Key)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {['effect', 'effectClear'].includes(action) && (
        <Field label={a('effectId')}>
          <input
            value={effect}
            maxLength={150}
            placeholder="minecraft:speed"
            onChange={(e) => setEffect(e.target.value)}
          />
        </Field>
      )}
      {action === 'effect' && (
        <div className="form-grid">
          <Field label={a('durationSeconds')}>
            <input
              type="number"
              min={1}
              max={1000000}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </Field>
          <Field label={a('amplifier')}>
            <input
              type="number"
              min={0}
              max={255}
              value={amplifier}
              onChange={(e) => setAmplifier(e.target.value)}
            />
          </Field>
        </div>
      )}
      {action === 'experience' && (
        <Field label={a('experienceUnit')}>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="levels">{a('levels')}</option>
            <option value="points">{a('points')}</option>
          </select>
        </Field>
      )}
      {action === 'title' && (
        <Field label={a('titleChannel')}>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {['title', 'subtitle', 'actionbar'].map((v) => (
              <option key={v} value={v}>
                {a(v)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {['op', 'deop'].includes(action) && <p className="warning-text">{a('operatorWarning')}</p>}
      {action === 'replace' && <p className="warning-text">{a('replaceWarning')}</p>}
      {preview && (
        <pre className="command-preview" aria-label={a('commandPreview')}>
          {preview}
        </pre>
      )}
      {group && (
        <p>
          {names.length} {a('selectedPlayers')} · {names.join(', ')}
        </p>
      )}
      {server.status !== 'running' && <p className="hint">{a('startServer')}</p>}
      {server.status === 'running' && requiresOnline && !selectionOnline && (
        <p className="hint">{a('onlineRequired')}</p>
      )}
      {group && capabilities.actions.includes('kick') && (
        <details className="admin-advanced">
          <summary>{a('advancedAdministration')}</summary>
          <p>{a('groupKickWarning')}</p>
          <Button onClick={() => setAction('kick')}>{a('action.kick')}</Button>
        </details>
      )}
      <Button
        variant="primary"
        disabled={
          busy ||
          server.status !== 'running' ||
          !preview ||
          !parsed.success ||
          !names.length ||
          !allowed.includes(action) ||
          (requiresOnline && !selectionOnline)
        }
        onClick={() => {
          if (parsed.success) {
            setReview(parsed.data);
            setConfirmation('');
          }
        }}
      >
        {a('reviewAction')}
      </Button>
      {activeBatch && (
        <Button
          onClick={() => {
            void api.cancelOperation(activeBatch.id);
          }}
        >
          {a('cancelRemaining')}
        </Button>
      )}
      {cancelled && <p>{a('groupCancelled')}</p>}
      <ResultList results={results} />
      {review && (
        <Dialog
          title={a('confirmAction')}
          closeLabel={t('close')}
          onClose={() => setReview(undefined)}
        >
          <div className="dialog-body">
            <p>{a('confirmTargets')}</p>
            <p>
              <strong>{names.join(', ')}</strong>
            </p>
            <pre className="command-preview">
              {names.map((name) => buildPlayerCommand(server, name, review)).join('\n')}
            </pre>
            <Field label={a('confirmNames')}>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setReview(undefined)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || confirmation !== names.join(', ')}
              onClick={() => {
                void run(async () =>
                  group
                    ? api.administerPlayers(server.id, { names, input: review, confirmation })
                    : {
                        results: [
                          await api.administerPlayer(server.id, {
                            name: names[0]!,
                            uuid,
                            input: review,
                            confirmation,
                          }),
                        ],
                        cancelled: false,
                      },
                ).then((r) => {
                  if (r.ok) {
                    setResults(r.value.results);
                    setCancelled(r.value.cancelled);
                    setReview(undefined);
                    onChanged?.();
                  }
                });
              }}
            >
              {t('send')}
            </Button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
