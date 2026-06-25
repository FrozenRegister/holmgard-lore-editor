<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { topics, settings, listSortBy, showToast, isMobile } from '$lib/stores';
  import { saveTopic } from '$lib/storage';
  import { getEntityConfig, getTopicPrefix } from '$lib/entities';
  import { ENTITY_FETCHERS, getEntityName, getEntitySummary } from '$lib/d1-reads';
  import type { EntityRecord, CharacterRecord } from '$lib/d1-reads';
  import type { Topic } from '$lib/types';
  import TopicCard from '$lib/components/TopicCard.svelte';

  $: type = $page.params.type ?? '';
  $: config = getEntityConfig(type);

  // D1 state
  let d1Records: EntityRecord[] = [];
  let d1Loading = false;
  let d1Error: string | null = null;

  // Reload D1 data when type changes (or on initial mount)
  let currentLoadedType = '';
  $: if (config?.hasD1 && config.apiSlug && type !== currentLoadedType && $settings.workerHost) {
    currentLoadedType = type;
    loadD1(config.apiSlug, $settings.workerHost);
  }

  async function loadD1(slug: string, host: string) {
    const fetcher = ENTITY_FETCHERS[slug];
    if (!fetcher) return;
    d1Loading = true;
    d1Error = null;
    d1Records = [];
    try {
      d1Records = await fetcher(host);
    } catch (e) {
      d1Error = e instanceof Error ? e.message : 'Failed to load world records';
    } finally {
      d1Loading = false;
    }
  }

  // Lore topics for this entity type, sorted
  $: topicRecords = $topics
    .filter(t => getTopicPrefix(t.key) === type)
    .sort((a, b) => {
      const s = $listSortBy;
      if (s === 'name-desc') return (b.key ?? '').localeCompare(a.key ?? '');
      if (s === 'updated-desc') return new Date(b.meta?.updatedAt as string).getTime() - new Date(a.meta?.updatedAt as string).getTime();
      if (s === 'updated-asc') return new Date(a.meta?.updatedAt as string).getTime() - new Date(b.meta?.updatedAt as string).getTime();
      if (s === 'version-desc') return (b.meta?.version ?? 0) - (a.meta?.version ?? 0);
      return (a.key ?? '').localeCompare(b.key ?? '');
    });

  // Set of topic keys for this type — used to show Lore links on D1 character records
  $: topicKeySet = new Set(topicRecords.map(t => t.key));

  // Returns the kv_origin of a character record (for Lore link), or null for non-character types.
  function getCharacterLoreKey(entityType: string, record: EntityRecord): string | null {
    if (entityType !== 'character') return null;
    return (record as CharacterRecord).kv_origin ?? null;
  }

  // Returns the detail page href for a character record, or null for other entity types.
  function getCharacterDetailHref(entityType: string, record: EntityRecord): string | null {
    if (entityType !== 'character') return null;
    const id = (record as CharacterRecord).id;
    return `/entities/character/${encodeURIComponent(id)}`;
  }

  async function createNewEntity() {
    if (!config) return;
    const suffix = prompt(`Enter a name for the new ${config.singularLabel} (e.g. "aldric"):`);
    if (!suffix?.trim()) return;
    const key = `${type}:${suffix.trim().toLowerCase().replace(/\s+/g, '-')}`;
    if ($topics.find(t => t.key === key)) {
      showToast(`Topic "${key}" already exists`, 'error');
      return;
    }
    const now = new Date().toISOString();
    const topic: Topic = {
      key,
      text: `# ${suffix.trim()}\n\nStart writing here…\n`,
      meta: { updatedAt: now, version: 1 },
    };
    await saveTopic(topic);
    topics.update(ts => [...ts, topic].sort((a, b) => a.key.localeCompare(b.key)));
    goto(`/editor/${encodeURIComponent(key)}`);
  }
</script>

{#if !config}
  <div class="entity-page">
    <div class="error-state">
      <p>Unknown entity type: <code>{type}</code></p>
      <a href="/" class="btn btn-secondary">Back to All Topics</a>
    </div>
  </div>
{:else}
  <div class="entity-page">
    <header class="page-header">
      <div class="header-left">
        <h1>{config.label}</h1>
        <span class="badge">{topicRecords.length}</span>
      </div>
      {#if !$isMobile}
        <button class="btn btn-primary" on:click={createNewEntity}>
          + New {config.singularLabel}
        </button>
      {/if}
    </header>

    <!-- World Records from D1 -->
    {#if config.hasD1}
      <section class="world-records">
        <h2 class="section-heading">World Records</h2>

        {#if d1Loading}
          <div class="d1-loading">Loading world records…</div>
        {:else if d1Error}
          <div class="d1-error">{d1Error}</div>
        {:else if d1Records.length === 0}
          <div class="d1-empty">No {config.label.toLowerCase()} in the world yet.</div>
        {:else}
          <ul class="record-list" role="list">
            {#each d1Records as record (getEntityName(record) + record)}
              {@const loreKey = getCharacterLoreKey(type, record)}
              {@const detailHref = getCharacterDetailHref(type, record)}
              <li class="record-row" class:record-row--linked={!!detailHref}>
                {#if detailHref}
                  <a href={detailHref} class="record-link-area">
                    <span class="record-name">{getEntityName(record)}</span>
                    <span class="record-summary">{getEntitySummary(type, record)}</span>
                  </a>
                {:else}
                  <div class="record-main">
                    <span class="record-name">{getEntityName(record)}</span>
                    <span class="record-summary">{getEntitySummary(type, record)}</span>
                  </div>
                {/if}
                {#if loreKey && topicKeySet.has(loreKey) && !detailHref}
                  <a
                    href="/editor/{encodeURIComponent(loreKey)}"
                    class="lore-link"
                    title="Open lore topic"
                  >Lore</a>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <!-- Lore Topics -->
    <section class="lore-topics">
      <div class="section-header-row">
        <h2 class="section-heading">Lore Topics</h2>
        <span class="badge">{topicRecords.length}</span>
        <select
          value={$listSortBy}
          on:change={(e) => listSortBy.set(e.currentTarget.value)}
          class="sort-select"
          aria-label="Sort topics"
        >
          <option value="name-asc">Name A→Z</option>
          <option value="name-desc">Name Z→A</option>
          <option value="updated-desc">Last Updated</option>
          <option value="version-desc">Version</option>
        </select>
      </div>

      {#if topicRecords.length === 0}
        <div class="lore-empty">
          <p>No {config.singularLabel} lore topics yet.</p>
          <p class="empty-desc">{config.description}</p>
          {#if !$isMobile}
            <button class="btn btn-secondary" on:click={createNewEntity}>
              + New {config.singularLabel}
            </button>
          {/if}
        </div>
      {:else}
        <div class="topic-grid">
          {#each topicRecords as topic (topic.key)}
            <TopicCard
              {topic}
              readOnly={true}
              on:open={() => goto(`/editor/${encodeURIComponent(topic.key)}`)}
            />
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .entity-page {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    height: 100%;
    overflow: auto;
  }

  @media (max-width: 768px) {
    .entity-page { padding: 1rem; gap: 1.25rem; }
    h1 { font-size: 1.35rem; }
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  h1 {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
  }

  .badge {
    background: var(--surface2);
    color: var(--fg-muted);
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  /* Section headings */
  .section-heading {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--fg-muted);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* World Records */
  .world-records {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .record-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .record-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 0.85rem;
    border-radius: 7px;
    background: var(--surface);
    border: 1px solid var(--border);
    transition: border-color 0.12s;
  }

  .record-row--linked { padding: 0; overflow: hidden; }
  .record-row--linked:hover { border-color: var(--accent); }

  .record-link-area {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.6rem 0.85rem;
    text-decoration: none;
    color: inherit;
  }
  .record-link-area:hover .record-name { color: var(--accent); }

  .record-row:not(.record-row--linked):hover {
    border-color: var(--accent);
  }

  .record-main {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    min-width: 0;
  }

  .record-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .record-summary {
    font-size: 0.8rem;
    color: var(--fg-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lore-link {
    font-size: 0.75rem;
    color: var(--accent);
    text-decoration: none;
    border: 1px solid var(--accent);
    border-radius: 4px;
    padding: 0.1rem 0.45rem;
    white-space: nowrap;
    transition: background 0.12s;
    flex-shrink: 0;
  }

  .lore-link:hover {
    background: rgba(201, 168, 76, 0.15);
  }

  /* Lore Topics */
  .lore-topics {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .sort-select {
    margin-left: auto;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font-size: 0.82rem;
    outline: none;
    cursor: pointer;
  }

  .sort-select:focus {
    border-color: var(--accent);
  }

  .topic-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  @media (max-width: 768px) {
    .topic-grid { grid-template-columns: 1fr; gap: 0.75rem; }
  }

  /* Empty / loading states */
  .d1-loading,
  .d1-empty {
    color: var(--fg-muted);
    font-size: 0.9rem;
    padding: 0.75rem 0;
  }

  .d1-error {
    color: #ef9a9a;
    font-size: 0.85rem;
    padding: 0.5rem 0.85rem;
    background: rgba(229, 115, 115, 0.1);
    border: 1px solid #e57373;
    border-radius: 6px;
  }

  .lore-empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    color: var(--fg-muted);
    padding: 1rem 0;
  }

  .lore-empty p { margin: 0; font-size: 0.95rem; }
  .empty-desc { font-size: 0.85rem; opacity: 0.75; }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 100%;
    color: var(--fg-muted);
  }
</style>
