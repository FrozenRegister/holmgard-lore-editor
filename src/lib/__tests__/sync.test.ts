import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectConflict,
  enqueue,
  flushQueue,
  enqueuePendingDelete,
  dequeuePendingDeletes,
  pullAll,
} from '../sync';
import type { Topic, AppSettings } from '../types';

// ── Mock: storage queue ────────────────────────────────────────────────────────
const mockQueue: any[] = [];
vi.mock('../storage', () => ({
  loadQueue: vi.fn(async () => [...mockQueue]),
  saveQueue: vi.fn(async (q: any[]) => {
    mockQueue.length = 0;
    mockQueue.push(...q);
  }),
}));

// ── Mock: fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Mock: localStorage ────────────────────────────────────────────────────────
const lsStore: Record<string, string> = {};
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem:    (k: string) => lsStore[k] ?? null,
    setItem:    (k: string, v: string) => { lsStore[k] = v; },
    removeItem: (k: string) => { delete lsStore[k]; },
  },
  writable: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTopic(key: string, text: string, version: number): Topic {
  return { key, text, meta: { version, updatedAt: '2026-01-01T00:00:00.000Z' } };
}

function makeRemote(key: string, text: string, version: number): Topic  {
  return { key, text, meta: { version, updatedAt: '2026-01-01T00:00:00.000Z' } };
}

function makeSettings(host = 'http://worker'): AppSettings {
  return { workerHost: host, autoSyncIntervalSecs: 0 };

}

beforeEach(() => {
  mockQueue.length = 0;
  Object.keys(lsStore).forEach((k) => delete lsStore[k]);
  mockFetch.mockReset();
  vi.clearAllMocks();
});

// ── detectConflict ────────────────────────────────────────────────────────────
describe('detectConflict', () => {
  it('returns null when local and remote text are identical', () => {
    expect(detectConflict(makeTopic('k', 'same', 1), makeRemote('k', 'same', 1), null)).toBeNull();
  });

  it('returns null when remote text matches base (remote unchanged since last sync)', () => {
    const local  = makeTopic('k', 'my edits', 2);
    const remote = makeRemote('k', 'base text', 1);
    expect(detectConflict(local, remote, 'base text')).toBeNull();
  });

  it('returns ConflictInfo when base is null and texts differ', () => {
    const result = detectConflict(
      makeTopic('orcs', 'local version', 1),
      makeRemote('orcs', 'remote version', 1),
      null
    );
    expect(result).not.toBeNull();
    expect(result!.key).toBe('orcs');
    expect(result!.local).toBe('local version');
    expect(result!.remote).toBe('remote version');
    expect(result!.base).toBe('');
  });

  it('returns ConflictInfo when both sides diverged from a known base', () => {
    const result = detectConflict(
      makeTopic('k', 'local edits', 2),
      makeRemote('k', 'remote edits', 2),
      'original text'
    );
    expect(result).not.toBeNull();
    expect(result!.local).toBe('local edits');
    expect(result!.remote).toBe('remote edits');
    expect(result!.base).toBe('original text');
  });

  it('returns ConflictInfo when base is null even if remote version is higher', () => {
    expect(detectConflict(makeTopic('k', 'old', 1), makeRemote('k', 'new', 99), null)).not.toBeNull();
  });

  it('preserves remoteMeta in the returned ConflictInfo', () => {
    const remote = makeRemote('k', 'remote', 3);
    const result = detectConflict(makeTopic('k', 'local', 1), remote, null);
    expect(result!.remoteMeta).toEqual(remote.meta);
  });

  it('returns null for identical empty strings', () => {
    expect(detectConflict(makeTopic('k', '', 1), makeRemote('k', '', 1), null)).toBeNull();
  });

  it('is case-sensitive when comparing text', () => {
    expect(detectConflict(makeTopic('k', 'Hello', 1), makeRemote('k', 'hello', 1), null)).not.toBeNull();
  });
});

// ── enqueuePendingDelete / dequeuePendingDeletes ───────────────────────────────
describe('enqueuePendingDelete', () => {
  it('adds a key to the pending delete list', () => {
    enqueuePendingDelete('dragons');
    expect(dequeuePendingDeletes()).toContain('dragons');
  });

  it('does not add the same key twice', () => {
    enqueuePendingDelete('elves');
    enqueuePendingDelete('elves');
    const keys = dequeuePendingDeletes();
    expect(keys.filter((k) => k === 'elves')).toHaveLength(1);
  });

  it('handles multiple distinct keys', () => {
    enqueuePendingDelete('a');
    enqueuePendingDelete('b');
    enqueuePendingDelete('c');
    const keys = dequeuePendingDeletes();
    expect(keys).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(keys).toHaveLength(3);
  });
});

describe('dequeuePendingDeletes', () => {
  it('returns an empty array when nothing is queued', () => {
    expect(dequeuePendingDeletes()).toEqual([]);
  });

  it('clears the queue after dequeue', () => {
    enqueuePendingDelete('orcs');
    dequeuePendingDeletes();
    expect(dequeuePendingDeletes()).toEqual([]);
  });

  it('returns all queued keys and clears in one call', () => {
    enqueuePendingDelete('key-1');
    enqueuePendingDelete('key-2');
    const first  = dequeuePendingDeletes();
    const second = dequeuePendingDeletes();
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
  });
});

// ── enqueue ───────────────────────────────────────────────────────────────────
describe('enqueue', () => {
  it('adds an entry to the save queue', async () => {
    await enqueue('dragons', 'some text');
    expect(mockQueue).toHaveLength(1);
    expect(mockQueue[0].key).toBe('dragons');
    expect(mockQueue[0].text).toBe('some text');
  });

  it('overwrites an existing queued entry for the same key', async () => {
    await enqueue('dragons', 'first');
    await enqueue('dragons', 'second');
    expect(mockQueue).toHaveLength(1);
    expect(mockQueue[0].text).toBe('second');
  });

  it('queues multiple distinct keys', async () => {
    await enqueue('a', 'text a');
    await enqueue('b', 'text b');
    expect(mockQueue).toHaveLength(2);
  });

  it('sets attempts to 0 on a new entry', async () => {
    await enqueue('key', 'text');
    expect(mockQueue[0].attempts).toBe(0);
  });
});

// ── flushQueue ────────────────────────────────────────────────────────────────
describe('flushQueue', () => {
  it('calls adminSave for each queued item', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await enqueue('dragons', 'text');
    await flushQueue(makeSettings(), 'secret', () => {});
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/set-lore'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('clears the queue after a successful flush', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await enqueue('elves', 'text');
    await flushQueue(makeSettings(), 'secret', () => {});
    expect(mockQueue).toHaveLength(0);
  });

  it('does nothing when queue is empty', async () => {
    await flushQueue(makeSettings(), 'secret', () => {});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps failed items in queue with incremented attempts', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    await enqueue('orcs', 'text');
    await flushQueue(makeSettings(), 'secret', () => {});
    expect(mockQueue).toHaveLength(1);
    expect(mockQueue[0].attempts).toBe(1);
  });

  it('drops items that have reached MAX_ATTEMPTS', async () => {
    mockQueue.push({ key: 'ghost', text: 'text', enqueuedAt: new Date().toISOString(), attempts: 8 });
    await flushQueue(makeSettings(), 'secret', () => {});
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockQueue).toHaveLength(0);
  });
});

// ── pullAll (tests withConcurrency indirectly) ────────────────────────────────
describe('pullAll', () => {
  function rpcResponse(data: object) {
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: data }) };
  }

  it('returns an empty map when there are no remote topics', async () => {
    mockFetch.mockResolvedValueOnce(rpcResponse({ keys: [] }));
    const map = await pullAll('http://worker');
    expect(map.size).toBe(0);
  });

  it('returns a correctly populated map for a single topic', async () => {
    mockFetch
      .mockResolvedValueOnce(rpcResponse({ keys: ['dragons'] }))
      .mockResolvedValueOnce(rpcResponse({ key: 'dragons', text: 'here be dragons', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }));
    const map = await pullAll('http://worker');
    expect(map.size).toBe(1);
    expect(map.get('dragons')?.text).toBe('here be dragons');
  });

  it('handles 20 topics without throwing (concurrency stress)', async () => {
    const keys = Array.from({ length: 20 }, (_, i) => `topic-${i}`);
    mockFetch.mockResolvedValueOnce(rpcResponse({ keys }));
    for (const key of keys) {
      mockFetch.mockResolvedValueOnce(
        rpcResponse({ key, text: `text for ${key}`, meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } })
      );
    }
    const map = await pullAll('http://worker');
    expect(map.size).toBe(20);
  });

  it('omits topics where getTopicRemote returns null', async () => {
    mockFetch
      .mockResolvedValueOnce(rpcResponse({ keys: ['good', 'bad'] }))
      .mockResolvedValueOnce(rpcResponse({ key: 'good', text: 'ok', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }))
      .mockRejectedValueOnce(new Error('not found'));
    const map = await pullAll('http://worker');
    expect(map.has('good')).toBe(true);
    expect(map.has('bad')).toBe(false);
  });
});
