/**
 * Default application settings.
 * This is the single source of truth for AppSettings defaults.
 * Imported by both storage.ts and stores.ts to prevent drift.
 */
import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  workerHost: 'https://holmgard-lore-mcp.frozenregister.workers.dev',
  autoSyncIntervalSecs: 30,
  autoSync: true,
  syncHistory: true,
};
