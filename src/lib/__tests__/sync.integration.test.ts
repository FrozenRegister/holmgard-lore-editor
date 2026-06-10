import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock @tauri-apps/api/tauri (no Tauri runtime in jsdom)
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

// The fetch global is replaced per-test to simulate MCP Worker responses
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
  vi.resetAllMocks();
  vi.resetModules();
});

describe('sync integration', () => {
  // ── Mock helpers ──────────────────────────────────────────────────────────────

  function mockFetch(jsonResult: unknown, status = 200) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 401 ? 'Unauthorized' : status === 500 ? 'Internal Server Error' : 'OK',
      json: async () => jsonResult,
      text: async () => JSON.stringify(jsonResult),
    });
  }

  function mockFetchSequence(...responses: Array<{ json: unknown; status?: number }>) {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const resp = responses[call] ?? responses[responses.length - 1];
      call++;
      return Promise.resolve({
        ok: (resp.status ?? 200) >= 200 && (resp.status ?? 200) < 300,
        status: resp.status ?? 200,
        statusText: 'OK',
        json: async () => resp.json,
        text: async () => JSON.stringify(resp.json),
      });
    });
  }

  // ── listTopicsRemote → list_topics RPC ────────────────────────────────────────

  describe('listTopicsRemote (RPC → real parseKvEntry)', () => {
    it('should parse the keys array from a valid JSON-RPC response', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: { keys: ['character:sarah', 'location:fernveil'] },
      });

      const { listTopicsRemote } = await import('$lib/sync');
      const keys = await listTopicsRemote('https://example.workers.dev', 'sk-test');
      expect(keys).toEqual(['character:sarah', 'location:fernveil']);
    });

    it('should return empty array when remote returns no keys', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {},
      });

      const { listTopicsRemote } = await import('$lib/sync');
      const keys = await listTopicsRemote('https://example.workers.dev', 'sk-test');
      expect(keys).toEqual([]);
    });

    it('should throw on HTTP 401', async () => {
      mockFetch({}, 401);

      const { listTopicsRemote } = await import('$lib/sync');
      await expect(
        listTopicsRemote('https://example.workers.dev', 'wrong-key'),
      ).rejects.toThrow('HTTP 401');
    });

    it('should warn when called without an API key', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch({ jsonrpc: '2.0', id: 1, result: { keys: [] } });

      const { listTopicsRemote } = await import('$lib/sync');
      await listTopicsRemote('https://example.workers.dev');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('without an API key'));
      warn.mockRestore();
    });
  });

  // ── getTopicRemote → get_lore RPC ─────────────────────────────────────────────

  describe('getTopicRemote (RPC → real parseKvEntry)', () => {
    it('should parse a valid topic from JSON-RPC response', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          key: 'character:sarah',
          text: '## Sarah Weaver\nA brave explorer.',
          meta: { version: 3, updatedAt: '2026-06-01T00:00:00Z' },
        },
      });

      const { getTopicRemote } = await import('$lib/sync');
      const topic = await getTopicRemote('https://example.workers.dev', 'character:sarah', 'sk-test');
      expect(topic).not.toBeNull();
      expect(topic!.key).toBe('character:sarah');
      expect(topic!.text).toContain('Sarah Weaver');
      expect(topic!.meta.version).toBe(3);
    });

    it('should handle raw string format (no meta) gracefully', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: { key: 'faction:guild', text: 'Old Guild' },
      });

      const { getTopicRemote } = await import('$lib/sync');
      const topic = await getTopicRemote('https://example.workers.dev', 'faction:guild', 'sk-test');
      expect(topic).not.toBeNull();
      expect(topic!.text).toBe('Old Guild');
      expect(topic!.meta.version).toBe(0); // default for missing meta
    });

    it('should return null on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { getTopicRemote } = await import('$lib/sync');
      const topic = await getTopicRemote('https://example.workers.dev', 'any', 'sk-test');
      expect(topic).toBeNull();
    });
  });

  // ── pullAll → listTopicsRemote + batchGetTopicsRemote ─────────────────────────

  describe('pullAll (two-call compose)', () => {
    it('should list then batch-fetch in two calls', async () => {
      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { keys: ['a', 'b'] } } },
        { json: { jsonrpc: '2.0', id: 2, result: { key: 'a', text: 'Topic A' } } },
        { json: { jsonrpc: '2.0', id: 3, result: { key: 'b', text: 'Topic B' } } },
      );

      const { pullAll } = await import('$lib/sync');
      const map = await pullAll('https://example.workers.dev', 'sk-test');
      expect(map.size).toBe(2);
      expect(map.get('a')!.text).toBe('Topic A');
      expect(map.get('b')!.text).toBe('Topic B');
    });

    it('should return empty map when no keys exist', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: { keys: [] } });

      const { pullAll } = await import('$lib/sync');
      const map = await pullAll('https://example.workers.dev', 'sk-test');
      expect(map.size).toBe(0);
    });
  });

  // ── adminSave + adminDelete ───────────────────────────────────────────────────

  describe('adminSave (real fetch → admin/set-lore)', () => {
    it('should POST to admin/set-lore with correct body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });

      const { adminSave } = await import('$lib/sync');
      await adminSave(
        'https://example.workers.dev',
        'character:sarah',
        '## Sarah\nBrave explorer.',
        'admin-secret',
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.workers.dev/admin/set-lore',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'character:sarah',
            text: '## Sarah\nBrave explorer.',
            secret: 'admin-secret',
          }),
        }),
      );
    });

    it('should throw on non-200 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Forbidden',
      });

      const { adminSave } = await import('$lib/sync');
      await expect(
        adminSave('https://example.workers.dev', 'k', 'text', 'wrong-secret'),
      ).rejects.toThrow('Admin save failed (403)');
    });
  });

  describe('adminDelete', () => {
    it('should POST to admin/delete-lore', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });

      const { adminDelete } = await import('$lib/sync');
      await adminDelete('https://example.workers.dev', 'old-topic', 'admin-secret');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.workers.dev/admin/delete-lore',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'old-topic', secret: 'admin-secret' }),
        }),
      );
    });
  });

  // ── Conflict detection ────────────────────────────────────────────────────────

  describe('detectConflict (pure logic)', () => {
    it('should return null when local and remote match', async () => {
      const { detectConflict } = await import('$lib/sync');

      const local = { key: 'a', text: 'same', meta: { version: 1, updatedAt: '' } };
      const remote = { key: 'a', text: 'same', meta: { version: 1, updatedAt: '' } };

      expect(detectConflict(local, remote, null)).toBeNull();
    });

    it('should return null when remote matches base (no local changes)', async () => {
      const { detectConflict } = await import('$lib/sync');

      const local = { key: 'a', text: 'local edit', meta: { version: 1, updatedAt: '' } };
      const remote = { key: 'a', text: 'original', meta: { version: 1, updatedAt: '' } };

      expect(detectConflict(local, remote, 'original')).toBeNull();
    });

    it('should detect conflict when both sides diverged from base', async () => {
      const { detectConflict } = await import('$lib/sync');

      const local = { key: 'a', text: 'local edit', meta: { version: 1, updatedAt: '' } };
      const remote = { key: 'a', text: 'remote edit', meta: { version: 2, updatedAt: '' } };

      const conflict = detectConflict(local, remote, 'original');
      expect(conflict).not.toBeNull();
      expect(conflict!.key).toBe('a');
      expect(conflict!.local).toBe('local edit');
      expect(conflict!.remote).toBe('remote edit');
      expect(conflict!.base).toBe('original');
    });

    it('should detect conflict when base is null and texts differ', async () => {
      const { detectConflict } = await import('$lib/sync');

      const local = { key: 'a', text: 'local', meta: { version: 1, updatedAt: '' } };
      const remote = { key: 'a', text: 'remote', meta: { version: 2, updatedAt: '' } };

      const conflict = detectConflict(local, remote, null);
      expect(conflict).not.toBeNull();
      expect(conflict!.base).toBe('');
    });
  });

  // ── Pending-delete queue (localStorage) ───────────────────────────────────────

  describe('enqueuePendingDelete / dequeuePendingDeletes (real localStorage)', () => {
    it('should enqueue and dequeue pending deletes', async () => {
      const { enqueuePendingDelete, dequeuePendingDeletes } = await import('$lib/sync');

      enqueuePendingDelete('topic-1');
      enqueuePendingDelete('topic-2');
      enqueuePendingDelete('topic-1'); // duplicate → no-op

      const keys = dequeuePendingDeletes();
      expect(keys).toEqual(['topic-1', 'topic-2']);

      // Queue should be cleared after dequeue
      expect(localStorage.getItem('lore_pending_deletes')).toBeNull();
    });

    it('should return empty array when queue is empty', async () => {
      const { dequeuePendingDeletes } = await import('$lib/sync');

      const keys = dequeuePendingDeletes();
      expect(keys).toEqual([]);
    });
  });

  // ── getChanges (changelog delta sync) ─────────────────────────────────────────

  describe('getChanges (changelog endpoint)', () => {
    it('should fetch changelog entries from /changes', async () => {
      mockFetch({
        changes: [
          { key: 'a', version: 5, updatedAt: '2026-06-01T00:00:00Z', op: 'write' },
          { key: 'b', version: 3, updatedAt: '2026-06-02T00:00:00Z', op: 'write' },
        ],
      });

      const { getChanges } = await import('$lib/sync');
      const changes = await getChanges('https://example.workers.dev', '2026-05-01T00:00:00Z', 'sk-test');
      expect(changes).toHaveLength(2);
      expect(changes[0].key).toBe('a');
      expect(changes[0].version).toBe(5);
      expect(changes[0].op).toBe('write');
    });

    it('should throw on HTTP 401', async () => {
      mockFetch({}, 401);

      const { getChanges } = await import('$lib/sync');
      await expect(
        getChanges('https://example.workers.dev', '2026-01-01', 'wrong-key'),
      ).rejects.toThrow('HTTP 401');
    });

    it('should return empty array when response has no changes field', async () => {
      mockFetch({});

      const { getChanges } = await import('$lib/sync');
      const changes = await getChanges('https://example.workers.dev', '2026-01-01', 'sk-test');
      expect(changes).toEqual([]);
    });
  });

  // ── getTopicHistories ─────────────────────────────────────────────────────────

  describe('getTopicHistories', () => {
    it('should fetch histories for multiple topics', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          'topic-a': [
            { text: 'v1', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } },
            { text: 'v2', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } },
          ],
          'topic-b': [],
        },
      });

      const { getTopicHistories } = await import('$lib/sync');
      const histories = await getTopicHistories(
        'https://example.workers.dev',
        ['topic-a', 'topic-b'],
        'sk-test',
      );
      expect(histories.size).toBe(2);
      expect(histories.get('topic-a')).toHaveLength(2);
      expect(histories.get('topic-b')).toHaveLength(0);
    });

    it('should return empty map for empty keys array', async () => {
      const { getTopicHistories } = await import('$lib/sync');
      const histories = await getTopicHistories('https://example.workers.dev', [], 'sk-test');
      expect(histories.size).toBe(0);
    });
  });

  // ── batchGetTopicsRemote ──────────────────────────────────────────────────────

  describe('batchGetTopicsRemote (parallel getTopicRemote)', () => {
    it('should fetch multiple topics in parallel', async () => {
      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { key: 'a', text: 'A', meta: { version: 1, updatedAt: '' } } } },
        { json: { jsonrpc: '2.0', id: 2, result: { key: 'b', text: 'B', meta: { version: 1, updatedAt: '' } } } },
      );

      const { batchGetTopicsRemote } = await import('$lib/sync');
      const map = await batchGetTopicsRemote('https://example.workers.dev', ['a', 'b'], 'sk-test');
      expect(map.size).toBe(2);
      expect(map.get('a')!.text).toBe('A');
      expect(map.get('b')!.text).toBe('B');
    });

    it('should return empty map for empty keys', async () => {
      const { batchGetTopicsRemote } = await import('$lib/sync');
      const map = await batchGetTopicsRemote('https://example.workers.dev', [], 'sk-test');
      expect(map.size).toBe(0);
    });

    it('should skip failed fetches gracefully', async () => {
      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { key: 'a', text: 'A', meta: { version: 1, updatedAt: '' } } } },
        { json: {}, status: 500 }, // b fails
      );

      const { batchGetTopicsRemote } = await import('$lib/sync');
      const map = await batchGetTopicsRemote('https://example.workers.dev', ['a', 'b'], 'sk-test');
      expect(map.size).toBe(1); // only 'a' succeeds
    });
  });
});