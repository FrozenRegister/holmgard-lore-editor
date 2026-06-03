<script lang="ts">
  import { onMount } from 'svelte';
  import { mcpOpen, settings } from '$lib/stores';
  import { callTool, listTools, type Tool } from '$lib/mcp';
  import { fly } from 'svelte/transition';
  import hljs from 'highlight.js';

  let method = 'list_topics';
  let paramsText = '{}';
  let busy = false;
  let error: string | null = null;
  let toolsLoading = false;
  let tools: Tool[] = [];
  let expandedEntries = new Set<number>();

  let history: {
    id: number;
    method: string;
    params: unknown;
    result: unknown;
    ms: number;
  }[] = [];

  let nextId = 1;

  onMount(async () => {
    try {
      toolsLoading = true;
      tools = await listTools($settings.workerHost);
    } catch (e) {
      console.error('Failed to load tools:', e);
    } finally {
      toolsLoading = false;
    }
  });

  function toggleEntry(id: number) {
    if (expandedEntries.has(id)) {
      expandedEntries.delete(id);
    } else {
      expandedEntries.add(id);
    }
    expandedEntries = expandedEntries;
  }

  function highlightJSON(json: unknown): string {
    const text = JSON.stringify(json, null, 2);
    return hljs.highlight(text, { language: 'json' }).value;
  }

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
        <div class="method-input-group">
          <input
            list="tools-list"
            bind:value={method}
            placeholder="Enter method or select from dropdown"
          />
          <datalist id="tools-list">
            {#each tools as tool}
              <option value={tool.name}>{tool.description || tool.name}</option>
            {/each}
          </datalist>
          {#if tools.length > 0}
            <select bind:value={method} class="method-select" title="Quick select a tool">
              <option value="" disabled selected>Select a tool...</option>
              {#each tools as tool}
                <option value={tool.name}>{tool.name}</option>
              {/each}
            </select>
          {/if}
        </div>
      </label>

      <label>
        <span>Params (JSON)</span>
        <textarea rows="4" bind:value={paramsText} />
      </label>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button class="run-btn" on:click={run} disabled={busy || toolsLoading}>
        {busy ? 'Running…' : toolsLoading ? 'Loading tools…' : 'Run Tool'}
      </button>
    </section>

    <section class="history">
      {#each history as entry}
        <div class="entry">
          <button
            class="entry-header"
            on:click={() => toggleEntry(entry.id)}
            title={expandedEntries.has(entry.id) ? 'Collapse' : 'Expand'}
          >
            <span class="collapse-icon">
              {expandedEntries.has(entry.id) ? '▼' : '▶'}
            </span>
            <code>{entry.method}</code>
            <span class="ms">{entry.ms} ms</span>
          </button>
          {#if expandedEntries.has(entry.id)}
            <pre class="json-result"><code>{@html highlightJSON(entry.result)}</code></pre>
          {/if}
        </div>
      {/each}
    </section>
  </div>
{/if}

<style>
  :global(.hljs) {
    background: transparent;
    color: var(--fg);
  }

  :global(.hljs-string) {
    color: #a6e22e;
  }

  :global(.hljs-number) {
    color: #ae81ff;
  }

  :global(.hljs-literal) {
    color: #66d9ef;
  }

  :global(.hljs-attr) {
    color: #a1efe4;
  }

  :global(.hljs-punctuation) {
    color: var(--fg-muted);
  }

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

  .method-input-group {
    display: flex;
    gap: 0.5rem;
  }

  input,
  textarea,
  select {
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    padding: 0.4rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--fg);
  }

  input {
    flex: 1;
    min-width: 0;
  }

  .method-select {
    flex: 0 0 auto;
    min-width: fit-content;
    cursor: pointer;
  }

  textarea {
    font-family: var(--font-mono, monospace);
    resize: vertical;
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
    border-radius: 6px;
    overflow: hidden;
  }

  .entry-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    background: none;
    border: none;
    color: var(--fg);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    transition: background-color 0.15s;
  }

  .entry-header:hover {
    background-color: var(--surface3, rgba(255, 255, 255, 0.05));
  }

  .collapse-icon {
    display: inline-flex;
    min-width: 1rem;
    font-size: 0.7rem;
  }

  .entry-header code {
    flex: 1;
    font-size: 0.85rem;
  }

  .entry-header .ms {
    white-space: nowrap;
    font-size: 0.75rem;
    color: var(--fg-muted);
  }

  .json-result {
    margin: 0;
    padding: 0.5rem;
    background: var(--surface3, rgba(0, 0, 0, 0.2));
    font-size: 0.7rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    border-top: 1px solid var(--border);
    max-height: 300px;
    overflow-y: auto;
  }

  .json-result code {
    font-family: var(--font-mono, monospace);
  }
</style>
