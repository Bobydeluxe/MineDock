/** Curated paths from Paper's global/world schemas. Only use fields present in the actual file. */
export const paperSettings: Record<string, { min?: number; max?: number }> = {
  'config/paper-global.yml:chunk-system.io-threads': { min: -1, max: 256 },
  'config/paper-global.yml:chunk-system.worker-threads': { min: -1, max: 256 },
  'config/paper-global.yml:watchdog.early-warning-delay': { min: 0, max: 2147483647 },
  'config/paper-global.yml:watchdog.early-warning-every': { min: 0, max: 2147483647 },
  'config/paper-global.yml:player-auto-save.rate': { min: -1, max: 2147483647 },
  'config/paper-global.yml:player-auto-save.max-per-tick': { min: -1, max: 1000000 },
  'config/paper-world-defaults.yml:chunks.auto-save-interval': { min: -1, max: 2147483647 },
  'config/paper-world-defaults.yml:chunks.max-auto-save-chunks-per-tick': { min: 1, max: 1000000 },
  'config/paper-world-defaults.yml:collisions.max-entity-collisions': { min: 0, max: 1000 },
  'config/paper-world-defaults.yml:environment.disable-explosion-knockback': {},
  'config/paper-world-defaults.yml:environment.disable-thunder': {},
  'config/paper-world-defaults.yml:environment.disable-ice-and-snow': {},
};
