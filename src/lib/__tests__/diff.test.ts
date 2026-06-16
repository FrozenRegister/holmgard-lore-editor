import { describe, it, expect } from 'vitest';
import {
  lineDiff,
  wordDiff,
  toHunks,
  summarize,
  mergeFromPicks,
  hunkLabel,
  hunkCounts,
  similarity,
} from '../diff';

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('hello world', 'hello world')).toBe(1);
  });
  it('returns 0 for an empty side', () => {
    expect(similarity('hello', '')).toBe(0);
  });
  it('is high for small word swaps', () => {
    expect(similarity('**Status:** Active / Preparing', '**Status:** Active / Departed')).toBeGreaterThan(0.5);
  });
});

describe('lineDiff', () => {
  it('produces all eq ops for identical inputs', () => {
    const ops = lineDiff('a\nb\nc', 'a\nb\nc');
    expect(ops.every(o => o.type === 'eq')).toBe(true);
    expect(ops).toHaveLength(3);
  });

  it('catches a single insertion without rippling', () => {
    const ops = lineDiff('a\nb\nc', 'a\nX\nb\nc');
    const changed = ops.filter(o => o.type !== 'eq');
    expect(changed).toHaveLength(1);
    expect(changed[0].type).toBe('ins');
  });

  it('catches a single deletion without rippling', () => {
    const ops = lineDiff('a\nb\nc\nd', 'a\nc\nd');
    const changed = ops.filter(o => o.type !== 'eq');
    expect(changed).toHaveLength(1);
    expect(changed[0].type).toBe('del');
  });

  it('collapses del+ins of similar lines into a single mod', () => {
    const ops = lineDiff(
      '**Status:** Active / Preparing for Departure',
      '**Status:** Active / Departed'
    );
    expect(ops.filter(o => o.type === 'mod')).toHaveLength(1);
    expect(ops.filter(o => o.type === 'del')).toHaveLength(0);
    expect(ops.filter(o => o.type === 'ins')).toHaveLength(0);
  });

  it('does not collapse del+ins of unrelated lines', () => {
    const ops = lineDiff('apple', 'totally unrelated content');
    expect(ops.some(o => o.type === 'mod')).toBe(false);
  });

  it('handles multiple consecutive deletions with no insertions', () => {
    const ops = lineDiff('a\nb\nc\nd', 'a\nd');
    const dels = ops.filter(o => o.type === 'del');
    expect(dels).toHaveLength(2);
  });
});

describe('wordDiff', () => {
  it('marks only changed tokens', () => {
    const parts = wordDiff('Active / Preparing for Departure', 'Active / Departed');
    const ins = parts.filter(p => p.type === 'ins').map(p => p.text).join('');
    const del = parts.filter(p => p.type === 'del').map(p => p.text).join('');
    expect(del).toContain('Preparing');
    expect(ins).toContain('Departed');
    // "Active /" shared prefix preserved
    expect(parts.find(p => p.type === 'eq' && p.text.includes('Active'))).toBeTruthy();
  });
});

describe('toHunks', () => {
  it('returns no hunks for unchanged docs', () => {
    expect(toHunks(lineDiff('a\nb', 'a\nb'))).toEqual([]);
  });

  it('coalesces nearby changes into one hunk', () => {
    const ops = lineDiff('a\nb\nc\nd\ne', 'a\nb!\nc\nd!\ne');
    const hunks = toHunks(ops, 2);
    expect(hunks).toHaveLength(1);
  });

  it('splits distant changes into separate hunks', () => {
    const ops = lineDiff(
      ['a','b','c','d','e','f','g','h','i','j'].join('\n'),
      ['a!','b','c','d','e','f','g','h','i','j!'].join('\n')
    );
    const hunks = toHunks(ops, 1);
    expect(hunks).toHaveLength(2);
  });
});

describe('mergeFromPicks', () => {
  const local  = 'one\ntwo\nthree\nfour';
  const remote = 'one\nTWO\nthree\nFOUR';

  it('all-local picks reproduce the local text', () => {
    const ops = lineDiff(local, remote);
    const hunks = toHunks(ops, 2);
    const merged = mergeFromPicks(ops, hunks, hunks.map(() => 'local'));
    expect(merged).toBe(local);
  });

  it('all-remote picks reproduce the remote text', () => {
    const ops = lineDiff(local, remote);
    const hunks = toHunks(ops, 2);
    const merged = mergeFromPicks(ops, hunks, hunks.map(() => 'remote'));
    expect(merged).toBe(remote);
  });

  it('per-hunk picks blend cleanly', () => {
    // Two distinct hunks
    const L = 'one\nA1\nthree\nfour\nfive\nsix\nseven\nB1\nnine';
    const R = 'one\nA2\nthree\nfour\nfive\nsix\nseven\nB2\nnine';
    const ops = lineDiff(L, R);
    const hunks = toHunks(ops, 1);
    expect(hunks).toHaveLength(2);
    // Pick local for #1, remote for #2
    const merged = mergeFromPicks(ops, hunks, ['local', 'remote']);
    expect(merged).toBe('one\nA1\nthree\nfour\nfive\nsix\nseven\nB2\nnine');
  });

  it('handles pure insertions and deletions', () => {
    const L = 'a\nb\nc';
    const R = 'a\nb\nX\nc'; // pure insertion
    const ops = lineDiff(L, R);
    const hunks = toHunks(ops, 1);
    expect(mergeFromPicks(ops, hunks, ['local'])).toBe(L);
    expect(mergeFromPicks(ops, hunks, ['remote'])).toBe(R);
  });

  it('throws when hunks and picks lengths differ', () => {
    const ops = lineDiff('a\nb', 'a\nX');
    const hunks = toHunks(ops, 0);
    expect(() => mergeFromPicks(ops, hunks, [])).toThrow('length mismatch');
  });
});

describe('hunkLabel', () => {
  it('uses the field name when present', () => {
    const ops = lineDiff('**Status:** A', '**Status:** B');
    const [h] = toHunks(ops, 0);
    expect(hunkLabel(h)).toBe('Status');
  });

  it('uses the section heading otherwise', () => {
    const ops = lineDiff('## Old\nbody', '## New\nbody');
    const [h] = toHunks(ops, 0);
    expect(hunkLabel(h)).toMatch(/^§/);
  });

  it('reads the label from a pure insertion op', () => {
    // 'a\nc' → 'a\n**Status:** new\nc': the new line is an `ins` op
    const ops = lineDiff('a\nc', 'a\n**Status:** new\nc');
    const [h] = toHunks(ops, 0);
    expect(hunkLabel(h)).toBe('Status');
  });

  it('skips eq context ops when scanning for a label', () => {
    // context=1 includes an eq line in the hunk; the loop must skip it via `continue`
    const ops = lineDiff('context\n**Status:** A', 'context\n**Status:** B');
    const [h] = toHunks(ops, 1);
    expect(hunkLabel(h)).toBe('Status');
  });

  it('returns List item for list-item hunks', () => {
    const ops = lineDiff('- first item', '- second item');
    const [h] = toHunks(ops, 0);
    expect(hunkLabel(h)).toBe('List item');
  });

  it('returns Changes when no pattern matches', () => {
    const ops = lineDiff('plain text here', 'completely different');
    const [h] = toHunks(ops, 0);
    expect(hunkLabel(h)).toBe('Changes');
  });
});

describe('summarize', () => {
  it('counts ops by type', () => {
    const ops = lineDiff('a\nb\nc', 'a\nX\nc'); // 1 del + 1 ins (too dissimilar to be a mod)
    expect(summarize(ops)).toMatchObject({ mod: 0, add: 1, del: 1 });
  });
});

describe('hunkCounts', () => {
  it('returns summarize of hunk ops', () => {
    const ops = lineDiff('a\nb\nc', 'a\nX\nc');
    const [h] = toHunks(ops, 0);
    expect(hunkCounts(h)).toMatchObject({ total: expect.any(Number) });
    expect(hunkCounts(h).total).toBeGreaterThan(0);
  });
});
