import { describe, it, expect, vi, beforeEach } from 'vitest';

// history.ts imports @tauri-apps/api/tauri at module level.
// Mock it so the import doesn't crash — IS_TAURI stays false in jsdom
// (no __TAURI__ on window), so all reads/writes go through localStorage.
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: vi.fn() }));

import { loadHistory, pushHistory, clearHistory } from '../history';

// localStorage key pattern used by history.ts when IS_TAURI is false
function lsKey(key: string) {
  return `hle:file:history/${encodeURIComponent(key)}.json`;
}

beforeEach(() => {
  localStorage.clear();
});

// ── loadHistory ───────────────────────────────────────────────────────────────
describe('loadHistory', () => {
  it('returns empty array when no history exists', async () => {
    expect(await loadHistory('no-such-topic')).toEqual([]);
  });

  it('returns parsed entries for an existing key', async () => {
    const entries = [{ text: 'hello', version: 1, savedAt: '2026-01-01T00:00:00.000Z' }];
    localStorage.setItem(lsKey('dragons'), JSON.stringify(entries));
    const result = await loadHistory('dragons');
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe(1);
  });

  it('preserves order as stored (newest first)', async () => {
    const entries = [
      { text: 'new', version: 2, savedAt: '2026-01-02T00:00:00.000Z' },
      { text: 'old', version: 1, savedAt: '2026-01-01T00:00:00.000Z' },
    ];
    localStorage.setItem(lsKey('elves'), JSON.stringify(entries));
    const result = await loadHistory('elves');
    expect(result[0].version).toBe(2);
    expect(result[1].version).toBe(1);
  });

  it('returns empty array on malformed JSON', async () => {
    localStorage.setItem(lsKey('bad'), 'not-json{{{');
    expect(await loadHistory('bad')).toEqual([]);
  });
});

// ── pushHistory ───────────────────────────────────────────────────────────────
describe('pushHistory', () => {
  it('creates a new entry when no history exists', async () => {
    await pushHistory('dwarves', 'first content', 1, 'local');
    const result = await loadHistory('dwarves');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('first content');
    expect(result[0].version).toBe(1);
    expect(result[0].source).toBe('local');
  });

  it('prepends so newest entry is always first', async () => {
    await pushHistory('dwarves', 'v1', 1, 'local');
    await pushHistory('dwarves', 'v2', 2, 'local');
    const result = await loadHistory('dwarves');
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe(2);
    expect(result[1].version).toBe(1);
  });

  it('stores remote source correctly', async () => {
    await pushHistory('dwarves', 'remote content', 5, 'remote');
    expect((await loadHistory('dwarves'))[0].source).toBe('remote');
  });

  it('omits source field when not provided', async () => {
    await pushHistory('hobbits', 'text', 1);
    expect((await loadHistory('hobbits'))[0].source).toBeUndefined();
  });

  it('caps at 50 entries and drops the oldest', async () => {
    for (let i = 1; i <= 52; i++) {
      await pushHistory('giants', `content ${i}`, i, 'local');
    }
    const result = await loadHistory('giants');
    expect(result).toHaveLength(50);
    expect(result[0].version).toBe(52);   // newest kept
    expect(result[49].version).toBe(3);   // oldest kept (v1 and v2 dropped)
  });

  it('records a savedAt timestamp within test window', async () => {
    const before = new Date().toISOString();
    await pushHistory('hobbits', 'text', 1, 'local');
    const after = new Date().toISOString();
    const { savedAt } = (await loadHistory('hobbits'))[0];
    expect(savedAt >= before).toBe(true);
    expect(savedAt <= after).toBe(true);
  });

  it('does not cross-contaminate between keys', async () => {
    await pushHistory('keyA', 'text A', 1, 'local');
    await pushHistory('keyB', 'text B', 1, 'local');
    expect((await loadHistory('keyA'))[0].text).toBe('text A');
    expect((await loadHistory('keyB'))[0].text).toBe('text B');
  });
});

// ── clearHistory ──────────────────────────────────────────────────────────────
describe('clearHistory', () => {
  it('removes history so subsequent load returns []', async () => {
    await pushHistory('orcs', 'content', 1, 'local');
    await clearHistory('orcs');
    expect(await loadHistory('orcs')).toEqual([]);
  });

  it('does not throw when clearing a key with no history', async () => {
    await expect(clearHistory('nonexistent')).resolves.not.toThrow();
  });

  it('only clears the specified key', async () => {
    await pushHistory('keyA', 'text', 1, 'local');
    await pushHistory('keyB', 'text', 1, 'local');
    await clearHistory('keyA');
    expect(await loadHistory('keyB')).toHaveLength(1);
  });
});
