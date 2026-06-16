import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ── Must run before any import that touches storage ───────────────────────────
const { invokeMock, fetchMock } = vi.hoisted(() => {
  // Set up __TAURI__ on window before any module that checks IS_TAURI
  // This ensures storage.ts uses the Tauri code path (file-based) instead of IndexedDB
  if (typeof window !== 'undefined') {
    (window as any).__TAURI__ = {};
  }
  const invokeMock = vi.fn();
  const fetchMock = vi.fn();
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
  listTopicsRemote,
  getTopicRemote,
  adminSave,
  adminDelete,
  batchGetTopicsRemote,
  getTopicHistories,
  getChanges,
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
  return { workerHost: host, autoSyncIntervalSecs: 0, syncHistory: false, autoSync: true,   };
}

function okFetch(data: object) {
  return Promise.resolve({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: data }) } as Response);
}

// In-memory invoke store
const invokeStore: Record<string, string> = {};

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  Object.keys(invokeStore).forEach((k) => delete invokeStore[k]);
  localStorage.clear();
  (fetchMock as Mock).mockReset();
  (invokeMock as Mock).mockReset();

  vi.stubGlobal('__TAURI__', {});
  vi.stubGlobal('fetch', fetchMock);

  (invokeMock as Mock).mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
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
    await flushQueue(makeSettings(), 'secret', () => { });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/set-lore'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('clears the queue on success', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await enqueue('elves', 'text');
    await flushQueue(makeSettings(), 'secret', () => { });
    const q = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(q).toHaveLength(0);
  });

  it('does nothing when queue is empty', async () => {
    await flushQueue(makeSettings(), 'secret', () => { });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('increments attempts on failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await enqueue('orcs', 'text');
    await flushQueue(makeSettings(), 'secret', () => { });
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
    for (const k of keys) {
      fetchMock.mockResolvedValueOnce(okFetch({ key: k, text: `text for ${k}`, meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }));
    }
    expect((await pullAll('http://worker')).size).toBe(20);
  });

  it('omits topics missing from batch results', async () => {
    fetchMock
      .mockResolvedValueOnce(okFetch({ keys: ['good', 'bad'] }))
      .mockResolvedValueOnce(okFetch({ key: 'good', text: 'ok', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }))
      .mockRejectedValueOnce(new Error('not found'));
    const map = await pullAll('http://worker');
    expect(map.has('good')).toBe(true);
    expect(map.has('bad')).toBe(false);
  });
});

// ── listTopicsRemote ───────────────────────────────────────────────────────────
describe('listTopicsRemote', () => {
  it('returns list of topic keys', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({ keys: ['topic1', 'topic2', 'topic3'] }));
    const keys = await listTopicsRemote('http://worker');
    expect(keys).toEqual(['topic1', 'topic2', 'topic3']);
  });

  it('returns empty array when no keys field', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({}));
    const keys = await listTopicsRemote('http://worker');
    expect(keys).toEqual([]);
  });

  it('includes API key header when provided', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({ keys: [] }));
    await listTopicsRemote('http://worker', 'my-api-key');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBe('my-api-key');
  });

  it('throws on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' } as Response);
    await expect(listTopicsRemote('http://worker')).rejects.toThrow('HTTP 500');
  });

  it('emits console.warn when called without an API key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(okFetch({ keys: [] }));
    await listTopicsRemote('http://worker');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('without an API key'));
    warnSpy.mockRestore();
  });

  it('throws a 401-specific hint when the Worker rejects with 401', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' } as Response);
    await expect(listTopicsRemote('http://worker')).rejects.toThrow('check your MCP API key in Settings');
  });
});

// ── getTopicRemote ─────────────────────────────────────────────────────────────
describe('getTopicRemote', () => {
  it('returns topic with text and meta', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({
      key: 'dragons',
      text: 'Here be dragons',
      meta: { version: 2, updatedAt: '2026-06-01T00:00:00.000Z' },
    }));
    const topic = await getTopicRemote('http://worker', 'dragons');
    expect(topic).not.toBeNull();
    expect(topic!.key).toBe('dragons');
    expect(topic!.text).toBe('Here be dragons');
    expect(topic!.meta.version).toBe(2);
  });

  it('returns null on error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Not found'));
    const topic = await getTopicRemote('http://worker', 'missing');
    expect(topic).toBeNull();
  });

  it('provides default meta when meta is undefined', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({
      key: 'test',
      text: 'content',
    }));
    const topic = await getTopicRemote('http://worker', 'test');
    expect(topic!.meta.version).toBe(0);
    expect(topic!.meta.updatedAt).toBeDefined();
  });

  it('includes API key header when provided', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({ key: 'k', text: 't' }));
    await getTopicRemote('http://worker', 'k', 'secret-key');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBe('secret-key');
  });
});

// ── adminSave ──────────────────────────────────────────────────────────────────
describe('adminSave', () => {
  it('sends POST to admin/set-lore endpoint', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    await adminSave('http://worker', 'my-key', 'my-text', 'my-secret');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://worker/admin/set-lore');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body).toEqual({ key: 'my-key', text: 'my-text', secret: 'my-secret' });
  });

  it('throws on HTTP error with message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Invalid secret',
    } as Response);
    await expect(adminSave('http://worker', 'k', 't', 'bad')).rejects.toThrow('Invalid secret');
  });

  it('throws on HTTP error without message body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Error',
      text: async () => { throw new Error('No body'); },
    } as unknown as Response);
    await expect(adminSave('http://worker', 'k', 't', 'bad')).rejects.toThrow('Error');
  });
});

// ── adminDelete ────────────────────────────────────────────────────────────────
describe('adminDelete', () => {
  it('sends POST to admin/delete-lore endpoint', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    await adminDelete('http://worker', 'my-key', 'my-secret');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://worker/admin/delete-lore');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body).toEqual({ key: 'my-key', secret: 'my-secret' });
  });

  it('throws on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Key not found',
    } as Response);
    await expect(adminDelete('http://worker', 'missing', 'secret')).rejects.toThrow('Key not found');
  });
});

// ── batchGetTopicsRemote ───────────────────────────────────────────────────────
describe('batchGetTopicsRemote', () => {
  it('returns empty map for empty keys array', async () => {
    const map = await batchGetTopicsRemote('http://worker', []);
    expect(map.size).toBe(0);
  });

  it('fetches multiple topics in parallel', async () => {
    fetchMock
      .mockResolvedValueOnce(okFetch({ key: 'a', text: 'text a', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }))
      .mockResolvedValueOnce(okFetch({ key: 'b', text: 'text b', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }))
      .mockResolvedValueOnce(okFetch({ key: 'c', text: 'text c', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }));
    const map = await batchGetTopicsRemote('http://worker', ['a', 'b', 'c']);
    expect(map.size).toBe(3);
    expect(map.get('a')?.text).toBe('text a');
    expect(map.get('b')?.text).toBe('text b');
    expect(map.get('c')?.text).toBe('text c');
  });

  it('omits failed fetches from result', async () => {
    fetchMock
      .mockResolvedValueOnce(okFetch({ key: 'good', text: 'ok', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }))
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(okFetch({ key: 'also-good', text: 'ok', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } }));
    const map = await batchGetTopicsRemote('http://worker', ['good', 'bad', 'also-good']);
    expect(map.size).toBe(2);
    expect(map.has('good')).toBe(true);
    expect(map.has('bad')).toBe(false);
    expect(map.has('also-good')).toBe(true);
  });
});

// ── getTopicHistories ──────────────────────────────────────────────────────────
describe('getTopicHistories', () => {
  it('returns empty map for empty keys array', async () => {
    const map = await getTopicHistories('http://worker', []);
    expect(map.size).toBe(0);
  });

  it('fetches histories for multiple topics', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({
      'topic1': [
        { text: 'v1', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } },
        { text: 'v2', meta: { version: 2, updatedAt: '2026-01-02T00:00:00.000Z' } },
      ],
      'topic2': [
        { text: 'v1', meta: { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' } },
      ],
    }));
    const map = await getTopicHistories('http://worker', ['topic1', 'topic2']);
    expect(map.size).toBe(2);
    expect(map.get('topic1')).toHaveLength(2);
    expect(map.get('topic2')).toHaveLength(1);
  });

  it('includes API key header when provided', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({}));
    await getTopicHistories('http://worker', ['k'], 'api-key');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBe('api-key');
  });
});

// ── getChanges ─────────────────────────────────────────────────────────────────
describe('getChanges', () => {
  it('fetches changes since timestamp', async () => {
    const changes = [
      { key: 'topic1', version: 2, updatedAt: '2026-01-02T00:00:00.000Z', op: 'write' },
      { key: 'topic2', version: 1, updatedAt: '2026-01-03T00:00:00.000Z', op: 'write' },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ changes }),
    } as Response);
    const result = await getChanges('http://worker', '2026-01-01T00:00:00.000Z');
    expect(result).toEqual(changes);
  });

  it('returns empty array when no changes field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);
    const result = await getChanges('http://worker', '2026-01-01T00:00:00.000Z');
    expect(result).toEqual([]);
  });

  it('returns empty array and does not fetch for invalid since param', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await getChanges('http://worker', '2026-01-01T00:00:00.000Z?inject');
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid since param'), expect.anything());
    warnSpy.mockRestore();
  });

  it('returns empty array and does not fetch for empty since param', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await getChanges('http://worker', '');
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('includes API key header when provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ changes: [] }) } as Response);
    await getChanges('http://worker', '2026-01-01T00:00:00.000Z', 'api-key');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBe('api-key');
  });

  it('throws on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' } as Response);
    await expect(getChanges('http://worker', '2026-01-01T00:00:00.000Z')).rejects.toThrow('HTTP 500');
  });

  it('emits console.warn when called without an API key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ changes: [] }) } as Response);
    await getChanges('http://worker', '2026-01-01T00:00:00.000Z');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('without an API key'));
    warnSpy.mockRestore();
  });

  it('throws a 401-specific hint when the Worker rejects with 401', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' } as Response);
    await expect(getChanges('http://worker', '2026-01-01T00:00:00.000Z')).rejects.toThrow(
      'check your MCP API key in Settings'
    );
  });
});

// ── rpc JSON-level errors (line 45) ───────────────────────────────────────────
describe('rpc JSON-level errors', () => {
  it('throws with error.message when RPC response contains error with message field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'topic not found' } }),
    } as Response);
    await expect(listTopicsRemote('http://worker', 'key')).rejects.toThrow('topic not found');
  });

  it('throws JSON.stringify(error) when error has no message field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32600 } }),
    } as Response);
    await expect(listTopicsRemote('http://worker', 'key')).rejects.toThrow('-32600');
  });
});

// ── getTopicRemote null result (line 67) ──────────────────────────────────────
describe('getTopicRemote null result', () => {
  it('returns null when RPC result is null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: null }),
    } as Response);
    const topic = await getTopicRemote('http://worker', 'missing', 'key');
    expect(topic).toBeNull();
  });
});

// ── getTopicHistories null snapshots (line 266) ───────────────────────────────
describe('getTopicHistories null snapshots', () => {
  it('treats null snapshots as empty array', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({ 'topic1': null }));
    const map = await getTopicHistories('http://worker', ['topic1'], 'key');
    expect(map.get('topic1')).toEqual([]);
  });
});

// ── parseKvEntry edge cases ────────────────────────────────────────────────────
// Note: parseKvEntry is internal but we can test it through getTopicRemote behavior
describe('parseKvEntry behavior', () => {
  it('handles old raw string format', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({
      key: 'old-topic',
      text: 'just raw text',
    }));
    const topic = await getTopicRemote('http://worker', 'old-topic');
    expect(topic!.text).toBe('just raw text');
    expect(topic!.meta.version).toBe(0);
  });

  it('handles new KV format with text and meta', async () => {
    fetchMock.mockResolvedValueOnce(okFetch({
      key: 'new-topic',
      text: 'structured content',
      meta: { version: 5, updatedAt: '2026-06-15T00:00:00.000Z' },
    }));
    const topic = await getTopicRemote('http://worker', 'new-topic');
    expect(topic!.text).toBe('structured content');
    expect(topic!.meta.version).toBe(5);
    expect(topic!.meta.updatedAt).toBe('2026-06-15T00:00:00.000Z');
  });
});

// ── flushQueue edge cases ──────────────────────────────────────────────────────
describe('flushQueue edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops items after max attempts', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    fetchMock.mockRejectedValue(new Error('offline'));
    // Set attempts close to max (MAX_ATTEMPTS = 8). 
    // The first flush increments to 8; the second flush detects the limit and drops the item.
    const q = [{ key: 'old', text: 'text', enqueuedAt: '2026-01-01T00:00:00.000Z', attempts: 7 }];
    invokeStore['offline-queue.json'] = JSON.stringify(q);

    const flushPromise1 = flushQueue(makeSettings(), 'secret', () => { });
    await vi.advanceTimersByTimeAsync(600000);
    await flushPromise1;

    // Second flush to process the item now that it has hit the max attempts
    const flushPromise2 = flushQueue(makeSettings(), 'secret', () => { });
    await vi.advanceTimersByTimeAsync(600000);
    await flushPromise2;

    const remaining = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(remaining).toHaveLength(0);
  });

  it('retains items that fail but have attempts remaining', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const q = [{ key: 'retry', text: 'text', enqueuedAt: '2026-01-01T00:00:00.000Z', attempts: 3 }];
    invokeStore['offline-queue.json'] = JSON.stringify(q);

    const flushPromise = flushQueue(makeSettings(), 'secret', () => { });

    // Advance timers to allow the backoff delay to complete
    await vi.advanceTimersByTimeAsync(30000);
    await flushPromise;

    const remaining = JSON.parse(invokeStore['offline-queue.json'] ?? '[]');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(4);
  });
});
