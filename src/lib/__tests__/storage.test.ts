import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadSettings,
  loadQueue,
  loadTopic,
  saveTopic,
  deleteTopic,
  saveSettings,
  loadAllTopics,
  saveQueue
} from '../storage';
import { invoke } from '@tauri-apps/api/tauri';
import * as idb from '../storage-idb';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

vi.mock('../storage-idb', () => ({
  idbLoadAllTopics: vi.fn(),
  idbLoadTopic: vi.fn(),
  idbSaveTopic: vi.fn(),
  idbDeleteTopic: vi.fn(),
  idbLoadQueue: vi.fn(),
  idbSaveQueue: vi.fn(),
  migrateFromLocalStorage: vi.fn(() => Promise.resolve({ topicsMigrated: 0, queueMigrated: false })),
  isIDBReady: vi.fn(() => Promise.resolve(true)),
}));

describe('storage.ts logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete (window as any).__TAURI__;
  });

  describe('loadSettings (Browser)', () => {
    it('returns defaults when no settings exist', async () => {
      const settings = await loadSettings();
      expect(settings.autoSync).toBe(true);
    });

    it('merges saved settings', async () => {
      localStorage.setItem('hle:file:settings.json', JSON.stringify({ autoSync: false }));
      const settings = await loadSettings();
      expect(settings.autoSync).toBe(false);
    });

    it('handles corrupt JSON gracefully', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('hle:file:settings.json', '{{invalid');
      const settings = await loadSettings();
      expect(settings.autoSync).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse settings.json'),
        expect.any(Error)
      );
    });
  });

  describe('saveSettings', () => {
    it('saves settings to localStorage in browser mode', async () => {
      const settings = { autoSync: false, workerHost: 'http://localhost' } as any;
      await saveSettings(settings);
      const saved = localStorage.getItem('hle:file:settings.json');
      const parsed = JSON.parse(saved!);
      expect(parsed.autoSync).toBe(false);
      expect(parsed.workerHost).toBe('http://localhost');
    });

    it('saves settings via Tauri fs in app mode', async () => {
      (window as any).__TAURI__ = {};
      const settings = { autoSync: true } as any;
      await saveSettings(settings);
      expect(invoke).toHaveBeenCalledWith('fs_write', {
        path: 'settings.json',
        content: JSON.stringify(settings, null, 2)
      });
    });

    it('wraps localStorage QuotaExceededError with a readable message', async () => {
      const quotaErr = new DOMException('quota exceeded', 'QuotaExceededError');
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw quotaErr; });
      const settings = { autoSync: false } as any;

      try {
        await expect(saveSettings(settings)).rejects.toThrow('Storage quota exceeded. Please clear some data.');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('loadQueue (Browser)', () => {
    it('loads queue from IndexedDB', async () => {
      const mockQueue = [{ key: 'test', text: 'content', attempts: 0 }];
      (idb.idbLoadQueue as any).mockResolvedValue(mockQueue);

      const queue = await loadQueue();
      expect(queue).toEqual(mockQueue);
      expect(idb.idbLoadQueue).toHaveBeenCalled();
    });
  });

  describe('loadQueue (Tauri)', () => {
    beforeEach(() => {
      (window as any).__TAURI__ = {};
    });

    it('reads from filesystem', async () => {
      const mockData = [{ key: 'a', text: 'b' }];
      (invoke as any).mockResolvedValue(JSON.stringify(mockData));

      const queue = await loadQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].key).toBe('a');
      expect(invoke).toHaveBeenCalledWith('fs_read', { path: 'offline-queue.json' });
    });

    it('returns empty array on missing file', async () => {
      (invoke as any).mockRejectedValue('Entity not found');
      const queue = await loadQueue();
      expect(queue).toEqual([]);
    });

    it('logs warning on corrupt file', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (invoke as any).mockResolvedValue('corrupt');
      const queue = await loadQueue();
      expect(queue).toEqual([]);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('saveQueue', () => {
    it('saves queue via IndexedDB in browser mode', async () => {
      const queue = [{ key: 'test', text: 'content', attempts: 0 }] as any[];
      await saveQueue(queue as any);
      expect(idb.idbSaveQueue).toHaveBeenCalledWith(queue);
    });

    it('saves queue via Tauri fs in app mode', async () => {
      (window as any).__TAURI__ = {};
      const queue = [{ key: 'test', text: 'content', attempts: 0 }] as any[];
      await saveQueue(queue as any);
      expect(invoke).toHaveBeenCalledWith('fs_write', {
        path: 'offline-queue.json',
        content: JSON.stringify(queue, null, 2)
      });
    });
  });

  describe('loadTopic (Tauri)', () => {
    beforeEach(() => {
      (window as any).__TAURI__ = {};
    });

    it('suppresses warning for missing files (normal case)', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (invoke as any).mockRejectedValue('Os { code: 2, kind: NotFound, message: "..." }');

      const topic = await loadTopic('missing');
      expect(topic).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it('warns on unexpected read errors', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (invoke as any).mockRejectedValue('Permission Denied');

      await loadTopic('locked-file');
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected error loading topic'),
        expect.any(String)
      );
    });

    it('loads and parses topic from filesystem', async () => {
      const mockTopic = { key: 'test', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } };
      (invoke as any).mockResolvedValue(JSON.stringify(mockTopic));

      const topic = await loadTopic('test');
      expect(topic).toEqual(mockTopic);
      expect(invoke).toHaveBeenCalledWith('fs_read', { path: 'topics/test.json' });
    });

    it('returns null on corrupt topic JSON', async () => {
      (invoke as any).mockResolvedValue('{invalid json');
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const topic = await loadTopic('corrupt');
      expect(topic).toBeNull();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('saveTopic', () => {
    it('saves topic via Tauri fs in app mode', async () => {
      (window as any).__TAURI__ = {};
      const topic = { key: 'test-topic', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } } as any;

      await saveTopic(topic);
      expect(invoke).toHaveBeenCalledWith('fs_write', {
        path: 'topics/test-topic.json',
        content: JSON.stringify(topic, null, 2)
      });
    });

    it('saves topic via IndexedDB in browser mode', async () => {
      const topic = { key: 'test', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } } as any;

      await saveTopic(topic);
      expect(idb.idbSaveTopic).toHaveBeenCalledWith(topic);
    });

    it('debounces multiple saves for the same topic', async () => {
      vi.useFakeTimers();
      (window as any).__TAURI__ = {};
      const topic = { key: 'debounce-test', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } } as any;

      saveTopic(topic);
      saveTopic(topic);
      saveTopic(topic);

      expect(invoke).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('fs_write', expect.objectContaining({
        path: expect.stringContaining('debounce-test'),
      }));
      vi.useRealTimers();
    });

    it('rejects on Tauri save error', async () => {
      vi.useFakeTimers();
      (window as any).__TAURI__ = {};
      const topic = { key: 'error-test', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } } as any;
      (invoke as any).mockRejectedValueOnce(new Error('Write failed'));

      const promise = saveTopic(topic);
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow('Write failed');
      vi.useRealTimers();
    });

    it('wraps IDB QuotaExceededError with a readable message', async () => {
      const quotaErr = new DOMException('quota', 'QuotaExceededError');
      (idb.idbSaveTopic as any).mockRejectedValueOnce(quotaErr);
      const topic = { key: 'test', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } } as any;

      await expect(saveTopic(topic)).rejects.toThrow('Storage quota exceeded.');
    });

    it('re-throws non-quota IDB errors', async () => {
      (idb.idbSaveTopic as any).mockRejectedValueOnce(new Error('constraint error'));
      const topic = { key: 'test', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } } as any;

      await expect(saveTopic(topic)).rejects.toThrow('constraint error');
    });
  });

  describe('deleteTopic', () => {
    it('deletes topic via Tauri fs in app mode', async () => {
      (window as any).__TAURI__ = {};

      await deleteTopic('test-topic');
      expect(invoke).toHaveBeenCalledWith('fs_delete', {
        path: 'topics/test-topic.json'
      });
    });

    it('deletes topic via IndexedDB in browser mode', async () => {
      await deleteTopic('test');
      expect(idb.idbDeleteTopic).toHaveBeenCalledWith('test');
    });
  });

  describe('loadAllTopics (Tauri)', () => {
    beforeEach(() => {
      (window as any).__TAURI__ = {};
    });

    it('loads and parses all topic files from filesystem', async () => {
      const mockFiles = ['topic1.json', 'topic2.json', 'ignore.txt'];
      const mockTopics = [
        { key: 'topic1', text: 'content1', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } },
        { key: 'topic2', text: 'content2', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 2 } },
      ];

      (invoke as any)
        .mockResolvedValueOnce(mockFiles)
        .mockResolvedValueOnce(JSON.stringify(mockTopics[0]))
        .mockResolvedValueOnce(JSON.stringify(mockTopics[1]));

      const topics = await loadAllTopics();
      expect(topics).toEqual(mockTopics);
      expect(invoke).toHaveBeenCalledWith('fs_list', { path: 'topics' });
    });

    it('skips non-JSON files', async () => {
      const mockFiles = ['topic1.json', 'readme.txt', 'topic2.json'];
      const mockTopic1 = { key: 'topic1', text: 'content1', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } };
      const mockTopic2 = { key: 'topic2', text: 'content2', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 2 } };

      (invoke as any)
        .mockResolvedValueOnce(mockFiles)
        .mockResolvedValueOnce(JSON.stringify(mockTopic1))
        .mockResolvedValueOnce(JSON.stringify(mockTopic2));

      const topics = await loadAllTopics();
      expect(topics).toHaveLength(2);
    });

    it('handles corrupt topic files gracefully', async () => {
      const mockFiles = ['good.json', 'bad.json'];
      const goodTopic = { key: 'good', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } };

      (invoke as any)
        .mockResolvedValueOnce(mockFiles)
        .mockResolvedValueOnce(JSON.stringify(goodTopic))
        .mockResolvedValueOnce('{invalid json');

      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const topics = await loadAllTopics();

      expect(topics).toHaveLength(1);
      expect(topics[0].key).toBe('good');
      expect(spy).toHaveBeenCalled();
    });

    it('returns sorted topics by key', async () => {
      const mockFiles = ['b.json', 'a.json'];
      const topicB = { key: 'b', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } };
      const topicA = { key: 'a', text: 'content', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } };

      (invoke as any)
        .mockResolvedValueOnce(mockFiles)
        .mockResolvedValueOnce(JSON.stringify(topicB))
        .mockResolvedValueOnce(JSON.stringify(topicA));

      const result = await loadAllTopics();
      expect(result).toEqual([topicA, topicB]);
    });
  });

  describe('loadAllTopics (Browser)', () => {
    it('loads topics from IndexedDB', async () => {
      const mockTopics = [
        { key: 'topic1', text: 'content1', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 1 } },
        { key: 'topic2', text: 'content2', meta: { updatedAt: '2021-01-01T00:00:00.000Z', version: 2 } },
      ];

      (idb.idbLoadAllTopics as any).mockResolvedValue(mockTopics);

      const topics = await loadAllTopics();
      expect(topics).toEqual(mockTopics);
      expect(idb.idbLoadAllTopics).toHaveBeenCalled();
    });
  });
});