<script lang="ts">
  import { conflictQueue, topics, showToast, settings } from "$lib/stores";
  import { saveTopic } from "$lib/storage";
  import { pushHistory } from "$lib/history";
  import { adminSave, enqueue } from "$lib/sync";
  import { getAdminSecret } from "$lib/auth";
  import {
    lineDiff,
    wordDiff,
    toHunks,
    summarize,
    mergeFromPicks,
    hunkLabel,
    type LineOp,
    type HunkPick,
  } from "$lib/diff";
  import type { Topic } from "$lib/types";

  $: conflict = $conflictQueue[0];
  $: queueLength = $conflictQueue.length;

  type Tab = "cherry" | "base" | "local" | "remote" | "manual";
  let activeTab: Tab = "cherry";
  let manualText = "";
  let resolving = false;

  // ── Per-conflict diff state ─────────────────────────────────────────────
  // Recomputed whenever the front of the queue changes.
  let ops: LineOp[] = [];
  let hunks: ReturnType<typeof toHunks> = [];
  let picks: HunkPick[] = [];
  let summary = { add: 0, del: 0, mod: 0, total: 0 };

  $: if (conflict) {
    activeTab = "cherry";
    manualText = conflict.local;
    ops = lineDiff(conflict.local, conflict.remote);
    hunks = toHunks(ops, 2);
    // Default: take remote (server is usually source of truth post-sync).
    // User can flip any individual hunk; bulk toggles below set them all.
    picks = hunks.map(() => "remote");
    summary = summarize(ops);
  }

  // Merged text from current per-hunk picks. Falls through to local if no hunks.
  $: mergedText = hunks.length === 0
    ? (conflict?.local ?? "")
    : mergeFromPicks(ops, hunks, picks);

  function setPick(i: number, p: HunkPick) {
    picks = picks.map((x, j) => (j === i ? p : x));
  }
  function setAllPicks(p: HunkPick) {
    picks = picks.map(() => p);
  }

  function setTab(t: string) { activeTab = t as Tab; }

  // ── Save flow (unchanged from before) ───────────────────────────────────
  async function resolveSingle(c: typeof conflict, chosenText: string) {
    const existing = $topics.find((t) => t.key === c.key);
    const updated: Topic = {
      key: c.key,
      text: chosenText,
      meta: {
        updatedAt: new Date().toISOString(),
        version: (existing?.meta.version ?? 1) + 1,
        syncedRemoteText: c.remote, // store what remote was when we resolved this
      },
    };
    await saveTopic(updated);
    await pushHistory(c.key, chosenText, updated.meta.version, "conflict");
    topics.update((ts) => ts.map((t) => (t.key === c.key ? updated : t)));
    try {
      const secret = await getAdminSecret();
      if (secret) await adminSave($settings.workerHost, c.key, chosenText, secret);
    } catch {
      await enqueue(c.key, chosenText);
    }
  }

  async function resolve(chosenText: string) {
    if (!conflict) return;
    resolving = true;
    try {
      await resolveSingle(conflict, chosenText);
      const key = conflict.key;
      conflictQueue.update((q) => q.slice(1));
      showToast(`Conflict resolved for "${key}"`, "success");
    } catch (err: any) {
      showToast(`Resolution failed: ${err.message}`, "error");
    } finally {
      resolving = false;
    }
  }

  async function resolveAll(which: "local" | "remote") {
    resolving = true;
    const snapshot = [...$conflictQueue];
    let resolved = 0;
    try {
      for (const c of snapshot) {
        const text = which === "local" ? c.local : c.remote;
        try { await resolveSingle(c, text); resolved++; }
        catch (err: any) { showToast(`Failed on "${c.key}": ${err.message}`, "error"); }
      }
      conflictQueue.set([]);
      showToast(
        `Resolved ${resolved} of ${snapshot.length} conflicts (accepted ${which})`,
        "success",
      );
    } finally { resolving = false; }
  }

  function dismiss()    { conflictQueue.update((q) => q.slice(1)); }
  function dismissAll() { conflictQueue.set([]); }

  // The merged-save action — used by the Cherry-pick tab.
  function saveMerged() {
    if (!conflict) return;
    resolve(mergedText);
  }

  // Saving the manual-edit textarea.
  function saveManual() {
    if (!conflict) return;
    resolve(manualText);
  }
</script>

<svelte:window
  on:keydown={(e) => {
    if (resolving || !conflict) return;
    if (
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLInputElement
    ) return;
    if (e.key === "d" || e.key === "D") dismiss();
    if (e.key === "r" || e.key === "R") resolve(conflict.remote);
    if (e.key === "l" || e.key === "L") resolve(conflict.local);
    if (e.key === "m" || e.key === "M") saveMerged();
    if ((e.key === "a" || e.key === "A") && queueLength > 1) resolveAll("remote");
    if ((e.key === "z" || e.key === "Z") && queueLength > 1) resolveAll("local");
  }}
/>

{#if conflict}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Conflict Resolver">
    <div class="modal">
      <!-- ── header ─────────────────────────────────────────── -->
      <div class="modal-header">
        <div class="header-row">
          <h2>⚠ Sync Conflict</h2>
          {#if queueLength > 1}
            <span class="queue-badge">{queueLength} remaining</span>
          {/if}
        </div>
        <p class="modal-sub">
          Topic <code>{conflict.key}</code> has diverged between local and remote.
          Pick a side per change or accept one version wholesale.
        </p>
        {#if queueLength > 1}
          <div class="batch-actions">
            <span class="batch-label">Resolve all at once:</span>
            <button class="btn btn-batch" on:click={() => resolveAll("remote")} disabled={resolving}>
              Accept All Remote [A]
            </button>
            <button class="btn btn-batch" on:click={() => resolveAll("local")} disabled={resolving}>
              Accept All Local [Z]
            </button>
            <button class="btn btn-batch btn-ghost" on:click={dismissAll} disabled={resolving}>
              Dismiss All
            </button>
          </div>
        {/if}
      </div>

      <!-- ── tabs ───────────────────────────────────────────── -->
      <div class="tabs" role="tablist">
        {#each [["cherry","Cherry-pick"],["local","Local (yours)"],["remote","Remote (server)"],["base","Base (common ancestor)"],["manual","Manual Edit"]] as [id, label]}
          <button
            class="tab"
            class:active={activeTab === id}
            role="tab"
            aria-selected={activeTab === id}
            on:click={() => setTab(id)}
          >
            {label}
            {#if id === "cherry" && summary.total > 0}
              <span class="tab-count">{hunks.length}</span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- ── body ───────────────────────────────────────────── -->
      <div class="content-pane" class:content-pane-cherry={activeTab === "cherry"}>
        {#if activeTab === "cherry"}
          {#if hunks.length === 0}
            <p class="empty-note">
              No textual differences detected between local and remote.
            </p>
          {:else}
            <div class="diff-tools">
              <div class="summary">
                <span class="pip pip-add">+{summary.add}</span>
                <span class="pip pip-del">−{summary.del}</span>
                <span class="pip pip-mod">~{summary.mod}</span>
                <span class="summary-text">
                  {hunks.length} change{hunks.length === 1 ? "" : "s"} ·
                  {picks.filter(p => p === "local").length} local /
                  {picks.filter(p => p === "remote").length} remote
                </span>
              </div>
              <div class="diff-nav">
                <button class="btn-sm" on:click={() => setAllPicks("local")}>All local</button>
                <button class="btn-sm" on:click={() => setAllPicks("remote")}>All remote</button>
              </div>
            </div>

            <div class="hunks">
              {#each hunks as h, i (i)}
                <article class={"hunk-card pick-" + picks[i]}>
                  <header class="hunk-head">
                    <span class="hunk-num">#{i + 1}</span>
                    <span class="hunk-label">{hunkLabel(h)}</span>
                    <span class="hunk-meta">
                      {#if h.ops.filter(o => o.type === "mod").length > 0}
                        <span class="pip pip-mod">~{h.ops.filter(o => o.type === "mod").length}</span>
                      {/if}
                      {#if h.ops.filter(o => o.type === "ins").length > 0}
                        <span class="pip pip-add">+{h.ops.filter(o => o.type === "ins").length}</span>
                      {/if}
                      {#if h.ops.filter(o => o.type === "del").length > 0}
                        <span class="pip pip-del">−{h.ops.filter(o => o.type === "del").length}</span>
                      {/if}
                    </span>
                    <span class="spring" />
                    <div class="segment" role="radiogroup" aria-label="Which side to keep">
                      <button
                        class="seg"
                        class:on={picks[i] === "local"}
                        on:click={() => setPick(i, "local")}
                        aria-pressed={picks[i] === "local"}
                      >Keep local</button>
                      <button
                        class="seg"
                        class:on={picks[i] === "remote"}
                        on:click={() => setPick(i, "remote")}
                        aria-pressed={picks[i] === "remote"}
                      >Take remote</button>
                    </div>
                  </header>

                  <pre class="hunk-pre">{#each h.ops as op, j (j)}{#if op.type === "eq"}<div class="hp-row hp-eq">{"  " + (op.a || "\u00A0")}</div>{:else if op.type === "mod"}{@const wp = wordDiff(op.a, op.b)}<div class="hp-row hp-del">{"− "}{#each wp as p, k (k)}{#if p.type === "eq"}<span>{p.text}</span>{:else if p.type === "del"}<span class="word word-del">{p.text}</span>{/if}{/each}</div><div class="hp-row hp-add">{"+ "}{#each wp as p, k (k)}{#if p.type === "eq"}<span>{p.text}</span>{:else if p.type === "ins"}<span class="word word-add">{p.text}</span>{/if}{/each}</div>{:else if op.type === "del"}<div class="hp-row hp-del">{"− " + (op.a || "\u00A0")}</div>{:else if op.type === "ins"}<div class="hp-row hp-add">{"+ " + (op.b || "\u00A0")}</div>{/if}{/each}</pre>
                </article>
              {/each}
            </div>
          {/if}

        {:else if activeTab === "local"}
          <pre class="code-view">{conflict.local}</pre>
        {:else if activeTab === "remote"}
          <pre class="code-view">{conflict.remote}</pre>
        {:else if activeTab === "base"}
          {#if conflict.base}
            <pre class="code-view">{conflict.base}</pre>
          {:else}
            <p class="empty-note">No common base available — topic may be new on one side.</p>
          {/if}
        {:else if activeTab === "manual"}
          <textarea
            class="manual-editor"
            bind:value={manualText}
            spellcheck="false"
            aria-label="Manually edit merged content"
          ></textarea>
        {/if}
      </div>

      <!-- ── actions ────────────────────────────────────────── -->
      <div class="modal-actions">
        <button class="btn btn-ghost" on:click={dismiss} disabled={resolving}>
          {queueLength > 1 ? "Skip [D]" : "Dismiss [D]"}
        </button>
        <span class="spring" />
        {#if activeTab === "cherry"}
          <button class="btn btn-secondary" on:click={() => resolve(conflict.remote)} disabled={resolving}>
            Accept Remote [R]
          </button>
          <button class="btn btn-secondary" on:click={() => resolve(conflict.local)} disabled={resolving}>
            Accept Local [L]
          </button>
          <button class="btn btn-primary" on:click={saveMerged} disabled={resolving || hunks.length === 0}>
            {resolving ? "Saving…" : "Save Merged [M]"}
          </button>
        {:else if activeTab === "manual"}
          <button class="btn btn-secondary" on:click={() => resolve(conflict.remote)} disabled={resolving}>
            Accept Remote [R]
          </button>
          <button class="btn btn-secondary" on:click={() => resolve(conflict.local)} disabled={resolving}>
            Accept Local [L]
          </button>
          <button class="btn btn-primary" on:click={saveManual} disabled={resolving || !manualText.trim()}>
            {resolving ? "Saving…" : "Save Manual"}
          </button>
        {:else}
          <button class="btn btn-secondary" on:click={() => resolve(conflict.remote)} disabled={resolving}>
            Accept Remote [R]
          </button>
          <button class="btn btn-secondary" on:click={() => resolve(conflict.local)} disabled={resolving}>
            Accept Local [L]
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── overlay + modal shell ──────────────────────────── */
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 800;
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: min(960px, 96vw);
    max-height: 88vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  /* ── header ─────────────────────────────────────────── */
  .modal-header { padding: 1.1rem 1.4rem 0; flex-shrink: 0; }
  .modal-header h2 {
    font-size: 1.05rem; font-weight: 700;
    color: #ffb74d; margin: 0;
  }
  .modal-sub {
    font-size: 0.83rem; color: var(--fg-muted);
    margin: 0; line-height: 1.5;
  }
  .header-row {
    display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.3rem;
  }
  code {
    font-family: var(--font-mono); font-size: 0.85em;
    background: var(--surface2); padding: 0.1em 0.35em;
    border-radius: 3px; color: var(--accent);
  }
  .queue-badge {
    background: var(--accent); color: var(--bg);
    font-size: 0.7rem; font-weight: 700;
    padding: 0.12rem 0.55rem; border-radius: 999px;
  }

  /* batch */
  .batch-actions {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
    margin-top: 0.55rem; padding: 0.55rem 0.7rem;
    background: var(--surface2); border-radius: 6px;
  }
  .batch-label {
    font-size: 0.76rem; color: var(--fg-muted);
    font-weight: 600; white-space: nowrap;
  }

  /* ── tabs ───────────────────────────────────────────── */
  .tabs {
    display: flex; gap: 0; padding: 0.75rem 1.4rem 0;
    border-bottom: 1px solid var(--border);
    overflow-x: auto; flex-shrink: 0;
  }
  .tab {
    padding: 0.45rem 0.85rem;
    font-size: 0.82rem; font-weight: 600;
    background: none; border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-muted);
    cursor: pointer; white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-display);
  }
  .tab:hover { color: var(--fg); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 5px;
    background: var(--surface2); color: var(--fg);
    border-radius: 9px; font-size: 10.5px; font-weight: 700;
  }
  .tab.active .tab-count { background: var(--accent); color: #1a1a1e; }

  /* ── body ───────────────────────────────────────────── */
  .content-pane {
    flex: 1; overflow: auto; padding: 1rem 1.4rem; min-height: 200px;
  }
  .content-pane-cherry {
    padding: 0; background: var(--bg);
  }
  .code-view {
    margin: 0; font-family: var(--font-mono);
    font-size: 0.82rem; line-height: 1.6;
    white-space: pre-wrap; word-break: break-word;
    color: var(--fg); background: var(--bg);
    padding: 0.75rem; border-radius: 6px;
    border: 1px solid var(--border);
  }
  .manual-editor {
    width: 100%; min-height: 240px; height: 100%;
    background: var(--bg); color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.75rem;
    font-family: var(--font-mono); font-size: 0.82rem; line-height: 1.6;
    resize: vertical; outline: none; box-sizing: border-box;
  }
  .manual-editor:focus { border-color: var(--accent); }
  .empty-note {
    color: var(--fg-muted); font-size: 0.875rem;
    font-style: italic; text-align: center; padding: 2rem;
  }

  /* ── diff tools bar (cherry-pick) ───────────────────── */
  .diff-tools {
    display: flex; align-items: center; gap: 14px;
    padding: 0.6rem 1.4rem;
    background: var(--bg); border-bottom: 1px solid var(--border);
  }
  .summary { display: flex; align-items: center; gap: 6px; }
  .summary-text { color: var(--fg-muted); font-size: 12px; margin-left: 6px; }
  .diff-nav { margin-left: auto; display: flex; gap: 8px; }
  .pip {
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 11px; font-weight: 700;
    padding: 1px 7px; border-radius: 4px; min-width: 30px; line-height: 1.4;
  }
  .pip-add { color: #9ed4a3; background: rgba(90, 154, 96, 0.32); }
  .pip-del { color: #e69b9b; background: rgba(192, 80, 80, 0.32); }
  .pip-mod { color: var(--accent); background: rgba(201, 168, 76, 0.22); }
  .btn-sm {
    background: var(--surface2); color: var(--fg);
    border: 1px solid var(--border);
    font-size: 11.5px; padding: 4px 9px; border-radius: 4px;
    cursor: pointer; font-family: var(--font-display);
  }
  .btn-sm:hover { background: var(--border); }

  /* ── hunk cards ─────────────────────────────────────── */
  .hunks {
    padding: 14px 1.4rem 1.4rem;
    display: flex; flex-direction: column; gap: 12px;
  }
  .hunk-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px; overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .hunk-card.pick-local  { border-color: rgba(201, 168, 76, 0.4); box-shadow: inset 3px 0 0 var(--accent); }
  .hunk-card.pick-remote { border-color: rgba(122, 107, 176, 0.5); box-shadow: inset 3px 0 0 var(--accent2); }
  .hunk-head {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
  }
  .hunk-num {
    font-family: var(--font-mono); font-size: 11px; color: var(--fg-muted);
    padding: 2px 6px; background: var(--bg); border-radius: 3px;
  }
  .hunk-label {
    font-family: var(--font-mono); font-size: 12px; font-weight: 700;
    color: var(--accent);
  }
  .hunk-meta { display: inline-flex; gap: 4px; }
  .spring { flex: 1; }

  .segment {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 5px; overflow: hidden;
  }
  .seg {
    padding: 4px 10px; background: var(--bg); color: var(--fg-muted);
    border: none; cursor: pointer;
    font-family: var(--font-display); font-size: 11.5px; font-weight: 600;
    transition: background 0.12s, color 0.12s;
  }
  .seg + .seg { border-left: 1px solid var(--border); }
  .seg.on:first-child { background: var(--accent);  color: #111; }
  .seg.on:last-child  { background: var(--accent2); color: #fff; }
  .seg:not(.on):hover { color: var(--fg); background: var(--surface2); }

  .hunk-pre {
    margin: 0; padding: 8px 0;
    font-family: var(--font-mono); font-size: 12px; line-height: 1.6;
    overflow-x: auto;
  }
  .hp-row { padding: 0 14px; white-space: pre-wrap; word-break: break-word; }
  .hp-eq  { color: #6b6676; }
  .hp-add { background: rgba(90, 154, 96, 0.14); color: #9ed4a3; }
  .hp-del { background: rgba(192, 80, 80, 0.13); color: #e69b9b; }

  /* intra-line word highlight */
  .word { border-radius: 2px; padding: 0 2px; }
  .word-add {
    background: rgba(90, 154, 96, 0.42); color: #e8f5ea;
  }
  .word-del {
    background: rgba(192, 80, 80, 0.42); color: #fbe6e6;
    text-decoration: line-through;
    text-decoration-thickness: 1px;
    text-decoration-color: rgba(245, 212, 212, 0.5);
  }

  /* ── footer ─────────────────────────────────────────── */
  .modal-actions {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.85rem 1.4rem;
    border-top: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }

  .btn-batch { font-size: 0.78rem; padding: 0.3rem 0.65rem; }
</style>
