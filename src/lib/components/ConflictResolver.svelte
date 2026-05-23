<script lang="ts">
  import { conflictQueue, topics, showToast, settings } from "$lib/stores";
  import { saveTopic } from "$lib/storage";
  import { adminSave, enqueue } from "$lib/sync";
  import { getAdminSecret } from "$lib/auth";
  import type { Topic } from "$lib/types";

  $: conflict = $conflictQueue[0];
  $: queueLength = $conflictQueue.length;

  type Tab = "base" | "local" | "remote" | "manual";
  let activeTab: Tab = "local";
  let manualText = "";
  let resolving = false;

  // Reset view whenever the front of the queue changes
  $: if (conflict) {
    activeTab = "local";
    manualText = conflict.local;
  }

  function setTab(t: string) {
    activeTab = t as Tab;
  }

  function diff(a: string, b: string): string {
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    const result: string[] = [];
    const maxLen = Math.max(aLines.length, bLines.length);
    for (let i = 0; i < maxLen; i++) {
      const aLine = aLines[i] ?? "";
      const bLine = bLines[i] ?? "";
      if (aLine === bLine) {
        result.push(`  ${bLine}`);
      } else if (aLine && !bLine) {
        result.push(`- ${aLine}`);
      } else if (!aLine && bLine) {
        result.push(`+ ${bLine}`);
      } else {
        result.push(`- ${aLine}`);
        result.push(`+ ${bLine}`);
      }
    }
    return result.join("\n");
  }

  // Core save logic, reused by single and batch resolve
  async function resolveSingle(c: typeof conflict, chosenText: string) {
    const existing = $topics.find((t) => t.key === c.key);
    const updated: Topic = {
      key: c.key,
      text: chosenText,
      meta: {
        updatedAt: new Date().toISOString(),
        version: (existing?.meta.version ?? 1) + 1,
      },
    };
    await saveTopic(updated);
    topics.update((ts) => ts.map((t) => (t.key === c.key ? updated : t)));
    try {
      const secret = await getAdminSecret();
      if (secret)
        await adminSave($settings.workerHost, c.key, chosenText, secret);
    } catch {
      await enqueue(c.key, chosenText);
    }
  }

  // Resolve current conflict and advance queue
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

  // Batch resolve all queued conflicts at once
  async function resolveAll(which: "local" | "remote") {
    resolving = true;
    const snapshot = [...$conflictQueue];
    let resolved = 0;
    try {
      for (const c of snapshot) {
        const text = which === "local" ? c.local : c.remote;
        try {
          await resolveSingle(c, text);
          resolved++;
        } catch (err: any) {
          showToast(`Failed on "${c.key}": ${err.message}`, "error");
        }
      }
      conflictQueue.set([]);
      showToast(
        `Resolved ${resolved} of ${snapshot.length} conflicts (accepted ${which})`,
        "success",
      );
    } finally {
      resolving = false;
    }
  }

  // Skip current, keep rest in queue
  function dismiss() {
    conflictQueue.update((q) => q.slice(1));
  }

  // Wipe the whole queue without saving anything
  function dismissAll() {
    conflictQueue.set([]);
  }

  $: diffLocalRemote = conflict ? diff(conflict.local, conflict.remote) : "";
</script>

<svelte:window
  on:keydown={(e) => {
    if (resolving || !conflict) return;
    if (
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLInputElement
    )
      return;
    if (e.key === "d" || e.key === "D") dismiss();
    if (e.key === "r" || e.key === "R") resolve(conflict.remote);
    if (e.key === "l" || e.key === "L") resolve(conflict.local);
    if ((e.key === "a" || e.key === "A") && queueLength > 1)
      resolveAll("remote");
    if ((e.key === "z" || e.key === "Z") && queueLength > 1)
      resolveAll("local");
  }}
/>

{#if conflict}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Conflict Resolver"
  >
    <div class="modal">
      <div class="modal-header">
        <div class="header-row">
          <h2>⚠ Sync Conflict</h2>
          {#if queueLength > 1}
            <span class="queue-badge">{queueLength} remaining</span>
          {/if}
        </div>
        <p class="modal-sub">
          Topic <code>{conflict.key}</code> has diverged between local and remote.
          Choose which version to keep.
        </p>
        {#if queueLength > 1}
          <div class="batch-actions">
            <span class="batch-label">Resolve all at once:</span>
            <button
              class="btn btn-batch"
              on:click={() => resolveAll("remote")}
              disabled={resolving}
            >
              Accept All Remote [A]
            </button>
            <button
              class="btn btn-batch"
              on:click={() => resolveAll("local")}
              disabled={resolving}
            >
              Accept All Local [Z]
            </button>
            <button
              class="btn btn-batch btn-ghost"
              on:click={dismissAll}
              disabled={resolving}
            >
              Dismiss All
            </button>
          </div>
        {/if}
      </div>

      <div class="tabs" role="tablist">
        {#each [["local", "Local (yours)"], ["remote", "Remote (server)"], ["base", "Base (common ancestor)"], ["manual", "Manual Edit"]] as [id, label]}
          <button
            class="tab"
            class:active={activeTab === id}
            role="tab"
            aria-selected={activeTab === id}
            on:click={() => setTab(id)}
          >
            {label}
          </button>
        {/each}
      </div>

      <div class="content-pane">
        {#if activeTab === "local"}
          <pre class="code-view">{conflict.local}</pre>
        {:else if activeTab === "remote"}
          <pre class="code-view">{conflict.remote}</pre>
        {:else if activeTab === "base"}
          {#if conflict.base}
            <pre class="code-view">{conflict.base}</pre>
          {:else}
            <p class="empty-note">
              No common base available — topic may be new on one side.
            </p>
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

      {#if activeTab !== "manual"}
        <details class="diff-details">
          <summary>Show diff (local vs remote)</summary>
          <pre class="diff-view">{diffLocalRemote}</pre>
        </details>
      {/if}

      <div class="modal-actions">
        <button class="btn btn-ghost" on:click={dismiss} disabled={resolving}>
          {queueLength > 1 ? "Skip [D]" : "Dismiss [D]"}
        </button>
        <button
          class="btn btn-secondary"
          on:click={() => resolve(conflict.remote)}
          disabled={resolving}
        >
          Accept Remote [R]
        </button>
        <button
          class="btn btn-secondary"
          on:click={() => resolve(conflict.local)}
          disabled={resolving}
        >
          Accept Local [L]
        </button>
        {#if activeTab === "manual"}
          <button
            class="btn btn-primary"
            on:click={() => resolve(manualText)}
            disabled={resolving || !manualText.trim()}
          >
            {resolving ? "Saving…" : "Save Manual"}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── existing styles unchanged ── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: min(800px, 95vw);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .modal-header {
    padding: 1.25rem 1.5rem 0;
    flex-shrink: 0;
  }
  .modal-header h2 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #ffb74d;
    margin: 0 0 0.35rem;
  }
  .modal-sub {
    font-size: 0.85rem;
    color: var(--fg-muted);
    margin: 0;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.85em;
    background: var(--surface2);
    padding: 0.1em 0.35em;
    border-radius: 3px;
    color: var(--accent);
  }
  .tabs {
    display: flex;
    gap: 0;
    padding: 0.75rem 1.5rem 0;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    flex-shrink: 0;
  }
  .tab {
    padding: 0.45rem 0.9rem;
    font-size: 0.83rem;
    font-weight: 600;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-muted);
    cursor: pointer;
    white-space: nowrap;
    transition:
      color 0.15s,
      border-color 0.15s;
    margin-bottom: -1px;
  }
  .tab:hover {
    color: var(--fg);
  }
  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
  .content-pane {
    flex: 1;
    overflow: auto;
    padding: 1rem 1.5rem;
    min-height: 200px;
  }
  .code-view {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.82rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--fg);
    background: var(--bg);
    padding: 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .manual-editor {
    width: 100%;
    min-height: 240px;
    height: 100%;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.82rem;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }
  .manual-editor:focus {
    border-color: var(--accent);
  }
  .diff-details {
    padding: 0 1.5rem 0.5rem;
  }
  .diff-details summary {
    font-size: 0.8rem;
    color: var(--fg-muted);
    cursor: pointer;
    user-select: none;
  }
  .diff-view {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0.5rem 0 0;
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg);
    padding: 0.65rem;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .empty-note {
    color: var(--fg-muted);
    font-size: 0.875rem;
    font-style: italic;
    text-align: center;
    padding: 2rem;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  /* ── NEW: batch styles ── */
  .header-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.35rem;
  }
  .queue-badge {
    background: var(--accent);
    color: var(--bg);
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
  }
  .batch-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.6rem;
    padding: 0.6rem 0.75rem;
    background: var(--surface2);
    border-radius: 6px;
  }
  .batch-label {
    font-size: 0.78rem;
    color: var(--fg-muted);
    font-weight: 600;
    white-space: nowrap;
  }
  .btn-batch {
    font-size: 0.78rem;
    padding: 0.3rem 0.65rem;
  }
</style>
