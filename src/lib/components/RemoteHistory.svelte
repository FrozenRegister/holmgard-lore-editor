<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TopicSnapshot } from '$lib/types';

  export let snapshots: TopicSnapshot[] = [];
  export let currentText: string = '';
  export let loading: boolean = false;
  export let error: string | null = null;

  const dispatch = createEventDispatcher<{ restore: string }>();

  let expandedIndex: number | null = null;

  function toggleExpand(i: number) {
    expandedIndex = expandedIndex === i ? null : i;
  }

  function getDiffStats(oldText: string, newText: string): { added: number; removed: number } {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    let added = 0;
    let removed = 0;

    // Simple line-based diff
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    for (const line of newLines) {
      if (!oldSet.has(line)) added++;
    }
    for (const line of oldLines) {
      if (!newSet.has(line)) removed++;
    }

    return { added, removed };
  }

  function highlightDiff(oldText: string, newText: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const lines: string[] = [];

    // Simple diff: mark each line as removed (-), added (+), or unchanged ( )
    const maxLen = Math.max(oldLines.length, newLines.length);
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldIdx < oldLines.length ? oldLines[oldIdx] : null;
      const newLine = newIdx < newLines.length ? newLines[newIdx] : null;

      if (oldLine === newLine) {
        // Lines match, skip both
        if (oldLine !== null) {
          lines.push(`  ${oldLine}`);
        }
        oldIdx++;
        newIdx++;
      } else if (oldLine === null) {
        // Only new lines remain
        lines.push(`+ ${newLine}`);
        newIdx++;
      } else if (newLine === null) {
        // Only old lines remain
        lines.push(`- ${oldLine}`);
        oldIdx++;
      } else {
        // Lines differ; show both (removed first, then added)
        lines.push(`- ${oldLine}`);
        lines.push(`+ ${newLine}`);
        oldIdx++;
        newIdx++;
      }

      if (lines.length >= 20) break;
    }

    return lines.slice(0, 20).join('\n') + (oldIdx < oldLines.length || newIdx < newLines.length ? '\n... (truncated)' : '');
  }
</script>

{#if loading}
  <div class="loading-state">
    <p>Loading remote history…</p>
  </div>
{:else if error}
  <div class="error-state">
    <p>Error: {error}</p>
  </div>
{:else if snapshots.length === 0}
  <div class="empty-state">
    <p>No remote snapshots found.</p>
  </div>
{:else}
  <ul class="snapshot-list">
    {#each snapshots as snapshot, i}
      {@const diffStats = getDiffStats(snapshot.text, currentText)}
      <li class="snapshot-item">
        <button class="snapshot-header" on:click={() => toggleExpand(i)}>
          <span class="expand-icon">{expandedIndex === i ? '▼' : '▶'}</span>
          <span class="snapshot-meta">
            <span class="version">v{snapshot.meta.version ?? '?'}</span>
            <span class="updated">{new Date(snapshot.meta.updatedAt).toLocaleString()}</span>
          </span>
          <span class="diff-stats">
            {#if diffStats.added > 0 || diffStats.removed > 0}
              <span class="stat added" title="Lines added">+{diffStats.added}</span>
              <span class="stat removed" title="Lines removed">-{diffStats.removed}</span>
            {:else}
              <span class="stat unchanged">No changes</span>
            {/if}
          </span>
        </button>

        {#if expandedIndex === i}
          <div class="snapshot-details">
            <div class="diff-preview">
              <pre><code>{highlightDiff(snapshot.text, currentText)}</code></pre>
            </div>
            <button
              class="btn btn-secondary btn-sm"
              on:click={() => dispatch('restore', snapshot.text)}
            >
              Restore This Version
            </button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .loading-state,
  .error-state,
  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--fg-muted);
  }

  .error-state {
    color: #f87171;
  }

  .snapshot-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    height: 100%;
  }

  .snapshot-item {
    border-bottom: 1px solid var(--border);
  }

  .snapshot-header {
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--fg);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    transition: background-color 0.15s;
  }

  .snapshot-header:hover {
    background-color: var(--surface2);
  }

  .expand-icon {
    display: inline-flex;
    min-width: 1rem;
    font-size: 0.7rem;
    color: var(--fg-muted);
  }

  .snapshot-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .version {
    font-weight: 600;
    color: var(--accent);
    font-size: 0.9rem;
  }

  .updated {
    font-size: 0.8rem;
    color: var(--fg-muted);
  }

  .diff-stats {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-shrink: 0;
  }

  .stat {
    font-size: 0.75rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .stat.added {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .stat.removed {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .stat.unchanged {
    color: var(--fg-muted);
    font-size: 0.7rem;
  }

  .snapshot-details {
    padding: 1rem;
    background: var(--surface2);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .diff-preview {
    background: var(--surface3, rgba(0, 0, 0, 0.1));
    border-radius: 4px;
    overflow: hidden;
    max-height: 300px;
    overflow-y: auto;
  }

  .diff-preview pre {
    margin: 0;
    padding: 0.75rem;
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .diff-preview code {
    font-family: var(--font-mono, monospace);
    display: block;
  }

  .diff-preview :global(pre) {
    background: transparent;
  }

  /* Diff line coloring */
  .diff-preview :global(code) {
    --removed-bg: rgba(239, 68, 68, 0.1);
    --added-bg: rgba(34, 197, 94, 0.1);
  }

  :global(.btn) {
    padding: 0.4rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.15s;
  }

  :global(.btn-secondary) {
    background: var(--surface3, rgba(0, 0, 0, 0.15));
    color: var(--fg);
  }

  :global(.btn-secondary:hover) {
    background: var(--border);
  }
</style>
