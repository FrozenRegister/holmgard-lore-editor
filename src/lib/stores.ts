/**
 * Svelte writable stores — single source of truth for the app.
 */
import { writable, derived } from 'svelte/store';
import type { Topic, SyncState, ConflictInfo, AppSettings } from './types';

// ── Topics ────────────────────────────────────────────────────────────────────

export const topics = writable<Topic[]>([]);

export const topicMap = derived(topics, ($topics) => {
  const map = new Map<string, Topic>();
  for (const t of $topics) map.set(t.key, t);
  return map;
});

// ── Settings ──────────────────────────────────────────────────────────────────

export const settings = writable<AppSettings>({
  workerHost: 'https://holmgard-lore-mcp.frozenregister.workers.dev',
  autoSyncIntervalSecs: 30,
  syncHistory: false,
});

// ── Sync state ────────────────────────────────────────────────────────────────

export const syncState = writable<SyncState>({ status: 'idle' });

// ── Active conflict waiting for resolution ────────────────────────────────────

export const conflictQueue = writable<ConflictInfo[]>([]);
export const activeConflict = derived(conflictQueue, $q => $q[0] ?? null);

// Auto-reset syncState when all conflicts are resolved
conflictQueue.subscribe(($q) => {
  if ($q.length === 0) {
    syncState.update(($s) =>
      $s.status === 'conflict'
        ? { status: 'success', lastSync: new Date().toISOString() }
        : $s
    );
  }
});

// ── UI state ──────────────────────────────────────────────────────────────────

/** Key of the topic currently open in the editor */
export const activeTopicKey = writable<string | null>(null);

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  isStreaming?: boolean;
}

export const chatOpen = writable<boolean>(false);
export const chatMessages = writable<ChatMessage[]>([]);

/** True while loading initial data */
export const initialising = writable(true);

// ── Notification / toast ──────────────────────────────────────────────────────

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

let _toastId = 0;
export const toasts = writable<Toast[]>([]);

export function showToast(
  message: string,
  type: Toast['type'] = 'info',
  durationMs = 3500
): void {
  const id = ++_toastId;
  toasts.update((ts) => [...ts, { id, message, type }]);
  setTimeout(() => {
    toasts.update((ts) => ts.filter((t) => t.id !== id));
  }, durationMs);
}
