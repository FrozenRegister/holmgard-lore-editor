import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  idbLoadAllTopics,
  idbLoadTopic,
  idbSaveTopic,
  idbDeleteTopic,
  idbLoadQueue,
  idbSaveQueue,
  migrateFromLocalStorage,
  isIDBReady,
  HolmgardDB,
} from '../storage-idb';
import type { Topic, QueuedSave } from '../types';

// Use fake-indexeddb to enable these tests in the Vitest/jsdom environment.
describe('IndexedDB storage layer', () => {
  let db: HolmgardDB;

  beforeEach(async () => {
    db = new HolmgardDB();
    await db.open();
    // Clean tables to avoid cross-test contamination
    await db.topics.clear();
    await db.queue.clear();
    localStorage.clear();
  });

  afterEach(async () => {
    // Close the per-test connection but do NOT delete the database — the
    // module-level singleton inside storage-idb.ts will reuse it on the next
    // test. Deleting the whole DB caused "Closing db now to resume the delete
    // request" warnings and occasional hangs in jsdom.
    if (db && db.isOpen()) db.close();
  });

  describe('Topics', () => {
    it('saves and loads a topic', async () => {
      const topic: Topic = {
        key: 'test-topic',
        text: 'Hello world',
        meta: { version: 1, updatedAt: '2025-01-01T00:00:00Z' },
      };

      await idbSaveTopic(topic);
      const loaded = await idbLoadTopic('test-topic');

      expect(loaded).toEqual(topic);
    });

    it('loads all topics sorted by key', async () => {
      const topics: Topic[] = [
        {
          key: 'zebra',
          text: 'Z',
          meta: { version: 1, updatedAt: '2025-01-01T00:00:00Z' },
        },
        {
          key: 'apple',
          text: 'A',
          meta: { version: 1, updatedAt: '2025-01-01T00:00:00Z' },
        },
      ];

      for (const topic of topics) {
        await idbSaveTopic(topic);
      }

      const loaded = await idbLoadAllTopics();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].key).toBe('apple');
      expect(loaded[1].key).toBe('zebra');
    });

    it('deletes a topic', async () => {
      const topic: Topic = {
        key: 'to-delete',
        text: 'Bye',
        meta: { version: 1, updatedAt: '2025-01-01T00:00:00Z' },
      };

      await idbSaveTopic(topic);
      await idbDeleteTopic('to-delete');
      const loaded = await idbLoadTopic('to-delete');

      expect(loaded).toBeNull();
    });

    it('returns null for nonexistent topic', async () => {
      const loaded = await idbLoadTopic('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('Queue', () => {
    it('saves and loads queue items', async () => {
      const queue: QueuedSave[] = [
        {
          key: 'topic1',
          text: 'Content 1',
          attempts: 1,
          enqueuedAt: new Date().toISOString(),
        },
        {
          key: 'topic2',
          text: 'Content 2',
          attempts: 2,
          enqueuedAt: new Date().toISOString(),
        },
      ];

      await idbSaveQueue(queue);
      const loaded = await idbLoadQueue();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].key).toBe('topic1');
      expect(loaded[1].key).toBe('topic2');
    });

    it('clears queue on save', async () => {
      const queue1: QueuedSave[] = [
        {
          key: 'old',
          text: 'Old',
          attempts: 1,
          enqueuedAt: new Date().toISOString(),
        },
      ];

      await idbSaveQueue(queue1);
      const queue2: QueuedSave[] = [
        {
          key: 'new',
          text: 'New',
          attempts: 1,
          enqueuedAt: new Date().toISOString(),
        },
      ];

      await idbSaveQueue(queue2);
      const loaded = await idbLoadQueue();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].key).toBe('new');
    });
  });

  describe('Migration from localStorage', () => {
    beforeEach(() => {
      // Simulate existing localStorage entries
      localStorage.setItem('hle:file:topics/character%3Atest.json', JSON.stringify({
        key: 'character:test',
        text: 'Test character',
        meta: { version: 1, updatedAt: '2025-01-01T00:00:00Z' },
      }));

      localStorage.setItem('hle:file:offline-queue.json', JSON.stringify([
        {
          key: 'queued-topic',
          text: 'Queued',
          attempts: 1,
          enqueuedAt: new Date().toISOString(),
        },
      ]));
    });

    it('migrates topics from localStorage to IndexedDB', async () => {
      const result = await migrateFromLocalStorage();

      expect(result.topicsMigrated).toBe(1);
      expect(result.queueMigrated).toBe(true);

      const loaded = await idbLoadAllTopics();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].key).toBe('character:test');

      // Verify localStorage was cleaned up
      expect(localStorage.getItem('hle:file:topics/character%3Atest.json')).toBeNull();
    });

    it('is idempotent — can run multiple times safely', async () => {
      await migrateFromLocalStorage();
      const result = await migrateFromLocalStorage();

      expect(result.topicsMigrated).toBe(0);
      expect(result.queueMigrated).toBe(false);

      const loaded = await idbLoadAllTopics();
      expect(loaded).toHaveLength(1);
    });

    it('skips invalid JSON in localStorage without crashing', async () => {
      localStorage.setItem('hle:file:topics/bad.json', 'not-json');
      localStorage.removeItem('hle:file:offline-queue.json');

      const result = await migrateFromLocalStorage();

      expect(result.topicsMigrated).toBe(1); // Only the valid character:test
      expect(result.queueMigrated).toBe(false);
    });

    it('handles empty localStorage gracefully', async () => {
      localStorage.clear();
      const result = await migrateFromLocalStorage();

      expect(result.topicsMigrated).toBe(0);
      expect(result.queueMigrated).toBe(false);
    });
  });

  describe('isIDBReady', () => {
    it('returns true when IndexedDB is open and available', async () => {
      await expect(isIDBReady()).resolves.toBe(true);
    });
  });
});
