import { useState } from 'react';
import { useApp } from './context';
import { Button, Dialog, Field, Loading, ErrorBox, useData, bytes } from './ui';
export function RecoveryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, run, busy, t, snapshot } = useApp();
  const review = useData(() => api.recoveryReview(id), [id]);
  const [confirmation, setConfirmation] = useState('');
  const [backupId, setBackupId] = useState('');
  return (
    <Dialog title={t('reviewRecovery')} closeLabel={t('close')} onClose={onClose}>
      <div className="dialog-body">
        <p>{t('recoveryHelp')}</p>
        {review.error ? (
          <ErrorBox error={review.error} retry={review.reload} retryLabel={t('retry')} />
        ) : review.loading ? (
          <Loading label={t('loading')} />
        ) : (
          review.data && (
            <>
              <strong>{review.data.label}</strong>
              {review.data.copies.map((copy) => (
                <Field
                  key={copy.role}
                  label={`${t(('recovery.' + copy.role) as 'recovery.destination')} · ${t(copy.exists ? 'recoveryPresent' : 'recoveryMissing')}`}
                >
                  <input readOnly value={copy.path} />
                </Field>
              ))}
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() =>
                    api.resolveOperation(id, { action: 'retry', confirmation: '' }),
                  ).then(() => review.reload());
                }}
              >
                {t('retryRecovery')}
              </Button>
              <Field label={t('recoveryConfirmation')} hint={review.data.label}>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Field>
              <Button
                disabled={
                  busy || !review.data.rollbackAvailable || confirmation !== review.data.label
                }
                onClick={() => {
                  void run(() =>
                    api.resolveOperation(id, { action: 'rollback', confirmation }),
                  ).then((result) => {
                    if (result.ok) onClose();
                  });
                }}
              >
                {t('restoreOriginal')}
              </Button>
              {review.data.backups.length > 0 && (
                <>
                  <Field label={t('backups')}>
                    <select value={backupId} onChange={(event) => setBackupId(event.target.value)}>
                      <option value="">{t('selectBackup')}</option>
                      {review.data.backups.map((backup) => (
                        <option key={backup.id} value={backup.id}>
                          {backup.name} ·{' '}
                          {new Date(backup.createdAt).toLocaleString(snapshot.settings.language)} ·{' '}
                          {bytes(backup.size)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    disabled={busy || !backupId || confirmation !== review.data.label}
                    onClick={() => {
                      void run(() =>
                        api.resolveOperation(id, { action: 'backup', confirmation, backupId }),
                      ).then((result) => {
                        if (result.ok) onClose();
                      });
                    }}
                  >
                    {t('restore')}
                  </Button>
                </>
              )}
              <p className="hint">{t('recoveryPreserved')}</p>
              {review.data.preservedCopies.map((copy) => (
                <input key={copy} readOnly value={copy} />
              ))}
            </>
          )
        )}
      </div>
    </Dialog>
  );
}
