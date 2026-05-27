/**
 * Storage layer — wraps Tauri fs_* commands with a clean async API.
 * Falls back to localStorage when running in a plain browser (e.g. `pnpm dev`).
 */
import { invoke } from '@tauri-apps/api/tauri';
import type { Topic, AppSettings, QueuedSave } from './types';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

// ── Low-level helpers ─────────────────────────────────────────────────────────

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
    localStorage.setItem(`hle:file:${path}`, content);
  }
}

async function deleteFile(path: string): Promise<void> {
  if (IS_TAURI) {
    await invoke('fs_delete', { path });
  } else {
    localStorage.removeItem(`hle:file:${path}`);
  }
}

async function listFiles(path: string): Promise<string[]> {
  if (IS_TAURI) {
    return invoke<string[]>('fs_list', { path });
  }
  const prefix = `hle:file:${path}/`;
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

// ── Topics ────────────────────────────────────────────────────────────────────

const TOPICS_DIR = 'topics';

function topicPath(key: string) {
  return `${TOPICS_DIR}/${encodeURIComponent(key)}.json`;
}

export async function loadAllTopics(): Promise<Topic[]> {
  const files = await listFiles(TOPICS_DIR);
  const topics: Topic[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(`${TOPICS_DIR}/${file}`);
    if (raw) {
      try {
        topics.push(JSON.parse(raw) as Topic);
      } catch {
        console.warn('Corrupt topic file:', file);
      }
    }
  }
  return topics.sort((a, b) => a.key.localeCompare(b.key));
}

export async function loadTopic(key: string): Promise<Topic | null> {
  const raw = await readFile(topicPath(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Topic;
  } catch {
    return null;
  }
}

export async function saveTopic(topic: Topic): Promise<void> {
  await writeFile(topicPath(topic.key), JSON.stringify(topic, null, 2));
}

export async function deleteTopic(key: string): Promise<void> {
  await deleteFile(topicPath(key));
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

// ── Offline queue ─────────────────────────────────────────────────────────────

const QUEUE_PATH = 'offline-queue.json';

export async function loadQueue(): Promise<QueuedSave[]> {
  const raw = await readFile(QUEUE_PATH);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedSave[];
  } catch {
    return [];
  }
}

export async function saveQueue(queue: QueuedSave[]): Promise<void> {
  await writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2));
}
