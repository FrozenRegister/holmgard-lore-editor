import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest';
import Dexie from 'dexie';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

function simulateBrowser() {
  delete (globalThis as any).__TAURI__;
}

// Delete the lore-db IndexedDB database between test files 
// (fake-indexeddb registers it as a real named DB in memory)
beforeAll(async () => {
  await Dexie.delete('lore-db');
});

afterEach(async () => {
  // Clean up IDB before resetting modules (module must still be alive for delete to work)
  await Dexie.delete('lore-db').catch(() => {});
  localStorage.clear();
  vi.resetAllMocks();
  vi.resetModules();
  simulateBrowser();
});

describe('storage integration (real localStorage + fake-indexeddb)', () => {
  // ── Settings (localStorage path) ──────────────────────────────────────────────

  describe('loadSettings / saveSettings', () => {
    it('should return defaults when no settings are saved', async () => {
      const { loadSettings } = await import('$lib/storage');
      const settings = await loadSettings();
      expect(settings.workerHost).toContain('holmgard-lore-mcp');
      expect(settings.autoSync).toBe(true);
      expect(settings.syncHistory).toBe(true);
      expect(settings.autoSyncIntervalSecs).toBe(30);
    });

    it('should roundtrip settings', async () => {
      const { saveSettings, loadSettings } = await import('$lib/storage');

      await saveSettings({
        workerHost: 'https://custom.example.com',
        autoSyncIntervalSecs: 60,
        autoSync: false,
        syncHistory: false,
      });

      const settings = await loadSettings();
      expect(settings.workerHost).toBe('https://custom.example.com');
      expect(settings.autoSyncIntervalSecs).toBe(60);
      expect(settings.autoSync).toBe(false);
      expect(settings.syncHistory).toBe(false);
    });

    it('should merge partial saved settings with defaults', async () => {
      const { DEFAULT_SETTINGS } = await import('$lib/defaults');
      const { saveSettings, loadSettings } = await import('$lib/storage');

      await saveSettings({ ...DEFAULT_SETTINGS, autoSync: false });
      const settings = await loadSettings();
      expect(settings.autoSync).toBe(false);
      expect(settings.syncHistory).toBe(true);
      expect(settings.workerHost).toBe(DEFAULT_SETTINGS.workerHost);
    });
  });

  // ── Topics (IndexedDB path in browser mode) ───────────────────────────────────

  describe('topic CRUD (browser mode)', () => {
    it('should save and load a topic', async () => {
      const { saveTopic, loadTopic } = await import('$lib/storage');

      const topic = {
        key: 'character:test',
        text: '## Test\nA test character.',
        meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' },
      };

      await saveTopic(topic);
      const loaded = await loadTopic('character:test');
      expect(loaded).not.toBeNull();
      expect(loaded!.key).toBe('character:test');
      expect(loaded!.text).toContain('A test character');
    });

    it('should return null for missing topic', async () => {
      const { loadTopic } = await import('$lib/storage');
      const result = await loadTopic('nonexistent-key');
      expect(result).toBeNull();
    });

    it('should update an existing topic', async () => {
      const { saveTopic, loadTopic } = await import('$lib/storage');

      await saveTopic({
        key: 'character:update',
        text: 'v1',
        meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' },
      });

      await saveTopic({
        key: 'character:update',
        text: 'v2',
        meta: { version: 2, updatedAt: '2026-01-02T00:00:00Z' },
      });

      const updated = await loadTopic('character:update');
      expect(updated!.text).toBe('v2');
      expect(updated!.meta.version).toBe(2);
    });

    it('should delete a topic', async () => {
      const { saveTopic, deleteTopic, loadTopic } = await import('$lib/storage');

      await saveTopic({
        key: 'character:delete-me',
        text: 'temp',
        meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' },
      });

      await deleteTopic('character:delete-me');
      const result = await loadTopic('character:delete-me');
      expect(result).toBeNull();
    });

    it('should load all topics sorted by key', async () => {
      const { saveTopic, loadAllTopics } = await import('$lib/storage');

      await saveTopic({ key: 'integration:c', text: 'C', meta: { version: 1, updatedAt: '' } });
      await saveTopic({ key: 'integration:a', text: 'A', meta: { version: 1, updatedAt: '' } });
      await saveTopic({ key: 'integration:b', text: 'B', meta: { version: 1, updatedAt: '' } });

      const all = await loadAllTopics();
      // Only check the ones we just inserted (DB may have leftovers from other tests)
      const ours = all.filter(t => t.key.startsWith('integration:'));
      expect(ours).toHaveLength(3);
      // Verify sorting: 'a' < 'b' < 'c'
      expect(ours[0].key).toBe('integration:a');
      expect(ours[1].key).toBe('integration:b');
      expect(ours[2].key).toBe('integration:c');
    });

    it('should return empty result for keys that have never been saved', async () => {
      const { loadTopic } = await import('$lib/storage');
      const result = await loadTopic('never-saved-key-xyz');
      expect(result).toBeNull();
    });
  });
});