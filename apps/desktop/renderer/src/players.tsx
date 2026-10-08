import { useState } from 'react';
import { Users } from 'lucide-react';
import { useApp } from './context';
import { Button, Field, Empty, ErrorBox, Loading, useData, Dialog, Toggle } from './ui';
import { Confirm } from './management';
import { engineDefinition } from '../../../../packages/domain/engines';
import type { Server } from '../../../../packages/domain/types';
import type { ModerationAction, ModeratePlayerInput } from '../../../../packages/domain/players';
import { localizeMessage } from '../../../../packages/domain/localization';
import type { KnownPlayer } from '../../../../packages/domain/players';
const playTime = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${Math.floor(seconds) % 60}s`;
export function PlayersView({ server }: { server: Server }) {
  const { api, t, run, busy, snapshot } = useApp();
  const data = useData(async () => {
    if (server.status === 'running') await api.players(server.id);
    return api.playerReport(server.id);
  }, [server.id, server.status, server.players.join(',')]);
  const [filter, setFilter] = useState('known'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [name, setName] = useState(''),
    [action, setAction] = useState<ModerationAction>('whitelistAdd'),
    [reason, setReason] = useState(''),
    [confirmation, setConfirmation] = useState<ModeratePlayerInput>(),
    [response, setResponse] = useState('');
  const [details, setDetails] = useState<KnownPlayer>();
  const players = (data.data?.players ?? []).filter(
    (player) =>
      (filter === 'known' ||
        (filter === 'online'
          ? player.online
          : filter === 'operators'
            ? player.operator
            : filter === 'whitelist'
              ? player.whitelisted
              : player.banned)) &&
      (player.name + ' ' + (player.uuid ?? '') + ' ' + (player.xuid ?? ''))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const actions = data.data?.actions ?? [],
    selectedAction = actions.includes(action) ? action : (actions[0] ?? 'whitelistAdd');
  const validTarget =
    engineDefinition(server.engine).edition === 'java'
      ? /^[A-Za-z\d_.]{1,32}$/.test(name)
      : /^[A-Za-z\d_. -]{1,32}$/.test(name) && name.trim() === name;
  const actionLabel = (value: ModerationAction) => t(value);
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{t('knownPlayers')}</h2>
            <p>{t('playerDataHelp')}</p>
          </div>
          <Button disabled={busy || data.loading} onClick={data.reload}>
            {t('refresh')}
          </Button>
        </div>
        {engineDefinition(server.engine).edition === 'java' && (
          <Toggle
            label={t('whitelist')}
            checked={server.whitelist}
            onChange={(value) => {
              void run(() => api.setWhitelist(server.id, value));
            }}
          />
        )}
        <p className="hint">{t('player.whitelistHelp')}</p>
        <div className="player-filters">
          <Field label={t('playerList')}>
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="known">{t('knownPlayers')}</option>
              <option value="online">{t('connectedPlayers')}</option>
              <option value="operators">{t('operators')}</option>
              <option value="whitelist">{t('whitelist')}</option>
              <option value="banned">{t('bannedPlayers')}</option>
            </select>
          </Field>
          <Field label={t('search')}>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </Field>
        </div>
        {data.data?.warnings.map((warning) => (
          <p className="warning-text" key={warning}>
            {localizeMessage(warning, snapshot.settings.language)}
          </p>
        ))}
        {data.error ? (
          <ErrorBox error={data.error} retry={data.reload} retryLabel={t('retry')} />
        ) : data.loading ? (
          <Loading label={t('loading')} />
        ) : !players.length ? (
          <Empty icon={<Users />} title={t('noKnownPlayers')} />
        ) : (
          <>
            {players.slice(page * 50, (page + 1) * 50).map((player) => (
              <article className="known-player" key={player.name.toLowerCase()}>
                <div className="section-heading">
                  <div>
                    <h3>{player.name}</h3>
                    <Button onClick={() => setDetails(player)}>{t('player.details')}</Button>
                    <div className="tags">
                      <span>{t(player.online ? 'running' : 'stopped')}</span>
                      {player.operator && (
                        <span>
                          {t('operatorStatus')}
                          {player.operatorLevel !== undefined ? ' ' + player.operatorLevel : ''}
                        </span>
                      )}
                      {player.whitelisted && <span>{t('whitelist')}</span>}
                      {player.banned && <span>{t('bannedStatus')}</span>}
                    </div>
                  </div>
                  <Button
                    disabled={busy || !/^[A-Za-z\d_. -]{1,32}$/.test(player.name)}
                    onClick={() => setName(player.name)}
                  >
                    {t('moderate')}
                  </Button>
                </div>
                <dl className="player-details">
                  <div>
                    <dt>UUID</dt>
                    <dd>
                      {player.uuid ?? t('unavailable')}
                      {player.uuid && (
                        <small>
                          {t(
                            player.identityMode === 'offline' ? 'offlineIdentity' : 'localIdentity',
                          )}{' '}
                          · {player.identitySource}
                        </small>
                      )}
                    </dd>
                  </div>
                  {player.xuid && (
                    <div>
                      <dt>XUID</dt>
                      <dd>{player.xuid}</dd>
                    </div>
                  )}
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
                      {player.lastSeen
                        ? new Date(player.lastSeen).toLocaleString()
                        : t('unavailable')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('observedConnections')}</dt>
                    <dd>{player.joins}</dd>
                  </div>
                  <div>
                    <dt>{t('observedPlayTime')}</dt>
                    <dd>{playTime(player.observedMs / 1000)}</dd>
                  </div>
                  <div>
                    <dt>{t('minecraftPlayTime')}</dt>
                    <dd>
                      {player.minecraftPlaySeconds !== undefined
                        ? playTime(player.minecraftPlaySeconds)
                        : t('unavailable')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('ping')}</dt>
                    <dd>
                      {player.pingMs !== undefined ? player.pingMs + ' ms' : t('unavailable')}
                    </dd>
                  </div>
                </dl>
                {player.banned && player.banReason && <p className="muted">{player.banReason}</p>}
              </article>
            ))}
            <div className="actions">
              <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
                {t('previous')}
              </Button>
              <span>
                {page + 1} / {Math.ceil(players.length / 50)} · {players.length}
              </span>
              <Button
                disabled={(page + 1) * 50 >= players.length}
                onClick={() => setPage(page + 1)}
              >
                {t('next')}
              </Button>
            </div>
          </>
        )}
        {data.data?.bannedIpCount !== undefined && (
          <p className="muted small-text">
            {t('bannedIpCount')}: {data.data.bannedIpCount}
          </p>
        )}
      </section>
      {details && (
        <PlayerDetailsDialog
          server={server}
          player={details}
          onClose={() => setDetails(undefined)}
        />
      )}
      <section className="panel">
        <h2>{t('moderate')}</h2>
        <div className="form-grid">
          <Field label={t('playerName')}>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} />
          </Field>
          <Field label={t('action')}>
            <select
              value={selectedAction}
              onChange={(event) => setAction(event.target.value as ModerationAction)}
            >
              {actions.map((value) => (
                <option value={value} key={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </select>
          </Field>
          {['ban', 'kick'].includes(selectedAction) && (
            <Field label={t('moderationReason')}>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={200}
              />
            </Field>
          )}
        </div>
        <Button
          variant="primary"
          disabled={busy || server.status !== 'running' || !validTarget || !actions.length}
          onClick={() =>
            setConfirmation({ action: selectedAction, name, confirmation: name, reason })
          }
        >
          {t('send')}
        </Button>
        {response && <p className="command-response">{response}</p>}
      </section>
      {confirmation && (
        <Confirm
          name={confirmation.name}
          help={t('playerActionConfirm') + ' ' + actionLabel(confirmation.action)}
          onClose={() => setConfirmation(undefined)}
          onConfirm={() => {
            void run(() => api.moderatePlayer(server.id, confirmation)).then((result) => {
              if (result.ok) {
                setResponse(result.value);
                setConfirmation(undefined);
                data.reload();
              }
            });
          }}
        />
      )}
    </>
  );
}
function PlayerDetailsDialog({
  server,
  player,
  onClose,
}: {
  server: Server;
  player: KnownPlayer;
  onClose: () => void;
}) {
  const { api, t, run, busy } = useApp(),
    data = useData(() => api.playerDetails(server.id, player.name), [server.id, player.name]),
    skin = useData(() => api.playerSkin(server.id, player.name), [server.id, player.name]);
  const [note, setNote] = useState<string>();
  return (
    <Dialog title={player.name} closeLabel={t('close')} onClose={onClose}>
      {skin.data ? (
        <div className="player-skin">
          <img
            src={skin.data}
            alt={player.name}
            style={{ width: 128, height: 128, imageRendering: 'pixelated' }}
          />
        </div>
      ) : (
        <Users size={48} aria-label={t('player.defaultIcon')} />
      )}
      <p>{player.uuid ?? t('unavailable')}</p>
      {data.error && <ErrorBox error={data.error} />}
      {data.data && (
        <>
          <div className="metric-grid">
            {(['today', 'week', 'month'] as const).map((key) => (
              <div className="metric-card" key={key}>
                <strong>{playTime(data.data!.observedMs[key] / 1000)}</strong>
                <small>
                  {t(
                    key === 'today'
                      ? 'player.today'
                      : key === 'week'
                        ? 'player.week'
                        : 'player.month',
                  )}
                </small>
              </div>
            ))}
          </div>
          <Field label={t('player.notes')}>
            <textarea
              maxLength={4000}
              rows={4}
              value={note ?? data.data.note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <p className="hint">{t('player.notesHelp')}</p>
          <Button
            disabled={busy}
            onClick={() => {
              void run(() => api.playerNote(server.id, player.name, note ?? data.data!.note)).then(
                data.reload,
              );
            }}
          >
            {t('save')}
          </Button>
          <details open>
            <summary>{t('player.sessions')}</summary>
            <p className="hint">{t('player.sessionsHelp')}</p>
            {data.data.sessions.map((session) => (
              <p key={session.id}>
                <time>{new Date(session.startedAt).toLocaleString()}</time> →{' '}
                {new Date(session.endedAt ?? session.lastAt).toLocaleString()} ·{' '}
                {playTime(
                  Math.max(0, Date.parse(session.lastAt) - Date.parse(session.startedAt)) / 1000,
                )}{' '}
                {session.interrupted ? '· ' + t('player.interrupted') : ''}
              </p>
            ))}
          </details>
        </>
      )}
    </Dialog>
  );
}
