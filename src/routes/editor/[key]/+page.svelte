<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { topics, syncState, settings, showToast, activeConflict } from '$lib/stores';
  import { saveTopic, loadTopic } from '$lib/storage';
  import { pushHistory, loadHistory } from '$lib/history';
  import { adminSave, enqueue } from '$lib/sync';
  import { renderMarkdown } from '$lib/marked-config';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
  import type { Topic, HistoryEntry } from '$lib/types';

  // ── Route param ───────────────────────────────────────────────────────────
  $: key = $page.params.key ? decodeURIComponent($page.params.key) : '';

  // ── State ─────────────────────────────────────────────────────────────────
  let topic: Topic | null = null;
  let editorText = '';
  let isSaving = false;
  let isSyncing = false;
  let isDirty = false;
  let showPreview = true;
  let showHistory = false;
  let historyEntries: HistoryEntry[] = [];
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  const AUTOSAVE_DELAY = 5000;

  // ── Load topic ────────────────────────────────────────────────────────────
  onMount(async () => {
    await loadCurrent();
  });

  $: if (key) loadCurrent();

  async function loadCurrent() {
    const t = await loadTopic(key);
    if (!t) {
      // Try from store
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

  // ── Autosave ──────────────────────────────────────────────────────────────
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
      await pushHistory(key, editorText, updated.meta.version);
      topic = updated;
      isDirty = false;
      topics.update((ts) =>
        ts.map((t) => (t.key === key ? updated : t))
      );
    } catch (err) {
      console.error('Save error:', err);
      showToast('Save failed', 'error');
    } finally {
      isSaving = false;
    }
  }

  // ── Sync to remote ────────────────────────────────────────────────────────
  async function syncTopic() {
    if (!topic) return;
    // Save locally first
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

  async function getAdminSecret(): Promise<string | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      return await invoke<string | null>('keyring_get', { account: 'admin_secret' });
    } catch {
      return null;
    }
  }

  // ── Version history ───────────────────────────────────────────────────────
  async function openHistory() {
    historyEntries = await loadHistory(key);
    showHistory = true;
  }

  function restoreVersion(entry: HistoryEntry) {
    editorText = entry.text;
    isDirty = true;
    scheduleAutosave();
    showHistory = false;
    showToast(`Restored version ${entry.version}`, 'info');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  onDestroy(() => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (isDirty) performSave();
  });
</script>

<svelte:window
  on:beforeunload={(e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }}
/>

<div class="editor-page">
  <!-- Toolbar -->
  <div class="editor-toolbar">
    <button class="btn btn-ghost btn-sm" on:click={() => goto('/')} aria-label="Back">
      ← Topics
    </button>
    <h2 class="topic-key">{key}</h2>

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
      <button class="btn btn-ghost btn-sm" on:click={openHistory}>
        History
      </button>
      <button class="btn btn-ghost btn-sm" on:click={performSave} disabled={!isDirty || isSaving}>
        Save
      </button>
      <button class="btn btn-primary btn-sm" on:click={syncTopic} disabled={isSyncing}>
        {isSyncing ? 'Syncing…' : 'Sync ↑'}
      </button>
    </div>
  </div>

  <!-- Editor / Preview split -->
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

<!-- Version history drawer -->
{#if showHistory}
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
                <span class="hist-version">v{entry.version}</span>
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
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .status-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .saving  { background: rgba(201, 168, 76, 0.2); color: var(--accent); }
  .dirty   { background: rgba(255, 183, 77, 0.2); color: #ffb74d; }
  .saved   { background: rgba(76, 175, 80, 0.15); color: #81c784; }

  .editor-body {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    overflow: hidden;
  }

  .editor-body.preview-hidden {
    grid-template-columns: 1fr;
  }

  .editor-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border);
  }

  .preview-pane {
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
  }

  /* History overlay */
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
  .hist-version { font-weight: 700; font-size: 0.85rem; color: var(--accent); }
  .hist-date { font-size: 0.75rem; color: var(--fg-muted); }

  .empty-hist {
    text-align: center;
    color: var(--fg-muted);
    padding: 2rem;
  }

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
</style>
