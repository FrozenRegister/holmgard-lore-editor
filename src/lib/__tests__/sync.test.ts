import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Must run before any import that touches storage ───────────────────────────
const { invokeMock, fetchMock } = vi.hoisted(() => {
  Object.defineProperty(globalThis, '__TAURI__', { value: {}, configurable: true });
  const invokeMock = vi.fn();
  const fetchMock  = vi.fn();
  globalThis.fetch = fetchMock as any;
  return { invokeMock, fetchMock };
});

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: invokeMock }));

// Import AFTER mocks
import {
  detectConflict,
  enqueue,
  flushQueue,
  enqueuePendingDelete,
  dequeuePendingDeletes,
  pullAll,
} from '../sync';
import type { Topic, AppSettings } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTopic(key: string, text: string, version: number): Topic {
  return { key, text, meta: { version, updatedAt: '2026-01-01T00:00:00.000Z' } };
}

function makeRemote(key: string, text: string, version: number): Topic {
  return { key, text, meta: { version, updatedAt: '2026-01-01T00:00:00.000Z' } };
}

function makeSettings(host = 'http://worker'): AppSettings {
  return { workerHost: host, autoSyncIntervalSecs: 0 };
}

function okFetch(data: object) {
  return Promise.resolve({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: data }) } as Response);
}

// In-memory invoke store
const invokeStore: Record<string, string> = {};

beforeEach(() => {
  Object.keys(invokeStore).forEach((k) => delete invokeStore[k]);
  localStorage.clear();
  fetchMock.mockReset();
  invokeMock.mockReset();

  invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'fs_read') {
      const val = invokeStore[`${args?.path}`];
      if (val === undefined) throw new Error('Not found');
      return val;
    }
    if (cmd === 'fs_write') { invokeStore[`${args?.path}`] = args?.content as string; return; }
    if (cmd === 'fs_delete') { delete invokeStore[`${args?.path}`]; return; }
    throw new Error(`Unknown: ${cmd}`);
  });
});

// ── detectConflict ────────────────────────────────────────────────────────────
describe('detectConflict', () => {
  it('returns null when text is identical', () => {
    expect(detectConflict(makeTopic('k', 'same', 1), makeRemote('k', 'same', 1), null)).toBeNull();
  });

  it('returns null when remote text matches base (remote unchanged)', () => {
    expect(detectConflict(makeTopic('k', 'my edits', 2), makeRemote('k', 'base', 1), 'base')).toBeNull();
  });

  it('returns ConflictInfo when base is null and texts differ', () => {
    const r = detectConflict(makeTopic('orcs', 'local', 1), makeRemote('orcs', 'remote', 1), null);
    expect(r).not.toBeNull();
    expect(r!.key).toBe('orcs');
    expect(r!.local).toBe('local');
    expect(r!.remote).toBe('remote');
    expect(r!.base).toBe('');
  });

  it('returns ConflictInfo when both sides diverged from a known base', () => {
    const r = detectConflict(makeTopic('k', 'local edits', 2), makeRemote('k', 'remote edits', 2), 'original');
    expect(r).not.toBeNull();
    expect(r!.base).toBe('original');
  });

  it('preserves remoteMeta', () => {
    const remote = makeRemote('k', 'remote', 3);
    expect(detectConflict(makeTopic('k', 'local', 1), remote, null)!.remoteMeta).toEqual(remote.meta);
  });

  it('returns null for identical empty strings', () => {
    expect(detectConflict(makeTopic('k', '', 1), makeRemote('k', '', 1), null)).toBeNull();
  });

  it('is case-sensitive', () => {
    expect(detectConflict(makeTopic('k', 'Hello', 1), makeRemote('k', 'hello', 1), null)).not.toBeNull();
  });
});

// ── enqueuePendingDelete / dequeuePendingDeletes ───────────────────────────────
describe('enqueuePendingDelete', () => {
  it('adds a key to pending deletes', () => {
    enqueuePendingDelete('dragons');
    expect(dequeuePendingDeletes()).toContain('dragons');
  });

  it('deduplicates the same key', () => {
    enqueuePendingDelete('elves');
    enqueuePendingDelete('elves');
    expect(dequeuePendingDeletes().filter((k) => k === 'elves')).toHaveLength(1);
  });

  it('handles multiple distinct keys', () => {
    enqueuePendingDelete('a');
    enqueuePendingDelete('b');
    enqueuePendingDelete('c');
    expect(dequeuePendingDeletes()).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });
});

describe('dequeuePendingDeletes', () => {
  it('returns empty array when nothing queued', () => {
    expect(dequeuePendingDeletes()).toEqual([]);
  });

  it('clears queue after dequeue', () => {
    enqueuePendingDelete('orcs');
    dequeuePendingDeletes();
    expect(dequeuePendingDeletes()).toEqual([]);
  });
});

// ── enqueue ───────────────────────────────────────────────────────────────────
describe('enqueue', () => {
  it('adds an entry to the queue', async () => {
    await enqueue('dragons', 'text');
    const q = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(q).toHaveLength(1);
    expect(q[0].key).toBe('dragons');
  });

  it('overwrites same key', async () => {
    await enqueue('dragons', 'first');
    await enqueue('dragons', 'second');
    const q = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(q).toHaveLength(1);
    expect(q[0].text).toBe('second');
  });

  it('initialises attempts to 0', async () => {
    await enqueue('k', 'text');
    const q = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(q[0].attempts).toBe(0);
  });
});

// ── flushQueue ────────────────────────────────────────────────────────────────
describe('flushQueue', () => {
  it('sends a POST for each queued item', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await enqueue('dragons', 'text');
    await flushQueue(makeSettings(), 'secret', () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/set-lore'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('clears the queue on success', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await enqueue('elves', 'text');
    await flushQueue(makeSettings(), 'secret', () => {});
    const q = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(q).toHaveLength(0);
  });

  it('does nothing when queue is empty', async () => {
    await flushQueue(makeSettings(), 'secret', () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('increments attempts on failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await enqueue('orcs', 'text');
    await flushQueue(makeSettings(), 'secret', () => {});
    const q = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(q[0].attempts).toBe(1);
  });
});

// ── pullAll ───────────────────────────────────────────────────────────────────
describe('pullAll', () => {
  it('returns empty map when no remote topics', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({ keys: [] }));
    expect((await pullAll('http://worker')).size).toBe(0);
  });

  it('returns populated map for one topic', async () => {
    fetchMock
      .mockResolvedValueOnce(okFetch({ keys: ['dragons'] }))
      .mockResolvedValueOnce(okFetch({ key: 'dragons', text: 'here be dragons', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }));
    const map = await pullAll('http://worker');
    expect(map.get('dragons')?.text).toBe('here be dragons');
  });

  it('handles 20 topics without throwing', async () => {
    const keys = Array.from({ length: 20 }, (_, i) => `topic-${i}`);
    fetchMock.mockResolvedValueOnce(okFetch({ keys }));
    for (const key of keys) {
      fetchMock.mockResolvedValueOnce(okFetch({ key, text: `text for ${key}`, meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }));
    }
    expect((await pullAll('http://worker')).size).toBe(20);
  });

  it('omits topics that fail to fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(okFetch({ keys: ['good', 'bad'] }))
      .mockResolvedValueOnce(okFetch({ key: 'good', text: 'ok', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }))
      .mockRejectedValueOnce(new Error('not found'));
    const map = await pullAll('http://worker');
    expect(map.has('good')).toBe(true);
    expect(map.has('bad')).toBe(false);
  });
});
