/**
 * Storage layer — wraps Tauri fs_* commands with a clean async API.
 * Falls back to IndexedDB (Dexie) when running in a plain browser (e.g. `pnpm dev`).
 */
import { invoke } from '@tauri-apps/api/tauri';
import type { Topic, AppSettings, QueuedSave } from './types';
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

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

let _idbReady = false;
let _migrationDone = false;

// Initialize IDB on first use
async function ensureIDBReady(): Promise<void> {
  if (_idbReady || IS_TAURI) return;
  try {
    _idbReady = await isIDBReady();
  } catch (err) {
    console.error('IndexedDB initialization failed:', err);
    throw err;
  }
}

// Run migration once
async function ensureMigrationDone(): Promise<void> {
  if (_migrationDone || IS_TAURI) return;
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
  if (IS_TAURI) {
    try {
      return await invoke<string>('fs_read', { path });
    } catch {
      return null;
    }
  }
  return localStorage.getItem(`hle:file:${path}`);
}

async function writeFile(path: string, content: string): Promise<void> {
  if (IS_TAURI) {
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
  if (IS_TAURI) {
    await invoke('fs_delete', { path });
  } else {
    localStorage.removeItem(`hle:file:${path}`);
  }
}

// ── Topics (use IndexedDB in browser, Tauri fs in app) ────────────────────────

export async function loadAllTopics(): Promise<Topic[]> {
  if (IS_TAURI) {
    const TOPICS_DIR = 'topics';
    const files = await invoke<string[]>('fs_list', { path: TOPICS_DIR });
    const topics: Topic[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await invoke<string>('fs_read', { path: `${TOPICS_DIR}/${file}` });
        topics.push(JSON.parse(raw) as Topic);
      } catch {
        console.warn('Corrupt topic file:', file);
      }
    }
    return topics.sort((a, b) => a.key.localeCompare(b.key));
  }

  // Browser: use IndexedDB
  await ensureMigrationDone();
  return idbLoadAllTopics();
}

export async function loadTopic(key: string): Promise<Topic | null> {
  if (IS_TAURI) {
    try {
      const raw = await invoke<string>('fs_read', {
        path: `topics/${encodeURIComponent(key)}.json`,
      });
      return JSON.parse(raw) as Topic;
    } catch {
      return null;
    }
  }

  // Browser: use IndexedDB
  await ensureMigrationDone();
  return idbLoadTopic(key);
}

export async function saveTopic(topic: Topic): Promise<void> {
  if (IS_TAURI) {
    await invoke('fs_write', {
      path: `topics/${encodeURIComponent(topic.key)}.json`,
      content: JSON.stringify(topic, null, 2),
    });
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
  if (IS_TAURI) {
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
const DEFAULT_SETTINGS: AppSettings = {
  workerHost: 'https://holmgard-lore-mcp.frozenregister.workers.dev',
  autoSyncIntervalSecs: 30,
  autoSync: true,
  syncHistory: true,
};

export async function loadSettings(): Promise<AppSettings> {
  const raw = await readFile(SETTINGS_PATH);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ── Offline queue (use IndexedDB in browser, Tauri fs in app) ────────────────

export async function loadQueue(): Promise<QueuedSave[]> {
  if (IS_TAURI) {
    const raw = await readFile('offline-queue.json');
    if (!raw) return [];
    try {
      return JSON.parse(raw) as QueuedSave[];
    } catch {
      return [];
    }
  }

  // Browser: use IndexedDB
  await ensureMigrationDone();
  return idbLoadQueue();
}

export async function saveQueue(queue: QueuedSave[]): Promise<void> {
  if (IS_TAURI) {
    await writeFile('offline-queue.json', JSON.stringify(queue, null, 2));
  } else {
    // Browser: use IndexedDB
    await ensureMigrationDone();
    await idbSaveQueue(queue);
  }
}
