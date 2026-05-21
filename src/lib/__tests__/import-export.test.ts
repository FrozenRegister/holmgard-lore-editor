/**
 * Tests for import/export logic.
 * We test the core serialisation logic directly (not the Svelte page).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Topic, ExportBundle } from '../types';

// ── Helpers mirroring the page logic ─────────────────────────────────────────

function buildBundle(topics: Topic[]): ExportBundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    topics,
  };
}

function parseBundle(json: string): ExportBundle | null {
  try {
    const b = JSON.parse(json) as Partial<ExportBundle>;
    if (b.version !== 1 || !Array.isArray(b.topics)) return null;
    return b as ExportBundle;
  } catch {
    return null;
  }
}

function mergeTopics(
  existing: Topic[],
  incoming: Topic[]
): { merged: Topic[]; imported: number; skipped: number } {
  const map = new Map(existing.map((t) => [t.key, t]));
  let imported = 0;
  let skipped = 0;

  for (const topic of incoming) {
    if (!topic.key || typeof topic.text !== 'string') { skipped++; continue; }
    const ex = map.get(topic.key);
    if (ex) {
      const existingV = ex.meta?.version ?? 0;
      const incomingV = topic.meta?.version ?? 0;
      if (incomingV <= existingV) { skipped++; continue; }
    }
    map.set(topic.key, topic);
    imported++;
  }

  return {
    merged: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)),
    imported,
    skipped,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const topic1: Topic = {
  key: 'holmgard',
  text: '# Holmgard',
  meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 2 },
};

const topic2: Topic = {
  key: 'lamia',
  text: '# Lamia',
  meta: { updatedAt: '2025-01-01T00:00:00.000Z', version: 1 },
};

// ── buildBundle ───────────────────────────────────────────────────────────────

describe('buildBundle', () => {
  it('creates a valid v1 bundle', () => {
    const bundle = buildBundle([topic1, topic2]);
    expect(bundle.version).toBe(1);
    expect(bundle.topics).toHaveLength(2);
    expect(bundle.exportedAt).toBeTruthy();
  });

  it('serialises and re-parses without data loss', () => {
    const bundle = buildBundle([topic1]);
    const json = JSON.stringify(bundle, null, 2);
    const parsed = parseBundle(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.topics[0]).toEqual(topic1);
  });
});

// ── parseBundle ───────────────────────────────────────────────────────────────

describe('parseBundle', () => {
  it('returns null for invalid JSON', () => {
    expect(parseBundle('NOT JSON')).toBeNull();
  });

  it('returns null for wrong version', () => {
    const bad = JSON.stringify({ version: 2, topics: [] });
    expect(parseBundle(bad)).toBeNull();
  });

  it('returns null when topics is not an array', () => {
    const bad = JSON.stringify({ version: 1, topics: null });
    expect(parseBundle(bad)).toBeNull();
  });

  it('parses a valid bundle', () => {
    const bundle = buildBundle([topic1, topic2]);
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed).not.toBeNull();
    expect(parsed!.topics).toHaveLength(2);
  });
});

// ── mergeTopics ───────────────────────────────────────────────────────────────

describe('mergeTopics', () => {
  it('imports all topics into empty store', () => {
    const { merged, imported, skipped } = mergeTopics([], [topic1, topic2]);
    expect(imported).toBe(2);
    expect(skipped).toBe(0);
    expect(merged).toHaveLength(2);
  });

  it('skips topics with equal or lower version', () => {
    const { imported, skipped } = mergeTopics(
      [topic1],                // existing: holmgard v2
      [{ ...topic1, text: 'old' }] // incoming: holmgard v2 — same version → skip
    );
    expect(imported).toBe(0);
    expect(skipped).toBe(1);
  });

  it('replaces topic with newer version', () => {
    const newerHolmgard: Topic = {
      ...topic1,
      text: '# Holmgard — Updated',
      meta: { updatedAt: '2025-06-01T00:00:00.000Z', version: 5 },
    };
    const { merged, imported } = mergeTopics([topic1], [newerHolmgard]);
    expect(imported).toBe(1);
    expect(merged.find((t) => t.key === 'holmgard')!.text).toBe('# Holmgard — Updated');
  });

  it('skips entries with missing key', () => {
    const bad = { key: '', text: 'oops', meta: { updatedAt: '', version: 1 } } as Topic;
    const { skipped } = mergeTopics([], [bad]);
    expect(skipped).toBe(1);
  });

  it('skips entries with non-string text', () => {
    const bad = { key: 'k', text: 42 as unknown as string, meta: { updatedAt: '', version: 1 } };
    const { skipped } = mergeTopics([], [bad as Topic]);
    expect(skipped).toBe(1);
  });

  it('returns topics sorted by key', () => {
    const topics: Topic[] = [
      { key: 'z-topic', text: '', meta: { updatedAt: '', version: 1 } },
      { key: 'a-topic', text: '', meta: { updatedAt: '', version: 1 } },
      { key: 'm-topic', text: '', meta: { updatedAt: '', version: 1 } },
    ];
    const { merged } = mergeTopics([], topics);
    expect(merged.map((t) => t.key)).toEqual(['a-topic', 'm-topic', 'z-topic']);
  });

  it('does not mutate the existing array', () => {
    const existing = [topic1];
    const before = [...existing];
    mergeTopics(existing, [topic2]);
    expect(existing).toEqual(before);
  });
});

// ── ZIP-related (logic only — JSZip integration tested via e2e) ───────────────

describe('ZIP filename derivation', () => {
  it('converts topic key to md filename', () => {
    const toMd = (key: string) => `${key}.md`;
    expect(toMd('holmgard')).toBe('holmgard.md');
    expect(toMd('my-cool-place')).toBe('my-cool-place.md');
  });

  it('strips holmgard-lore/ prefix from zip path', () => {
    const stripPrefix = (p: string) => p.replace(/^holmgard-lore\//, '').replace(/\.md$/, '');
    expect(stripPrefix('holmgard-lore/lamia.md')).toBe('lamia');
    expect(stripPrefix('holmgard-lore/undercity.md')).toBe('undercity');
  });
});
