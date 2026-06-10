import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

function simulateBrowser() {
  delete (globalThis as any).__TAURI__;
}

afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.resetModules();
  simulateBrowser();
});

describe('history integration (real localStorage)', () => {
  it('should load empty history for unknown key', async () => {
    const { loadHistory } = await import('$lib/history');
    const entries = await loadHistory('unknown-key');
    expect(entries).toEqual([]);
  });

  it('should push and load history entries (newest first)', async () => {
    const { pushHistory, loadHistory } = await import('$lib/history');

    await pushHistory('topic-1', 'v1 text', 1, 'local');
    await pushHistory('topic-1', 'v2 text', 2, 'remote');
    await pushHistory('topic-1', 'v3 text', 3, 'conflict');

    const entries = await loadHistory('topic-1');
    expect(entries).toHaveLength(3);
    expect(entries[0].text).toBe('v3 text');
    expect(entries[0].version).toBe(3);
    expect(entries[0].source).toBe('conflict');
    expect(entries[1].text).toBe('v2 text');
    expect(entries[1].source).toBe('remote');
    expect(entries[2].text).toBe('v1 text');
    expect(entries[2].source).toBe('local');
  });

  it('should store source field only when provided', async () => {
    const { pushHistory, loadHistory } = await import('$lib/history');

    await pushHistory('topic-2', 'text', 1);
    const entries = await loadHistory('topic-2');
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBeUndefined();
  });

  it('should trim to MAX_ENTRIES (50)', async () => {
    const { pushHistory, loadHistory } = await import('$lib/history');

    for (let i = 1; i <= 60; i++) {
      await pushHistory('topic-3', `v${i}`, i);
    }

    const entries = await loadHistory('topic-3');
    expect(entries).toHaveLength(50);
    expect(entries[0].version).toBe(60);
    expect(entries[49].version).toBe(11);
  });

  it('should clear history for a key', async () => {
    const { pushHistory, clearHistory, loadHistory } = await import('$lib/history');

    await pushHistory('topic-4', 'text', 1);
    await pushHistory('topic-4', 'text2', 2);

    await clearHistory('topic-4');
    const entries = await loadHistory('topic-4');
    expect(entries).toEqual([]);

    // Should not affect other keys
    await pushHistory('topic-5', 'text', 1);
    const topic5 = await loadHistory('topic-5');
    expect(topic5).toHaveLength(1);
  });

  it('should have timestamps on each entry', async () => {
    const { pushHistory, loadHistory } = await import('$lib/history');

    await pushHistory('topic-6', 'text', 1);
    const entries = await loadHistory('topic-6');
    expect(entries[0].savedAt).toBeDefined();
    expect(new Date(entries[0].savedAt).getTime()).toBeGreaterThan(0);
  });

  it('should handle corrupt history data gracefully', async () => {
    localStorage.setItem('hle:file:history/topic-bad.json', 'not-json');
    const { loadHistory } = await import('$lib/history');
    const entries = await loadHistory('topic-bad');
    expect(entries).toEqual([]);
  });

  it('should write to localStorage in browser mode', async () => {
    const { pushHistory } = await import('$lib/history');

    await pushHistory('topic-7', 'stored', 1);
    const raw = localStorage.getItem('hle:file:history/topic-7.json');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed[0].text).toBe('stored');
  });
});