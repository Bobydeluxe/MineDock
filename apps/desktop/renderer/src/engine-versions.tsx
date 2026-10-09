import { useEffect, useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import type { Engine } from '../../../../packages/domain/types';
import type { CatalogOption } from '../../../../packages/domain/catalogs';
import { useApp } from './context';
import { Button, Field, Toggle, useData, Loading, ErrorBox } from './ui';
export interface EngineChoice {
  version: string;
  build?: string;
  loaderVersion?: string;
  installerVersion?: string;
}
export function EngineVersionPicker({
  engine,
  value,
  onChange,
  onReady,
  locked = false,
}: {
  engine: Engine;
  value: EngineChoice;
  onChange: (value: EngineChoice) => void;
  onReady?: (ready: boolean) => void;
  locked?: boolean;
}) {
  const { api, t } = useApp();
  const [all, setAll] = useState(false),
    [snapshots, setSnapshots] = useState(false),
    [filter, setFilter] = useState(''),
    [refresh, setRefresh] = useState(0);
  const catalog = useData(
    () => api.engineCatalog(engine, value.version || undefined, refresh > 0, snapshots),
    [engine, value.version, refresh, snapshots],
  );
  const data = catalog.data;
  const hasBuild = !['vanilla', 'bedrock', 'pocketmine'].includes(engine),
    isLoader = ['fabric', 'forge', 'neoforge'].includes(engine);
  const build = isLoader ? value.loaderVersion : value.build;
  const ready =
    !catalog.loading &&
    !catalog.error &&
    !!data &&
    data.minecraftVersion === (value.version || undefined) &&
    data.versions.some((v) => v.version === value.version) &&
    (!hasBuild || data.builds.some((v) => v.version === build)) &&
    (engine !== 'fabric' || data.installers.some((v) => v.version === value.installerVersion));
  useEffect(() => {
    onReady?.(ready);
  }, [ready, onReady]);
  useEffect(() => {
    if (
      !data ||
      catalog.loading ||
      data.engine !== engine ||
      data.minecraftVersion !== (value.version || undefined)
    )
      return;
    const recommended = (options: CatalogOption[]) => options.find((v) => v.recommended)?.version;
    if (!value.version) {
      const version = recommended(data.versions);
      if (version) onChange({ ...value, version });
      return;
    }
    if ((hasBuild && !build) || (engine === 'fabric' && !value.installerVersion)) {
      const next = {
        ...value,
        ...(isLoader
          ? { loaderVersion: build ?? recommended(data.builds) }
          : { build: build ?? recommended(data.builds) }),
        installerVersion:
          engine === 'fabric'
            ? (value.installerVersion ?? recommended(data.installers))
            : undefined,
      };
      if (
        next.build !== value.build ||
        next.loaderVersion !== value.loaderVersion ||
        next.installerVersion !== value.installerVersion
      )
        onChange(next);
    }
  }, [data, catalog.loading, engine, value, build, hasBuild, isLoader, onChange]);
  const list = (
    options: CatalogOption[],
    selected: string | undefined,
    label: string,
    set: (v: string) => void,
  ) => (
    <section className="catalog-list" aria-label={label}>
      <header>
        <h3>{label}</h3>
        <span className="badge">{options.length}</span>
      </header>
      <div className="catalog-scroll" role="group" aria-label={label}>
        {options
          .filter((v) => v.version.toLowerCase().includes(filter.toLowerCase()))
          .map((option) => (
            <button
              type="button"
              key={option.version}
              className={selected === option.version ? 'selected' : ''}
              aria-pressed={selected === option.version}
              disabled={locked}
              onClick={() => set(option.version)}
            >
              <span className="catalog-radio" aria-hidden="true">
                {selected === option.version && <Check size={12} />}
              </span>
              <strong>{option.version}</strong>
              {option.recommended && <span className="badge enabled">{t('recommended')}</span>}
              {!option.stable && <small>{t('catalog.unconfirmed')}</small>}
            </button>
          ))}
      </div>
    </section>
  );
  return (
    <div className="engine-version-picker">
      <div className="section-heading">
        <h3>{t(engine === 'fabric' ? 'catalog.fabric' : 'minecraftVersion')}</h3>
        <Button
          disabled={catalog.loading || locked}
          aria-label={t('catalog.refresh')}
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={15} />
          {t('catalog.refresh')}
        </Button>
      </div>
      {catalog.error ? (
        <ErrorBox error={catalog.error} retry={catalog.reload} retryLabel={t('retry')} />
      ) : catalog.loading ? (
        <Loading label={t('loading')} />
      ) : (
        data && (
          <>
            <Field label={t(engine === 'pocketmine' ? 'pocketmineVersion' : 'minecraftVersion')}>
              <select
                value={value.version}
                disabled={locked}
                onChange={(e) => onChange({ ...value, version: e.target.value, build: undefined })}
              >
                {!data.versions.some((v) => v.version === value.version) && value.version && (
                  <option>{value.version}</option>
                )}
                {data.versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}
                    {v.recommended
                      ? ` · ${t('recommended')}`
                      : !v.stable
                        ? ` · ${t('catalog.unconfirmed')}`
                        : ''}
                  </option>
                ))}
              </select>
            </Field>
            {engine === 'vanilla' && (
              <Toggle
                label={t('catalog.snapshots')}
                checked={snapshots}
                onChange={setSnapshots}
                disabled={locked}
              />
            )}
            {hasBuild && (
              <>
                <Toggle label={t('catalog.showAll')} checked={all} onChange={setAll} />
                {!all ? (
                  <div className="catalog-summary">
                    <span>
                      {t(isLoader ? 'loaderVersion' : 'version')}: <strong>{build ?? '—'}</strong>
                    </span>
                    {engine === 'fabric' && (
                      <span>
                        {t('installerVersion')}: <strong>{value.installerVersion ?? '—'}</strong>
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <Field label={t('catalog.filter')}>
                      <input value={filter} onChange={(e) => setFilter(e.target.value)} />
                    </Field>
                    <div className="catalog-columns">
                      {list(data.builds, build, t(isLoader ? 'loaderVersion' : 'version'), (v) =>
                        onChange({ ...value, ...(isLoader ? { loaderVersion: v } : { build: v }) }),
                      )}
                      {engine === 'fabric' &&
                        list(data.installers, value.installerVersion, t('installerVersion'), (v) =>
                          onChange({ ...value, installerVersion: v }),
                        )}
                    </div>
                  </>
                )}
                {((build && data.builds.some((v) => v.version === build && !v.stable)) ||
                  (value.installerVersion &&
                    data.installers.some(
                      (v) => v.version === value.installerVersion && !v.stable,
                    ))) && <p className="warning-text">{t('catalog.experimental')}</p>}
              </>
            )}
            {!ready && value.version && (
              <p className="warning-text" role="status">
                {t('catalog.review')}
              </p>
            )}
            {engine === 'pocketmine' && <p className="hint">{t('pocketmineSupport')}</p>}
            <p className={data.offline ? 'warning-text' : 'hint'}>
              {t(
                data.offline
                  ? 'catalog.offline'
                  : data.cached
                    ? 'catalog.cached'
                    : 'catalog.official',
              )}{' '}
              · {new Date(data.fetchedAt).toLocaleString()}
            </p>
          </>
        )
      )}
    </div>
  );
}
