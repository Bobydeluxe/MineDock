import { useState } from 'react';
import { Coffee } from 'lucide-react';
import { useApp } from './context';
import { Button, Field, Dialog, Empty, ErrorBox, Loading, useData } from './ui';
import type { RuntimeEntry, RuntimeHealth } from '../../../../packages/domain/runtimes';
export function RuntimeControls() {
  const { api, t, run, busy } = useApp();
  const data = useData(() => api.runtimeEntries(), []);
  const [health, setHealth] = useState<Record<string, RuntimeHealth>>({}),
    [selection, setSelection] = useState<{ entry: RuntimeEntry; action: 'repair' | 'delete' }>(),
    [confirmation, setConfirmation] = useState(''),
    [replacementId, setReplacementId] = useState('');
  const open = (entry: RuntimeEntry, action: 'repair' | 'delete') => {
    setSelection({ entry, action });
    setConfirmation('');
    setReplacementId('');
  };
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{t('runtimes')}</h2>
          <p>{t('runtimeMaintenanceHelp')}</p>
        </div>
        <Button disabled={busy || data.loading} onClick={data.reload}>
          {t('refresh')}
        </Button>
      </div>
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} retryLabel={t('retry')} />
      ) : data.loading ? (
        <Loading label={t('loading')} />
      ) : !data.data?.length ? (
        <Empty icon={<Coffee />} title={t('notInstalled')} />
      ) : (
        data.data.map((entry) => (
          <article className="runtime-details" key={entry.id}>
            <div className="section-heading">
              <div>
                <h3>{entry.name}</h3>
                <p>
                  {entry.type === 'php' ? 'PHP' : 'Java'} ·{' '}
                  {t(entry.source === 'managed' ? 'managed' : 'systemRuntime')} ·{' '}
                  {entry.arch ?? t('unavailable')}
                </p>
              </div>
              <strong className={health[entry.id]?.status === 'healthy' ? 'green' : ''}>
                {health[entry.id]
                  ? t(('runtime.' + health[entry.id]!.status) as 'runtime.healthy')
                  : t('runtimeUnchecked')}
              </strong>
            </div>
            <code>{entry.path}</code>
            {health[entry.id] && (
              <p className="muted small-text">
                {health[entry.id]!.version ?? t('unavailable')} ·{' '}
                {health[entry.id]!.arch ?? t('unavailable')} ·{' '}
                {new Date(health[entry.id]!.checkedAt).toLocaleString()}
              </p>
            )}
            <p>
              {t('runtimeUsedBy')}:{' '}
              {entry.uses.length
                ? entry.uses
                    .map((use) => use.name + (use.active ? ' (' + t('running') + ')' : ''))
                    .join(', ')
                : t('runtimeUnused')}
            </p>
            <div className="actions">
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() => api.runtimeHealth(entry.id)).then((result) => {
                    if (result.ok)
                      setHealth((current) => ({ ...current, [entry.id]: result.value }));
                  });
                }}
              >
                {t('verifyRuntime')}
              </Button>
              {entry.source === 'managed' && (
                <>
                  <Button
                    disabled={busy || entry.uses.some((use) => use.active)}
                    onClick={() => open(entry, 'repair')}
                  >
                    {t('repairRuntime')}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy || entry.uses.some((use) => use.active)}
                    onClick={() => open(entry, 'delete')}
                  >
                    {t('delete')}
                  </Button>
                </>
              )}
            </div>
          </article>
        ))
      )}
      <div className="runtime-install-options">
        {[8, 11, 16, 17, 21, 25]
          .filter(
            (major) =>
              !data.data?.some(
                (entry) =>
                  entry.type === 'java' && entry.source === 'managed' && entry.major === major,
              ),
          )
          .map((major) => (
            <Button
              disabled={busy || data.loading || !!data.error}
              key={major}
              onClick={() => {
                void run(() => api.installRuntime(major)).then((result) => {
                  if (result.ok) data.reload();
                });
              }}
            >
              {t('install')} Java {major}
            </Button>
          ))}
      </div>
      {selection && (
        <Dialog
          title={t(selection.action === 'repair' ? 'repairRuntime' : 'delete')}
          closeLabel={t('close')}
          onClose={() => setSelection(undefined)}
        >
          <div className="dialog-body">
            <p>{t(selection.action === 'repair' ? 'runtimeRepairHelp' : 'runtimeDeleteHelp')}</p>
            <code className="confirm-name">{selection.entry.id}</code>
            {selection.action === 'delete' && !!selection.entry.uses.length && (
              <Field
                label={t('replacementRuntime')}
                hint={selection.entry.uses.map((use) => use.name).join(', ')}
              >
                <select
                  value={replacementId}
                  onChange={(event) => setReplacementId(event.target.value)}
                >
                  <option value="">{t('selectReplacement')}</option>
                  {data.data
                    ?.filter(
                      (entry) =>
                        entry.id !== selection.entry.id &&
                        entry.type === selection.entry.type &&
                        entry.major === selection.entry.major,
                    )
                    .map((entry) => (
                      <option value={entry.id} key={entry.id}>
                        {entry.name} · {entry.path}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label={t('runtimeConfirmId')}>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setSelection(undefined)}>{t('cancel')}</Button>
            <Button
              variant={selection.action === 'delete' ? 'danger' : 'primary'}
              disabled={
                busy ||
                confirmation !== selection.entry.id ||
                (selection.action === 'delete' && !!selection.entry.uses.length && !replacementId)
              }
              onClick={() => {
                const input = {
                  id: selection.entry.id,
                  confirmation,
                  replacementId: replacementId || undefined,
                };
                void run(() =>
                  selection.action === 'delete'
                    ? api.deleteRuntime(input)
                    : api.repairRuntime(input),
                ).then((result) => {
                  if (result.ok) {
                    setSelection(undefined);
                    setHealth({});
                    data.reload();
                  }
                });
              }}
            >
              {t(selection.action === 'delete' ? 'delete' : 'repairRuntime')}
            </Button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
