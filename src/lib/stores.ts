/**
 * Svelte writable stores — single source of truth for the app.
 */
import { writable, derived } from 'svelte/store';
import type { Topic, SyncState, ConflictInfo, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './defaults';
import { extractWikiLinks, resolveWikiLink } from './wiki-links';

// ── Topics ────────────────────────────────────────────────────────────────────

export const topics = writable<Topic[]>([]);

export const topicMap = derived(topics, ($topics) => {
  const map = new Map<string, Topic>();
  for (const t of $topics) map.set(t.key, t);
  return map;
});

/** Map from target topic key → list of source topic keys that reference it via [[wiki-links]]. */
export const backlinksIndex = derived(topics, ($topics) => {
  const keys = $topics.map(t => t.key);
  const index = new Map<string, string[]>();
  for (const t of $topics) {
    for (const label of extractWikiLinks(t.text ?? '')) {
      const target = resolveWikiLink(label, keys);
      if (!target) continue;
      const list = index.get(target) ?? [];
      if (!list.includes(t.key)) list.push(t.key);
      index.set(target, list);
    }
  }
  return index;
});

// ── Settings ──────────────────────────────────────────────────────────────────

export const settings = writable<AppSettings>(DEFAULT_SETTINGS);

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
  // SSR guard: `typeof window !== 'undefined'` branch (lines 79, 85) is never false in jsdom tests.
  // In jsdom, window is always defined. The guard is correct for SSR (Node.js) environments, but
  // tests run in jsdom where this check always returns true. This is acceptable: the actual
  // persistence mechanism (localStorage write-back in subscribe) is tested and works correctly
  // (see stores.test.ts lines 478-499). The false branch would only execute in a true Node.js
  // SSR environment (e.g., SvelteKit's server-side page load), which isn't tested here.
  /* c8 ignore next 1 */
  const stored = typeof window !== 'undefined' ? localStorage.getItem(`lore:filter:${key}`) : null;
  const initial = stored ? JSON.parse(stored) : defaultValue;
  const store = writable<T>(initial);
  let initialized = false;
  store.subscribe((value) => {
    if (!initialized) { initialized = true; return; } // skip redundant write-back of the value just read
    /* c8 ignore next 1 */
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
