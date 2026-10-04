import type { EngineId } from '../../../../packages/domain/engines';
import vanilla from './assets/engines/vanilla.svg';
import paper from './assets/engines/paper.svg';
import purpur from './assets/engines/purpur.svg';
import fabric from './assets/engines/fabric.svg';
import forge from './assets/engines/forge.svg';
import neoforge from './assets/engines/neoforge.svg';
import bedrock from './assets/engines/bedrock.svg';
import pocketmine from './assets/engines/pocketmine.svg';

const icons: Record<EngineId, string> = {
  vanilla,
  paper,
  purpur,
  fabric,
  forge,
  neoforge,
  bedrock,
  pocketmine,
};
export function EngineIcon({ engine, size = 36 }: { engine: EngineId; size?: number }) {
  return (
    <img
      className="engine-mark"
      data-engine={engine}
      src={icons[engine]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
