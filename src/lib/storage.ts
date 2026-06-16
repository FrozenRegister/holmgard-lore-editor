/**
 * Storage layer — wraps Tauri fs_* commands with a clean async API.
 * Falls back to IndexedDB (Dexie) when running in a plain browser (e.g. `pnpm dev`).
 */
import { invoke } from '@tauri-apps/api/tauri';
import type { Topic, AppSettings, QueuedSave } from './types';
import { DEFAULT_SETTINGS } from './defaults';
import {
  idbLoadAllTopics,
  idbLoadTopic,
  idbSaveTopic,
  idbDeleteTopic,
  idbLoadQueue,
  idbSaveQueue,
  migrateFromLocalStorage,
  isIDBReady,
} from './storage-idb';

const isTauri = () => typeof window !== 'undefined' && '__TAURI__' in window;

let _idbReady = false;
let _migrationDone = false;

// Initialize IDB on first use
async function ensureIDBReady(): Promise<void> {
  if (_idbReady || isTauri()) return;
  try {
    _idbReady = await isIDBReady();
  } catch (err) {
    console.error('IndexedDB initialization failed:', err);
    throw err;
  }
}

// Run migration once
async function ensureMigrationDone(): Promise<void> {
  if (_migrationDone || isTauri()) return;
  try {
    await ensureIDBReady();
    const result = await migrateFromLocalStorage();
    console.log(`Migrated ${result.topicsMigrated} topics, queue: ${result.queueMigrated}`);
    _migrationDone = true;
  } catch (err) {
    console.error('Migration from localStorage to IndexedDB failed:', err);
    throw err;
  }
}

// ── Low-level helpers (for settings, which remain in localStorage) ────────────

async function readFile(path: string): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string>('fs_read', { path });
    } catch {
      return null;
    }
  }
  return localStorage.getItem(`hle:file:${path}`);
}

async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke('fs_write', { path, content });
  } else {
    try {
      localStorage.setItem(`hle:file:${path}`, content);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please clear some data.');
      }
      throw err;
    }
  }
}

async function deleteFile(path: string): Promise<void> {
  if (isTauri()) {
    await invoke('fs_delete', { path });
  } else {
    localStorage.removeItem(`hle:file:${path}`);
  }
}

/**
 * Safely parse JSON string into a typed object.
 * Returns null and optionally logs a warning on failure.
 */
function safeParseJson<T>(raw: string | null, errorLabel?: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    if (errorLabel) console.warn(errorLabel, err);
    return null;
  }
}

// ── Topics (use IndexedDB in browser, Tauri fs in app) ────────────────────────

export async function loadAllTopics(): Promise<Topic[]> {
  if (isTauri()) {
    const TOPICS_DIR = 'topics';
    const files = await invoke<string[]>('fs_list', { path: TOPICS_DIR });
    const topics: Topic[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const path = `${TOPICS_DIR}/${file}`;
      try {
        const raw = await invoke<string>('fs_read', { path });
        const topic = safeParseJson<Topic>(raw, `Failed to parse topic file "${file}":`);
        if (topic) topics.push(topic);
      } catch (err) {
        console.warn(`Failed to read topic file "${file}":`, err);
      }
    }
    return topics.sort((a, b) => a.key.localeCompare(b.key));
  }

  // Browser: use IndexedDB
  await ensureMigrationDone();
  return idbLoadAllTopics();
}

export async function loadTopic(key: string): Promise<Topic | null> {
  if (isTauri()) {
    const path = `topics/${encodeURIComponent(key)}.json`;
    try {
      const raw = await invoke<string>('fs_read', { path });
      return safeParseJson<Topic>(raw, `Failed to parse topic file "${key}":`);
    } catch (err) {
      // File not found is common for unsaved topics; other errors (like corruption) should be logged.
      const errorMsg = String(err).toLowerCase();
      const isNotFound = 
        errorMsg.includes('not found') || 
        errorMsg.includes('notfound') || 
        errorMsg.includes('code: 2') || 
        errorMsg.includes('os error 2');

      if (!isNotFound) {
        console.warn(`Unexpected error loading topic "${key}" at ${path}:`, err);
      }
      return null;
    }
  }

  // Browser: use IndexedDB
  await ensureMigrationDone();
  return idbLoadTopic(key);
}

export async function saveTopic(topic: Topic): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('fs_write', {
        path: `topics/${encodeURIComponent(topic.key)}.json`,
        content: JSON.stringify(topic, null, 2),
      });
    } catch (err) {
      throw err;
    }
  } else {
    // Browser: use IndexedDB
    await ensureMigrationDone();
    try {
      await idbSaveTopic(topic);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded.');
      }
      throw err;
    }
  }
}

export async function deleteTopic(key: string): Promise<void> {
  if (isTauri()) {
    await invoke('fs_delete', {
      path: `topics/${encodeURIComponent(key)}.json`,
    });
  } else {
    // Browser: use IndexedDB
    await ensureMigrationDone();
    await idbDeleteTopic(key);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

const SETTINGS_PATH = 'settings.json';

export async function loadSettings(): Promise<AppSettings> {
  const raw = await readFile(SETTINGS_PATH);
  const parsed = safeParseJson<Partial<AppSettings>>(raw, 'Failed to parse settings.json, falling back to defaults:');
  return { ...DEFAULT_SETTINGS, ...(parsed ?? {}) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ── Offline queue (use IndexedDB in browser, Tauri fs in app) ────────────────

export async function loadQueue(): Promise<QueuedSave[]> {
  if (isTauri()) {
    const raw = await readFile('offline-queue.json');
    return safeParseJson<QueuedSave[]>(raw, 'Failed to parse offline-queue.json:') ?? [];
  }

  // Browser: use IndexedDB
  await ensureMigrationDone();
  return idbLoadQueue();
}

export async function saveQueue(queue: QueuedSave[]): Promise<void> {
  if (isTauri()) {
    await writeFile('offline-queue.json', JSON.stringify(queue, null, 2));
  } else {
    // Browser: use IndexedDB
    await ensureMigrationDone();
    await idbSaveQueue(queue);
  }
}
