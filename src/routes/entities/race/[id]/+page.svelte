<script lang="ts">
  import { page } from '$app/stores';
  import { settings } from '$lib/stores';
  import { fetchRaceById, fetchCharacters } from '$lib/d1-reads';
  import type { RaceRecord, CharacterRecord } from '$lib/d1-reads';
  import RelationsPanel from '$lib/components/RelationsPanel.svelte';

  $: id = $page.params.id ?? '';

  let race: RaceRecord | null = null;
  let loading = false;
  let error: string | null = null;
  let showRelations = false;
  let characters: CharacterRecord[] = [];
  let showCharacters = false;

  $: if (id && $settings.workerHost) load();

  async function load() {
    loading = true;
    error = null;
    race = null;
    characters = [];
    try {
      race = await fetchRaceById($settings.workerHost, id);
      if (!race) { error = 'Race not found'; return; }

      // Load characters of this race
      const allCharacters = await fetchCharacters($settings.workerHost);
      characters = allCharacters.filter(c => c.race === race?.name);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load race';
    } finally {
      loading = false;
    }
  }
</script>

<div class="detail-page">
  <nav class="breadcrumb">
    <a href="/entities/race">Races</a>
    <span class="sep">›</span>
    <span>{loading ? 'Loading…' : (race?.name ?? id)}</span>
  </nav>

  {#if loading}
    <p class="status-msg">Loading race…</p>

  {:else if error}
    <div class="error-card">
      <p>{error}</p>
      <a href="/entities/race" class="back-link">← Back to Races</a>
    </div>

  {:else if race}
    <div class="entity-header">
      <h1 class="entity-name">{race.name}</h1>
      {#if race.is_extinct}
        <span class="status-badge extinct">Extinct</span>
      {:else}
        <span class="status-badge active">Active</span>
      {/if}
      <button class="btn-action" class:active={showRelations} on:click={() => (showRelations = !showRelations)}>
        Relations
      </button>
      <button class="btn-action" class:active={showCharacters} on:click={() => (showCharacters = !showCharacters)}>
        Characters
        {#if characters.length > 0}
          <span class="count-badge">{characters.length}</span>
        {/if}
      </button>
    </div>

    {#if showRelations}
      <RelationsPanel entityTypeSlug="races" entityId={id} onClose={() => (showRelations = false)} />
    {/if}

    {#if race.parent_race_id}
      <div class="parent-race">
        Parent Race: <strong>{race.parent_race_id}</strong>
      </div>
    {/if}

    {#if race.description}
      <div class="description-section">
        <h2>Description</h2>
        <p class="description-text">{race.description}</p>
      </div>
    {/if}

    {#if showCharacters && characters.length > 0}
      <div class="characters-section">
        <h2>Characters ({characters.length})</h2>
        <div class="characters-list">
          {#each characters as char}
            <div class="character-item">
              <a href="/entities/character/{encodeURIComponent(char.id)}" class="char-name">
                {char.name}
              </a>
              <div class="char-meta">
                {char.character_class} · Lv.{char.level} · {char.hp}/{char.max_hp} HP · AC {char.ac}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if showCharacters}
      <div class="empty-state">
        <p>No characters of this race found in the database.</p>
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

  .btn-action {
    background: var(--surface2); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.3rem 0.75rem; font-size: 0.8rem; color: var(--fg-muted); cursor: pointer;
    margin-left: auto;
  }
  .btn-action:hover, .btn-action.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }

  .entity-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .entity-name { font-size: 1.75rem; font-weight: 700; margin: 0; }

  .status-badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.65rem;
    border-radius: 99px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .status-badge.extinct { background: rgba(229, 115, 115, 0.15); color: #e57373; }
  .status-badge.active { background: rgba(76, 175, 80, 0.15); color: #81c784; }

  .count-badge {
    display: inline-block;
    background: var(--accent);
    color: var(--bg);
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.05rem 0.32rem;
    border-radius: 999px;
    margin-left: 0.3rem;
  }

  .parent-race { color: var(--fg-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }

  .description-section { margin-bottom: 2rem; }
  .description-section h2 { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.75rem; color: var(--fg); }
  .description-text { color: var(--fg); line-height: 1.6; margin: 0; white-space: pre-wrap; }

  .characters-section { margin-top: 2rem; }
  .characters-section h2 { font-size: 1.1rem; font-weight: 600; margin: 0 0 1rem; color: var(--fg); }

  .characters-list {
    display: grid;
    gap: 0.75rem;
  }

  .character-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem 1rem;
  }

  .char-name {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
  }

  .char-name:hover { text-decoration: underline; }

  .char-meta { font-size: 0.85rem; color: var(--fg-muted); }

  .empty-state {
    background: var(--surface2);
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    color: var(--fg-muted);
  }
</style>
