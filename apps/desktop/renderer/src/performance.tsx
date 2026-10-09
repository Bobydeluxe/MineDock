import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { JvmOptions } from '../../../../packages/domain/performance';
import { recommendMemory } from '../../../../packages/domain/performance';
import { useApp } from './context';
import { Button, Field, ErrorBox, useData, Chart, bytes } from './ui';
export function PerformanceView({ server }: { server: Server }) {
  const { api, t } = useApp(),
    [hours, setHours] = useState(1),
    data = useData(() => api.performance(server.id, hours), [server.id, hours]);
  const samples = data.data?.samples ?? [],
    tps = samples.filter((s) => s.tps !== undefined),
    mspt = samples.filter((s) => s.mspt !== undefined);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{t('performance.title')}</h2>
        <select
          value={hours}
          aria-label={t('performance.history')}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {[1, 24, 168].map((h) => (
            <option key={h} value={h}>
              {h === 168 ? '7' : h} {t(h === 168 ? 'performance.days' : 'performance.hours')}
            </option>
          ))}
        </select>
        <Button onClick={data.reload}>{t('refresh')}</Button>
      </div>
      <p>{t('performance.tickHelp')}</p>
      {data.error && <ErrorBox error={data.error} />}
      <div className="chart-grid">
        {tps.length ? (
          <Chart label="TPS (1m)" values={tps.map((s) => s.tps!)} suffix="" />
        ) : (
          <p>TPS · {t('unavailable')}</p>
        )}
        {mspt.length ? (
          <Chart label="MSPT (5s)" values={mspt.map((s) => s.mspt!)} suffix="ms" />
        ) : (
          <p>MSPT · {t('unavailable')}</p>
        )}
      </div>
      <details>
        <summary>{t('performance.lags')}</summary>
        {data.data?.lags.map((lag) => (
          <details key={lag.at}>
            <summary>
              {new Date(lag.at).toLocaleString()} · {lag.tps ?? '—'} TPS · {lag.mspt ?? '—'} MSPT
              {' · '}
              {lag.cpu === undefined ? '—' : lag.cpu.toFixed(1)}% CPU ·{' '}
              {lag.memory === undefined ? '—' : bytes(lag.memory)}
            </summary>
            <pre style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {lag.logs.join('\n')}
            </pre>
          </details>
        ))}
      </details>
    </section>
  );
}
export function MemoryJvmControls({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp(),
    diagnostic = useData(() => api.diagnostic(), []),
    [memory, setMemory] = useState({ memoryMin: server.memoryMin, memoryMax: server.memoryMax }),
    [preset, setPreset] = useState<JvmOptions['preset']>(server.jvm?.preset ?? 'standard'),
    [flags, setFlags] = useState(server.jvm?.flags.join(' ') ?? '');
  if (!['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge'].includes(server.engine))
    return null;
  return (
    <details className="panel">
      <summary>{t('performance.ram')}</summary>
      <p>{t('performance.ramHelp')}</p>
      <div className="actions">
        {(['small', 'friends', 'modded'] as const).map((value) => (
          <Button
            key={value}
            disabled={!diagnostic.data}
            onClick={() => {
              setMemory(
                recommendMemory(
                  value,
                  diagnostic.data!.totalMemory / 1024 ** 2,
                  diagnostic.data!.freeMemory / 1024 ** 2,
                ),
              );
            }}
          >
            {t(
              value === 'small'
                ? 'performance.small'
                : value === 'friends'
                  ? 'performance.friends'
                  : 'performance.modded',
            )}
          </Button>
        ))}
      </div>
      <div className="form-grid">
        <Field label={t('memoryMin')}>
          <input
            type="number"
            value={memory.memoryMin}
            onChange={(e) => setMemory({ ...memory, memoryMin: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('memoryMax')}>
          <input
            type="number"
            value={memory.memoryMax}
            onChange={(e) => setMemory({ ...memory, memoryMax: Number(e.target.value) })}
          />
        </Field>
      </div>
      <details>
        <summary>JVM · {t('advanced')}</summary>
        <p>{t('performance.jvmHelp')}</p>
        <Field label={t('performance.jvmPreset')}>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as JvmOptions['preset'])}
          >
            <option value="standard">{t('performance.standard')}</option>
            <option value="optimized" disabled={server.javaMajor < 17}>
              {t('performance.optimized')}
            </option>
            <option value="custom" disabled={server.javaMajor < 17}>
              {t('performance.custom')}
            </option>
          </select>
        </Field>
        {preset === 'custom' && (
          <Field label={t('performance.flags')}>
            <input
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=100"
            />
          </Field>
        )}
      </details>
      <Button
        disabled={busy || !!server.pid}
        onClick={() => {
          void run(() =>
            api.configureServer(server.id, {
              ...memory,
              autoStart: server.autoStart,
              autoRestart: server.autoRestart,
              javaPath: server.javaPath,
              jvm: {
                preset,
                flags: preset === 'custom' ? flags.trim().split(/\s+/).filter(Boolean) : [],
              },
            }),
          );
        }}
      >
        {t('save')}
      </Button>
    </details>
  );
}
