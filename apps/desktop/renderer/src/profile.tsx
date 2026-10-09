import { useEffect, useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import { useApp } from './context';
import { Button, Field } from './ui';
import { EngineIcon } from './engine-icon';
export function ServerAvatar({ server, size = 40 }: { server: Server; size?: number }) {
  return server.thumbnail ? (
    <img className="server-thumbnail" src={server.thumbnail} width={size} height={size} alt="" />
  ) : (
    <EngineIcon engine={server.engine} size={size} />
  );
}
export function ProfileControls({ server }: { server: Server }) {
  const { api, t, run, busy, registerUnsaved } = useApp();
  const [name, setName] = useState(server.name),
    [thumbnail, setThumbnail] = useState<string | null>(server.thumbnail ?? null);
  const dirty = name !== server.name || thumbnail !== (server.thumbnail ?? null);
  useEffect(
    () => registerUnsaved('profile:' + server.id, dirty),
    [registerUnsaved, server.id, dirty],
  );
  useEffect(() => {
    setName(server.name);
    setThumbnail(server.thumbnail ?? null);
  }, [server.name, server.thumbnail]);
  return (
    <section className="panel profile-controls">
      <div>
        <h2>{t('profile.title')}</h2>
        <p className="hint">{t('profile.help')}</p>
      </div>
      <div className="profile-form">
        <ServerAvatar server={{ ...server, thumbnail: thumbnail ?? undefined }} size={64} />
        <Field label={t('name')}>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          disabled={busy}
          onClick={() =>
            void run(() => api.selectProfileIcon()).then((r) => {
              if (r.ok && r.value) setThumbnail(r.value);
            })
          }
        >
          {t('profile.chooseIcon')}
        </Button>
        <Button disabled={busy || !thumbnail} onClick={() => setThumbnail(null)}>
          {t('profile.resetIcon')}
        </Button>
        <Button
          variant="primary"
          disabled={
            busy ||
            !name.trim() ||
            (name === server.name && thumbnail === (server.thumbnail ?? null))
          }
          onClick={() => void run(() => api.updateProfile(server.id, { name, thumbnail }))}
        >
          {t('save')}
        </Button>
      </div>
    </section>
  );
}
