import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { Reachability } from '../../../../packages/networking/reachability';
import { useApp } from './context';
import { Button, Field, Toggle } from './ui';
import type { Key } from './i18n';
export function ReachabilityControls({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp(),
    [host, setHost] = useState(''),
    [consent, setConsent] = useState(false),
    [result, setResult] = useState<Reachability>();
  return (
    <details className="panel">
      <summary>{t('reach.title')}</summary>
      <p>{t('reach.help')}</p>
      <Field label={t('reach.host')}>
        <input
          value={host}
          placeholder="play.example.com"
          onChange={(e) => setHost(e.target.value)}
        />
      </Field>
      <Toggle label={t('reach.consent')} checked={consent} onChange={setConsent} />
      <Button
        disabled={busy || (consent && !host.trim())}
        onClick={() =>
          void run(() =>
            api.testReachability(server.id, { host: host.trim() || undefined, consent }),
          ).then((r) => {
            if (r.ok) setResult(r.value);
          })
        }
      >
        {t('reach.test')}
      </Button>
      {result && (
        <>
          <p>
            {t('reach.local')}: {t(('reach.' + result.local) as Key)} · {t('port')}: {result.port}
          </p>
          <p>
            {t('reach.external')}: {t(('reach.' + result.external) as Key)} ·{' '}
            {new Date(result.observerAt ?? result.at).toLocaleString()}
          </p>
          <p className="muted">{t('reach.firewall')}</p>
        </>
      )}
    </details>
  );
}
