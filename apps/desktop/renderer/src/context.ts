import { createContext, useContext } from 'react';
import type { Api, Snapshot } from '../../../../packages/domain/types';
import type { Key } from './i18n';
export type Run = <T>(
  action: () => Promise<T>,
  message?: string,
) => Promise<{ ok: true; value: T } | { ok: false }>;
export interface AppContextValue {
  api: Api;
  snapshot: Snapshot;
  t: (key: Key) => string;
  run: Run;
  busy: boolean;
  refresh: () => Promise<void>;
  error?: string;
  dismissError: () => void;
}
export const AppContext = createContext<AppContextValue | undefined>(undefined);
export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('App context missing.');
  return value;
}
