import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncAll } from '../syncAll';
import type { Topic } from '../types';

let localTopics: Topic[] = [];
let remoteTopics: Record<string, { text: string; meta: Topic['meta'] }> = {};
const savedTopics: Topic[] = [];
const raisedConflicts: any[] = [];

vi.mock('../storage', () => ({
  loadAllTopics: vi.fn(async () => localTopics),
  saveTopic: vi.fn(async (t: Topic) => { savedTopics.push(t); }),
}));

vi.mock('../sync', () => ({
  listTopicsRemote: vi.fn(async () => Object.keys(remoteTopics)),
  getTopicRemote: vi.fn(async (_host: string, key: string) => remoteTopics[key] ?? null),
  detectConflict: vi.fn((local: Topic, remote: { text: string; meta: Topic['meta'] }) => {
    if (local.text === remote.text) return null;
    if ((remote.meta.version ?? 0) > (local.meta.version ?? 0)) return null;
    return { key: local.key, localText: local.text, remoteText: remote.text, localMeta: local.meta, remoteMeta: remote.meta };
  }),
  enqueue: vi.fn(),
  dequeuePendingDeletes: vi.fn(),
}));

vi.mock('../stores', () => ({
  conflictQueue: { update: vi.fn(() => { raisedConflicts.push('raised'); }) },
  syncState: { set: vi.fn() },
  topics: { set: vi.fn() },
}));

vi.mock('../history', () => ({
  pushHistory: vi.fn(),
}));

function makeTopic(key: string, text: string, version: number): Topic {
  return {
    key,
    text,
    meta: { version, type: 'lore', updatedAt: '2026-01-01T00:00:00.000Z', syncedAt: '2026-01-01T00:00:00.000Z' },
  };
}

beforeEach(() => {
  localTopics = [];
  remoteTopics = {};
  savedTopics.length = 0;
  raisedConflicts.length = 0;
  vi.clearAllMocks();
});

describe('syncAll — clean remote-ahead update', () => {
  it('applies remote text and meta when remote version is higher', async () => {
    localTopics = [makeTopic('dragons', 'old text', 2)];
    remoteTopics['dragons'] = { text: 'new text', meta: { ...localTopics[0].meta, version: 3 } };
    await syncAll('http://worker', 'secret');
    const saved = savedTopics.find((t) => t.key === 'dragons');
    expect(saved?.text).toBe('new text');
    expect(saved?.meta.version).toBe(3);
  });

  it('does not raise a conflict for a clean remote-ahead update', async () => {
    localTopics = [makeTopic('elves', 'old', 1)];
    remoteTopics['elves'] = { text: 'new', meta: { ...localTopics[0].meta, version: 5 } };
    await syncAll('http://worker', 'secret');
    expect(raisedConflicts).toHaveLength(0);
  });
});

describe('syncAll — identical text', () => {
  it('does not save or raise conflict when text is identical', async () => {
    localTopics = [makeTopic('dwarves', 'same text', 1)];
    remoteTopics['dwarves'] = { text: 'same text', meta: localTopics[0].meta };
    await syncAll('http://worker', 'secret');
    expect(savedTopics).toHaveLength(0);
    expect(raisedConflicts).toHaveLength(0);
  });
});

describe('syncAll — true conflict', () => {
  it('raises a conflict when versions match but text differs', async () => {
    localTopics = [makeTopic('orcs', 'local version', 3)];
    remoteTopics['orcs'] = { text: 'remote version', meta: { ...localTopics[0].meta, version: 3 } };
    await syncAll('http://worker', 'secret');
    expect(raisedConflicts.length).toBeGreaterThan(0);
  });

  it('does not auto-save when a conflict is raised', async () => {
    localTopics = [makeTopic('orcs', 'local version', 3)];
    remoteTopics['orcs'] = { text: 'remote version', meta: { ...localTopics[0].meta, version: 3 } };
    await syncAll('http://worker', 'secret');
    expect(savedTopics).toHaveLength(0);
  });
});

describe('syncAll — new remote topic', () => {
  it('saves a topic that exists remotely but not locally', async () => {
    localTopics = [];
    remoteTopics['new-topic'] = {
      text: 'brand new',
      meta: { version: 1, type: 'lore', updatedAt: '2026-01-01T00:00:00.000Z', syncedAt: '2026-01-01T00:00:00.000Z' },
    };
    await syncAll('http://worker', 'secret');
    const saved = savedTopics.find((t) => t.key === 'new-topic');
    expect(saved?.text).toBe('brand new');
  });
});

describe('syncAll — concurrency', () => {
  it('handles 20 topics without throwing', async () => {
    localTopics = Array.from({ length: 20 }, (_, i) => makeTopic(`topic-${i}`, `text ${i}`, 1));
    for (const t of localTopics) {
      remoteTopics[t.key] = { text: t.text, meta: t.meta };
    }
    await expect(syncAll('http://worker', 'secret')).resolves.not.toThrow();
  });
});
