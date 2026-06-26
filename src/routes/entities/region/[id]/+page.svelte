<script lang="ts">
  import { page } from '$app/stores';
  import { settings } from '$lib/stores';
  import { fetchRegionById } from '$lib/d1-reads';
  import type { RegionDetailRecord } from '$lib/d1-reads';

  $: id = $page.params.id ?? '';

  let region: RegionDetailRecord | null = null;
  let loading = false;
  let error: string | null = null;

  $: if (id && $settings.workerHost) load();

  async function load() {
    loading = true;
    error = null;
    region = null;
    try {
      region = await fetchRegionById($settings.workerHost, id);
      if (!region) error = 'Region not found';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load region';
    } finally {
      loading = false;
    }
  }
</script>

<div class="detail-page">
  <nav class="breadcrumb">
    <a href="/entities/region">Regions</a>
    <span class="sep">›</span>
    <span>{loading ? 'Loading…' : (region?.name ?? id)}</span>
  </nav>

  {#if loading}
    <p class="status-msg">Loading region…</p>

  {:else if error}
    <div class="error-card">
      <p>{error}</p>
      <a href="/entities/region" class="back-link">← Back to Regions</a>
    </div>

  {:else if region}
    <div class="entity-header">
      <h1 class="entity-name">{region.name}</h1>
      {#if region.type}
        <span class="chip">{region.type}</span>
      {/if}
    </div>

    <div class="meta-grid">
      {#if region.owner_nation_name}
        <div class="meta-block">
          <span class="meta-label">Controlled by</span>
          <span class="meta-value">
            {#if region.owner_nation_id}
              <a href="/entities/nation/{encodeURIComponent(region.owner_nation_id)}" class="entity-link">{region.owner_nation_name}</a>
            {:else}
              {region.owner_nation_name}
            {/if}
          </span>
        </div>
      {:else}
        <div class="meta-block">
          <span class="meta-label">Controlled by</span>
          <span class="meta-value muted">Unclaimed</span>
        </div>
      {/if}
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

  .entity-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
  .entity-name { font-size: 1.75rem; font-weight: 700; margin: 0; }
  .chip {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 99px; padding: 0.2rem 0.65rem; font-size: 0.8rem;
    color: var(--fg-muted); text-transform: capitalize;
  }

  .meta-grid { display: flex; flex-wrap: wrap; gap: 1rem; }
  .meta-block {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.75rem 1rem; min-width: 160px;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .meta-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-muted); }
  .meta-value { font-size: 1rem; font-weight: 600; }
  .meta-value.muted { font-weight: 400; color: var(--fg-muted); font-style: italic; }
  .entity-link { color: var(--accent); text-decoration: none; }
  .entity-link:hover { text-decoration: underline; }
</style>
