<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { settings } from '$lib/stores';
  import { fetchLocationById, fetchLocationOccupants } from '$lib/d1-reads';
  import type { LocationDetailRecord, CharacterRecord } from '$lib/d1-reads';

  $: id = $page.params.id ?? '';

  let location: LocationDetailRecord | null = null;
  let occupants: CharacterRecord[] = [];
  let locLoading = false;
  let locError: string | null = null;
  let showOccupants = false;

  $: if (id && $settings.workerHost) loadLocation();

  async function loadLocation() {
    locLoading = true;
    locError = null;
    location = null;
    occupants = [];
    try {
      const [locResult, occResult] = await Promise.allSettled([
        fetchLocationById($settings.workerHost, id),
        fetchLocationOccupants($settings.workerHost, id),
      ]);
      if (locResult.status === 'fulfilled') {
        location = locResult.value;
        if (!location) locError = 'Location not found';
      } else {
        locError = locResult.reason instanceof Error ? locResult.reason.message : 'Failed to load location';
      }
      if (occResult.status === 'fulfilled') occupants = occResult.value;
    } finally {
      locLoading = false;
    }
  }

  function showOnMap() {
    if (!location || location.local_x == null || location.local_y == null) return;
    goto(`/world-editor?focus_x=${location.local_x}&focus_y=${location.local_y}`);
  }
</script>

<div class="loc-page">
  <!-- Breadcrumb -->
  <nav class="breadcrumb">
    <a href="/entities/location">Locations</a>
    <span class="sep">›</span>
    <span>{locLoading ? 'Loading…' : (location?.name ?? id)}</span>
  </nav>

  {#if locLoading}
    <p class="status-msg">Loading location…</p>

  {:else if locError}
    <div class="error-card">
      <p>{locError}</p>
      <a href="/entities/location" class="back-link">← Back to Locations</a>
    </div>

  {:else if location}
    <!-- Header -->
    <div class="loc-header">
      <div class="loc-title-row">
        <h1 class="loc-name">{location.name}</h1>
        {#if location.biome_context}
          <span class="biome-chip">{location.biome_context}</span>
        {/if}
      </div>

      <!-- Toolbar -->
      <div class="loc-toolbar">
        {#if location.local_x != null && location.local_y != null}
          <button class="btn-action" on:click={showOnMap}>
            Show on Map
          </button>
        {/if}
        <button
          class="btn-action"
          class:active={showOccupants}
          on:click={() => { showOccupants = !showOccupants; }}
        >
          Occupants
          {#if occupants.length > 0}
            <span class="ctx-count">{occupants.length}</span>
          {/if}
        </button>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="stats-grid">
      <div class="stat-block">
        <span class="stat-label">Visits</span>
        <span class="stat-value">{location.visited_count}</span>
      </div>
      {#if location.last_visited_at}
        <div class="stat-block">
          <span class="stat-label">Last visited</span>
          <span class="stat-value">{location.last_visited_at.slice(0, 10)}</span>
        </div>
      {/if}
      {#if location.local_x != null && location.local_y != null}
        <div class="stat-block">
          <span class="stat-label">Coords</span>
          <span class="stat-value">({location.local_x}, {location.local_y})</span>
        </div>
      {/if}
      {#if location.network_id}
        <div class="stat-block">
          <span class="stat-label">Network</span>
          <span class="stat-value muted">{location.network_id}</span>
        </div>
      {/if}
    </div>

    <!-- Description -->
    {#if location.base_description}
      <div class="loc-desc">
        <p>{location.base_description}</p>
      </div>
    {/if}

    <!-- Occupants overlay -->
    {#if showOccupants}
      <div class="ctx-overlay" role="dialog" aria-modal="true" aria-label="Occupants">
        <div class="ctx-panel">
          <div class="ctx-header">
            <span>Current Occupants</span>
            <button class="btn-close" on:click={() => { showOccupants = false; }}>✕</button>
          </div>
          <div class="ctx-body">
            {#if occupants.length === 0}
              <p class="ctx-empty">No characters currently in this location.</p>
            {:else}
              <ul class="ctx-list">
                {#each occupants as occ}
                  <li class="ctx-row">
                    <span class="ctx-name">
                      {#if occ.kv_origin}
                        <a href="/editor/{encodeURIComponent(occ.kv_origin)}">{occ.name}</a>
                      {:else}
                        {occ.name}
                      {/if}
                    </span>
                    <span class="ctx-muted">{occ.race} {occ.character_class} · Lv.{occ.level}</span>
                    <span class="ctx-tag ctx-tag--type">{occ.character_type}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .loc-page { max-width: 900px; margin: 0 auto; padding: 1.5rem; }

  .breadcrumb { font-size: 0.85rem; color: var(--text-muted, #888); margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.4rem; }
  .breadcrumb a { color: var(--accent, #7c9ef8); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .sep { opacity: 0.5; }

  .status-msg { color: var(--text-muted, #888); padding: 2rem 0; }

  .error-card { background: var(--surface, #1e1e2e); border: 1px solid var(--error, #e05c5c); border-radius: 8px; padding: 1.5rem; }
  .back-link { color: var(--accent, #7c9ef8); text-decoration: none; font-size: 0.9rem; }

  .loc-header { margin-bottom: 1.5rem; }
  .loc-title-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
  .loc-name { font-size: 1.75rem; font-weight: 700; margin: 0; }

  .biome-chip {
    background: var(--surface-2, #2a2a3e); border: 1px solid var(--border, #3a3a4e);
    border-radius: 99px; padding: 0.2rem 0.65rem; font-size: 0.8rem;
    color: var(--text-muted, #aaa); text-transform: capitalize;
  }

  .loc-toolbar { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .btn-action {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 500;
    background: var(--surface-2, #2a2a3e); border: 1px solid var(--border, #3a3a4e);
    color: var(--text, #e0e0e0); cursor: pointer; transition: background 0.15s;
  }
  .btn-action:hover { background: var(--surface-3, #353550); }
  .btn-action.active { background: var(--accent-dim, #3a4a7a); border-color: var(--accent, #7c9ef8); }

  .ctx-count {
    background: var(--accent, #7c9ef8); color: #fff;
    border-radius: 99px; padding: 0 0.4rem; font-size: 0.7rem; font-weight: 700; min-width: 1.2em; text-align: center;
  }

  .stats-grid { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
  .stat-block { background: var(--surface, #1e1e2e); border: 1px solid var(--border, #3a3a4e); border-radius: 8px; padding: 0.75rem 1rem; min-width: 120px; }
  .stat-label { display: block; font-size: 0.75rem; color: var(--text-muted, #888); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem; }
  .stat-value { font-size: 1.1rem; font-weight: 600; }
  .stat-value.muted { font-size: 0.85rem; font-weight: 400; color: var(--text-muted, #aaa); font-family: monospace; }

  .loc-desc { background: var(--surface, #1e1e2e); border: 1px solid var(--border, #3a3a4e); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; color: var(--text-muted, #ccc); font-style: italic; line-height: 1.6; }

  /* Shared overlay panel */
  .ctx-overlay {
    position: fixed; inset: 0; z-index: 400;
    background: rgba(0,0,0,0.45); display: flex; align-items: flex-end; justify-content: flex-end;
  }
  .ctx-panel {
    width: min(420px, 92vw); height: 100vh; max-height: 100vh;
    background: var(--surface, #1e1e2e); border-left: 1px solid var(--border, #3a3a4e);
    display: flex; flex-direction: column;
  }
  .ctx-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.25rem; border-bottom: 1px solid var(--border, #3a3a4e);
    font-weight: 600; font-size: 0.95rem;
  }
  .btn-close { background: none; border: none; color: var(--text-muted, #888); font-size: 1.1rem; cursor: pointer; padding: 0.25rem; }
  .ctx-body { flex: 1; overflow-y: auto; padding: 1rem; }
  .ctx-empty { color: var(--text-muted, #888); font-style: italic; text-align: center; padding: 2rem 0; }
  .ctx-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .ctx-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--surface-2, #2a2a3e); border-radius: 6px; }
  .ctx-name { flex: 1; font-weight: 500; }
  .ctx-name a { color: var(--accent, #7c9ef8); text-decoration: none; }
  .ctx-name a:hover { text-decoration: underline; }
  .ctx-muted { font-size: 0.8rem; color: var(--text-muted, #888); }
  .ctx-tag { font-size: 0.7rem; border-radius: 4px; padding: 0.15rem 0.45rem; font-weight: 600; text-transform: uppercase; background: var(--surface-3, #353550); color: var(--text-muted, #aaa); }
  .ctx-tag--type { background: #2a3a5a; color: #7c9ef8; }
</style>
