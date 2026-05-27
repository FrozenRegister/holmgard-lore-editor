/**
 * Holmgard diff — LCS-based line diff with intra-line word diff and hunking,
 * plus a cherry-pick merger used by the conflict resolver.
 *
 * No external deps; pure functions; covered by diff.test.ts.
 */

export type LineOp =
  | { type: 'eq';  a: string; b: string;            ai: number; bi: number }
  | { type: 'mod'; a: string; b: string;            ai: number; bi: number }
  | { type: 'del'; a: string;            ai: number                        }
  | { type: 'ins';            b: string;            bi: number             };

export type WordOp = { type: 'eq' | 'del' | 'ins'; text: string };

export interface Hunk {
  /** Index in the full op list where this hunk's slice starts. */
  start: number;
  /** Inclusive end index in the full op list. */
  end: number;
  /** Slice of ops covered. */
  ops: LineOp[];
}

export interface DiffSummary {
  add: number;
  del: number;
  mod: number;
  total: number;
}

// ── LCS core ─────────────────────────────────────────────────────────────────

function lcsTable<T>(A: T[], B: T[], eq: (x: T, y: T) => boolean): Int32Array[] {
  const n = A.length, m = B.length;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(A[i], B[j]) ? dp[i + 1][j + 1] + 1
                                : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

type RawOp<T> =
  | { type: 'eq';  a: T; b: T; ai: number; bi: number }
  | { type: 'del'; a: T;       ai: number             }
  | { type: 'ins'; b: T;       bi: number             };

function lcsOps<T>(A: T[], B: T[], eq: (x: T, y: T) => boolean): RawOp<T>[] {
  const dp = lcsTable(A, B, eq);
  const n = A.length, m = B.length;
  const ops: RawOp<T>[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(A[i], B[j])) { ops.push({ type: 'eq',  a: A[i], b: B[j], ai: i, bi: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', a: A[i], ai: i }); i++; }
    else                                    { ops.push({ type: 'ins', b: B[j], bi: j }); j++; }
  }
  while (i < n) { ops.push({ type: 'del', a: A[i], ai: i }); i++; }
  while (j < m) { ops.push({ type: 'ins', b: B[j], bi: j }); j++; }
  return ops;
}

/** Dice-coefficient style similarity on whitespace/word tokens. 0..1. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const tok = (s: string) => s.split(/(\s+|\W)/).filter(Boolean);
  const A = tok(a), B = tok(b);
  const counts = new Map<string, number>();
  for (const t of A) counts.set(t, (counts.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of B) {
    const c = counts.get(t) ?? 0;
    if (c > 0) { hit++; counts.set(t, c - 1); }
  }
  return (2 * hit) / (A.length + B.length);
}

// ── Public: line diff ────────────────────────────────────────────────────────

/**
 * Line-level diff with adjacent del/ins pairs collapsed to `mod` when the two
 * lines are similar enough (> 0.4). Returns ops in source order.
 */
export function lineDiff(localText: string, remoteText: string): LineOp[] {
  const A = localText.split('\n');
  const B = remoteText.split('\n');
  const raw = lcsOps(A, B, (x, y) => x === y);

  const out: LineOp[] = [];
  for (let k = 0; k < raw.length; k++) {
    const op = raw[k];
    if (op.type !== 'del') { out.push(op as LineOp); continue; }

    // Gather a run of dels followed by ins
    const dels: Extract<RawOp<string>, { type: 'del' }>[] = [op];
    while (k + 1 < raw.length && raw[k + 1].type === 'del') {
      dels.push(raw[++k] as Extract<RawOp<string>, { type: 'del' }>);
    }
    const ins: Extract<RawOp<string>, { type: 'ins' }>[] = [];
    while (k + 1 < raw.length && raw[k + 1].type === 'ins') {
      ins.push(raw[++k] as Extract<RawOp<string>, { type: 'ins' }>);
    }

    // Greedy pair dels with ins by best similarity > 0.4.
    const used = new Set<number>();
    for (const d of dels) {
      let best = -1, bestS = 0.4;
      for (let x = 0; x < ins.length; x++) {
        if (used.has(x)) continue;
        const s = similarity(d.a, ins[x].b);
        if (s > bestS) { bestS = s; best = x; }
      }
      if (best >= 0) {
        used.add(best);
        out.push({ type: 'mod', a: d.a, b: ins[best].b, ai: d.ai, bi: ins[best].bi });
      } else {
        out.push(d);
      }
    }
    for (let x = 0; x < ins.length; x++) if (!used.has(x)) out.push(ins[x]);
  }
  return out;
}

// ── Public: word diff ────────────────────────────────────────────────────────

/** Token-level diff between two lines. Returns coalesced runs. */
export function wordDiff(a: string, b: string): WordOp[] {
  const tokenize = (s: string) =>
    s.match(/\s+|[A-Za-z0-9_'-]+|[^\sA-Za-z0-9_'-]/g) ?? [];
  const A = tokenize(a);
  const B = tokenize(b);
  const ops = lcsOps(A, B, (x, y) => x === y);

  const merged: WordOp[] = [];
  for (const op of ops) {
    const t = op.type;
    const text = op.type === 'ins' ? op.b : op.a;
    const last = merged[merged.length - 1];
    if (last && last.type === t) last.text += text;
    else merged.push({ type: t, text });
  }
  return merged;
}

// ── Public: hunking ──────────────────────────────────────────────────────────

/**
 * Split ops into hunks: runs of contiguous changes plus N lines of unchanged
 * context on either side. Long unchanged stretches are excluded.
 */
export function toHunks(ops: LineOp[], context = 2): Hunk[] {
  const changedIdx: number[] = [];
  for (let i = 0; i < ops.length; i++) if (ops[i].type !== 'eq') changedIdx.push(i);
  if (changedIdx.length === 0) return [];

  const hunks: Hunk[] = [];
  let start = Math.max(0, changedIdx[0] - context);
  let end   = Math.min(ops.length - 1, changedIdx[0] + context);

  for (let k = 1; k < changedIdx.length; k++) {
    const idx = changedIdx[k];
    if (idx - context <= end + 1) {
      end = Math.min(ops.length - 1, idx + context);
    } else {
      hunks.push({ start, end, ops: ops.slice(start, end + 1) });
      start = Math.max(0, idx - context);
      end   = Math.min(ops.length - 1, idx + context);
    }
  }
  hunks.push({ start, end, ops: ops.slice(start, end + 1) });
  return hunks;
}

export function summarize(ops: LineOp[]): DiffSummary {
  let add = 0, del = 0, mod = 0;
  for (const op of ops) {
    if      (op.type === 'ins') add++;
    else if (op.type === 'del') del++;
    else if (op.type === 'mod') mod++;
  }
  return { add, del, mod, total: add + del + mod };
}

// ── Cherry-pick merger ───────────────────────────────────────────────────────

export type HunkPick = 'local' | 'remote';

/**
 * Reassemble a merged text from the full op list and a per-hunk pick array.
 * For ops outside any hunk (pure `eq`), both sides agree, so we emit the line.
 * For ops inside a hunk, the pick decides:
 *   - 'local'  → emit `a` for {del, mod}, skip `ins`
 *   - 'remote' → emit `b` for {ins, mod}, skip `del`
 *   - `eq` inside a hunk emits once (both sides agree)
 */
export function mergeFromPicks(ops: LineOp[], hunks: Hunk[], picks: HunkPick[]): string {
  if (hunks.length !== picks.length) {
    throw new Error(`mergeFromPicks: hunks (${hunks.length}) and picks (${picks.length}) length mismatch`);
  }
  // Map op-index → hunk-index. Hunks are non-overlapping by construction.
  const hunkOf: Int32Array = new Int32Array(ops.length).fill(-1);
  hunks.forEach((h, i) => {
    for (let k = h.start; k <= h.end; k++) hunkOf[k] = i;
  });

  const out: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const h = hunkOf[i];
    if (h === -1) {
      // Outside any hunk: it must be `eq` — emit either side.
      if (op.type === 'eq') out.push(op.a);
      continue;
    }
    const pick = picks[h];
    switch (op.type) {
      case 'eq':  out.push(op.a); break;
      case 'mod': out.push(pick === 'local' ? op.a : op.b); break;
      case 'del': if (pick === 'local')  out.push(op.a); break;
      case 'ins': if (pick === 'remote') out.push(op.b); break;
    }
  }
  return out.join('\n');
}

/** Best-effort label for a hunk: first `**Field:**` name found, else "Changes". */
export function hunkLabel(h: Hunk): string {
  const FIELD = /^\*\*([A-Za-z][A-Za-z0-9_ -]*):\*\*/;
  for (const op of h.ops) {
    let text = '';
    if (op.type === 'mod' || op.type === 'del') text = op.a;
    else if (op.type === 'ins') text = op.b;
    else continue;
    const m = FIELD.exec(text);
    if (m) return m[1];

    // Section heading? "## Physical Profile" etc.
    const head = /^#{1,6}\s+(.+)$/.exec(text);
    if (head) return `§ ${head[1]}`;

    // List item?
    if (/^\s*[-*]\s+/.test(text)) return 'List item';
  }
  return 'Changes';
}

export function hunkCounts(h: Hunk): DiffSummary {
  return summarize(h.ops);
}
