import { useState } from 'react';
import type { Server } from '../../../../packages/domain/types';
import type { MacroInput, LogSearchResult } from '../../../../packages/domain/console';
import { useApp } from './context';
import { Button, Field, Dialog } from './ui';
export function ConsoleToolsView({ server }: { server: Server }) {
  const { api, t, run, busy } = useApp(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [player, setPlayer] = useState(''),
    [category, setCategory] = useState<'all' | 'chat' | 'warnings' | 'errors'>('all'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [result, setResult] = useState<LogSearchResult>(),
    [builder, setBuilder] = useState(false),
    [name, setName] = useState(''),
    [steps, setSteps] = useState<MacroInput['steps']>([{ type: 'save' }]);
  const presets: MacroInput[] = [
    {
      name: t('console.restart5'),
      steps: [
        { type: 'announce', message: '[MineDock] Restarting in 5 minutes.' },
        { type: 'delay', seconds: 300 },
        { type: 'restart' },
      ],
    },
    { name: t('console.saveStop'), steps: [{ type: 'save' }, { type: 'stop' }] },
    { name: t('console.backupRestart'), steps: [{ type: 'backup' }, { type: 'restart' }] },
    {
      name: t('console.announceRestart'),
      steps: [
        { type: 'announce', message: '[MineDock] Restarting in 30 seconds.' },
        { type: 'delay', seconds: 30 },
        { type: 'restart' },
      ],
    },
  ];
  return (
    <details className="panel">
      <summary>{t('console.tools')}</summary>
      <div className="actions">
        <Button onClick={() => setOpen(true)}>{t('console.history')}</Button>
        <Button onClick={() => setBuilder(true)}>{t('console.customMacro')}</Button>
      </div>
      <p>{t('console.macroHelp')}</p>
      {[...presets, ...(server.macros ?? [])].map((macro, index) => (
        <Button
          key={index}
          disabled={busy || server.status !== 'running'}
          onClick={() => {
            void run(() => api.runMacro(server.id, macro));
          }}
        >
          {macro.name}
        </Button>
      ))}
      {open && (
        <Dialog title={t('console.history')} closeLabel={t('close')} onClose={() => setOpen(false)}>
          <div className="form-grid">
            <Field label={t('searchLogs')}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </Field>
            <Field label={t('playerName')}>
              <input value={player} onChange={(e) => setPlayer(e.target.value)} />
            </Field>
            <Field label={t('console.category')}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                {(['all', 'chat', 'warnings', 'errors'] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(
                      c === 'all'
                        ? 'allLevels'
                        : c === 'chat'
                          ? 'console.chat'
                          : c === 'warnings'
                            ? 'console.warnings'
                            : 'console.errors',
                    )}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('console.from')}>
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t('console.to')}>
              <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Button
            disabled={busy}
            onClick={() => {
              void run(() =>
                api.searchHistoricalLogs(server.id, {
                  query,
                  player,
                  category,
                  from: from ? new Date(from).toISOString() : undefined,
                  to: to ? new Date(to).toISOString() : undefined,
                }),
              ).then((r) => {
                if (r.ok) setResult(r.value);
              });
            }}
          >
            {t('search')}
          </Button>
          {result && (
            <>
              <p>
                {result.files} {t('files')} · {result.lines.length} ·{' '}
                {result.truncated ? t('console.truncated') : ''}
              </p>
              <pre style={{ maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {result.lines.map((l) => l.file + ' · ' + l.text).join('\n')}
              </pre>
            </>
          )}
        </Dialog>
      )}
      {builder && (
        <Dialog
          title={t('console.customMacro')}
          closeLabel={t('close')}
          onClose={() => setBuilder(false)}
        >
          <Field label={t('name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          {steps.map((step, index) => (
            <div className="installed-row" key={index}>
              <select
                aria-label={t('action')}
                value={step.type}
                onChange={(e) => {
                  const type = e.target.value as MacroInput['steps'][number]['type'];
                  setSteps(
                    steps.map((s, i) =>
                      i === index
                        ? type === 'delay'
                          ? { type, seconds: 30 }
                          : type === 'announce'
                            ? { type, message: '' }
                            : { type }
                        : s,
                    ),
                  );
                }}
              >
                {(['announce', 'delay', 'save', 'backup', 'stop', 'restart'] as const).map(
                  (type) => (
                    <option key={type} value={type}>
                      {t(
                        type === 'announce'
                          ? 'console.announcement'
                          : type === 'delay'
                            ? 'console.delay'
                            : type,
                      )}
                    </option>
                  ),
                )}
              </select>
              {step.type === 'announce' && (
                <input
                  aria-label={t('console.announcement')}
                  value={step.message}
                  onChange={(e) =>
                    setSteps(
                      steps.map((s, i) => (i === index ? { ...step, message: e.target.value } : s)),
                    )
                  }
                />
              )}{' '}
              {step.type === 'delay' && (
                <input
                  aria-label={t('console.delay')}
                  type="number"
                  value={step.seconds}
                  min={1}
                  max={300}
                  onChange={(e) =>
                    setSteps(
                      steps.map((s, i) =>
                        i === index ? { ...step, seconds: Number(e.target.value) } : s,
                      ),
                    )
                  }
                />
              )}
              <Button
                disabled={steps.length === 1}
                onClick={() => setSteps(steps.filter((_, i) => i !== index))}
              >
                {t('delete')}
              </Button>
            </div>
          ))}
          <Button
            disabled={steps.length >= 20}
            onClick={() => setSteps([...steps, { type: 'save' }])}
          >
            {t('console.addStep')}
          </Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={() => {
              void run(() => api.saveMacro(server.id, { name, steps })).then((r) => {
                if (r.ok) setBuilder(false);
              });
            }}
          >
            {t('save')}
          </Button>
        </Dialog>
      )}
    </details>
  );
}
