<script lang="ts">
  import { page } from '$app/stores';
  import { settings } from '$lib/stores';
  import { fetchQuestById, fetchQuestLog } from '$lib/d1-reads';
  import type { QuestRecord, QuestLogEntry } from '$lib/d1-reads';
  import RelationsPanel from '$lib/components/RelationsPanel.svelte';

  $: id = $page.params.id ?? '';

  let quest: QuestRecord | null = null;
  let log: QuestLogEntry[] = [];
  let loading = false;
  let error: string | null = null;
  let showLog = false;
  let showRelations = false;

  $: if (id && $settings.workerHost) load();

  async function load() {
    loading = true;
    error = null;
    quest = null;
    log = [];
    try {
      const [questResult, logResult] = await Promise.allSettled([
        fetchQuestById($settings.workerHost, id),
        fetchQuestLog($settings.workerHost, id),
      ]);
      if (questResult.status === 'fulfilled') {
        quest = questResult.value;
        if (!quest) error = 'Quest not found';
      } else {
        error = questResult.reason instanceof Error ? questResult.reason.message : 'Failed to load quest';
      }
      if (logResult.status === 'fulfilled') log = logResult.value;
    } finally {
      loading = false;
    }
  }

  function statusClass(status: string): string {
    if (status === 'active') return 'status-active';
    if (status === 'completed' || status === 'done') return 'status-done';
    if (status === 'failed' || status === 'abandoned') return 'status-failed';
    return '';
  }
</script>

<div class="detail-page">
  <nav class="breadcrumb">
    <a href="/entities/quest">Quests</a>
    <span class="sep">›</span>
    <span>{loading ? 'Loading…' : (quest?.name ?? id)}</span>
  </nav>

  {#if loading}
    <p class="status-msg">Loading quest…</p>

  {:else if error}
    <div class="error-card">
      <p>{error}</p>
      <a href="/entities/quest" class="back-link">← Back to Quests</a>
    </div>

  {:else if quest}
    <div class="entity-header">
      <h1 class="entity-name">{quest.name}</h1>
      <span class="status-chip {statusClass(quest.status)}">{quest.status}</span>
    </div>

    {#if quest.giver}
      <div class="giver-row">Given by <strong>{quest.giver}</strong></div>
    {/if}

    {#if quest.description}
      <div class="description-card">
        <p>{quest.description}</p>
      </div>
    {/if}

    <!-- Log drawer toggle -->
    <div class="log-toolbar">
      <button class="btn-action" class:active={showRelations} on:click={() => { showRelations = !showRelations; showLog = false; }}>
        Relations
      </button>
      <button class="btn-action" class:active={showLog} on:click={() => { showLog = !showLog; showRelations = false; }}>
        Quest Log
        {#if log.length > 0}
          <span class="ctx-count">{log.length}</span>
        {/if}
      </button>
    </div>

    {#if showRelations}
      <RelationsPanel entityTypeSlug="quests" entityId={id} onClose={() => (showRelations = false)} />
    {/if}

    <!-- Log entries inline -->
    {#if showLog}
      <div class="log-list">
        {#if log.length === 0}
          <p class="log-empty">No log entries yet.</p>
        {:else}
          {#each log as entry}
            <div class="log-entry">
              <span class="log-date">{entry.created_at.slice(0, 10)}</span>
              <p class="log-note">{entry.note}</p>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .detail-page { max-width: 720px; margin: 0 auto; padding: 1.5rem; }

  .breadcrumb { font-size: 0.85rem; color: var(--fg-muted); margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.4rem; }
  .breadcrumb a { color: var(--accent); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .sep { opacity: 0.5; }

  .status-msg { color: var(--fg-muted); padding: 2rem 0; }
  .error-card { background: var(--surface); border: 1px solid #e05c5c; border-radius: 8px; padding: 1.5rem; }
  .back-link { color: var(--accent); text-decoration: none; font-size: 0.9rem; }

  .entity-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .entity-name { font-size: 1.75rem; font-weight: 700; margin: 0; }

  .status-chip {
    border-radius: 99px; padding: 0.2rem 0.65rem; font-size: 0.78rem; font-weight: 600;
    text-transform: capitalize; background: var(--surface); border: 1px solid var(--border); color: var(--fg-muted);
  }
  .status-active { background: rgba(100,180,255,0.15); border-color: rgba(100,180,255,0.3); color: #64b4ff; }
  .status-done   { background: rgba(76,175,80,0.15);  border-color: rgba(76,175,80,0.3);  color: #81c784; }
  .status-failed { background: rgba(229,115,115,0.15); border-color: rgba(229,115,115,0.3); color: #e57373; }

  .giver-row { color: var(--fg-muted); font-size: 0.9rem; margin-bottom: 1rem; }
  .description-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 1rem 1.25rem; margin-bottom: 1.5rem; color: var(--fg); line-height: 1.6;
  }
  .description-card p { margin: 0; }

  .log-toolbar { margin-bottom: 0.75rem; }
  .btn-action {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 500;
    background: var(--surface); border: 1px solid var(--border);
    color: var(--fg); cursor: pointer; transition: background 0.15s;
  }
  .btn-action:hover { background: var(--surface); opacity: 0.85; }
  .btn-action.active { border-color: var(--accent); color: var(--accent); }

  .ctx-count {
    background: var(--accent); color: var(--bg);
    border-radius: 99px; padding: 0 0.4rem; font-size: 0.7rem; font-weight: 700;
  }

  .log-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .log-entry {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.75rem 1rem;
  }
  .log-date { font-size: 0.75rem; color: var(--fg-muted); font-variant-numeric: tabular-nums; }
  .log-note { margin: 0.25rem 0 0; font-size: 0.9rem; line-height: 1.55; }
  .log-empty { color: var(--fg-muted); font-style: italic; }
</style>
