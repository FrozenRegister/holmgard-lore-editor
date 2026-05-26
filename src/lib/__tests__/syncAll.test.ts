import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted: all mock dependencies created before any import runs ─────────────
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

  const conflictEvents: any[][] = [];

  return {
    invokeMock:         vi.fn(),
    pullAllMock:        vi.fn(),
    detectConflictMock: vi.fn(),
    adminDeleteMock:    vi.fn(),
    saveTopicMock:      vi.fn(),
    pushHistoryMock:    vi.fn(),
    flushQueueMock:     vi.fn(),
    getAdminSecretMock: vi.fn(),
    enqueuePendingDeleteMock: vi.fn(),
    dequeueMock:        vi.fn(),
    showToastMock:      vi.fn(),

    topicsStore:   makeStore<any[]>([]),
    settingsStore: makeStore<any>({
      workerHost: 'http://worker',
      autoSyncIntervalSecs: 0,
      syncHistory: false,
    }),
    syncStateStore: makeStore<any>({ status: 'idle' }),

    conflictEvents,
    conflictQueueMock: {
      set:    vi.fn((v: any) => { conflictEvents.push(v); }),
      update: vi.fn((fn: any) => { conflictEvents.push(fn([])); }),
    },
  };
});

// ── Replace svelte/store get() so our makeStore objects work with it ──────────
vi.mock('svelte/store', async () => {
  const actual = await vi.importActual<typeof import('svelte/store')>('svelte/store');
  return { ...actual, get: (store: { val: unknown }) => store.val };
});

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: mocks.invokeMock }));

vi.mock('../stores', () => ({
  topics:        mocks.topicsStore,
  settings:      mocks.settingsStore,
  syncState:     mocks.syncStateStore,
  conflictQueue: mocks.conflictQueueMock,
  showToast:     mocks.showToastMock,
}));

vi.mock('../sync', () => ({
  pullAll:               mocks.pullAllMock,
  detectConflict:        mocks.detectConflictMock,
  adminDelete:           mocks.adminDeleteMock,
  enqueue:               vi.fn(),
  flushQueue:            mocks.flushQueueMock,
  dequeuePendingDeletes: mocks.dequeueMock,
  enqueuePendingDelete:  mocks.enqueuePendingDeleteMock,
}));

vi.mock('../storage', () => ({
  saveTopic:     mocks.saveTopicMock,
  loadAllTopics: vi.fn(async () => mocks.topicsStore.val),
}));

vi.mock('../history', () => ({
  pushHistory: mocks.pushHistoryMock,
}));

vi.mock('../auth', () => ({
  getAdminSecret: mocks.getAdminSecretMock,
}));

// Import AFTER all mocks
import { runSync } from '../syncAll';
import type { Topic } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTopic(key: string, text: string, version: number): Topic {
  return { key, text, meta: { version, updatedAt: '2026-01-01T00:00:00.000Z' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conflictEvents.length = 0;
  mocks.topicsStore.set([]);
  mocks.settingsStore.set({ workerHost: 'http://worker', autoSyncIntervalSecs: 0, syncHistory: false });
  mocks.syncStateStore.set({ status: 'idle' });
  mocks.dequeueMock.mockReturnValue([]);
  mocks.saveTopicMock.mockResolvedValue(undefined);
  mocks.pushHistoryMock.mockResolvedValue(undefined);
  mocks.flushQueueMock.mockResolvedValue(undefined);
  mocks.pullAllMock.mockResolvedValue(new Map());
  mocks.detectConflictMock.mockReturnValue(null);
  mocks.getAdminSecretMock.mockResolvedValue(null);
});

// ── Remote-ahead update (texts match, only meta differs) ──────────────────────
describe('runSync — remote-ahead update', () => {
  it('saves updated meta when remote version is higher and text matches', async () => {
    // detectConflict returns null only when texts match — so text must be the same
    const local = makeTopic('dragons', 'same text', 2);
    const remote = makeTopic('dragons', 'same text', 3);
    mocks.topicsStore.set([local]);
    mocks.pullAllMock.mockResolvedValue(new Map([['dragons', remote]]));
    mocks.detectConflictMock.mockReturnValue(null);

    await runSync();

    expect(mocks.saveTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'dragons', meta: expect.objectContaining({ version: 3 }) })
    );
  });

  it('does not raise a conflict for a clean remote-ahead update', async () => {
    const local = makeTopic('elves', 'same', 1);
    mocks.topicsStore.set([local]);
    mocks.pullAllMock.mockResolvedValue(new Map([['elves', makeTopic('elves', 'same', 5)]]));
    mocks.detectConflictMock.mockReturnValue(null);

    await runSync();

    expect(mocks.conflictEvents).toHaveLength(0);
  });

  it('does not save when remote version is not higher than local', async () => {
    const local = makeTopic('dwarves', 'same text', 3);
    mocks.topicsStore.set([local]);
    mocks.pullAllMock.mockResolvedValue(new Map([['dwarves', makeTopic('dwarves', 'same text', 3)]]));
    mocks.detectConflictMock.mockReturnValue(null);

    await runSync();

    expect(mocks.saveTopicMock).not.toHaveBeenCalled();
  });
});

// ── True conflict ─────────────────────────────────────────────────────────────
describe('runSync — true conflict', () => {
  it('raises conflict when detectConflict returns ConflictInfo', async () => {
    const conflict = { key: 'orcs', local: 'local', remote: 'remote', base: '', remoteMeta: {} };
    mocks.topicsStore.set([makeTopic('orcs', 'local version', 3)]);
    mocks.pullAllMock.mockResolvedValue(new Map([['orcs', makeTopic('orcs', 'remote version', 3)]]));
    mocks.detectConflictMock.mockReturnValue(conflict);

    await runSync();

    expect(mocks.conflictEvents.length).toBeGreaterThan(0);
  });

  it('does not auto-save a conflicted topic', async () => {
    const conflict = { key: 'orcs', local: 'local', remote: 'remote', base: '', remoteMeta: {} };
    mocks.topicsStore.set([makeTopic('orcs', 'local version', 3)]);
    mocks.pullAllMock.mockResolvedValue(new Map([['orcs', makeTopic('orcs', 'remote version', 3)]]));
    mocks.detectConflictMock.mockReturnValue(conflict);

    await runSync();

    expect(mocks.saveTopicMock).not.toHaveBeenCalled();
  });

  it('sets syncState to conflict when conflicts exist', async () => {
    const conflict = { key: 'orcs', local: 'a', remote: 'b', base: '', remoteMeta: {} };
    mocks.topicsStore.set([makeTopic('orcs', 'a', 1)]);
    mocks.pullAllMock.mockResolvedValue(new Map([['orcs', makeTopic('orcs', 'b', 1)]]));
    mocks.detectConflictMock.mockReturnValue(conflict);

    await runSync();

    expect(mocks.syncStateStore.val.status).toBe('conflict');
  });
});

// ── New remote topic ──────────────────────────────────────────────────────────
describe('runSync — new remote topic', () => {
  it('saves a topic that exists remotely but not locally', async () => {
    mocks.topicsStore.set([]);
    mocks.pullAllMock.mockResolvedValue(new Map([['new-topic', makeTopic('new-topic', 'brand new', 1)]]));

    await runSync();

    expect(mocks.saveTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'new-topic', text: 'brand new' })
    );
  });

  it('calls pushHistory for new remote topics when syncHistory is true', async () => {
    mocks.settingsStore.set({ workerHost: 'http://worker', autoSyncIntervalSecs: 0, syncHistory: true });
    mocks.topicsStore.set([]);
    mocks.pullAllMock.mockResolvedValue(new Map([['elves', makeTopic('elves', 'new', 1)]]));

    await runSync();

    expect(mocks.pushHistoryMock).toHaveBeenCalled();
  });

  it('does not call pushHistory when syncHistory is false', async () => {
    mocks.settingsStore.set({ workerHost: 'http://worker', autoSyncIntervalSecs: 0, syncHistory: false });
    mocks.topicsStore.set([]);
    mocks.pullAllMock.mockResolvedValue(new Map([['elves', makeTopic('elves', 'new', 1)]]));

    await runSync();

    expect(mocks.pushHistoryMock).not.toHaveBeenCalled();
  });
});

// ── Concurrent sync guard ─────────────────────────────────────────────────────
describe('runSync — concurrency guard', () => {
  it('exits immediately when already syncing', async () => {
    mocks.syncStateStore.set({ status: 'syncing' });

    await runSync();

    expect(mocks.pullAllMock).not.toHaveBeenCalled();
  });
});

// ── Pending deletes ───────────────────────────────────────────────────────────
describe('runSync — pending deletes', () => {
  it('calls adminDelete for each pending key when secret is available', async () => {
    mocks.dequeueMock.mockReturnValue(['old-topic']);
    mocks.getAdminSecretMock.mockResolvedValue('secret');
    mocks.adminDeleteMock.mockResolvedValue(undefined);

    await runSync();

    expect(mocks.adminDeleteMock).toHaveBeenCalledWith('http://worker', 'old-topic', 'secret');
  });

  it('re-queues failed deletes', async () => {
    mocks.dequeueMock.mockReturnValue(['bad-topic']);
    mocks.getAdminSecretMock.mockResolvedValue('secret');
    mocks.adminDeleteMock.mockRejectedValue(new Error('network'));

    await runSync();

    expect(mocks.enqueuePendingDeleteMock).toHaveBeenCalledWith('bad-topic');
  });

  it('re-queues all pending deletes when no secret available', async () => {
    mocks.dequeueMock.mockReturnValue(['key-a', 'key-b']);
    mocks.getAdminSecretMock.mockResolvedValue(null);

    await runSync();

    expect(mocks.enqueuePendingDeleteMock).toHaveBeenCalledWith('key-a', 0, expect.any(Array));
    expect(mocks.enqueuePendingDeleteMock).toHaveBeenCalledWith('key-b', 1, expect.any(Array));
    expect(mocks.adminDeleteMock).not.toHaveBeenCalled();
  });
});

// ── Empty remote ──────────────────────────────────────────────────────────────
describe('runSync — empty remote', () => {
  it('does not throw when pullAll returns an empty map', async () => {
    mocks.topicsStore.set([makeTopic('dragons', 'text', 1)]);
    mocks.pullAllMock.mockResolvedValue(new Map());

    await expect(runSync()).resolves.not.toThrow();
  });

  it('sets syncState to success when no conflicts', async () => {
    mocks.pullAllMock.mockResolvedValue(new Map());

    await runSync();

    expect(mocks.syncStateStore.val.status).toBe('success');
  });
});
