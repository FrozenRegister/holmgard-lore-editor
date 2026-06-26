<script lang="ts">
  import { page } from '$app/stores';
  import { settings } from '$lib/stores';
  import { fetchItemById } from '$lib/d1-reads';
  import type { ItemRecord } from '$lib/d1-reads';
  import RelationsPanel from '$lib/components/RelationsPanel.svelte';

  $: id = $page.params.id ?? '';

  let item: ItemRecord | null = null;
  let loading = false;
  let error: string | null = null;
  let showRelations = false;

  $: if (id && $settings.workerHost) load();

  async function load() {
    loading = true;
    error = null;
    item = null;
    try {
      item = await fetchItemById($settings.workerHost, id);
      if (!item) error = 'Item not found';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load item';
    } finally {
      loading = false;
    }
  }
</script>

<div class="detail-page">
  <nav class="breadcrumb">
    <a href="/entities/item">Items</a>
    <span class="sep">›</span>
    <span>{loading ? 'Loading…' : (item?.name ?? id)}</span>
  </nav>

  {#if loading}
    <p class="status-msg">Loading item…</p>

  {:else if error}
    <div class="error-card">
      <p>{error}</p>
      <a href="/entities/item" class="back-link">← Back to Items</a>
    </div>

  {:else if item}
    <div class="entity-header">
      <h1 class="entity-name">{item.name}</h1>
      {#if item.type}
        <span class="type-chip">{item.type}</span>
      {/if}
      <button class="btn-action" class:active={showRelations} on:click={() => (showRelations = !showRelations)}>
        Relations
      </button>
    </div>

    {#if showRelations}
      <RelationsPanel entityTypeSlug="items" entityId={id} onClose={() => (showRelations = false)} />
    {/if}

    <div class="stats-grid">
      <div class="stat-block">
        <span class="stat-label">Value</span>
        <span class="stat-value">{item.value.toLocaleString()} gp</span>
      </div>
      <div class="stat-block">
        <span class="stat-label">Weight</span>
        <span class="stat-value">{item.weight} lb</span>
      </div>
    </div>
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

  .btn-action {
    background: var(--surface2); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.3rem 0.75rem; font-size: 0.8rem; color: var(--fg-muted); cursor: pointer;
    margin-left: auto;
  }
  .btn-action:hover, .btn-action.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }

  .entity-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
  .entity-name { font-size: 1.75rem; font-weight: 700; margin: 0; }
  .type-chip {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 99px; padding: 0.2rem 0.65rem; font-size: 0.8rem;
    color: var(--fg-muted); text-transform: capitalize;
  }

  .stats-grid { display: flex; gap: 1rem; flex-wrap: wrap; }
  .stat-block {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.75rem 1.25rem; min-width: 120px;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-muted); }
  .stat-value { font-size: 1.25rem; font-weight: 700; }
</style>
