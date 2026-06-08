import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted: all mock dependencies created before any import runs ─────────────
const mocks = vi.hoisted(() => {
  function makeStore<T>(initial: T, tracker?: any[]) {
    let _val = initial;
    return {
      get val() { return _val; },
      set: vi.fn((v: T) => { 
        _val = v; 
        if (tracker) tracker.push(v);
      }),
      update: vi.fn((fn: (v: T) => T) => { 
        _val = fn(_val); 
        if (tracker) tracker.push(_val);
      }),
      subscribe: vi.fn((fn: (v: T) => void) => { fn(_val); return () => {}; }),
    };
  }

  const conflictEvents: any[][] = [];
  const topicsUpdateEvents: any[] = [];
  const syncStateUpdateEvents: any[] = [];

  return {
    invokeMock:         vi.fn(),
    pullAllMock:        vi.fn(),
    detectConflictMock: vi.fn(),
    adminDeleteMock:    vi.fn(),
    saveTopicMock:      vi.fn(),
    pushHistoryMock:    vi.fn(),
    flushQueueMock:     vi.fn(),
    getAdminSecretMock: vi.fn(),
    getMcpApiKeyMock:   vi.fn(),
    enqueuePendingDeleteMock: vi.fn(),
    dequeueMock:        vi.fn(),
    getChangesMock:     vi.fn(),
    batchGetTopicsRemoteMock: vi.fn(),
    showToastMock:      vi.fn(),

    topicsStore:    makeStore<any[]>([], topicsUpdateEvents),
    settingsStore:  makeStore<any>({ workerHost: 'http://worker', autoSyncIntervalSecs: 0, syncHistory: false }),
    syncStateStore: makeStore<any>({ status: 'idle' }, syncStateUpdateEvents),
    conflictQueueMock: makeStore<any[]>([], conflictEvents),

    conflictEvents,
    topicsUpdateEvents,
    syncStateUpdateEvents,
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
  getChanges:            mocks.getChangesMock,
  batchGetTopicsRemote:  mocks.batchGetTopicsRemoteMock,
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
  getMcpApiKey:   mocks.getMcpApiKeyMock,
}));

// Import AFTER all mocks
import { runSync, runSmartSync } from '../syncAll';
import type { Topic } from '../types';
import type { RemoteTopic } from '../sync';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTopic(key: string, text: string, version: number): Topic {
  return { key, text, meta: { version, updatedAt: '2026-01-01T00:00:00.000Z' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conflictEvents.length = 0;
  mocks.topicsUpdateEvents.length = 0;
  mocks.syncStateUpdateEvents.length = 0;
  mocks.topicsStore.set([]);
  mocks.settingsStore.set({ workerHost: 'http://worker', autoSyncIntervalSecs: 0, syncHistory: false });
  mocks.syncStateStore.set({ status: 'idle' });
  mocks.dequeueMock.mockReturnValue([]);
  mocks.getChangesMock.mockResolvedValue([]);
  mocks.batchGetTopicsRemoteMock.mockResolvedValue(new Map());
  mocks.saveTopicMock.mockResolvedValue(undefined);
  mocks.pushHistoryMock.mockResolvedValue(undefined);
  mocks.flushQueueMock.mockResolvedValue(undefined);
  mocks.pullAllMock.mockResolvedValue(new Map());
  mocks.detectConflictMock.mockReturnValue(null);
  mocks.getAdminSecretMock.mockResolvedValue(null);
  mocks.getMcpApiKeyMock.mockResolvedValue(null);

  // Reset trackers AFTER initialization so they only capture test execution events
  mocks.conflictEvents.length = 0;
  mocks.topicsUpdateEvents.length = 0;
  mocks.syncStateUpdateEvents.length = 0;
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

  it('clears removedFromRemote flag if topic reappears in remote', async () => {
    const local: Topic = { 
      key: 'returned', 
      text: 'text', 
      meta: { version: 2, updatedAt: '...', removedFromRemote: true } 
    };
    const remote: RemoteTopic = {
      key: 'returned',
      text: 'text',
      meta: { version: 2, updatedAt: '...' }
    };
    mocks.topicsStore.set([local]);
    mocks.pullAllMock.mockResolvedValue(new Map([['returned', remote]]));
    mocks.detectConflictMock.mockReturnValue(null);

    await runSync();

    expect(mocks.saveTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'returned', meta: expect.objectContaining({ removedFromRemote: false }) })
    );
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

    expect(mocks.conflictEvents.at(-1)).toContainEqual(conflict);
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

    expect(mocks.enqueuePendingDeleteMock).toHaveBeenCalledWith('key-a');
    expect(mocks.enqueuePendingDeleteMock).toHaveBeenCalledWith('key-b');
    expect(mocks.adminDeleteMock).not.toHaveBeenCalled();
  });
});

// ── Local "Ghost" Topics ──────────────────────────────────────────────────────
describe('runSync — local ghosts', () => {
  it('flags local topics as removedFromRemote if missing from remote map', async () => {
    const local = makeTopic('ghost', 'boo', 1);
    mocks.topicsStore.set([local]);
    mocks.pullAllMock.mockResolvedValue(new Map()); // Remote is empty

    await runSync();

    expect(mocks.saveTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({ 
        key: 'ghost', 
        meta: expect.objectContaining({ removedFromRemote: true }) 
      })
    );
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

// ── Smart Sync ────────────────────────────────────────────────────────────────
describe('runSmartSync', () => {
  const since = '2026-01-01T00:00:00.000Z';

  it('returns false if getChanges fails (triggering full sync fallback)', async () => {
    mocks.getChangesMock.mockRejectedValue(new Error('api fail'));
    const result = await runSmartSync(since);
    expect(result).toBe(false);
  });

  it('returns true and updates lastSync if no changes found', async () => {
    mocks.getChangesMock.mockResolvedValue([]);
    const result = await runSmartSync(since);
    expect(result).toBe(true);
    expect(mocks.syncStateUpdateEvents.at(-1).lastSync).toBeDefined();
  });

  it('processes remote deletes by flagging local topics', async () => {
    const local = makeTopic('delete-me', 'text', 1);
    mocks.topicsStore.set([local]);
    mocks.getChangesMock.mockResolvedValue([{ key: 'delete-me', op: 'delete', updatedAt: '...', version: 2 }]);

    await runSmartSync(since);

    expect(mocks.saveTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'delete-me', meta: expect.objectContaining({ removedFromRemote: true }) })
    );
  });

  it('de-duplicates entries to only process the latest operation per key', async () => {
    mocks.getChangesMock.mockResolvedValue([
      { key: 'dup', op: 'write', updatedAt: '2026-01-01T10:00:00Z', version: 2 },
      { key: 'dup', op: 'write', updatedAt: '2026-01-01T11:00:00Z', version: 3 },
    ]);

    await runSmartSync(since);

    // Should only call batch-fetch once for the single key
    expect(mocks.batchGetTopicsRemoteMock).toHaveBeenCalledWith(expect.any(String), ['dup'], undefined);
  });

  it('saves new topics discovered via changelog', async () => {
    const remote: RemoteTopic = { key: 'new', text: 'new content', meta: { version: 1, updatedAt: '...' } };
    mocks.getChangesMock.mockResolvedValue([{ key: 'new', op: 'write', updatedAt: '...', version: 1 }]);
    mocks.batchGetTopicsRemoteMock.mockResolvedValue(new Map([['new', remote]]));

    await runSmartSync(since);

    expect(mocks.saveTopicMock).toHaveBeenCalledWith(expect.objectContaining({ key: 'new', text: 'new content' }));
  });

  it('updates local topics when remote version is higher', async () => {
    const local = makeTopic('update', 'old', 1);
    const remote: RemoteTopic = { key: 'update', text: 'new', meta: { version: 2, updatedAt: '...' } };
    
    mocks.topicsStore.set([local]);
    mocks.getChangesMock.mockResolvedValue([{ key: 'update', op: 'write', updatedAt: '...', version: 2 }]);
    mocks.batchGetTopicsRemoteMock.mockResolvedValue(new Map([['update', remote]]));
    mocks.detectConflictMock.mockReturnValue(null);

    await runSmartSync(since);

    expect(mocks.saveTopicMock).toHaveBeenCalledWith(expect.objectContaining({ text: 'new', meta: expect.objectContaining({ version: 2 }) }));
  });

  it('identifies and queues conflicts during smart sync', async () => {
    const local = makeTopic('clash', 'local', 1);
    const remote: RemoteTopic = { key: 'clash', text: 'remote', meta: { version: 2, updatedAt: '...' } };
    const conflict = { key: 'clash', local: 'local', remote: 'remote', base: 'base', remoteMeta: remote.meta };

    mocks.topicsStore.set([local]);
    mocks.getChangesMock.mockResolvedValue([{ key: 'clash', op: 'write', updatedAt: '...', version: 2 }]);
    mocks.batchGetTopicsRemoteMock.mockResolvedValue(new Map([['clash', remote]]));
    mocks.detectConflictMock.mockReturnValue(conflict);

    await runSmartSync(since);

    expect(mocks.conflictEvents.at(-1)).toContainEqual(conflict);
    expect(mocks.syncStateStore.val.status).toBe('conflict');
  });

  it('maintains conflict status if already in conflict', async () => {
    mocks.syncStateStore.set({ status: 'conflict' });
    mocks.getChangesMock.mockResolvedValue([]);

    await runSmartSync(since);

    expect(mocks.syncStateUpdateEvents.at(-1).status).toBe('conflict');
  });

  it('does not update when remote version is not higher than local (smart sync)', async () => {
    const local = makeTopic('same-ver', 'same text', 2);
    const remote: RemoteTopic = { key: 'same-ver', text: 'same text', meta: { version: 2, updatedAt: '...' } };

    mocks.topicsStore.set([local]);
    mocks.getChangesMock.mockResolvedValue([{ key: 'same-ver', op: 'write', updatedAt: '...', version: 2 }]);
    mocks.batchGetTopicsRemoteMock.mockResolvedValue(new Map([['same-ver', remote]]));
    mocks.detectConflictMock.mockReturnValue(null);

    await runSmartSync(since);

    // No save called — versions are equal, nothing to update
    expect(mocks.saveTopicMock).not.toHaveBeenCalled();
  });

  it('pluralizes conflict count in toast when multiple conflicts (smart sync)', async () => {
    const local1 = makeTopic('a', 'local1', 1);
    const local2 = makeTopic('b', 'local2', 1);
    const remote1: RemoteTopic = { key: 'a', text: 'remote1', meta: { version: 2, updatedAt: '...' } };
    const remote2: RemoteTopic = { key: 'b', text: 'remote2', meta: { version: 2, updatedAt: '...' } };

    mocks.topicsStore.set([local1, local2]);
    mocks.getChangesMock.mockResolvedValue([
      { key: 'a', op: 'write', updatedAt: '...', version: 2 },
      { key: 'b', op: 'write', updatedAt: '...', version: 2 },
    ]);
    mocks.batchGetTopicsRemoteMock.mockResolvedValue(new Map([['a', remote1], ['b', remote2]]));
    mocks.detectConflictMock
      .mockReturnValueOnce({ key: 'a', local: 'local1', remote: 'remote1', base: '', remoteMeta: {} })
      .mockReturnValueOnce({ key: 'b', local: 'local2', remote: 'remote2', base: '', remoteMeta: {} });

    // Clear toast calls from beforeEach before this test
    mocks.showToastMock.mockClear();

    await runSmartSync(since);

    expect(mocks.showToastMock).toHaveBeenCalledWith(
      expect.stringContaining('2 conflicts'),
      'warning',
    );
  });
});

// ── Error Handling ────────────────────────────────────────────────────────────
describe('syncAll — errors', () => {
  it('sets syncState to error and shows toast on runSync failure', async () => {
    mocks.pullAllMock.mockRejectedValue(new Error('fatal error'));

    await runSync();

    expect(mocks.syncStateStore.val.status).toBe('error');
    expect(mocks.syncStateStore.val.error).toBe('fatal error');
    expect(mocks.showToastMock).toHaveBeenCalledWith(expect.stringContaining('failed'), 'error');
  });

  it('sets syncState to success on runSync if no conflicts occurred', async () => {
    mocks.pullAllMock.mockResolvedValue(new Map());
    
    await runSync();

    expect(mocks.syncStateStore.val.status).toBe('success');
    expect(mocks.syncStateStore.val.lastSync).toBeDefined();
  });
});
