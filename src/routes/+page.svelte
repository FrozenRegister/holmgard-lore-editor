<script lang="ts">
  import { goto } from "$app/navigation";
  import { topics, syncState, showToast, conflictQueue, isMobile, listActiveType, listActiveStatus, listSortBy, selectedForDeletion } from "$lib/stores";
  import { saveTopic, deleteTopic } from "$lib/storage";
  import { enqueuePendingDelete } from "$lib/sync";
  import { runSync } from "$lib/syncAll";
  import TopicCard from "$lib/components/TopicCard.svelte";
  import NewFromTemplate from "$lib/components/NewFromTemplate.svelte";
  import type { Topic } from "$lib/types";

  let searchQuery = "";
  let showTemplateModal = false;
  let syncing = false;

  $: activeType = $listActiveType;
  $: activeStatus = $listActiveStatus;
  $: sortBy = $listSortBy;
  $: isRemovalMode = activeStatus === "removed";

  $: typePrefixes = (() => {
    const counts = new Map<string, number>();
    for (const t of $topics) {
      const idx = t.key.indexOf(":");
      const prefix = idx !== -1 ? t.key.slice(0, idx) : "other";
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => {
      if (a === "other") return 1;
      if (b === "other") return -1;
      return a.localeCompare(b);
    });
  })();

  $: filtered = $topics
    .filter(
      (t) =>
        !activeType ||
        t.key.startsWith(activeType + ":") ||
        (activeType === "other" && !t.key.includes(":")),
    )
    .filter((t) => {
      if (!activeStatus) return true;
      if (activeStatus === "conflicts")
        return $conflictQueue.some((c) => c.key === t.key);
      if (activeStatus === "removed") return t.meta.removedFromRemote === true;
      if (activeStatus === "recent")
        return (
          new Date(t.meta.updatedAt) >
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
      return true;
    })
    .filter(
      (t) =>
        !searchQuery ||
        t.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.text.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "name-desc") return b.key.localeCompare(a.key);
      if (sortBy === "updated-desc")
        return new Date(b.meta.updatedAt as string).getTime() - new Date(a.meta.updatedAt as string).getTime();
      if (sortBy === "updated-asc")
        return new Date(a.meta.updatedAt as string).getTime() - new Date(b.meta.updatedAt as string).getTime();
      if (sortBy === "version-desc")
        return (b.meta.version ?? 0) - (a.meta.version ?? 0);
      if (sortBy === "type") {
        const aPrefix = a.key.includes(":") ? a.key.slice(0, a.key.indexOf(":")) : "￿";
        const bPrefix = b.key.includes(":") ? b.key.slice(0, b.key.indexOf(":")) : "￿";
        const cmp = aPrefix.localeCompare(bPrefix);
        return cmp !== 0 ? cmp : a.key.localeCompare(b.key);
      }
      return a.key.localeCompare(b.key); // name-asc default
    });

  async function createNewTopic() {
    const key = prompt('Enter a unique topic key (e.g. "my-character"):');
    if (!key) return;
    if ($topics.find((t) => t.key === key)) {
      showToast(`Topic "${key}" already exists`, "error");
      return;
    }
    const now = new Date().toISOString();
    const topic: Topic = {
      key,
      text: `# ${key}\n\nStart writing here…\n`,
      meta: { updatedAt: now, version: 1 },
    };
    await saveTopic(topic);
    topics.update((ts) =>
      [...ts, topic].sort((a, b) => a.key.localeCompare(b.key)),
    );
    goto(`/editor/${encodeURIComponent(key)}`);
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete topic "${key}"? This cannot be undone.`)) return;
    enqueuePendingDelete(key);
    await deleteTopic(key);
    topics.update((ts) => ts.filter((t) => t.key !== key));
    showToast(`Deleted "${key}"`, "success");
  }

  async function syncAll() {
    syncing = true;
    try {
      await runSync();
    } finally {
      syncing = false;
    }
  }

  function toggleSelected(key: string) {
    const selected = new Set($selectedForDeletion);
    selected.has(key) ? selected.delete(key) : selected.add(key);
    selectedForDeletion.set([...selected]);
  }

  function toggleSelectAll() {
    const selected = new Set($selectedForDeletion);
    if (selected.size === filtered.length) {
      selectedForDeletion.set([]);
    } else {
      selectedForDeletion.set(filtered.map(t => t.key));
    }
  }

  async function deleteSelected() {
    const selected = new Set($selectedForDeletion);
    if (selected.size === 0) {
      showToast('No topics selected', 'warning');
      return;
    }
    if (!confirm(`Delete ${selected.size} selected topic${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    let deleted = 0;
    for (const key of selected) {
      await deleteTopic(key);
      deleted++;
    }
    topics.update((ts) => ts.filter((t) => !selected.has(t.key)));
    selectedForDeletion.set([]);
    showToast(`Deleted ${deleted} topic${deleted !== 1 ? 's' : ''}`, 'success');
  }
</script>

<svelte:window
  on:keydown={(e) => {
    if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!syncing) syncAll();
    }
  }}
/>

<div class="page topic-list-page">
  <header class="page-header">
    <div class="header-left">
      <h1>Lore Topics</h1>
      <span class="badge">{$topics.length}</span>
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost" on:click={syncAll} disabled={syncing}>
        <span class="icon">{syncing ? "↻" : "⇅"}</span>
        {syncing ? "Syncing…" : "Sync"}
      </button>
      {#if !$isMobile}
        <button
          class="btn btn-secondary"
          on:click={() => (showTemplateModal = true)}
        >
          ＋ From Template
        </button>
        <button class="btn btn-primary" on:click={createNewTopic}>
          ＋ New Topic
        </button>
      {/if}
    </div>
  </header>

  <div class="search-bar">
    <input
      type="search"
      placeholder="Search topics…"
      bind:value={searchQuery}
      class="search-input"
      aria-label="Search topics"
    />
    <span class="sort-label">Sort:</span>
    <select value={sortBy} on:change={(e) => listSortBy.set(e.currentTarget.value)} class="sort-select" aria-label="Sort topics">
      <option value="name-asc">Name A→Z</option>
      <option value="name-desc">Name Z→A</option>
      <option value="updated-desc">Last Updated (newest)</option>
      <option value="updated-asc">Last Updated (oldest)</option>
      <option value="version-desc">Version (highest)</option>
      <option value="type">Type</option>
    </select>
  </div>

  <div class="filter-bar">
    <button
      class="chip"
      class:chip-active={activeType === null}
      on:click={() => listActiveType.set(null)}
    >All</button>
    {#each typePrefixes as [prefix, count]}
      <button
        class="chip"
        class:chip-active={activeType === prefix}
        on:click={() => listActiveType.set(activeType === prefix ? null : prefix)}
      >{prefix} <span class="chip-count">{count}</span></button>
    {/each}

    <span class="chip-divider" aria-hidden="true"></span>

    <button
      class="chip"
      class:chip-active={activeStatus === "conflicts"}
      on:click={() =>
        listActiveStatus.set(activeStatus === "conflicts" ? null : "conflicts")}
    >⚠ Conflicts</button>
    <button
      class="chip"
      class:chip-active={activeStatus === "removed"}
      on:click={() =>
        listActiveStatus.set(activeStatus === "removed" ? null : "removed")}
    >🗑 Removed from Remote</button>
    <button
      class="chip"
      class:chip-active={activeStatus === "recent"}
      on:click={() =>
        listActiveStatus.set(activeStatus === "recent" ? null : "recent")}
    >🕐 Recent</button>

    {#if isRemovalMode && filtered.length > 0}
      <span class="chip-divider" aria-hidden="true"></span>
      <button
        class="chip"
        on:click={toggleSelectAll}
      >
        {$selectedForDeletion.length === filtered.length ? "Deselect All" : "Select All"}
      </button>
      <button
        class="chip chip-danger"
        on:click={deleteSelected}
        disabled={$selectedForDeletion.length === 0}
      >
        🗑 Delete ({$selectedForDeletion.length})
      </button>
    {/if}
  </div>

  {#if $syncState.status === "error"}
    <div class="alert alert-error">{$syncState.error ?? "Sync error"}</div>
  {/if}

  {#if filtered.length === 0}
    <div class="empty-state">
      {#if searchQuery || activeType || activeStatus}
        <p>No topics match the current filters.</p>
      {:else}
        <p>No topics yet. Create one or import a bundle.</p>
      {/if}
    </div>
  {:else}
    <div class={`topic-grid ${isRemovalMode ? 'with-checkboxes' : ''}`}>
      {#each filtered as topic (topic.key)}
        <div class="topic-wrapper">
          {#if isRemovalMode}
            <input
              type="checkbox"
              class="topic-checkbox"
              checked={$selectedForDeletion.includes(topic.key)}
              on:change={() => toggleSelected(topic.key)}
              aria-label={`Select ${topic.key}`}
            />
          {/if}
          <TopicCard
            {topic}
            readOnly={$isMobile}
            on:open={() => goto(`/editor/${encodeURIComponent(topic.key)}`)}
            on:delete={() => handleDelete(topic.key)}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showTemplateModal}
  <NewFromTemplate on:close={() => (showTemplateModal = false)} />
{/if}

<style>
  .topic-list-page {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    height: 100%;
    overflow: auto;
  }

  @media (max-width: 768px) {
    .topic-list-page { padding: 1rem; gap: 0.85rem; }
    h1 { font-size: 1.35rem; }
    .page-header { flex-direction: column; align-items: stretch; }
    .header-actions { width: 100%; flex-direction: column; }
    .header-actions .btn { width: 100%; min-height: 44px; }
    .topic-grid { grid-template-columns: 1fr; gap: 0.75rem; }
    .search-bar { grid-template-columns: 1fr; }
    .sort-label { display: none; }
    .sort-select { width: 100%; min-height: 44px; padding: 0.6rem; }
    .search-input { min-height: 44px; padding: 0.65rem 0.85rem; }
    .filter-bar { gap: 0.5rem; }
    .chip { padding: 0.35rem 0.75rem; min-height: 40px; display: flex; align-items: center; }
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

  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .search-bar {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
  }

  .sort-label {
    font-size: 0.82rem;
    color: var(--fg-muted);
    white-space: nowrap;
  }

  .sort-select {
    padding: 0.48rem 0.6rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font-size: 0.85rem;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .sort-select:focus {
    border-color: var(--accent);
  }

  .search-input {
    width: 100%;
    padding: 0.5rem 0.85rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .search-input:focus {
    border-color: var(--accent);
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .chip {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.25rem 0.65rem;
    font-size: 0.78rem;
    color: var(--fg-muted);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    white-space: nowrap;
  }

  .chip:hover {
    border-color: var(--accent);
    color: var(--fg);
  }

  .chip-active {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .chip-count {
    opacity: 0.7;
  }

  .chip-divider {
    display: inline-block;
    width: 1px;
    height: 1rem;
    background: var(--border);
    margin: 0 0.25rem;
    flex-shrink: 0;
  }

  .chip-danger {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
    color: #ef4444;
  }

  .chip-danger:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: #dc2626;
    color: #dc2626;
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .topic-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .topic-grid.with-checkboxes {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }

  .topic-wrapper {
    position: relative;
  }

  .topic-grid.with-checkboxes .topic-wrapper {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .topic-checkbox {
    margin-top: 0.5rem;
    cursor: pointer;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
  }

  .topic-grid.with-checkboxes :global(.topic-card) {
    flex: 1;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    font-size: 1rem;
  }

  .alert {
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .alert-error {
    background: rgba(229, 115, 115, 0.12);
    border: 1px solid #e57373;
    color: #ef9a9a;
  }

  .icon {
    font-style: normal;
  }
</style>
