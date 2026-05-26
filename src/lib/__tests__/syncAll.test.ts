import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Must run before any import that touches storage or stores ─────────────────
const { invokeMock, fetchMock } = vi.hoisted(() => {
  Object.defineProperty(globalThis, '__TAURI__', { value: {}, configurable: true });
  const invokeMock = vi.fn();
  const fetchMock  = vi.fn();
  globalThis.fetch = fetchMock as any;
  return { invokeMock, fetchMock };
});

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: invokeMock }));

// ── Controllable store state ──────────────────────────────────────────────────
import { readable, writable, get } from 'svelte/store';
import type { Topic, AppSettings } from '../types';

const localTopics   = writable<Topic[]>([]);
const localSettings = writable<AppSettings>({ workerHost: 'http://worker', autoSyncIntervalSecs: 0 });
const conflictEvents: any[] = [];

vi.mock('../stores', () => ({
  topics:        localTopics,
  settings:      localSettings,
  syncState:     { set: vi.fn() },
  conflictQueue: { set: vi.fn((v: any) => conflictEvents.push(v)), update: vi.fn() },
  showToast:     vi.fn(),
}));

// ── Mock ../sync so runSync doesn't make real network calls ───────────────────
const pullAllMock       = vi.fn();
const detectConflictMock = vi.fn();
const enqueueMock        = vi.fn();
const flushQueueMock     = vi.fn();
const dequeueMock        = vi.fn();

vi.mock('../sync', () => ({
  pullAll:               pullAllMock,
  detectConflict:        detectConflictMock,
  enqueue:               enqueueMock,
  flushQueue:            flushQueueMock,
  dequeuePendingDeletes: dequeueMock,
  enqueuePendingDelete:  vi.fn(),
}));

// Import AFTER all mocks
import { runSync } from '../syncAll';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTopic(key: string, text: string, version: number): Topic {
  return { key, text, meta: { version, updatedAt: '2026-01-01T00:00:00.000Z' } };
}

const invokeStore: Record<string, string> = {};

beforeEach(() => {
  Object.keys(invokeStore).forEach((k) => delete invokeStore[k]);
  localStorage.clear();
  fetchMock.mockReset();
  invokeMock.mockReset();
  pullAllMock.mockReset();
  detectConflictMock.mockReset();
  enqueueMock.mockReset();
  flushQueueMock.mockReset();
  dequeueMock.mockReset();
  conflictEvents.length = 0;

  localTopics.set([]);
  localSettings.set({ workerHost: 'http://worker', autoSyncIntervalSecs: 0 });

  dequeueMock.mockReturnValue([]);

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

// ── Clean remote-ahead update ─────────────────────────────────────────────────
describe('runSync — clean remote-ahead update', () => {
  it('saves updated topic when remote version is higher', async () => {
    const local = makeTopic('dragons', 'old text', 2);
    localTopics.set([local]);
    pullAllMock.mockResolvedValue(new Map([
      ['dragons', makeTopic('dragons', 'new text', 3)]
    ]));
    detectConflictMock.mockReturnValue(null);

    await runSync();

    const saved = JSON.parse(invokeStore['topics/dragons.json'] ?? 'null');
    expect(saved?.text).toBe('new text');
    expect(saved?.meta.version).toBe(3);
  });

  it('does not raise a conflict for clean remote-ahead update', async () => {
    localTopics.set([makeTopic('elves', 'old', 1)]);
    pullAllMock.mockResolvedValue(new Map([['elves', makeTopic('elves', 'new', 5)]]));
    detectConflictMock.mockReturnValue(null);

    await runSync();

    expect(conflictEvents).toHaveLength(0);
  });
});

// ── Identical text — no-op ────────────────────────────────────────────────────
describe('runSync — identical text', () => {
  it('does not save when text is identical', async () => {
    localTopics.set([makeTopic('dwarves', 'same text', 1)]);
    pullAllMock.mockResolvedValue(new Map([['dwarves', makeTopic('dwarves', 'same text', 1)]]));
    detectConflictMock.mockReturnValue(null);

    await runSync();

    expect(invokeStore['topics/dwarves.json']).toBeUndefined();
    expect(conflictEvents).toHaveLength(0);
  });
});

// ── True conflict ─────────────────────────────────────────────────────────────
describe('runSync — true conflict', () => {
  it('raises a conflict when detectConflict returns ConflictInfo', async () => {
    const conflict = { key: 'orcs', local: 'local', remote: 'remote', base: '', remoteMeta: {} };
    localTopics.set([makeTopic('orcs', 'local version', 3)]);
    pullAllMock.mockResolvedValue(new Map([['orcs', makeTopic('orcs', 'remote version', 3)]]));
    detectConflictMock.mockReturnValue(conflict);

    await runSync();

    expect(conflictEvents.length).toBeGreaterThan(0);
  });

  it('does not auto-save a conflicted topic', async () => {
    const conflict = { key: 'orcs', local: 'local', remote: 'remote', base: '', remoteMeta: {} };
    localTopics.set([makeTopic('orcs', 'local version', 3)]);
    pullAllMock.mockResolvedValue(new Map([['orcs', makeTopic('orcs', 'remote version', 3)]]));
    detectConflictMock.mockReturnValue(conflict);

    await runSync();

    expect(invokeStore['topics/orcs.json']).toBeUndefined();
  });
});

// ── New remote topic ──────────────────────────────────────────────────────────
describe('runSync — new remote topic', () => {
  it('saves a topic that exists remotely but not locally', async () => {
    localTopics.set([]);
    pullAllMock.mockResolvedValue(new Map([
      ['new-topic', makeTopic('new-topic', 'brand new', 1)]
    ]));
    detectConflictMock.mockReturnValue(null);

    await runSync();

    const saved = JSON.parse(invokeStore['topics/new-topic.json'] ?? 'null');
    expect(saved?.text).toBe('brand new');
  });
});

// ── Empty remote ──────────────────────────────────────────────────────────────
describe('runSync — empty remote', () => {
  it('does not throw when pullAll returns an empty map', async () => {
    localTopics.set([makeTopic('dragons', 'text', 1)]);
    pullAllMock.mockResolvedValue(new Map());

    await expect(runSync()).resolves.not.toThrow();
  });
});
