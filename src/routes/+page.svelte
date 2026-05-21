<script lang="ts">
  import { goto } from '$app/navigation';
  import { topics, syncState, settings, showToast, initialising } from '$lib/stores';
  import { saveTopic, deleteTopic } from '$lib/storage';
  import { pullAll, adminDelete, detectConflict, enqueuePendingDelete, dequeuePendingDeletes } from '$lib/sync';
  import { getAdminSecret } from '$lib/auth';
  import { activeConflict } from '$lib/stores';
  import TopicCard from '$lib/components/TopicCard.svelte';
  import NewFromTemplate from '$lib/components/NewFromTemplate.svelte';
  import type { Topic } from '$lib/types';

  let searchQuery = '';
  let showTemplateModal = false;
  let syncing = false;

  $: filtered = $topics.filter(
    (t) =>
      t.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.text.slice(0, 200).toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function createNewTopic() {
    const key = prompt('Enter a unique topic key (e.g. "my-character"):');
    if (!key) return;
    if ($topics.find((t) => t.key === key)) {
      showToast(`Topic "${key}" already exists`, 'error');
      return;
    }
    const now = new Date().toISOString();
    const topic: Topic = {
      key,
      text: `# ${key}\n\nStart writing here…\n`,
      meta: { updatedAt: now, version: 1 },
    };
    await saveTopic(topic);
    topics.update((ts) => [...ts, topic].sort((a, b) => a.key.localeCompare(b.key)));
    goto(`/editor/${encodeURIComponent(key)}`);
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete topic "${key}"? This cannot be undone.`)) return;
    enqueuePendingDelete(key); 
    await deleteTopic(key);
    topics.update((ts) => ts.filter((t) => t.key !== key));
    showToast(`Deleted "${key}"`, 'success');
  }

async function syncAll() {
  syncing = true;
  syncState.set({ status: 'syncing' });
  try {
    // ── Flush pending deletes to KV before pulling ──────────────────────────
// ── Flush pending deletes to KV before pulling ──────────────────────────
const pendingDeletes = dequeuePendingDeletes();
if (pendingDeletes.length) {
  const secret = await getAdminSecret();
  if (secret) {
    for (const key of pendingDeletes) {
      try {
        await adminDelete($settings.workerHost, key, secret);
      } catch (err) {
        enqueuePendingDelete(key); // re-queue so next sync retries it
        console.warn(`Delete failed for "${key}", re-queued:`, err);
      }
    }
  } else {
    // No secret available — re-queue everything and skip
    pendingDeletes.forEach(enqueuePendingDelete);
    console.warn('No admin secret available, skipping pending deletes');
  }
}


    // ── Pull remote state (deleted keys are now gone from KV) ───────────────
    const remote = await pullAll($settings.workerHost);
    const localMap = new Map($topics.map((t) => [t.key, t]));

    // Merge in new remote topics
    const newTopics: Topic[] = [];
    for (const [key, rTopic] of remote) {
      if (!localMap.has(key)) {
        const t: Topic = {
          key,
          text: rTopic.text,
          meta: { ...rTopic.meta },
        };
        await saveTopic(t);
        newTopics.push(t);
      } else {
        const local = localMap.get(key)!;
        const conflict = detectConflict(local, rTopic, null);
        if (conflict) {
          activeConflict.set(conflict);
          syncState.set({ status: 'conflict' });
          showToast(`Conflict detected on "${key}" — review required`, 'warning');
          return;
        }
      }
    }

    if (newTopics.length) {
      topics.update((ts) =>
        [...ts, ...newTopics].sort((a, b) => a.key.localeCompare(b.key))
      );
    }

    const now = new Date().toISOString();
    syncState.set({ status: 'success', lastSync: now });
    showToast(`Synced ${remote.size} remote topics`, 'success');
  } catch (err: any) {
    syncState.set({ status: 'error', error: err.message });
    showToast('Sync failed — check connection', 'error');
  } finally {
    syncing = false;
  }
}

</script>

<div class="page topic-list-page">
  <header class="page-header">
    <div class="header-left">
      <h1>Lore Topics</h1>
      <span class="badge">{$topics.length}</span>
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost" on:click={syncAll} disabled={syncing}>
        <span class="icon">{syncing ? '↻' : '⇅'}</span>
        {syncing ? 'Syncing…' : 'Sync'}
      </button>
      <button class="btn btn-secondary" on:click={() => (showTemplateModal = true)}>
        ＋ From Template
      </button>
      <button class="btn btn-primary" on:click={createNewTopic}>
        ＋ New Topic
      </button>
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
  </div>

  {#if $syncState.status === 'error'}
    <div class="alert alert-error">{$syncState.error ?? 'Sync error'}</div>
  {/if}

  {#if filtered.length === 0}
    <div class="empty-state">
      {#if searchQuery}
        <p>No topics match "<strong>{searchQuery}</strong>"</p>
      {:else}
        <p>No topics yet. Create one or import a bundle.</p>
      {/if}
    </div>
  {:else}
    <div class="topic-grid">
      {#each filtered as topic (topic.key)}
        <TopicCard
          {topic}
          on:open={() => goto(`/editor/${encodeURIComponent(topic.key)}`)}
          on:delete={() => handleDelete(topic.key)}
        />
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
    max-width: 480px;
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

  .topic-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
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

  .icon { font-style: normal; }
</style>
