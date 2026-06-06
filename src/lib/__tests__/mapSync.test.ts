import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ── Hoisted: all mock dependencies created before any import runs ─────────────
// IS_TAURI in mapSync.ts is evaluated once at module-load time (line 17).
// We keep __TAURI__ absent so IS_TAURI = false → the browser auth path is used
// throughout this file. Tauri-specific invoke calls cannot be tested here
// because the constant cannot be toggled after import.
const mocks = vi.hoisted(() => {
  function makeStore<T>(initial: T) {
    let _val = initial;
    return {
      get val() { return _val; },
      set(v: T)                     { _val = v; },
      update(fn: (v: T) => T)       { _val = fn(_val); },
      subscribe(fn: (v: T) => void) { fn(_val); return () => {}; },
    };
  }

  return {
    getAllHexesMock:        vi.fn(),
    getAllLandmarksMock:    vi.fn(),
    updateMapPushedAtMock:  vi.fn(),
    getAdminSecretMock:     vi.fn(),
    invokeMock:             vi.fn(),
    settingsStore: makeStore<any>({
      workerHost: 'http://worker',
      autoSync: true,
      autoSyncIntervalSecs: 0,
      syncHistory: false,
    }),
  };
});

// Mock svelte/store get() to return our store's .val (uses getter internally)
vi.mock('svelte/store', async () => {
  const actual = await vi.importActual<typeof import('svelte/store')>('svelte/store');
  return { ...actual, get: (store: { val: unknown }) => store.val };
});

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: mocks.invokeMock }));

vi.mock('../mapDb', () => ({
  getAllHexes:         mocks.getAllHexesMock,
  getAllLandmarks:     mocks.getAllLandmarksMock,
  updateMapPushedAt:   mocks.updateMapPushedAtMock,
}));

vi.mock('../auth', () => ({
  getAdminSecret: mocks.getAdminSecretMock,
}));

vi.mock('../stores', () => ({
  settings: mocks.settingsStore,
}));

// Import AFTER mocks
import { MapSyncError, pushMapToWorker } from '../mapSync';
import type { HexRecord, LandmarkRecord } from '../mapDb';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeHex(q: number, r: number, terrain = 'grassland', mapId = TEST_MAP_ID): HexRecord {
  return { mapId, q, r, terrain, name: '', description: '' };
}

function makeLandmark(id: string, q: number, r: number, mapId = TEST_MAP_ID): LandmarkRecord {
  return {
    mapId, id, q, r,
    name: '', type: '', notes: '',
    attributes: '{}', linkedMapId: null, visible: true,
  };
}

function okResponse(): Response {
  return { ok: true } as Response;
}

function errorResponse(status: number, body?: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    text: async () => body ?? `HTTP ${status}`,
  } as Response;
}

const TEST_MAP_ID = 'test-map-001';

beforeEach(() => {
  vi.clearAllMocks();

  // Reset default mocks
  mocks.getAllHexesMock.mockResolvedValue([]);
  mocks.getAllLandmarksMock.mockResolvedValue([]);
  mocks.updateMapPushedAtMock.mockResolvedValue(undefined);
  mocks.getAdminSecretMock.mockResolvedValue('test-secret');
  mocks.settingsStore.set({
    workerHost: 'http://worker',
    autoSync: true,
    autoSyncIntervalSecs: 0,
    syncHistory: false,
  });

  // Clear __TAURI__ for browser-mode tests (default)
  delete (globalThis as any).__TAURI__;

  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── MapSyncError ──────────────────────────────────────────────────────────────
describe('MapSyncError', () => {
  it('creates an error with message and optional cause', () => {
    const cause = new Error('underlying issue');
    const err = new MapSyncError('sync failed', cause);
    expect(err.message).toBe('sync failed');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('MapSyncError');
  });

  it('creates an error without a cause', () => {
    const err = new MapSyncError('simple error');
    expect(err.message).toBe('simple error');
    expect(err.cause).toBeUndefined();
    expect(err instanceof Error).toBe(true);
  });
});

// ── Worker host validation ────────────────────────────────────────────────────
describe('pushMapToWorker — host validation', () => {
  it('throws MapSyncError when workerHost is empty string', async () => {
    mocks.settingsStore.set({ ...mocks.settingsStore.val, workerHost: '' });
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow(MapSyncError);
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('Worker host is not configured');
  });

  it('throws MapSyncError when workerHost is whitespace-only', async () => {
    mocks.settingsStore.set({ ...mocks.settingsStore.val, workerHost: '   ' });
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('Worker host is not configured');
  });

  it('does not throw when workerHost is valid', async () => {
    (fetch as Mock).mockResolvedValue(okResponse());
    await expect(pushMapToWorker(TEST_MAP_ID)).resolves.not.toThrow();
  });
});

// ── Auth — browser mode ───────────────────────────────────────────────────────
describe('pushMapToWorker — auth (browser mode)', () => {
  beforeEach(() => {
    delete (globalThis as any).__TAURI__;
    (fetch as Mock).mockResolvedValue(okResponse());
  });

  it('calls getAdminSecret when not in Tauri', async () => {
    mocks.getAdminSecretMock.mockResolvedValue('browser-secret');
    await pushMapToWorker(TEST_MAP_ID);
    expect(mocks.getAdminSecretMock).toHaveBeenCalledOnce();
  });

  it('throws MapSyncError when adminSecret is null', async () => {
    mocks.getAdminSecretMock.mockResolvedValue(null);
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow(MapSyncError);
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('Admin secret is not configured');
  });

  it('throws MapSyncError when adminSecret is empty string', async () => {
    mocks.getAdminSecretMock.mockResolvedValue('');
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('Admin secret is not configured');
  });
});

// ── Auth — Tauri mode ────────────────────────────────────────────────────────
// IS_TAURI in mapSync.ts is a module-level constant (line 17) evaluated once
// at import time. Since this test file runs before the Tauri mock can be set,
// the browser auth path is always used. Tauri-specific auth behavior is
// exercised via integration tests on the Tauri desktop build.
// The @tauri-apps/api/tauri mock (invokeMock) is kept available for future
// refactoring if IS_TAURI is converted to a runtime check.

// ── Data fetching ─────────────────────────────────────────────────────────────
describe('pushMapToWorker — data fetching', () => {
  beforeEach(() => {
    (fetch as Mock).mockResolvedValue(okResponse());
  });

  it('calls getAllHexes and getAllLandmarks with the mapId', async () => {
    await pushMapToWorker(TEST_MAP_ID);
    expect(mocks.getAllHexesMock).toHaveBeenCalledWith(TEST_MAP_ID);
    expect(mocks.getAllLandmarksMock).toHaveBeenCalledWith(TEST_MAP_ID);
  });

  it('succeeds with empty hexes and empty landmarks', async () => {
    mocks.getAllHexesMock.mockResolvedValue([]);
    mocks.getAllLandmarksMock.mockResolvedValue([]);
    await expect(pushMapToWorker(TEST_MAP_ID)).resolves.not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('succeeds with hexes but no landmarks', async () => {
    mocks.getAllHexesMock.mockResolvedValue([makeHex(0, 0)]);
    mocks.getAllLandmarksMock.mockResolvedValue([]);
    await expect(pushMapToWorker(TEST_MAP_ID)).resolves.not.toThrow();
  });

  it('succeeds with landmarks but no hexes', async () => {
    mocks.getAllHexesMock.mockResolvedValue([]);
    mocks.getAllLandmarksMock.mockResolvedValue([makeLandmark('lm-1', 0, 0)]);
    await expect(pushMapToWorker(TEST_MAP_ID)).resolves.not.toThrow();
  });
});

// ── Batching ──────────────────────────────────────────────────────────────────
describe('pushMapToWorker — batching', () => {
  beforeEach(() => {
    (fetch as Mock).mockResolvedValue(okResponse());
  });

  it('pushes hexes in batches of 500', async () => {
    const manyHexes = Array.from({ length: 1250 }, (_, i) => makeHex(i, 0));
    mocks.getAllHexesMock.mockResolvedValue(manyHexes);

    await pushMapToWorker(TEST_MAP_ID);

    const calls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-hexes')
    );
    expect(calls).toHaveLength(3);

    const body1 = JSON.parse(calls[0][1].body);
    expect(body1.hexes).toHaveLength(500);
    expect(body1.hexes[0].q).toBe(0);

    const body2 = JSON.parse(calls[1][1].body);
    expect(body2.hexes).toHaveLength(500);
    expect(body2.hexes[0].q).toBe(500);

    const body3 = JSON.parse(calls[2][1].body);
    expect(body3.hexes).toHaveLength(250);
    expect(body3.hexes[0].q).toBe(1000);
  });

  it('pushes landmarks in batches of 500', async () => {
    const manyLandmarks = Array.from({ length: 750 }, (_, i) => makeLandmark(`lm-${i}`, i, 0));
    mocks.getAllLandmarksMock.mockResolvedValue(manyLandmarks);

    await pushMapToWorker(TEST_MAP_ID);

    const calls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-landmarks')
    );
    expect(calls).toHaveLength(2);

    const body1 = JSON.parse(calls[0][1].body);
    expect(body1.landmarks).toHaveLength(500);

    const body2 = JSON.parse(calls[1][1].body);
    expect(body2.landmarks).toHaveLength(250);
  });

  it('pushes both hexes and landmarks in the same sync', async () => {
    const hexes = Array.from({ length: 10 }, (_, i) => makeHex(i, 0));
    const landmarks = Array.from({ length: 5 }, (_, i) => makeLandmark(`lm-${i}`, i, 0));
    mocks.getAllHexesMock.mockResolvedValue(hexes);
    mocks.getAllLandmarksMock.mockResolvedValue(landmarks);

    await pushMapToWorker(TEST_MAP_ID);

    const hexCalls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-hexes')
    );
    const landmarkCalls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-landmarks')
    );
    expect(hexCalls).toHaveLength(1);
    expect(landmarkCalls).toHaveLength(1);
  });
});

// ── Request construction ──────────────────────────────────────────────────────
describe('pushMapToWorker — request construction', () => {
  beforeEach(() => {
    (fetch as Mock).mockResolvedValue(okResponse());
    mocks.getAllHexesMock.mockResolvedValue([makeHex(0, 0)]);
  });

  it('strips trailing slash from workerHost', async () => {
    mocks.settingsStore.set({ ...mocks.settingsStore.val, workerHost: 'http://worker/' });
    await pushMapToWorker(TEST_MAP_ID);
    const [url] = (fetch as Mock).mock.calls[0];
    expect(url).toBe('http://worker/admin/map/push-hexes');
  });

  it('sends POST request with correct headers', async () => {
    await pushMapToWorker(TEST_MAP_ID);
    const [, options] = (fetch as Mock).mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-Admin-Secret']).toBe('test-secret');
  });

  it('includes mapId and hexes in the body', async () => {
    mocks.getAllHexesMock.mockResolvedValue([makeHex(3, -2, 'forest'), makeHex(3, -1, 'water')]);
    await pushMapToWorker(TEST_MAP_ID);
    const [, options] = (fetch as Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.mapId).toBe(TEST_MAP_ID);
    expect(body.hexes).toHaveLength(2);
    expect(body.hexes[0]).toEqual({ mapId: TEST_MAP_ID, q: 3, r: -2, terrain: 'forest', name: '', description: '' });
    expect(body.hexes[1]).toEqual({ mapId: TEST_MAP_ID, q: 3, r: -1, terrain: 'water', name: '', description: '' });
  });
});

// ── HTTP error handling ───────────────────────────────────────────────────────
describe('pushMapToWorker — HTTP errors', () => {
  beforeEach(() => {
    mocks.getAllHexesMock.mockResolvedValue([makeHex(0, 0)]);
  });

  it('throws MapSyncError on HTTP 500', async () => {
    (fetch as Mock).mockResolvedValue(errorResponse(500, 'Server crashed'));
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow(MapSyncError);
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('HTTP 500: Server crashed');
  });

  it('throws MapSyncError on HTTP 403 with message', async () => {
    (fetch as Mock).mockResolvedValue(errorResponse(403, 'Forbidden'));
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('HTTP 403: Forbidden');
  });

  it('throws MapSyncError when response body is empty', async () => {
    (fetch as Mock).mockResolvedValue(errorResponse(502, ''));
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('HTTP 502');
  });

  it('throws MapSyncError when response text() throws', async () => {
    (fetch as Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
      text: async () => { throw new Error('no body'); },
    } as unknown as Response);
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow(MapSyncError);
    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow('HTTP 500');
  });

  it('stops on first failed batch and does not push remaining batches', async () => {
    // Provide both hexes and landmarks so there are 2 batches to push
    mocks.getAllHexesMock.mockResolvedValue([makeHex(0, 0)]);
    mocks.getAllLandmarksMock.mockResolvedValue([makeLandmark('lm-1', 0, 0)]);
    (fetch as Mock)
      .mockResolvedValueOnce(okResponse())        // push-hexes succeeds
      .mockResolvedValueOnce(errorResponse(500)); // push-landmarks fails

    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow(MapSyncError);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.updateMapPushedAtMock).not.toHaveBeenCalled();
  });
});

// ── Successful sync ───────────────────────────────────────────────────────────
describe('pushMapToWorker — successful sync', () => {
  beforeEach(() => {
    mocks.getAllHexesMock.mockResolvedValue([makeHex(0, 0)]);
    mocks.getAllLandmarksMock.mockResolvedValue([makeLandmark('lm-1', 0, 0)]);
    (fetch as Mock).mockResolvedValue(okResponse());
  });

  it('updates pushedAt timestamp on success', async () => {
    await pushMapToWorker(TEST_MAP_ID);
    expect(mocks.updateMapPushedAtMock).toHaveBeenCalledWith(TEST_MAP_ID, expect.any(String));
  });

  it('calls updateMapPushedAt with an ISO timestamp', async () => {
    const before = Date.now();
    await pushMapToWorker(TEST_MAP_ID);
    const after = Date.now();
    const timestamp = new Date(mocks.updateMapPushedAtMock.mock.calls[0][1]).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('does not update pushedAt when push fails', async () => {
    mocks.getAllHexesMock.mockResolvedValue([]);
    mocks.getAllLandmarksMock.mockResolvedValue([]);
    mocks.getAdminSecretMock.mockResolvedValue(null);

    await expect(pushMapToWorker(TEST_MAP_ID)).rejects.toThrow(MapSyncError);
    expect(mocks.updateMapPushedAtMock).not.toHaveBeenCalled();
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────
describe('pushMapToWorker — edge cases', () => {
  it('handles exactly BATCH_SIZE hexes (500) without creating extra batch', async () => {
    const hexes = Array.from({ length: 500 }, (_, i) => makeHex(i, 0));
    mocks.getAllHexesMock.mockResolvedValue(hexes);
    (fetch as Mock).mockResolvedValue(okResponse());

    await pushMapToWorker(TEST_MAP_ID);

    const hexCalls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-hexes')
    );
    expect(hexCalls).toHaveLength(1);
    const body = JSON.parse(hexCalls[0][1].body);
    expect(body.hexes).toHaveLength(500);
  });

  it('handles exactly BATCH_SIZE + 1 hexes (501) creating 2 batches', async () => {
    const hexes = Array.from({ length: 501 }, (_, i) => makeHex(i, 0));
    mocks.getAllHexesMock.mockResolvedValue(hexes);
    (fetch as Mock).mockResolvedValue(okResponse());

    await pushMapToWorker(TEST_MAP_ID);

    const hexCalls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-hexes')
    );
    expect(hexCalls).toHaveLength(2);
    expect(JSON.parse(hexCalls[0][1].body).hexes).toHaveLength(500);
    expect(JSON.parse(hexCalls[1][1].body).hexes).toHaveLength(1);
  });

  it('handles multiple hex batches with a single landmark batch', async () => {
    const manyHexes = Array.from({ length: 750 }, (_, i) => makeHex(i, 0));
    mocks.getAllHexesMock.mockResolvedValue(manyHexes);
    mocks.getAllLandmarksMock.mockResolvedValue([makeLandmark('lm-1', 0, 0)]);
    (fetch as Mock).mockResolvedValue(okResponse());

    await pushMapToWorker(TEST_MAP_ID);

    const hexCalls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-hexes')
    );
    const landmarkCalls = (fetch as Mock).mock.calls.filter(
      ([url]: [string]) => (url as string).endsWith('/push-landmarks')
    );
    expect(hexCalls).toHaveLength(2);
    expect(landmarkCalls).toHaveLength(1);
    expect(mocks.updateMapPushedAtMock).toHaveBeenCalledOnce();
  });
});