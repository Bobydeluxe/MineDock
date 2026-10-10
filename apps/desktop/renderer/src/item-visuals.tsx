import { useEffect, useRef, useState } from 'react';
import { CircleHelp, FolderSearch } from 'lucide-react';
import { useApp } from './context';
import { Button, useData } from './ui';
import type { Server } from '../../../../packages/domain/types';
import type { ItemStack, ItemVisual } from '../../../../packages/domain/administration';
import { engineDefinition } from '../../../../packages/domain/engines';
import type { Key } from './i18n';
import { actualEnchantments } from '../../../../packages/domain/item-presentation';

export function useItemText() {
  const { t } = useApp();
  return (key: string) => t(('items.' + key) as Key);
}
// Only visible thumbnails initiate IPC. The privileged service shares all work and owns disk/HTTP.
export function ItemThumbnail({
  server,
  item,
  large = false,
  showName = false,
  tooltipId,
}: {
  server: Server;
  item: Pick<ItemStack, 'id' | 'components'> & Partial<ItemStack>;
  large?: boolean;
  showName?: boolean;
  tooltipId?: string;
}) {
  const { api, snapshot } = useApp(),
    a = useItemText(),
    ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false),
    [resolved, setResolved] = useState<{ context: string; visual: ItemVisual }>(),
    [generation, setGeneration] = useState(0);
  const version = server.minecraftVersion ?? server.version,
    state = JSON.stringify(item.components),
    requestContext = JSON.stringify([
      server.id,
      server.engine,
      version,
      item.id,
      state,
      generation,
      snapshot.settings.language,
    ]),
    visual =
      resolved?.context === requestContext && resolved.visual.version === version
        ? resolved.visual
        : undefined;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '80px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const listener = () => setGeneration((n) => n + 1);
    window.addEventListener('minedock-item-assets', listener);
    return () => window.removeEventListener('minedock-item-assets', listener);
  }, []);
  useEffect(() => {
    let active = true;
    if (visible && engineDefinition(server.engine).edition === 'java')
      void api
        .itemVisual(server.id, { id: item.id, components: JSON.parse(state) })
        .then((v) => {
          if (active) setResolved({ context: requestContext, visual: v });
        })
        .catch(() => {
          if (active)
            setResolved({
              context: requestContext,
              visual: {
                id: item.id,
                version,
                name: item.id,
                source: 'local-client',
                status: 'unavailable',
              },
            });
        });
    return () => {
      active = false;
    };
  }, [
    api,
    server.id,
    server.engine,
    version,
    item.id,
    state,
    visible,
    generation,
    snapshot.settings.language,
    requestContext,
  ]);
  const name = visual?.name ?? item.id.split(':')[1]?.replaceAll('_', ' ') ?? item.id,
    status =
      engineDefinition(server.engine).edition !== 'java'
        ? 'edition'
        : (visual?.status ?? 'loading'),
    description = `${name} · ${item.id}${item.count ? ' × ' + item.count : ''} · ${engineDefinition(server.engine).edition} ${version} · ${a(status)}`,
    maximum = item.components['minecraft:max_damage'];
  return (
    <span ref={ref} className={'item-visual' + (large ? ' large' : '')} title={description}>
      <span className="item-picture" role="img" aria-label={description}>
        {visual?.url ? (
          <img
            src={visual.url}
            alt=""
            draggable={false}
            onError={() =>
              setResolved((v) =>
                v ? { ...v, visual: { ...v.visual, url: undefined, status: 'unavailable' } } : v,
              )
            }
          />
        ) : (
          <CircleHelp size={large ? 40 : 22} aria-hidden="true" />
        )}
        {actualEnchantments(item).length > 0 && (
          <span className="item-enchanted" aria-label={a('enchanted')}>
            ✦
          </span>
        )}
        {typeof maximum === 'number' &&
          Number.isSafeInteger(maximum) &&
          maximum > 0 &&
          typeof item.damage === 'number' &&
          Number.isFinite(item.damage) && (
            <span
              className="item-durability"
              role="meter"
              aria-label={a('durability')}
              aria-valuemin={0}
              aria-valuemax={maximum}
              aria-valuenow={Math.max(0, maximum - item.damage)}
            >
              <span
                style={{
                  width: Math.max(0, Math.min(100, 100 * (1 - item.damage / maximum))) + '%',
                }}
              />
            </span>
          )}
      </span>
      {showName && <span className="item-readable-name">{name}</span>}
      <span className="item-tooltip" role="tooltip" id={tooltipId}>
        {description}
      </span>
    </span>
  );
}
export function ItemAssetSetup({ server }: { server: Server }) {
  const { api, run, busy } = useApp(),
    a = useItemText(),
    [generation, setGeneration] = useState(0);
  const java = engineDefinition(server.engine).edition === 'java',
    version = server.minecraftVersion ?? server.version;
  const context = useData(
    () => (java ? api.itemAssetContext(server.id) : Promise.resolve(null)),
    [server.id, version, generation, java],
  );
  if (!java) return <p className="hint">{a('edition')}</p>;
  return (
    <div className="item-assets-setup">
      <p className="hint">
        Java {version} · {a(context.data?.available ? 'localClient' : 'setupHelp')}
      </p>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          void run(() => api.itemAssetImport(server.id)).then((r) => {
            if (r.ok) {
              setGeneration((n) => n + 1);
              window.dispatchEvent(new Event('minedock-item-assets'));
            }
          });
        }}
      >
        <FolderSearch size={15} />
        {a('findClient')}
      </Button>
    </div>
  );
}
