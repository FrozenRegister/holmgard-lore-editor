import { describe, it, expect, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.resetModules();
});

describe('stores integration (real Svelte stores)', () => {
  // ── Topics store ─────────────────────────────────────────────────────────────

  describe('topics store', () => {
    it('should start empty', async () => {
      const { topics } = await import('$lib/stores');
      expect(get(topics)).toEqual([]);
    });

    it('should support CRUD operations', async () => {
      const { topics } = await import('$lib/stores');
      const topic = {
        key: 'character:test',
        text: '## Test\nA test character.',
        meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' },
      };

      // Create
      topics.update((t) => [...t, topic]);
      expect(get(topics)).toHaveLength(1);
      expect(get(topics)[0].key).toBe('character:test');

      // Update
      topics.update((t) =>
        t.map((item) =>
          item.key === 'character:test'
            ? { ...item, text: '## Test\nUpdated character.', meta: { ...item.meta, version: 2 } }
            : item,
        ),
      );
      expect(get(topics)[0].text).toContain('Updated character');
      expect(get(topics)[0].meta.version).toBe(2);

      // Delete
      topics.update((t) => t.filter((item) => item.key !== 'character:test'));
      expect(get(topics)).toEqual([]);
    });
  });

  // ── topicMap derived store ───────────────────────────────────────────────────

  describe('topicMap derived store', () => {
    it('should reflect topics as a Map', async () => {
      const { topics, topicMap } = await import('$lib/stores');

      topics.set([
        {
          key: 'a',
          text: 'Topic A',
          meta: { version: 1, updatedAt: '' },
        },
        {
          key: 'b',
          text: 'Topic B',
          meta: { version: 1, updatedAt: '' },
        },
      ]);

      const map = get(topicMap);
      expect(map.size).toBe(2);
      expect(map.get('a')!.text).toBe('Topic A');
      expect(map.get('b')!.text).toBe('Topic B');
    });

    it('should update when topics change', async () => {
      const { topics, topicMap } = await import('$lib/stores');

      topics.set([{ key: 'x', text: 'X', meta: { version: 1, updatedAt: '' } }]);
      expect(get(topicMap).get('x')!.text).toBe('X');

      topics.update((t) => [
        ...t,
        { key: 'y', text: 'Y', meta: { version: 1, updatedAt: '' } },
      ]);
      expect(get(topicMap).size).toBe(2);
    });
  });

  // ── Settings store ───────────────────────────────────────────────────────────

  describe('settings store', () => {
    it('should have default values', async () => {
      const { settings } = await import('$lib/stores');
      const s = get(settings);
      expect(s.workerHost).toBeDefined();
      expect(s.autoSync).toBe(true);
      expect(s.syncHistory).toBe(true);
      expect(s.autoSyncIntervalSecs).toBe(30);
    });

    it('should allow updates', async () => {
      const { settings } = await import('$lib/stores');
      settings.update((s) => ({ ...s, autoSync: false }));
      expect(get(settings).autoSync).toBe(false);
    });
  });

  // ── Sync state store ─────────────────────────────────────────────────────────

  describe('syncState store', () => {
    it('should start as idle', async () => {
      const { syncState } = await import('$lib/stores');
      expect(get(syncState).status).toBe('idle');
    });

    it('should transition through states', async () => {
      const { syncState } = await import('$lib/stores');

      syncState.set({ status: 'syncing' });
      expect(get(syncState).status).toBe('syncing');

      syncState.set({ status: 'success', lastSync: '2026-01-01T00:00:00Z' });
      expect(get(syncState).status).toBe('success');
      expect(get(syncState).lastSync).toBe('2026-01-01T00:00:00Z');

      syncState.set({ status: 'error', error: 'Network failure' });
      expect(get(syncState).status).toBe('error');
      expect(get(syncState).error).toBe('Network failure');

      syncState.set({ status: 'conflict' });
      expect(get(syncState).status).toBe('conflict');
    });
  });

  // ── Conflict queue ───────────────────────────────────────────────────────────

  describe('conflictQueue & activeConflict', () => {
    it('should start empty', async () => {
      const { conflictQueue, activeConflict } = await import('$lib/stores');
      expect(get(conflictQueue)).toEqual([]);
      expect(get(activeConflict)).toBeNull();
    });

    it('should queue conflicts and expose first as active', async () => {
      const { conflictQueue, activeConflict } = await import('$lib/stores');

      const c1 = { key: 'a', base: 'base', local: 'local-a', remote: 'remote-a', remoteMeta: { version: 1, updatedAt: '' } };
      const c2 = { key: 'b', base: 'base', local: 'local-b', remote: 'remote-b', remoteMeta: { version: 1, updatedAt: '' } };

      conflictQueue.set([c1, c2]);
      expect(get(activeConflict)!.key).toBe('a');

      // Remove first conflict
      conflictQueue.set([c2]);
      expect(get(activeConflict)!.key).toBe('b');

      // Clear all
      conflictQueue.set([]);
      expect(get(activeConflict)).toBeNull();
    });
  });

  // ── UI state stores ──────────────────────────────────────────────────────────

  describe('UI state stores', () => {
    it('should initialize with correct defaults', async () => {
      const { activeTopicKey, isMobile, editorMode, collapseSidebar } = await import('$lib/stores');

      expect(get(activeTopicKey)).toBeNull();
      expect(get(isMobile)).toBe(false);
      expect(get(editorMode)).toBe('edit');
      expect(get(collapseSidebar)).toBe(true);
    });
  });

  // ── Toast system ─────────────────────────────────────────────────────────────

  describe('toast system', () => {
    it('should show and auto-remove toasts', async () => {
      vi.useFakeTimers();
      const { showToast, toasts } = await import('$lib/stores');

      showToast('Test message', 'info');
      expect(get(toasts)).toHaveLength(1);
      expect(get(toasts)[0].message).toBe('Test message');
      expect(get(toasts)[0].type).toBe('info');

      vi.advanceTimersByTime(5000);
      expect(get(toasts)).toHaveLength(0);

      vi.useRealTimers();
    });

    it('should generate unique IDs', async () => {
      const { showToast, toasts } = await import('$lib/stores');

      showToast('First', 'info');
      showToast('Second', 'success');
      showToast('Third', 'error');

      const t = get(toasts);
      expect(t).toHaveLength(3);
      const ids = t.map((x) => x.id);
      expect(new Set(ids).size).toBe(3); // all unique
    });
  });
});