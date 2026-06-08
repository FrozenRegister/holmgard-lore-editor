import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSettings, loadQueue, loadTopic } from '../storage';
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
    // Toggle IS_TAURI by manipulating window.__TAURI__
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

  describe('loadQueue (Tauri)', () => {
    beforeEach(() => {
      (window as any).__TAURI__ = {};
    });

    it('reads from filesystem', async () => {
      const mockData = [{ key: 'a', text: 'b' }];
      (invoke as any).mockResolvedValue(JSON.stringify(mockData));
      
      const queue = await loadQueue();
      expect(queue).toEqual(mockData);
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
  });
});