/**
 * Tests for storage.ts — mocks Tauri invoke so no native bridge needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @tauri-apps/api/tauri ─────────────────────────────────────────────

const invokeMap: Record<string, unknown> = {};

const { invokeMock } = vi.hoisted(() => {
  // Must run before storage.ts is imported so IS_TAURI evaluates to true
  Object.defineProperty(globalThis, '__TAURI__', { value: {}, configurable: true });
  const invokeMock = vi.fn();
  return { invokeMock };
});

invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
  if (cmd === 'fs_read') {
    const key = `${args?.path}`;
    const val = invokeMap[key];
    if (val === undefined) throw new Error('Not found');
    return val;
  }
  if (cmd === 'fs_write') {
    invokeMap[`${args?.path}`] = args?.content;
    return;
  }
  if (cmd === 'fs_delete') {
    delete invokeMap[`${args?.path}`];
    return;
  }
  if (cmd === 'fs_list') {
    const prefix = `${args?.path}/`;
    return Object.keys(invokeMap)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }
  throw new Error(`Unknown command: ${cmd}`);
});

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: invokeMock }));

// Import AFTER mocking
import {
  loadTopic,
  saveTopic,
  deleteTopic,
  loadAllTopics,
  loadSettings,
  saveSettings,
  loadQueue,
  saveQueue,
} from '../storage';
import type { Topic, AppSettings, QueuedSave } from '../types';

beforeEach(() => {
  Object.keys(invokeMap).forEach((k) => delete invokeMap[k]);
  invokeMock.mockClear();
});

// ── Topic CRUD ────────────────────────────────────────────────────────────────

describe('loadTopic', () => {
  it('returns null for unknown key', async () => {
    const result = await loadTopic('missing');
    expect(result).toBeNull();
  });

  it('round-trips a saved topic', async () => {
    const topic: Topic = {
      key: 'test-topic',
      text: '# Test',
      meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 1 },
    };
    await saveTopic(topic);
    const loaded = await loadTopic('test-topic');
    expect(loaded).toEqual(topic);
  });

  it('returns null for corrupt JSON', async () => {
    invokeMap['topics/test-corrupt.json'] = 'NOT_JSON{{{{';
    const result = await loadTopic('test-corrupt');
    expect(result).toBeNull();
  });
});

describe('deleteTopic', () => {
  it('removes a saved topic', async () => {
    const topic: Topic = {
      key: 'to-delete',
      text: '# bye',
      meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 1 },
    };
    await saveTopic(topic);
    expect(await loadTopic('to-delete')).not.toBeNull();
    await deleteTopic('to-delete');
    expect(await loadTopic('to-delete')).toBeNull();
  });
});

describe('loadAllTopics', () => {
  it('returns empty array when no topics', async () => {
    const all = await loadAllTopics();
    expect(all).toEqual([]);
  });

  it('loads all saved topics sorted by key', async () => {
    const topics: Topic[] = [
      { key: 'zebra', text: '# Z', meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 1 } },
      { key: 'alpha', text: '# A', meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 1 } },
      { key: 'middle', text: '# M', meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 1 } },
    ];
    for (const t of topics) await saveTopic(t);
    const all = await loadAllTopics();
    expect(all.map((t) => t.key)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('skips corrupt topic files gracefully', async () => {
    await saveTopic({ key: 'good', text: '# Good', meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 1 } });
    invokeMap['topics/bad%20topic.json'] = 'INVALID';
    const all = await loadAllTopics();
    expect(all.some((t) => t.key === 'good')).toBe(true);
    expect(all.some((t) => t.key === 'bad topic')).toBe(false);
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────

describe('loadSettings', () => {
  it('returns default settings when none saved', async () => {
    const s = await loadSettings();
    expect(s.workerHost).toBe('https://holmgard-lore-mcp.frozenregister.workers.dev');
  });

  it('merges saved settings over defaults', async () => {
    const saved: AppSettings = {
      workerHost: 'https://custom.example.com',
      encryptedSecret: 'abc',
      iv: 'iv123',
      autoSyncIntervalSecs: 60,
      autoSync: true,           // ← add
      syncHistory: false,       // ← add
    };
    await saveSettings(saved);
    const loaded = await loadSettings();
    expect(loaded.workerHost).toBe('https://custom.example.com');
    expect(loaded.encryptedSecret).toBe('abc');
  });

  it('returns defaults for corrupt settings file', async () => {
    invokeMap['settings.json'] = '{ bad json';
    const s = await loadSettings();
    expect(s.workerHost).toBe('https://holmgard-lore-mcp.frozenregister.workers.dev');
  });
});

// ── Queue ─────────────────────────────────────────────────────────────────────

describe('queue persistence', () => {
  it('loads empty queue when none saved', async () => {
    const q = await loadQueue();
    expect(q).toEqual([]);
  });

  it('round-trips queue entries', async () => {
    const entries: QueuedSave[] = [
      { key: 'alpha', text: '# A', enqueuedAt: '2025-01-01T00:00:00.000Z', attempts: 0 },
      { key: 'beta', text: '# B', enqueuedAt: '2025-01-01T00:01:00.000Z', attempts: 1 },
    ];
    await saveQueue(entries);
    const loaded = await loadQueue();
    expect(loaded).toEqual(entries);
  });

  it('returns empty array for corrupt queue file', async () => {
    invokeMap['offline-queue.json'] = '[not valid';
    const q = await loadQueue();
    expect(q).toEqual([]);
  });
});
