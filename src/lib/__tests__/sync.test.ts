/**
 * Tests for sync.ts — uses mocked fetch so no real network calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listTopicsRemote, getTopicRemote, adminSave, detectConflict, enqueue, pullAll } from '../sync';

// ── Mock storage layer so enqueue doesn't invoke Tauri ──────────────────────
vi.mock('../storage', () => ({
  loadQueue: vi.fn(async () => []),
  saveQueue: vi.fn(async () => {}),
}));

const HOST = 'https://holmgard-lore-mcp.frozenregister.workers.dev';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRpcResponse(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeRpcError(message: string) {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32600, message } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── listTopicsRemote ──────────────────────────────────────────────────────────

describe('listTopicsRemote', () => {
  it('returns an array of keys on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeRpcResponse({ keys: ['holmgard', 'lamia'] }));
    const keys = await listTopicsRemote(HOST);
    expect(keys).toEqual(['holmgard', 'lamia']);
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/mcp`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws on RPC error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeRpcError('Internal error'));
    await expect(listTopicsRemote(HOST)).rejects.toThrow('Internal error');
  });

  it('throws on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(listTopicsRemote(HOST)).rejects.toThrow('HTTP 503');
  });
});

// ── getTopicRemote ────────────────────────────────────────────────────────────

describe('getTopicRemote', () => {
  it('returns topic data on success', async () => {
    const remoteTopic = {
      key: 'holmgard',
      text: '# Holmgard',
      meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 3 },
    };
    vi.mocked(fetch).mockResolvedValueOnce(makeRpcResponse(remoteTopic));
    const result = await getTopicRemote(HOST, 'holmgard');
    expect(result).toEqual(remoteTopic);
  });

  it('returns null on RPC error (graceful)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeRpcError('Not found'));
    const result = await getTopicRemote(HOST, 'missing-key');
    expect(result).toBeNull();
  });
});

// ── adminSave ─────────────────────────────────────────────────────────────────

describe('adminSave', () => {
  it('sends POST to /admin/set-lore', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await expect(adminSave(HOST, 'holmgard', '# Holmgard', 'secret123')).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/admin/set-lore`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: 'holmgard', text: '# Holmgard', secret: 'secret123' }),
      })
    );
  });

  it('throws on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    await expect(adminSave(HOST, 'k', 't', 'bad-secret')).rejects.toThrow('403');
  });
});

// ── detectConflict ────────────────────────────────────────────────────────────

describe('detectConflict', () => {
  const localTopic = {
    key: 'holmgard',
    text: 'local text',
    meta: { updatedAt: '2025-01-02T00:00:00.000Z', version: 2 },
  };
  const remoteTopic = {
    key: 'holmgard',
    text: 'remote text',
    meta: { updatedAt: '2025-01-03T00:00:00.000Z', version: 3 },
  };

  it('returns ConflictInfo when texts differ and base is null', () => {
    const conflict = detectConflict(localTopic, remoteTopic, null);
    expect(conflict).not.toBeNull();
    expect(conflict!.key).toBe('holmgard');
    expect(conflict!.local).toBe('local text');
    expect(conflict!.remote).toBe('remote text');
  });

  it('returns null when texts are identical', () => {
    const same = { ...remoteTopic, text: 'local text' };
    expect(detectConflict(localTopic, same, null)).toBeNull();
  });

  it('returns null when remote matches base (no remote change)', () => {
    const remote = { ...remoteTopic, text: 'base text' };
    expect(detectConflict(localTopic, remote, 'base text')).toBeNull();
  });

  it('detects conflict when base differs from both local and remote', () => {
    const conflict = detectConflict(localTopic, remoteTopic, 'original text');
    expect(conflict).not.toBeNull();
    expect(conflict!.base).toBe('original text');
  });
});

// ── enqueue ───────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  it('adds a new save to the queue', async () => {
    const { saveQueue } = await import('../storage');
    await enqueue('test-key', 'test text');
    expect(saveQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: 'test-key', text: 'test text', attempts: 0 }),
      ])
    );
  });

  it('replaces an existing queue entry for the same key', async () => {
    const { loadQueue, saveQueue } = await import('../storage');
    vi.mocked(loadQueue).mockResolvedValueOnce([
      { key: 'test-key', text: 'old text', enqueuedAt: '2025-01-01T00:00:00Z', attempts: 2 },
    ]);

    await enqueue('test-key', 'new text');

    const saved = vi.mocked(saveQueue).mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].text).toBe('new text');
    expect(saved[0].attempts).toBe(0); // reset
  });
});

// ── pullAll ───────────────────────────────────────────────────────────────────

describe('pullAll', () => {
  it('fetches and maps all remote topics', async () => {
    const keys = ['holmgard', 'lamia'];
    const holmgard = { key: 'holmgard', text: '# H', meta: { updatedAt: '2025-01-01T00:00:00Z', version: 1 } };
    const lamia    = { key: 'lamia',    text: '# L', meta: { updatedAt: '2025-01-01T00:00:00Z', version: 1 } };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeRpcResponse({ keys }))
      .mockResolvedValueOnce(makeRpcResponse(holmgard))
      .mockResolvedValueOnce(makeRpcResponse(lamia));

    const map = await pullAll(HOST);
    expect(map.size).toBe(2);
    expect(map.get('holmgard')?.text).toBe('# H');
    expect(map.get('lamia')?.text).toBe('# L');
  });
});
