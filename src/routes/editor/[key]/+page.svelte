<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { topics, syncState, settings, showToast, isMobile } from '$lib/stores';
  import { saveTopic, loadTopic } from '$lib/storage';
  import { pushHistory, loadHistory } from '$lib/history';
  import { adminSave, enqueue } from '$lib/sync';
  import { getAdminSecret } from '$lib/auth';
  import { renderMarkdown } from '$lib/marked-config';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
  import EventTimeline from '$lib/components/EventTimeline.svelte';
  import { callTool } from '$lib/mcp';
  import type { Topic, HistoryEntry, McpEvent, ActiveThread } from '$lib/types';

  // ── Route param ───────────────────────────────────────────────────────────────
  $: key = $page.params.key ? decodeURIComponent($page.params.key) : '';

  // ── State ─────────────────────────────────────────────────────────────────────
  let topic: Topic | null = null;
  let editorText = '';
  let isSaving = false;
  let isSyncing = false;
  let isDirty = false;
  let showPreview = true;
  let showHistory = false;
  let historyEntries: HistoryEntry[] = [];
  let showEventLog = false;
  let eventLogEntries: McpEvent[] = [];
  let eventLogLoading = false;
  let eventLogError: string | null = null;
  let eventLogThreadFilter = '';
  let availableThreads: ActiveThread[] = [];
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  const AUTOSAVE_DELAY = 5000;

  // ── Load topic ────────────────────────────────────────────────────────────────
  $: if (key) loadCurrent();

  async function loadCurrent() {
    const t = await loadTopic(key);
    if (!t) {
      const found = $topics.find((x) => x.key === key);
      if (found) {
        topic = found;
        editorText = found.text;
      } else {
        showToast(`Topic "${key}" not found`, 'error');
        goto('/');
      }
    } else {
      topic = t;
      editorText = t.text;
    }
    isDirty = false;
  }

  // ── Autosave ──────────────────────────────────────────────────────────────────
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(performSave, AUTOSAVE_DELAY);
  }

  function handleEditorChange(event: CustomEvent<string>) {
    editorText = event.detail;
    isDirty = true;
    scheduleAutosave();
  }

  async function performSave() {
    if (!topic || !isDirty) return;
    isSaving = true;
    try {
      const updated: Topic = {
        ...topic,
        text: editorText,
        meta: {
          ...topic.meta,
          updatedAt: new Date().toISOString(),
          version: topic.meta.version + 1,
        },
      };
      await saveTopic(updated);
      await pushHistory(key, editorText, updated.meta.version, 'local');
      topic = updated;
      isDirty = false;
      topics.update((ts) => ts.map((t) => (t.key === key ? updated : t)));
    } catch (err) {
      console.error('Save error:', err);
      showToast('Save failed', 'error');
    } finally {
      isSaving = false;
    }
  }

  // ── Sync to remote ────────────────────────────────────────────────────────────
  async function syncTopic() {
    if (!topic) return;
    if (isDirty) await performSave();
    isSyncing = true;
    syncState.set({ status: 'syncing' });
    try {
      const secret = await getAdminSecret();
      if (!secret) {
        showToast('No admin secret — configure it in Settings', 'warning');
        return;
      }
      await adminSave($settings.workerHost, topic!.key, topic!.text, secret);
      const now = new Date().toISOString();
      const synced: Topic = { ...topic!, meta: { ...topic!.meta, syncedAt: now } };
      await saveTopic(synced);
      topic = synced;
      topics.update((ts) => ts.map((t) => (t.key === key ? synced : t)));
      syncState.set({ status: 'success', lastSync: now });
      showToast('Synced to remote', 'success');
    } catch (err: any) {
      syncState.set({ status: 'error', error: err.message });
      await enqueue(topic!.key, topic!.text);
      showToast('Sync failed — added to offline queue', 'warning');
    } finally {
      isSyncing = false;
    }
  }

  // ── Version history ───────────────────────────────────────────────────────────
  async function openHistory() {
    showEventLog = false;
    historyEntries = await loadHistory(key);
    showHistory = true;
  }

  // ── Event log ─────────────────────────────────────────────────────────────────
  async function openEventLog() {
    showHistory = false;
    showEventLog = true;
    if (availableThreads.length === 0) {
      try {
        const secret = await getAdminSecret();
        const r = await callTool<{ threads: ActiveThread[] }>($settings.workerHost, 'list_active_threads', {}, secret ?? undefined);
        availableThreads = r.threads ?? [];
      } catch { /* non-fatal; filter just won't populate */ }
    }
    await loadEventLog();
  }

  async function loadEventLog() {
    eventLogLoading = true;
    eventLogError = null;
    try {
      const secret = await getAdminSecret();
      const args: Record<string, unknown> = { entity_key: key, limit: 100 };
      if (eventLogThreadFilter) args.thread = eventLogThreadFilter;
      const r = await callTool<{ events: McpEvent[] }>($settings.workerHost, 'get_event_log', args, secret ?? undefined);
      eventLogEntries = r.events ?? [];
    } catch (err: any) {
      eventLogError = err.message ?? 'Failed to load events';
    } finally {
      eventLogLoading = false;
    }
  }

  function restoreVersion(entry: HistoryEntry) {
    editorText = entry.text;
    isDirty = true;
    scheduleAutosave();
    showHistory = false;
    showToast(`Restored version ${entry.version}`, 'info');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  onDestroy(() => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (isDirty) performSave();
  });
</script>

<svelte:window on:beforeunload={(e) => { if (!$isMobile && isDirty) { e.preventDefault(); e.returnValue = ''; } }} />

<div class="editor-page">
  <!-- Toolbar -->
  <div class="editor-toolbar">
    <button class="btn btn-ghost btn-sm" on:click={() => goto('/')} aria-label="Back">
      ← Topics
    </button>
    <h2 class="topic-key">{key}</h2>

    {#if $isMobile}
      <!-- Mobile: read-only indicator only -->
      <span class="status-badge read-only-badge">Read Only</span>
    {:else}
      <!-- Desktop: full edit controls -->
      <div class="toolbar-right">
        {#if isSaving}
          <span class="status-badge saving">Saving…</span>
        {:else if isDirty}
          <span class="status-badge dirty">Unsaved</span>
        {:else}
          <span class="status-badge saved">Saved</span>
        {/if}
        <button class="btn btn-ghost btn-sm" on:click={() => (showPreview = !showPreview)}>
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
        <button class="btn btn-ghost btn-sm" on:click={openHistory}>History</button>
        <button class="btn btn-ghost btn-sm" on:click={openEventLog}>Event Log</button>
        <button class="btn btn-ghost btn-sm" on:click={performSave} disabled={!isDirty || isSaving}>
          Save
        </button>
        <button class="btn btn-primary btn-sm" on:click={syncTopic} disabled={isSyncing}>
          {isSyncing ? 'Syncing…' : 'Sync ↑'}
        </button>
      </div>
    {/if}
  </div>

  {#if $isMobile}
    <!-- Mobile: full-height preview, no editor -->
    <div class="preview-full">
      <MarkdownPreview markdown={editorText} />
    </div>
  {:else}
    <!-- Desktop: side-by-side editor / preview -->
    <div class="editor-body" class:preview-hidden={!showPreview}>
      <div class="editor-pane">
        {#if topic !== null}
          <MonacoEditor value={editorText} on:change={handleEditorChange} />
        {/if}
      </div>
      {#if showPreview}
        <div class="preview-pane">
          <MarkdownPreview markdown={editorText} />
        </div>
      {/if}
    </div>
  {/if}

  <!-- Footer meta -->
  {#if topic}
    <div class="editor-footer">
      <span>v{topic.meta.version}</span>
      <span>·</span>
      <span>Updated {new Date(topic.meta.updatedAt).toLocaleString()}</span>
      {#if topic.meta.syncedAt}
        <span>· Synced {new Date(topic.meta.syncedAt).toLocaleString()}</span>
      {/if}
    </div>
  {/if}
</div>

<!-- Event log drawer (desktop only) -->
{#if !$isMobile && showEventLog}
  <div class="history-overlay" role="dialog" aria-modal="true" aria-label="Event Log">
    <div class="history-panel">
      <div class="history-header">
        <h3>Event Log</h3>
        <div class="evlog-controls">
          <select
            class="thread-select"
            bind:value={eventLogThreadFilter}
            on:change={loadEventLog}
            aria-label="Filter by thread"
          >
            <option value="">All threads</option>
            {#each availableThreads as t}
              <option value={t.thread_name}>{t.thread_name}</option>
            {/each}
          </select>
          <button class="btn-icon" on:click={loadEventLog} aria-label="Refresh" title="Refresh" disabled={eventLogLoading}>↻</button>
          <button class="btn-icon" on:click={() => (showEventLog = false)} aria-label="Close">✕</button>
        </div>
      </div>
      <div class="evlog-body">
        <EventTimeline events={eventLogEntries} loading={eventLogLoading} error={eventLogError} />
      </div>
    </div>
  </div>
{/if}

<!-- Version history drawer (desktop only) -->
{#if !$isMobile && showHistory}
  <div class="history-overlay" role="dialog" aria-modal="true" aria-label="Version History">
    <div class="history-panel">
      <div class="history-header">
        <h3>Version History</h3>
        <button class="btn-icon" on:click={() => (showHistory = false)} aria-label="Close">✕</button>
      </div>
      {#if historyEntries.length === 0}
        <p class="empty-hist">No history saved yet.</p>
      {:else}
        <ul class="history-list">
          {#each historyEntries as entry}
            <li>
              <div class="hist-meta">
                <div class="hist-top">
                  <span class="hist-version">v{entry.version}</span>
                  {#if entry.source && entry.source !== 'local'}
                    <span class="hist-source hist-source--{entry.source}">{entry.source}</span>
                  {/if}
                </div>
                <span class="hist-date">{new Date(entry.savedAt).toLocaleString()}</span>
              </div>
              <button class="btn btn-secondary btn-sm" on:click={() => restoreVersion(entry)}>
                Restore
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .editor-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .topic-key {
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent);
    margin: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .toolbar-right { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .status-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .saving        { background: rgba(201, 168, 76, 0.2); color: var(--accent); }
  .dirty         { background: rgba(255, 183, 77, 0.2); color: #ffb74d; }
  .saved         { background: rgba(76, 175, 80, 0.15); color: #81c784; }
  .read-only-badge { background: rgba(138, 132, 148, 0.2); color: var(--fg-muted); }

  /* Desktop split layout */
  .editor-body {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    overflow: hidden;
  }
  .editor-body.preview-hidden { grid-template-columns: 1fr; }
  .editor-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border);
  }
  .preview-pane { overflow: auto; background: var(--bg); }

  /* Mobile preview — fills remaining height */
  .preview-full {
    flex: 1;
    overflow: auto;
    background: var(--bg);
  }

  .editor-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.35rem 1rem;
    font-size: 0.75rem;
    color: var(--fg-muted);
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .history-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 500;
    display: flex;
    justify-content: flex-end;
  }
  .history-panel {
    width: min(380px, 90vw);
    background: var(--surface);
    height: 100%;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
  }
  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .history-header h3 { margin: 0; font-size: 1rem; }
  .history-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
    overflow-y: auto;
    flex: 1;
  }
  .history-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 0.75rem;
    border-radius: 6px;
    gap: 0.5rem;
  }
  .history-list li:hover { background: var(--surface2); }
  .hist-meta { display: flex; flex-direction: column; gap: 0.15rem; }
  .hist-top  { display: flex; align-items: center; gap: 0.4rem; }
  .hist-version { font-weight: 700; font-size: 0.85rem; color: var(--accent); }
  .hist-date    { font-size: 0.75rem; color: var(--fg-muted); }
  .hist-source  {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
  }
  .hist-source--remote   { background: rgba(100, 180, 255, 0.15); color: #64b4ff; }
  .hist-source--conflict { background: rgba(255, 183, 77, 0.15);  color: #ffb74d; }
  .empty-hist { text-align: center; color: var(--fg-muted); padding: 2rem; }
  .btn-icon {
    background: none;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
    border-radius: 4px;
    line-height: 1;
  }
  .btn-icon:hover { color: var(--fg); background: var(--surface2); }
  .btn-icon:disabled { opacity: 0.4; cursor: default; }

  .evlog-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .thread-select {
    font-size: 0.75rem;
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--fg-muted);
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    max-width: 160px;
    cursor: pointer;
  }
  .thread-select:focus { outline: 1px solid var(--accent); }
  .evlog-body {
    flex: 1;
    overflow-y: auto;
  }
</style>
