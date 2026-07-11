import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
  vi.resetAllMocks();
  vi.resetModules();
});

describe('syncAll integration (real stores + storage + sync, mocked fetch)', () => {
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

  function mockFetch(jsonResult: unknown, status = 200) {
    mockFetchSequence({ json: jsonResult, status });
  }

  async function setup() {
    const { setMcpApiKey } = await import('$lib/auth');
    await setMcpApiKey('sk-test');
  }

  // ── runSync (full pull) ────────────────────────────────────────────────────────

  describe('runSync', () => {
    it('saves new remote topics and adds them to the topics store', async () => {
      await setup();
      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { keys: ['character:sarah'] } } },
        {
          json: {
            jsonrpc: '2.0', id: 2,
            result: { results: { 'character:sarah': { text: '## Sarah', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } } } },
          },
        },
      );

      const { runSync } = await import('$lib/syncAll');
      const { topics, syncState } = await import('$lib/stores');

      await runSync();

      expect(get(syncState).status).toBe('success');
      const t = get(topics).find((x) => x.key === 'character:sarah');
      expect(t).toBeDefined();
      expect(t!.text).toBe('## Sarah');
    });

    it('silently applies a remote metadata/version bump when text is unchanged (no conflict)', async () => {
      // detectConflict only skips flagging a conflict when local.text === remote.text
      // (or remote reverted exactly to the last-synced base) — an actual text change
      // with no known base is always surfaced as a conflict by design, see below.
      await setup();
      const { topics } = await import('$lib/stores');
      topics.set([{ key: 'a', text: 'same text', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } }]);

      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { keys: ['a'] } } },
        { json: { jsonrpc: '2.0', id: 2, result: { results: { a: { text: 'same text', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      expect(get(topics).find((t) => t.key === 'a')!.meta.version).toBe(2);
    });

    it('treats an untracked remote text change as a conflict rather than silently overwriting', async () => {
      // No syncedRemoteText recorded → base is null → any remote text difference
      // from local is surfaced for manual review, even though the local copy was
      // never actually edited by the user.
      await setup();
      const { topics, conflictQueue } = await import('$lib/stores');
      topics.set([{ key: 'a', text: 'old text', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } }]);

      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { keys: ['a'] } } },
        { json: { jsonrpc: '2.0', id: 2, result: { results: { a: { text: 'new text', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      expect(get(topics).find((t) => t.key === 'a')!.text).toBe('old text');
      expect(get(conflictQueue)).toHaveLength(1);
    });

    it('detects a conflict when local and remote both diverged from base', async () => {
      await setup();
      const { topics, syncState, conflictQueue } = await import('$lib/stores');
      topics.set([
        { key: 'a', text: 'local edit', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z', syncedRemoteText: 'base text' } },
      ]);

      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { keys: ['a'] } } },
        { json: { jsonrpc: '2.0', id: 2, result: { results: { a: { text: 'remote edit', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      expect(get(syncState).status).toBe('conflict');
      expect(get(conflictQueue)).toHaveLength(1);
      expect(get(conflictQueue)[0].key).toBe('a');
    });

    it('flags a local topic as removedFromRemote when it no longer exists remotely', async () => {
      await setup();
      const { topics } = await import('$lib/stores');
      topics.set([{ key: 'gone', text: 'still here locally', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } }]);

      mockFetch({ jsonrpc: '2.0', id: 1, result: { keys: [] } });

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      expect(get(topics).find((t) => t.key === 'gone')!.meta.removedFromRemote).toBe(true);
    });

    it('clears removedFromRemote when a previously-missing topic reappears', async () => {
      await setup();
      const { topics } = await import('$lib/stores');
      topics.set([{ key: 'a', text: 'text', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z', removedFromRemote: true } }]);

      mockFetchSequence(
        { json: { jsonrpc: '2.0', id: 1, result: { keys: ['a'] } } },
        { json: { jsonrpc: '2.0', id: 2, result: { results: { a: { text: 'text', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } } } } } },
      );

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      expect(get(topics).find((t) => t.key === 'a')!.meta.removedFromRemote).toBe(false);
    });

    it('shows a warning toast and does not sync when no API key is configured', async () => {
      // No setMcpApiKey call — key is absent.
      const { syncState } = await import('$lib/stores');
      const { runSync } = await import('$lib/syncAll');

      await runSync();

      expect(get(syncState).status).not.toBe('syncing');
      expect(get(syncState).status).not.toBe('success');
    });

    it('is a no-op when a sync is already in progress', async () => {
      await setup();
      const { syncState } = await import('$lib/stores');
      syncState.set({ status: 'syncing' });
      mockFetch({ jsonrpc: '2.0', id: 1, result: { keys: [] } });

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      // fetch should never have been called — runSync returned immediately
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('sets status to error when the remote pull fails', async () => {
      await setup();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

      const { runSync } = await import('$lib/syncAll');
      const { syncState } = await import('$lib/stores');
      await runSync();

      expect(get(syncState).status).toBe('error');
      expect(get(syncState).error).toContain('network down');
    });

    it('flushes queued pending deletes via admin secret before pulling', async () => {
      await setup();
      localStorage.setItem('hle:adminSecret', 'admin-secret-test');
      const { enqueuePendingDelete } = await import('$lib/sync');
      enqueuePendingDelete('stale-topic');

      mockFetchSequence(
        { json: { ok: true } }, // admin/delete-lore-batch
        { json: { jsonrpc: '2.0', id: 1, result: { keys: [] } } }, // list_topics
      );

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      const calledUrls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(calledUrls[0]).toContain('/admin/delete-lore-batch');
    });

    it('re-queues pending deletes when the admin batch-delete call fails', async () => {
      await setup();
      localStorage.setItem('hle:adminSecret', 'admin-secret-test');
      const { enqueuePendingDelete, dequeuePendingDeletes } = await import('$lib/sync');
      enqueuePendingDelete('stale-topic');

      mockFetchSequence(
        { json: { error: 'forbidden' }, status: 403 }, // admin/delete-lore-batch fails
        { json: { jsonrpc: '2.0', id: 1, result: { keys: [] } } }, // list_topics still proceeds
      );

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      expect(dequeuePendingDeletes()).toEqual(['stale-topic']);
    });

    it('re-queues pending deletes when no admin secret is configured', async () => {
      await setup();
      const { enqueuePendingDelete, dequeuePendingDeletes } = await import('$lib/sync');
      enqueuePendingDelete('stale-topic');

      mockFetch({ jsonrpc: '2.0', id: 1, result: { keys: [] } });

      const { runSync } = await import('$lib/syncAll');
      await runSync();

      // Re-queued: dequeuing again should still return it
      expect(dequeuePendingDeletes()).toEqual(['stale-topic']);
    });
  });

  // ── runSmartSync (delta pull) ──────────────────────────────────────────────────

  describe('runSmartSync', () => {
    it('returns true and updates lastSync when nothing changed', async () => {
      await setup();
      mockFetch({ changes: [] });

      const { runSmartSync } = await import('$lib/syncAll');
      const { syncState } = await import('$lib/stores');
      const ok = await runSmartSync('2026-01-01T00:00:00Z');

      expect(ok).toBe(true);
      expect(get(syncState).lastSync).toBeDefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1); // only the /changes call
    });

    it('returns false when the changelog fetch fails, signalling a fallback to full sync', async () => {
      await setup();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('changelog unavailable'));

      const { runSmartSync } = await import('$lib/syncAll');
      const ok = await runSmartSync('2026-01-01T00:00:00Z');

      expect(ok).toBe(false);
    });

    it('saves a new topic reported by the changelog', async () => {
      await setup();
      mockFetchSequence(
        { json: { changes: [{ key: 'new-topic', version: 1, updatedAt: '2026-02-01T00:00:00Z', op: 'write' }] } },
        { json: { jsonrpc: '2.0', id: 1, result: { results: { 'new-topic': { text: 'Fresh content', meta: { version: 1, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSmartSync } = await import('$lib/syncAll');
      const { topics } = await import('$lib/stores');
      await runSmartSync('2026-01-01T00:00:00Z');

      expect(get(topics).find((t) => t.key === 'new-topic')!.text).toBe('Fresh content');
    });

    it('silently applies a version bump when the changelog-reported text is unchanged (no conflict)', async () => {
      await setup();
      const { topics } = await import('$lib/stores');
      topics.set([{ key: 'a', text: 'same text', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } }]);

      mockFetchSequence(
        { json: { changes: [{ key: 'a', version: 2, updatedAt: '2026-02-01T00:00:00Z', op: 'write' }] } },
        { json: { jsonrpc: '2.0', id: 1, result: { results: { a: { text: 'same text', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSmartSync } = await import('$lib/syncAll');
      await runSmartSync('2026-01-01T00:00:00Z');

      expect(get(topics).find((t) => t.key === 'a')!.meta.version).toBe(2);
    });

    it('treats an untracked remote text change as a conflict rather than silently overwriting', async () => {
      await setup();
      const { topics, conflictQueue } = await import('$lib/stores');
      topics.set([{ key: 'a', text: 'old', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } }]);

      mockFetchSequence(
        { json: { changes: [{ key: 'a', version: 2, updatedAt: '2026-02-01T00:00:00Z', op: 'write' }] } },
        { json: { jsonrpc: '2.0', id: 1, result: { results: { a: { text: 'updated', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSmartSync } = await import('$lib/syncAll');
      await runSmartSync('2026-01-01T00:00:00Z');

      expect(get(topics).find((t) => t.key === 'a')!.text).toBe('old');
      expect(get(conflictQueue)).toHaveLength(1);
    });

    it('flags a locally-present topic as removedFromRemote on a delete changelog entry, with no extra fetch', async () => {
      await setup();
      const { topics } = await import('$lib/stores');
      topics.set([{ key: 'gone', text: 'still here', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } }]);

      mockFetch({ changes: [{ key: 'gone', version: 2, updatedAt: '2026-02-01T00:00:00Z', op: 'delete' }] });

      const { runSmartSync } = await import('$lib/syncAll');
      await runSmartSync('2026-01-01T00:00:00Z');

      expect(get(topics).find((t) => t.key === 'gone')!.meta.removedFromRemote).toBe(true);
      // Only the /changes call — no batch-get needed for a pure delete
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('detects a conflict during smart sync and appends to the existing conflict queue', async () => {
      await setup();
      const { topics, conflictQueue, syncState } = await import('$lib/stores');
      topics.set([{ key: 'a', text: 'local edit', meta: { version: 1, updatedAt: '2026-01-01T00:00:00Z', syncedRemoteText: 'base' } }]);
      conflictQueue.set([{ key: 'existing', local: 'x', remote: 'y', base: 'z', remoteMeta: { version: 1, updatedAt: '2026-01-01T00:00:00Z' } }]);

      mockFetchSequence(
        { json: { changes: [{ key: 'a', version: 2, updatedAt: '2026-02-01T00:00:00Z', op: 'write' }] } },
        { json: { jsonrpc: '2.0', id: 1, result: { results: { a: { text: 'remote edit', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSmartSync } = await import('$lib/syncAll');
      await runSmartSync('2026-01-01T00:00:00Z');

      expect(get(syncState).status).toBe('conflict');
      // Appended, not replaced — existing queue entry preserved
      expect(get(conflictQueue).map((c) => c.key)).toEqual(['existing', 'a']);
    });

    it('deduplicates multiple changelog entries for the same key, keeping only the latest', async () => {
      await setup();
      mockFetchSequence(
        {
          json: {
            changes: [
              { key: 'a', version: 1, updatedAt: '2026-01-01T00:00:00Z', op: 'write' },
              { key: 'a', version: 2, updatedAt: '2026-02-01T00:00:00Z', op: 'write' },
            ],
          },
        },
        { json: { jsonrpc: '2.0', id: 1, result: { results: { a: { text: 'latest', meta: { version: 2, updatedAt: '2026-02-01T00:00:00Z' } } } } } },
      );

      const { runSmartSync } = await import('$lib/syncAll');
      const { topics } = await import('$lib/stores');
      await runSmartSync('2026-01-01T00:00:00Z');

      // Only one batch-get call for the deduplicated key set
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(get(topics).find((t) => t.key === 'a')!.text).toBe('latest');
    });

    it('shows a warning toast and returns false when no API key is configured', async () => {
      globalThis.fetch = vi.fn();
      const { runSmartSync } = await import('$lib/syncAll');
      const ok = await runSmartSync('2026-01-01T00:00:00Z');

      expect(ok).toBe(false);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('is a no-op returning true when a sync is already in progress', async () => {
      await setup();
      globalThis.fetch = vi.fn();
      const { syncState } = await import('$lib/stores');
      syncState.set({ status: 'syncing' });

      const { runSmartSync } = await import('$lib/syncAll');
      const ok = await runSmartSync('2026-01-01T00:00:00Z');

      expect(ok).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
