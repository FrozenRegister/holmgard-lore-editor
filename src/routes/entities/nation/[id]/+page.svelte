<script lang="ts">
  import { page } from '$app/stores';
  import { settings } from '$lib/stores';
  import { fetchNationById } from '$lib/d1-reads';
  import type { NationRecord } from '$lib/d1-reads';

  $: id = $page.params.id ?? '';

  let nation: NationRecord | null = null;
  let loading = false;
  let error: string | null = null;

  $: if (id && $settings.workerHost) load();

  async function load() {
    loading = true;
    error = null;
    nation = null;
    try {
      nation = await fetchNationById($settings.workerHost, id);
      if (!nation) error = 'Nation not found';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load nation';
    } finally {
      loading = false;
    }
  }

  function statColor(value: number): string {
    if (value >= 70) return 'stat-high';
    if (value <= 30) return 'stat-low';
    return 'stat-mid';
  }
</script>

<div class="detail-page">
  <nav class="breadcrumb">
    <a href="/entities/nation">Nations</a>
    <span class="sep">›</span>
    <span>{loading ? 'Loading…' : (nation?.name ?? id)}</span>
  </nav>

  {#if loading}
    <p class="status-msg">Loading nation…</p>

  {:else if error}
    <div class="error-card">
      <p>{error}</p>
      <a href="/entities/nation" class="back-link">← Back to Nations</a>
    </div>

  {:else if nation}
    <div class="entity-header">
      <h1 class="entity-name">{nation.name}</h1>
      {#if nation.ideology}
        <span class="chip">{nation.ideology}</span>
      {/if}
    </div>

    {#if nation.leader}
      <div class="leader-row">Led by <strong>{nation.leader}</strong></div>
    {/if}

    <div class="stats-grid">
      <div class="stat-block">
        <span class="stat-label">Aggression</span>
        <div class="stat-bar">
          <div class="stat-fill {statColor(nation.aggression)}" style="width: {nation.aggression}%"></div>
        </div>
        <span class="stat-num">{nation.aggression}</span>
      </div>
      <div class="stat-block">
        <span class="stat-label">Trust</span>
        <div class="stat-bar">
          <div class="stat-fill {statColor(nation.trust)}" style="width: {nation.trust}%"></div>
        </div>
        <span class="stat-num">{nation.trust}</span>
      </div>
      <div class="stat-block">
        <span class="stat-label">Paranoia</span>
        <div class="stat-bar">
          <div class="stat-fill {statColor(nation.paranoia)}" style="width: {nation.paranoia}%"></div>
        </div>
        <span class="stat-num">{nation.paranoia}</span>
      </div>
      <div class="stat-block stat-block--wide">
        <span class="stat-label">GDP</span>
        <span class="stat-num stat-num--large">{nation.gdp.toLocaleString()} gp</span>
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

  .entity-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .entity-name { font-size: 1.75rem; font-weight: 700; margin: 0; }
  .chip {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 99px; padding: 0.2rem 0.65rem; font-size: 0.8rem;
    color: var(--fg-muted); text-transform: capitalize;
  }

  .leader-row { color: var(--fg-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }

  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .stat-block {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.75rem 1rem;
    display: flex; flex-direction: column; gap: 0.4rem;
  }
  .stat-block--wide { grid-column: 1 / -1; flex-direction: row; align-items: center; }
  .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-muted); }
  .stat-bar { height: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
  .stat-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
  .stat-fill.stat-high { background: #e57373; }
  .stat-fill.stat-mid  { background: var(--accent); }
  .stat-fill.stat-low  { background: #81c784; }
  .stat-num { font-size: 0.85rem; font-weight: 600; color: var(--fg-muted); }
  .stat-num--large { font-size: 1.25rem; font-weight: 700; color: var(--fg); margin-left: auto; }
</style>
