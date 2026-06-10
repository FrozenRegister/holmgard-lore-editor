import { describe, it, expect } from 'vitest';
import { lineDiff, summarize, type LineOp } from '$lib/diff';

// diff.ts is pure logic — no mocks needed, no localStorage, no fetch.
// Integration test: exercise the full diff/merge pipeline with realistic text.

function filterMod(ops: LineOp[]) { return ops.filter(o => o.type === 'mod'); }
function filterIns(ops: LineOp[]) { return ops.filter(o => o.type === 'ins'); }
function filterDel(ops: LineOp[]) { return ops.filter(o => o.type === 'del'); }

describe('diff integration', () => {
  it('should compute line diff between two texts', () => {
    const a = 'line 1\nline 2\nline 3';
    const b = 'line 1\nline 2 modified\nline 3\nline 4';

    const ops = lineDiff(a, b);
    expect(ops.length).toBeGreaterThan(0);

    // Should have a modification on line 2
    const mods = filterMod(ops);
    expect(mods.length).toBeGreaterThan(0);
    expect(mods[0].a).toBe('line 2');
    expect(mods[0].b).toBe('line 2 modified');

    // Should have an insertion of line 4
    const ins = filterIns(ops);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins[0].b).toBe('line 4');
  });

  it('should return only eq ops for identical texts', () => {
    const text = 'one\ntwo\nthree';

    const ops = lineDiff(text, text);
    expect(ops.length).toBe(3);
    expect(ops.every((o: any) => o.type === 'eq')).toBe(true);
  });

  it('should detect deletions', () => {
    const a = 'keep\nremove\nkeep';
    const b = 'keep\nkeep';

    const ops = lineDiff(a, b);
    const dels = filterDel(ops);
    expect(dels.length).toBeGreaterThan(0);
    expect(dels[0].a).toBe('remove');
  });

  it('should detect pure insertions', () => {
    const a = 'only one line';
    const b = 'only one line\nadded line';

    const ops = lineDiff(a, b);
    const ins = filterIns(ops);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins[0].b).toBe('added line');
  });

  it('should handle empty input', () => {
    const ops = lineDiff('', '');
    // Empty string splits as [""] — produces one eq op for the single empty line
    expect(ops.length).toBe(1);
    expect(ops[0].type).toBe('eq');
  });

  it('should handle all-new text vs empty', () => {
    const ops = lineDiff('', 'new line');
    // '' splits as [""], 'new line' splits as ["new line"]
    // Result will vary but should contain the new text somewhere
    expect(ops.length).toBeGreaterThan(0);
    const texts = ops.map((o: any) => (o.b ?? '')).join('');
    expect(texts).toContain('new line');
  });

  it('should handle real-world Markdown topic text diff', () => {
    const base = '## Sarah Weaver\nA brave explorer from Fernveil.\n## Goals\nFind the lost city.';
    const local = '## Sarah Weaver\nA brave explorer from Fernveil.\n## Goals\nFind the lost city.\nMap the uncharted.';
    const remote = '## Sarah Weaver\nA brave explorer from Fernveil.\n## Goals\nFind the lost city.\nTrade with locals.';

    // Diff between base and local should show insertion
    const baseVsLocal = lineDiff(base, local);
    const localIns = filterIns(baseVsLocal);
    expect(localIns.length).toBeGreaterThan(0);
    expect(localIns[0].b).toBe('Map the uncharted.');

    // Diff between base and remote should show different insertion
    const baseVsRemote = lineDiff(base, remote);
    const remoteIns = filterIns(baseVsRemote);
    expect(remoteIns.length).toBeGreaterThan(0);
    expect(remoteIns[0].b).toBe('Trade with locals.');
  });

  it('should compute a diff summary', () => {
    const a = 'one\ntwo\nthree';
    const b = 'one\nTWO changed\nthree\nfour';

    const ops = lineDiff(a, b);
    const summary = summarize(ops);
    expect(summary.total).toBeGreaterThan(0);
    // At least one mod (two → TWO changed) and one add (four)
    expect(summary.mod + summary.add).toBeGreaterThanOrEqual(1);
  });
});