// ── Topic model ───────────────────────────────────────────────────────────────

export interface TopicMeta {
  updatedAt: string; // ISO-8601
  version: number;
  syncedAt?: string;
  removedFromRemote?: boolean;
}

export interface Topic {
  key: string;
  text: string; // Markdown (may contain ```json / ```xml blocks)
  meta: TopicMeta;
}

// ── Version history ───────────────────────────────────────────────────────────

export interface HistoryEntry {
  savedAt: string;
  version: number;
  text: string;
  source?: 'local' | 'remote' | 'conflict';
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'conflict'
  | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSync?: string;
  error?: string;
}

export interface ConflictInfo {
  key: string;
  base: string;   // last known remote version before local edits
  local: string;  // current local text
  remote: string; // current remote text
  remoteMeta: TopicMeta;
}

// ── Offline queue ─────────────────────────────────────────────────────────────

export interface QueuedSave {
  key: string;
  text: string;
  enqueuedAt: string;
  attempts: number;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface AppSettings {
  workerHost: string; // e.g. https://holmgard-lore-mcp.frozenregister.workers.dev
  encryptedSecret?: string; // AES-GCM ciphertext (base64), backed up on disk
  iv?: string;              // base64 IV used during encryption
  autoSyncIntervalSecs: number; // 0 = disabled; default 30
  syncHistory: boolean;  // when false, remote syncs skip writing history entries
}

// ── Import / Export bundle ────────────────────────────────────────────────────

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  topics: Topic[];
}
