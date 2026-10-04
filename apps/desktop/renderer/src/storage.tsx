import { useApp } from './context';
import { Button, useData, ErrorBox, Loading, Empty, bytes, Chart } from './ui';
import { HardDrive } from 'lucide-react';
import { storageCategories } from '../../../../packages/domain/storage';
export function StorageView({ serverId }: { serverId: string }) {
  const { api, t, busy, run } = useApp(),
    data = useData(() => api.storageOverview(serverId), [serverId]);
  const report = data.data?.latest;
  return (
    <section className="panel storage-panel">
      <div className="section-heading">
        <div>
          <h2>{t('storageDetails')}</h2>
          <p>{t('storageDetailsHelp')}</p>
        </div>
        <Button
          disabled={busy}
          onClick={() => {
            void run(() => api.scanStorage(serverId)).then((result) => {
              if (result.ok) data.reload();
            });
          }}
        >
          {t('analyzeStorage')}
        </Button>
      </div>
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} retryLabel={t('retry')} />
      ) : data.loading ? (
        <Loading label={t('loading')} />
      ) : !report ? (
        <Empty icon={<HardDrive />} title={t('noStorageScan')} />
      ) : (
        <>
          <div className="storage-totals">
            <strong>{bytes(report.totalBytes)}</strong>
            <span>
              {report.files} {t('files')}
            </span>
            <span>{new Date(report.at).toLocaleString()}</span>
          </div>
          {!!report.excludedEntries && (
            <p className="warning-text">
              {t('storageExcluded')}: {report.excludedEntries}
            </p>
          )}
          <div className="storage-categories">
            {storageCategories.map((category) => (
              <div key={category}>
                <span>{t(('storage.' + category) as 'storage.worlds')}</span>
                <strong>{bytes(report.categories[category])}</strong>
                <meter
                  min={0}
                  max={Math.max(1, report.totalBytes)}
                  value={report.categories[category]}
                />
              </div>
            ))}
          </div>
          {!!data.data?.history.length && (
            <Chart
              label={t('storageTrend')}
              values={data.data.history.map((entry) => entry.totalBytes / 1024 ** 3)}
              suffix=" GB"
            />
          )}
          <h3>{t('largestFiles')}</h3>
          <div className="storage-files">
            {report.largest.map((file) => (
              <div className="storage-file" key={(file.backupId ?? '') + file.relativePath}>
                <div>
                  <strong>{file.relativePath}</strong>
                  <small>
                    {t(('storage.' + file.category) as 'storage.worlds')} ·{' '}
                    {new Date(file.modifiedAt).toLocaleString()}
                  </small>
                </div>
                <span>{bytes(file.size)}</span>
                <Button
                  onClick={() => {
                    void run(() =>
                      api.revealStorageFile(serverId, {
                        relativePath: file.relativePath,
                        backupId: file.backupId,
                      }),
                    );
                  }}
                >
                  {t('showInFolder')}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
