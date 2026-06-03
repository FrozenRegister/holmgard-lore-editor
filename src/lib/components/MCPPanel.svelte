<script lang="ts">
  import { mcpOpen, settings } from '$lib/stores';
  import { callTool } from '$lib/mcp';
  import { fly } from 'svelte/transition';

  let method = 'list_topics';
  let paramsText = '{}';
  let busy = false;
  let error: string | null = null;

  let history: {
    id: number;
    method: string;
    params: unknown;
    result: unknown;
    ms: number;
  }[] = [];

  let nextId = 1;

  async function run() {
    error = null;

    let params: unknown = {};
    if (paramsText.trim()) {
      try {
        params = JSON.parse(paramsText);
      } catch (e) {
        error = 'Params must be valid JSON';
        return;
      }
    }

    busy = true;
    const start = performance.now();

    try {
      const res = await callTool(
        $settings.workerHost,
        method,
        params as Record<string, unknown>
      );

      const ms = Math.round(performance.now() - start);

      history = [
        {
          id: nextId++,
          method,
          params,
          result: res,
          ms,
        },
        ...history,
      ];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      busy = false;
    }
  }
</script>

{#if $mcpOpen}
  <div
    class="mcp-panel"
    transition:fly={{ x: 40, duration: 150 }}
  >
    <header class="panel-header">
      <h2>MCP Tool Console</h2>
      <button class="close-btn" on:click={() => mcpOpen.set(false)}>✕</button>
    </header>

    <section class="controls">
      <label>
        <span>Method</span>
        <input bind:value={method} />
      </label>

      <label>
        <span>Params (JSON)</span>
        <textarea rows="4" bind:value={paramsText} />
      </label>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button class="run-btn" on:click={run} disabled={busy}>
        {busy ? 'Running…' : 'Run Tool'}
      </button>
    </section>

    <section class="history">
      {#each history as entry}
        <div class="entry">
          <div class="entry-header">
            <code>{entry.method}</code>
            <span>{entry.ms} ms</span>
          </div>
          <pre>{JSON.stringify(entry.result, null, 2)}</pre>
        </div>
      {/each}
    </section>
  </div>
{/if}

<style>
  .mcp-panel {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(420px, 100%);
    background: var(--surface);
    border-left: 1px solid var(--border);
    z-index: 500;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    color: var(--fg-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 6px;
  }

  .close-btn:hover {
    background: var(--surface2);
    color: var(--fg);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  input,
  textarea {
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    padding: 0.4rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--fg);
  }

  .run-btn {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: none;
    background: var(--accent);
    color: black;
    font-weight: 600;
    cursor: pointer;
  }

  .run-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .error {
    color: #f87171;
    font-size: 0.8rem;
  }

  .history {
    margin-top: 1rem;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .entry {
    background: var(--surface2);
    border: 1px solid var(--border);
    padding: 0.5rem;
    border-radius: 6px;
  }

  .entry-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.25rem;
  }

  pre {
    margin: 0;
    font-size: 0.75rem;
    white-space: pre-wrap;
  }
</style>
