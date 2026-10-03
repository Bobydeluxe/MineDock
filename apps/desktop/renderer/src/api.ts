import type { Api } from '../../../../packages/domain/types';
import { createMockApi } from './mock';
declare global {
  interface Window {
    minedock?: Api;
  }
}
export const api =
  window.minedock ?? (import.meta.env.MODE === 'mock' ? createMockApi() : undefined);
