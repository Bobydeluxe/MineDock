import { useEffect, useState } from 'react';
import { Box, Users, Copy, Shield, History, NotebookPen, Wrench, RefreshCw } from 'lucide-react';
import { useApp } from './context';
import { Button, Field, Dialog, useData, Loading, ErrorBox } from './ui';
import { ItemPicker, PlayerActionComposer, ResultList, useAdminText } from './administration-ui';
import type { Server } from '../../../../packages/domain/types';
import type { KnownPlayer } from '../../../../packages/domain/players';
import type {
  InventorySlot,
  InventoryEdit,
  InventoryRestorePreview,
  CommandResult,
} from '../../../../packages/domain/administration';
import { inventoryEditSchema, resourceIdSchema } from '../../../../packages/domain/administration';
import { buildPlayerCommand } from '../../../../packages/domain/admin-commands';
import { localizeMessage } from '../../../../packages/domain/localization';
import { ItemThumbnail, ItemAssetSetup, useItemText } from './item-visuals';
import { itemTextDetails, actualEnchantments } from '../../../../packages/domain/item-presentation';
const playTime = (ms: number) => `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m`;
export function PlayerProfileDialog({
  server,
  player,
  onClose,
}: {
  server: Server;
  player: KnownPlayer;
  onClose: () => void;
}) {
  const { api, t, run, busy, snapshot, registerUnsaved, requestNavigation } = useApp(),
    a = useAdminText(),
    assetText = useItemText();
  const [tab, setTab] = useState('inventory'),
    [note, setNote] = useState<string>(),
    [selection, setSelection] = useState<InventorySlot>(),
    [editAction, setEditAction] = useState<InventoryEdit['action']>('remove'),
    [item, setItem] = useState(''),
    [amount, setAmount] = useState('1'),
    [confirmation, setConfirmation] = useState(''),
    [restore, setRestore] = useState<InventoryRestorePreview>(),
    [results, setResults] = useState<CommandResult[]>([]);
  const data = useData(() => api.playerDetails(server.id, player.name), [server.id, player.name]);
  const inventory = useData(
    () => api.playerInventory(server.id, player.name),
    [server.id, player.name, server.status],
  );
  const skins = useData(() => api.playerSkin(server.id, player.name), [server.id, player.name]);
  const history = useData(
    () => api.administrationHistory(server.id, player.name),
    [server.id, player.name],
  );
  const copies = useData(
    () =>
      player.uuid ? api.playerInventorySnapshots(server.id, player.uuid) : Promise.resolve([]),
    [server.id, player.uuid],
  );
  const dirty = note !== undefined && note !== data.data?.note;
  useEffect(
    () => registerUnsaved('player-note-' + server.id + '-' + player.name, dirty),
    [dirty, registerUnsaved, server.id, player.name],
  );
  const report = inventory.data,
    online = server.status === 'running' && server.players.includes(player.name);
  const refresh = () => {
    inventory.reload();
    history.reload();
    copies.reload();
    data.reload();
  };
  const choose = (slot: InventorySlot) => {
    setSelection(slot);
    setEditAction(slot.item ? 'remove' : 'replace');
    setItem(slot.item?.id ?? '');
    setAmount('1');
    setConfirmation('');
  };
  const edit =
    selection && player.uuid && report?.sha256
      ? {
          name: player.name,
          uuid: player.uuid,
          sha256: report.sha256,
          slot: { section: selection.section, index: selection.index },
          action: editAction,
          count: editAction === 'empty' ? undefined : Number(amount),
          item: editAction === 'replace' ? item : undefined,
          confirmation,
        }
      : undefined;
  const validEdit = edit && inventoryEditSchema.safeParse(edit).success;
  let onlinePreview = '';
  if (
    selection &&
    online &&
    (editAction === 'empty' || editAction === 'replace') &&
    (editAction === 'empty' || resourceIdSchema.safeParse(item).success)
  )
    try {
      onlinePreview = buildPlayerCommand(server, player.name, {
        action: 'replace',
        slot: { section: selection.section, index: selection.index },
        item: editAction === 'empty' ? 'minecraft:air' : item,
        count: editAction === 'empty' ? 1 : Number(amount),
      });
    } catch {
      /* Unsupported slot commands remain unavailable. */
    }
  const grid = (section: InventorySlot['section'], hotbar = false) => (
    <div className={'inventory-grid ' + section} role="group" aria-label={a(section)}>
      {report?.slots
        .filter(
          (slot) =>
            slot.section === section &&
            (section !== 'inventory' || (hotbar ? slot.index < 9 : slot.index >= 9)),
        )
        .sort((a, b) => (section === 'armor' ? b.index - a.index : a.index - b.index))
        .map((slot) => (
          <button
            key={slot.index}
            type="button"
            className={'inventory-slot' + (slot.item ? ' occupied' : '')}
            onClick={() => choose(slot)}
            aria-label={`${a(section)} ${slot.index + 1} · ${slot.item ? slot.item.id + ' × ' + slot.item.count : a('emptySlot')}`}
            title={slot.item?.id ?? a('emptySlot')}
            aria-describedby={
              slot.item ? 'item-' + player.uuid + '-' + section + '-' + slot.index : undefined
            }
            aria-pressed={selection?.section === section && selection.index === slot.index}
          >
            {slot.item && (
              <ItemThumbnail
                server={server}
                item={slot.item}
                tooltipId={'item-' + player.uuid + '-' + section + '-' + slot.index}
              />
            )}
            {!slot.item && section === 'armor' && (
              <span className="equipment-label">
                {assetText(['boots', 'leggings', 'chestplate', 'helmet'][slot.index]!)}
              </span>
            )}
            {slot.item && slot.item.count > 1 && <strong>{slot.item.count}</strong>}
          </button>
        ))}
    </div>
  );
  return (
    <Dialog
      title={player.name}
      className="player-profile-dialog"
      closeLabel={t('close')}
      onClose={() => requestNavigation(onClose)}
    >
      <div className="dialog-body player-profile-body">
        <div className="player-profile-header">
          <div className="player-profile-avatar">
            {skins.data ? (
              <div role="img" aria-label={player.name} className="player-skin-head">
                {[8, 40].map((x) => (
                  <img key={x} src={skins.data!} alt="" style={{ left: -x * 12 }} />
                ))}
              </div>
            ) : (
              <Users size={48} aria-label={t('player.defaultIcon')} />
            )}
          </div>
          <div>
            <div className="tags">
              <span className={online ? 'status-online' : ''}>
                {a(online ? 'online' : 'offline')}
              </span>
              {report?.gamemode && <span>{t(report.gamemode as 'survival')}</span>}
              {player.operator && <span>OP {player.operatorLevel ?? ''}</span>}
              {player.whitelisted && <span>{t('whitelist')}</span>}
              {player.banned && <span>{t('bannedStatus')}</span>}
            </div>
            <p>
              {playTime(player.observedMs)} · {t('observedPlayTime')}
            </p>
            <p className="muted">
              Minecraft {server.minecraftVersion ?? server.version} ·{' '}
              {player.uuid ?? player.xuid ?? a('identityUnavailable')}
            </p>
            {(player.uuid || player.xuid) && (
              <Button
                variant="ghost"
                onClick={() => {
                  void run(() => navigator.clipboard.writeText(player.uuid ?? player.xuid!));
                }}
              >
                <Copy size={14} />
                {a('copyIdentity')}
              </Button>
            )}
          </div>
        </div>
        <nav className="profile-tabs" aria-label={a('profileTabs')}>
          {[
            ['inventory', Box],
            ['actions', Wrench],
            ['history', History],
            ['notes', NotebookPen],
          ].map(([value, Icon]) => {
            const TabIcon = Icon as typeof Box;
            return (
              <button
                key={value as string}
                type="button"
                aria-pressed={tab === value}
                className={tab === value ? 'selected' : ''}
                onClick={() => setTab(value as string)}
              >
                <TabIcon size={19} />
                {a(value as string)}
              </button>
            );
          })}
        </nav>
        {tab === 'inventory' && (
          <>
            <div className="section-heading">
              <div>
                <h3>{a('playerInventory')}</h3>
                <p className={'inventory-source ' + (report?.source ?? '')}>
                  {a(
                    report?.source === 'live'
                      ? 'liveInventory'
                      : report?.source === 'saved'
                        ? 'lastSaved'
                        : 'inventoryUnavailable',
                  )}
                  {report?.at && ' · ' + new Date(report.at).toLocaleString()}
                </p>
              </div>
              <Button disabled={busy || inventory.loading} onClick={refresh}>
                <RefreshCw size={15} />
                {t('refresh')}
              </Button>
            </div>
            {inventory.loading && <Loading label={t('loading')} />}
            {inventory.error && (
              <ErrorBox error={inventory.error} retry={inventory.reload} retryLabel={t('retry')} />
            )}
            {report?.source === 'saved' && <p className="hint">{a('savedHelp')}</p>}
            {report?.reason && (
              <p className="hint">{localizeMessage(report.reason, snapshot.settings.language)}</p>
            )}
            {report && report.source !== 'unavailable' && (
              <>
                <div className="player-vitals">
                  {(['health', 'hunger', 'saturation', 'experience', 'level'] as const).map(
                    (key) => (
                      <div key={key}>
                        <span>{a(key)}</span>
                        <strong>{report[key] ?? '—'}</strong>
                      </div>
                    ),
                  )}
                </div>
                <div className="section-heading">
                  <h3>{a('inventory')}</h3>
                  <span className="badge">36 {a('slots')}</span>
                </div>
                {grid('inventory')}
                <h4 className="hotbar-heading">{assetText('hotbar')}</h4>
                {grid('inventory', true)}
                <ItemAssetSetup server={server} />
                <div className="player-equipment">
                  <section>
                    <h3>{a('armor')}</h3>
                    {grid('armor')}
                  </section>
                  <section>
                    <h3>{a('offhand')}</h3>
                    {grid('offhand')}
                  </section>
                </div>
                <div className="section-heading">
                  <h3>{a('ender')}</h3>
                  <span className="badge">27 {a('slots')}</span>
                </div>
                {grid('ender')}
                <details className="inventory-history">
                  <summary>{a('inventoryCopies')}</summary>
                  <p className="hint">{a('restoreHelp')}</p>
                  {!copies.data?.length && <p>{a('noInventoryCopies')}</p>}
                  {copies.data?.map((copy) => (
                    <div className="section-heading" key={copy.id}>
                      <span>
                        {new Date(copy.at).toLocaleString()} ·{' '}
                        {a('action.inventory.' + copy.reason)}
                      </span>
                      <Button
                        disabled={busy || !report.writable || !player.uuid}
                        onClick={() => {
                          void run(() =>
                            api.previewPlayerInventoryRestore(
                              server.id,
                              player.name,
                              player.uuid!,
                              copy.id,
                            ),
                          ).then((r) => {
                            if (r.ok) {
                              setRestore(r.value);
                              setConfirmation('');
                            }
                          });
                        }}
                      >
                        {a('previewRestore')}
                      </Button>
                    </div>
                  ))}
                </details>
              </>
            )}
            <ResultList results={results} />
          </>
        )}
        {tab === 'actions' && (
          <>
            <PlayerActionComposer
              server={server}
              names={[player.name]}
              uuid={player.uuid}
              onlineNames={player.online ? [player.name] : []}
              onChanged={() => history.reload()}
            />
            <AdvancedPlayerControls server={server} player={player} onChanged={history.reload} />
          </>
        )}
        {tab === 'history' && (
          <>
            <dl className="player-details">
              <div>
                <dt>{t('firstSeen')}</dt>
                <dd>
                  {player.firstSeen
                    ? new Date(player.firstSeen).toLocaleString()
                    : t('unavailable')}
                </dd>
              </div>
              <div>
                <dt>{t('lastSeen')}</dt>
                <dd>
                  {player.lastSeen ? new Date(player.lastSeen).toLocaleString() : t('unavailable')}
                </dd>
              </div>
            </dl>
            {data.error && <ErrorBox error={data.error} />}
            {data.data && (
              <>
                <div className="metric-grid">
                  {(['today', 'week', 'month'] as const).map((key) => (
                    <div className="metric-card" key={key}>
                      <strong>{playTime(data.data!.observedMs[key])}</strong>
                      <small>{t(('player.' + key) as 'player.today')}</small>
                    </div>
                  ))}
                </div>
                <h3>{t('player.sessions')}</h3>
                <p className="hint">{t('player.sessionsHelp')}</p>
                {data.data.sessions.map((session) => (
                  <p key={session.id}>
                    {new Date(session.startedAt).toLocaleString()} →{' '}
                    {new Date(session.endedAt ?? session.lastAt).toLocaleString()} ·{' '}
                    {playTime(
                      Math.max(0, Date.parse(session.lastAt) - Date.parse(session.startedAt)),
                    )}
                    {session.interrupted ? ' · ' + t('player.interrupted') : ''}
                  </p>
                ))}
              </>
            )}
            <h3>{a('adminHistory')}</h3>
            <p className="hint">{a('historyPrivacy')}</p>
            {history.error && <ErrorBox error={history.error} />}
            {!history.data?.length && <p>{a('noAdminHistory')}</p>}
            {history.data?.map((event) => (
              <article className="admin-history-row" key={event.id}>
                <time>{new Date(event.at).toLocaleString()}</time>
                <strong>{a('action.' + event.action)}</strong>
                <span>{a(event.state)}</span>
                {Object.keys(event.parameters).length > 0 && (
                  <code>{JSON.stringify(event.parameters)}</code>
                )}
              </article>
            ))}
          </>
        )}
        {tab === 'notes' && (
          <>
            {data.error && <ErrorBox error={data.error} />}
            {data.data && (
              <>
                <Field label={t('player.notes')}>
                  <textarea
                    value={note ?? data.data.note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={4000}
                    rows={9}
                  />
                </Field>
                <p className="hint">{t('player.notesHelp')}</p>
                <Button
                  variant="primary"
                  disabled={busy || !dirty}
                  onClick={() => {
                    void run(() =>
                      api.playerNote(server.id, player.name, note ?? data.data!.note),
                    ).then((r) => {
                      if (r.ok) {
                        setNote(undefined);
                        data.reload();
                      }
                    });
                  }}
                >
                  {t('save')}
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {selection && (
        <Dialog
          title={a('slotDetails') + ' · ' + a(selection.section) + ' ' + (selection.index + 1)}
          closeLabel={t('close')}
          onClose={() => setSelection(undefined)}
        >
          <div className="dialog-body">
            {selection.item && (
              <div className="item-detail-picture">
                <ItemThumbnail server={server} item={selection.item} large showName />
              </div>
            )}
            {selection.item && itemTextDetails(selection.item.components).name && (
              <p>{itemTextDetails(selection.item.components).name}</p>
            )}
            {selection.item &&
              itemTextDetails(selection.item.components).lore.map((line, i) => (
                <p className="muted" key={i}>
                  {line}
                </p>
              ))}
            <p>
              <strong>{selection.item?.id ?? a('emptySlot')}</strong>
              {selection.item && ' × ' + selection.item.count}
            </p>
            {selection.item?.damage !== undefined && (
              <p>
                {a('damage')}: {selection.item.damage}
              </p>
            )}
            {selection.item?.enchantments.length ? (
              <p>
                {a('enchantments')}:{' '}
                {(actualEnchantments(selection.item).length
                  ? actualEnchantments(selection.item)
                  : selection.item.enchantments
                ).join(', ')}
              </p>
            ) : null}
            {selection.item && Object.keys(selection.item.components).length > 0 && (
              <details>
                <summary>{a('components')}</summary>
                <pre className="item-components">
                  {JSON.stringify(selection.item.components, null, 2)}
                </pre>
              </details>
            )}
            <p className="hint">
              {a(
                online
                  ? 'onlineSlotHelp'
                  : report?.writable
                    ? 'offlineEditHelp'
                    : 'editingUnavailable',
              )}
            </p>
            <Field label={t('action')}>
              <select
                value={editAction}
                onChange={(e) => setEditAction(e.target.value as InventoryEdit['action'])}
              >
                <option value="remove" disabled={!report?.writable || !selection.item}>
                  {a('removeAmount')}
                </option>
                <option value="empty" disabled={!selection.item}>
                  {a('emptyExactSlot')}
                </option>
                <option value="replace">{a('replaceExactSlot')}</option>
              </select>
            </Field>
            {editAction === 'replace' && (
              <ItemPicker server={server} value={item} onChange={setItem} />
            )}
            {editAction !== 'empty' && (
              <Field label={a('quantity')}>
                <input
                  type="number"
                  value={amount}
                  min={1}
                  max={editAction === 'remove' ? Math.min(64, selection.item?.count ?? 0) : 64}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            )}
            {editAction === 'replace' && <p className="warning-text">{a('replaceWarning')}</p>}
            {onlinePreview && <pre className="command-preview">{onlinePreview}</pre>}
            <Field label={a('confirmNames')}>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <p>
              <strong>{player.name}</strong>
            </p>
            {!report?.writable && !online && (
              <p className="warning-text">{a('editingUnavailable')}</p>
            )}
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setSelection(undefined)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                confirmation !== player.name ||
                (!report?.writable && !onlinePreview) ||
                (report?.writable && !validEdit)
              }
              onClick={() => {
                void run(async () => {
                  if (report?.writable && edit) {
                    await api.editPlayerInventory(server.id, edit);
                    return [] as CommandResult[];
                  }
                  return [
                    await api.administerPlayer(server.id, {
                      name: player.name,
                      uuid: player.uuid,
                      confirmation,
                      input: {
                        action: 'replace',
                        slot: { section: selection.section, index: selection.index },
                        item: editAction === 'empty' ? 'minecraft:air' : item,
                        count: editAction === 'empty' ? 1 : Number(amount),
                      },
                    }),
                  ];
                }).then((r) => {
                  if (r.ok) {
                    setResults(r.value);
                    setSelection(undefined);
                    refresh();
                  }
                });
              }}
            >
              {a('applyChange')}
            </Button>
          </footer>
        </Dialog>
      )}
      {restore && (
        <Dialog
          title={a('previewRestore')}
          closeLabel={t('close')}
          onClose={() => setRestore(undefined)}
        >
          <div className="dialog-body">
            <p>
              {a('restoreHelp')} · {new Date(restore.snapshot.at).toLocaleString()}
            </p>
            {restore.changes.map((change) => (
              <p key={change.slot.section + change.slot.index}>
                <strong>
                  {a(change.slot.section)} {change.slot.index + 1}
                </strong>
                : {change.before ? change.before.id + ' × ' + change.before.count : a('emptySlot')}{' '}
                → {change.after ? change.after.id + ' × ' + change.after.count : a('emptySlot')}
              </p>
            ))}
            {!restore.changes.length && <p>{a('noChanges')}</p>}
            <Field label={a('confirmNames')}>
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
            <p>
              <strong>{player.name}</strong>
            </p>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setRestore(undefined)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || confirmation !== player.name || !restore.changes.length}
              onClick={() => {
                void run(() =>
                  api.restorePlayerInventory(server.id, restore.token, confirmation),
                ).then((r) => {
                  if (r.ok) {
                    setRestore(undefined);
                    refresh();
                  }
                });
              }}
            >
              {t('restore')}
            </Button>
          </footer>
        </Dialog>
      )}
    </Dialog>
  );
}
function AdvancedPlayerControls({
  server,
  player,
  onChanged,
}: {
  server: Server;
  player: KnownPlayer;
  onChanged: () => void;
}) {
  const { api, run, busy, t } = useApp(),
    a = useAdminText();
  const [kill, setKill] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [ip, setIp] = useState(''),
    [ipConfirmation, setIpConfirmation] = useState(''),
    [ipAction, setIpAction] = useState<'ban-ip' | 'pardon-ip'>('ban-ip'),
    [results, setResults] = useState<CommandResult[]>([]);
  return (
    <details className="advanced-player-controls">
      <summary>
        <Shield size={16} /> {a('advancedAdministration')}
      </summary>
      <p className="warning-text">{a('killWarning')}</p>
      <Button
        variant="danger"
        disabled={busy || server.status !== 'running' || !player.online}
        onClick={() => {
          setKill(true);
          setConfirmation('');
        }}
      >
        {a('action.kill')}
      </Button>
      <details>
        <summary>{a('ipAdministration')}</summary>
        <p className="warning-text">{a('ipHelp')}</p>
        <Field label={t('action')}>
          <select value={ipAction} onChange={(e) => setIpAction(e.target.value as typeof ipAction)}>
            <option value="ban-ip">{a('action.ban-ip')}</option>
            <option value="pardon-ip">{a('action.pardon-ip')}</option>
          </select>
        </Field>
        <Field label={a('ipAddress')}>
          <input
            value={ip}
            maxLength={45}
            onChange={(e) => setIp(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label={a('confirmIp')}>
          <input
            value={ipConfirmation}
            onChange={(e) => setIpConfirmation(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Button
          variant="danger"
          disabled={
            busy ||
            server.status !== 'running' ||
            server.engine === 'bedrock' ||
            !ip ||
            ipConfirmation !== ip
          }
          onClick={() => {
            void run(() =>
              api.administerIp(server.id, { action: ipAction, ip, confirmation: ipConfirmation }),
            ).then((r) => {
              if (r.ok) {
                setResults([r.value]);
                setIp('');
                setIpConfirmation('');
                onChanged();
              }
            });
          }}
        >
          {a('applyChange')}
        </Button>
      </details>
      <ResultList results={results} />
      {kill && (
        <Dialog title={a('action.kill')} closeLabel={t('close')} onClose={() => setKill(false)}>
          <div className="dialog-body">
            <p className="warning-text">{a('killWarning')}</p>
            <p>
              <strong>{player.name}</strong>
            </p>
            <Field label={a('confirmNames')}>
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setKill(false)}>{t('cancel')}</Button>
            <Button
              variant="danger"
              disabled={busy || confirmation !== player.name}
              onClick={() => {
                void run(() =>
                  api.administerPlayer(server.id, {
                    name: player.name,
                    uuid: player.uuid,
                    input: { action: 'kill' },
                    confirmation,
                  }),
                ).then((r) => {
                  if (r.ok) {
                    setResults([r.value]);
                    setKill(false);
                    onChanged();
                  }
                });
              }}
            >
              {a('action.kill')}
            </Button>
          </footer>
        </Dialog>
      )}
    </details>
  );
}
