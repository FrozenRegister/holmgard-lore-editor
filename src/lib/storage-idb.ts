/**
 * IndexedDB storage layer using Dexie.
 * Replaces localStorage for topics and queue (fallback when not in Tauri).
 */
import Dexie, { type Table } from 'dexie';
import type { Topic, QueuedSave } from './types';

interface TopicRecord {
  key: string;
  data: Topic;
}

interface QueueRecord {
  id?: number;
  data: QueuedSave;
}

export class HolmgardDB extends Dexie {
  topics!: Table<TopicRecord>;
  queue!: Table<QueueRecord>;

  constructor() {
    super('holmgard-lore-editor');
    this.version(1).stores({
      topics: '&key',
      queue: '++id',
    });
  }
}

const db = new HolmgardDB();

// ── Topics ────────────────────────────────────────────────────────────────────

export async function idbLoadAllTopics(): Promise<Topic[]> {
  const records = await db.topics.toArray();
  return records
    .map(r => ({ ...r.data, text: r.data.text ?? '' }))
    .sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));
}

export async function idbLoadTopic(key: string): Promise<Topic | null> {
  const record = await db.topics.get(key);
  if (!record) return null;
  return { ...record.data, text: record.data.text ?? '' };
}

export async function idbSaveTopic(topic: Topic): Promise<void> {
  await db.topics.put({ key: topic.key, data: topic });
}

export async function idbDeleteTopic(key: string): Promise<void> {
  await db.topics.delete(key);
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export async function idbLoadQueue(): Promise<QueuedSave[]> {
  const records = await db.queue.toArray();
  return records.map(r => r.data);
}

export async function idbSaveQueue(queue: QueuedSave[]): Promise<void> {
  await db.transaction('rw', db.queue, async () => {
    await db.queue.clear();
    if (queue.length === 0) return;
    await db.queue.bulkAdd(queue.map(data => ({ data })));
  });
}

// ── Migration ─────────────────────────────────────────────────────────────────

/**
 * Migrate topics and queue from localStorage to IndexedDB.
 * Safe to call multiple times (idempotent).
 */
export async function migrateFromLocalStorage(): Promise<{
  topicsMigrated: number;
  queueMigrated: boolean;
}> {
  let topicsMigrated = 0;
  let queueMigrated = false;

  // Migrate topics from hle:file:topics/*.json
  const topicsPrefix = 'hle:file:topics/';
  const keysToMigrate = Object.keys(localStorage).filter(k => k.startsWith(topicsPrefix));

  for (const key of keysToMigrate) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const topic = JSON.parse(raw) as Topic;
      await idbSaveTopic(topic);
      localStorage.removeItem(key);
      topicsMigrated++;
    } catch (err) {
      console.warn(`Failed to migrate topic from ${key}:`, err);
    }
  }

  // Migrate queue from hle:file:offline-queue.json
  try {
    const queueRaw = localStorage.getItem('hle:file:offline-queue.json');
    if (queueRaw) {
      const queue = JSON.parse(queueRaw) as QueuedSave[];
      await idbSaveQueue(queue);
      localStorage.removeItem('hle:file:offline-queue.json');
      queueMigrated = true;
    }
  } catch (err) {
    console.warn('Failed to migrate queue:', err);
  }

  // Migrate settings (keep small, but also move to localStorage for now)
  // Settings remain in localStorage because they're small and frequently accessed

  return { topicsMigrated, queueMigrated };
}

/**
 * Check if IndexedDB is available and ready.
 */
export async function isIDBReady(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    /* c8 ignore next 1 */
    // Unreachable in tests: the module-level db singleton (line 31) successfully opens
    // at module load time. Subsequent calls to isIDBReady() simply reuse the already-open
    // connection, so db.open() succeeds and the catch block never executes. Simulating
    // an IDB failure would require resetting/closing the global singleton between tests,
    // which isn't practical with the current singleton pattern.
    return false;
  }
}
