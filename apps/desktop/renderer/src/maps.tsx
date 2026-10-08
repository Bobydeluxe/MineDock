import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { MapKind } from '../../../../packages/domain/maps';
import type { ModPlan } from '../../../../packages/domain/mods';
import { useApp } from './context';
import { Button, Field, Toggle, useData, ErrorBox } from './ui';
import { Confirm } from './management';
export function MapControls({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp(),
    status = useData(() => api.mapStatus(server.id), [server.id]),
    [kind, setKind] = useState<MapKind>('bluemap'),
    [port, setPort] = useState(8100),
    [assets, setAssets] = useState(false),
    [plan, setPlan] = useState<ModPlan>(),
    [confirm, setConfirm] = useState(false);
  if (!['paper', 'purpur'].includes(server.engine)) return null;
  return (
    <details className="panel">
      <summary>{t('map.title')}</summary>
      <p>{t('map.help')}</p>
      {status.error && <ErrorBox error={status.error} />}
      <Field label={t('map.title')}>
        <select
          value={kind}
          onChange={(e) => {
            const value = e.target.value as MapKind;
            setKind(value);
            setPort(value === 'bluemap' ? 8100 : 8123);
            setPlan(undefined);
          }}
        >
          <option value="bluemap">BlueMap</option>
          <option value="dynmap">Dynmap</option>
        </select>
      </Field>
      <Field label={t('port')}>
        <input
          type="number"
          min={1024}
          max={65535}
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
        />
      </Field>
      {kind === 'bluemap' && (
        <Toggle label={t('map.assets')} checked={assets} onChange={setAssets} />
      )}
      <Button
        disabled={busy || !!server.pid || server.status === 'installing'}
        onClick={() =>
          void run(() => api.mapPlan(server.id, kind)).then((r) => {
            if (r.ok) setPlan(r.value);
          })
        }
      >
        {t('map.analyze')}
      </Button>
      {plan && (
        <>
          <p>{plan.entries.map((e) => e.project.title + ' ' + e.version.name).join(', ')}</p>
          <p>
            {t('map.preview')}: http://127.0.0.1:{port}/
          </p>
          <Button disabled={busy} onClick={() => setConfirm(true)}>
            {t('install')}
          </Button>
        </>
      )}
      {status.data?.map(
        (item) =>
          item.url && (
            <div className="info-row" key={item.kind}>
              <code>{item.url}</code>
              <Button onClick={() => void run(() => api.openMap(server.id, item.kind))}>
                {t('map.open')}
              </Button>
            </div>
          ),
      )}
      {confirm && plan && (
        <Confirm
          name={server.name}
          help={t('map.help')}
          onClose={() => setConfirm(false)}
          onConfirm={() =>
            void run(() =>
              api.mapApply(server.id, {
                kind,
                token: plan.token,
                port,
                acceptAssets: assets,
                confirmation: server.name,
              }),
            ).then((r) => {
              if (r.ok) {
                setConfirm(false);
                setPlan(undefined);
                status.reload();
              }
            })
          }
        />
      )}
    </details>
  );
}
