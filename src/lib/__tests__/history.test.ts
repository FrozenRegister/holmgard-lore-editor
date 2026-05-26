import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadHistory, pushHistory, clearHistory } from '../history';

// ── Mock storage layer ────────────────────────────────────────────────────────
const store: Record<string, string> = {};

vi.mock('../storage', () => ({
    readFile: vi.fn(async (path: string) => {
        if (!(path in store)) throw new Error('NOT_FOUND');
        return store[path];
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
        store[path] = content;
    }),
    deleteFile: vi.fn(async (path: string) => {
        delete store[path];
    }),
}));

function historyPath(key: string) {
    return `history/${key}.json`;
}

beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
});

describe('loadHistory', () => {
    it('returns empty array when no history file exists', async () => {
        const result = await loadHistory('no-such-topic');
        expect(result).toEqual([]);
    });

    it('returns parsed entries for an existing key', async () => {
        const entries = [
            { text: 'hello', version: 1, savedAt: '2026-01-01T00:00:00.000Z', source: 'local' },
        ];
        store[historyPath('dragons')] = JSON.stringify(entries);
        const result = await loadHistory('dragons');
        expect(result).toHaveLength(1);
        expect(result[0].version).toBe(1);
    });

    it('returns entries ordered newest-first', async () => {
        const entries = [
            { text: 'old', version: 1, savedAt: '2026-01-01T00:00:00.000Z', source: 'local' },
            { text: 'new', version: 2, savedAt: '2026-01-02T00:00:00.000Z', source: 'local' },
        ];
        store[historyPath('elves')] = JSON.stringify(entries);
        const result = await loadHistory('elves');
        expect(result[0].version).toBe(2);
        expect(result[1].version).toBe(1);
    });
});

describe('pushHistory', () => {
    it('creates a new history file if none exists', async () => {
        await pushHistory('dwarves', 'first content', 1, 'local');
        const result = await loadHistory('dwarves');
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('first content');
        expect(result[0].version).toBe(1);
        expect(result[0].source).toBe('local');
    });

    it('appends to existing history', async () => {
        await pushHistory('dwarves', 'v1', 1, 'local');
        await pushHistory('dwarves', 'v2', 2, 'local');
        const result = await loadHistory('dwarves');
        expect(result).toHaveLength(2);
    });

    it('stores source correctly for remote entries', async () => {
        await pushHistory('dwarves', 'remote content', 5, 'remote');
        const result = await loadHistory('dwarves');
        expect(result[0].source).toBe('remote');
    });

    it('caps history at 50 entries, dropping the oldest', async () => {
        for (let i = 1; i <= 52; i++) {
            await pushHistory('giants', `content ${i}`, i, 'local');
        }
        const result = await loadHistory('giants');
        expect(result).toHaveLength(50);
        expect(result.every((e) => e.version >= 3)).toBe(true);
    });

    it('records a savedAt timestamp', async () => {
        const before = new Date().toISOString();
        await pushHistory('hobbits', 'text', 1, 'local');
        const after = new Date().toISOString();
        const result = await loadHistory('hobbits');
        expect(result[0].savedAt >= before).toBe(true);
        expect(result[0].savedAt <= after).toBe(true);
    });

    it('does not cross-contaminate history between keys', async () => {
        await pushHistory('keyA', 'text A', 1, 'local');
        await pushHistory('keyB', 'text B', 1, 'local');
        const a = await loadHistory('keyA');
        const b = await loadHistory('keyB');
        expect(a[0].text).toBe('text A');
        expect(b[0].text).toBe('text B');
    });
});

describe('clearHistory', () => {
    it('removes the history file so subsequent load returns []', async () => {
        await pushHistory('orcs', 'content', 1, 'local');
        await clearHistory('orcs');
        const result = await loadHistory('orcs');
        expect(result).toEqual([]);
    });

    it('does not throw when clearing a key with no history', async () => {
        await expect(clearHistory('nonexistent')).resolves.not.toThrow();
    });

    it('only clears the specified key', async () => {
        await pushHistory('keyA', 'text', 1, 'local');
        await pushHistory('keyB', 'text', 1, 'local');
        await clearHistory('keyA');
        const b = await loadHistory('keyB');
        expect(b).toHaveLength(1);
    });
});
