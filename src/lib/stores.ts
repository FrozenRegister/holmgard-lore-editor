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
  autoSync: true,
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

/** True when the viewport is mobile-width (≤768px). Set by the root layout. */
export const isMobile = writable(false);

/** Editor mode in the world map ('edit' or 'explorer'). Updated when switching view modes. */
export const editorMode = writable<'edit' | 'explorer'>('edit');

/** Auto-collapse sidebar when on world map in edit mode */
export const collapseSidebar = derived(
  [editorMode],
  ([$editorMode]) => $editorMode === 'edit'
);

// ── Topic list filters (persisted to localStorage) ────────────────────────────

function createFilterStore<T>(key: string, defaultValue: T) {
  const stored = typeof window !== 'undefined' ? localStorage.getItem(`lore:filter:${key}`) : null;
  const initial = stored ? JSON.parse(stored) : defaultValue;
  const store = writable<T>(initial);
  store.subscribe((value) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`lore:filter:${key}`, JSON.stringify(value));
    }
  });
  return store;
}

export const listActiveType = createFilterStore<string | null>('activeType', null);
export const listActiveStatus = createFilterStore<string | null>('activeStatus', null);
export const listSortBy = createFilterStore<string>('sortBy', 'name-asc');
export const selectedForDeletion = createFilterStore<string[]>('selectedForDeletion', []);

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

// ── MCP ──────────────────────────────────────────────────────────────────────
export const mcpOpen = writable<boolean>(false);

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
