<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    topics,
    syncState,
    settings,
    showToast,
    initialising,
  } from "$lib/stores";
  import { saveTopic, deleteTopic } from "$lib/storage";
  import {
    pullAll,
    adminDelete,
    detectConflict,
    enqueuePendingDelete,
    dequeuePendingDeletes,
  } from "$lib/sync";
  import { getAdminSecret } from "$lib/auth";
  import { conflictQueue } from "$lib/stores";
  import TopicCard from "$lib/components/TopicCard.svelte";
  import NewFromTemplate from "$lib/components/NewFromTemplate.svelte";
  // Add ConflictInfo to the types import:
  import type { Topic, ConflictInfo } from "$lib/types";

  let searchQuery = "";
  let showTemplateModal = false;
  let syncing = false;
  let activeType: string | null = null;
  let activeStatus: string | null = null;

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
        t.text.slice(0, 200).toLowerCase().includes(searchQuery.toLowerCase()),
    );

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
    syncState.set({ status: "syncing" });
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
          console.warn("No admin secret available, skipping pending deletes");
        }
      }

      // ── Pull remote state (deleted keys are now gone from KV) ───────────────
      const remote = await pullAll($settings.workerHost);
      const localMap = new Map($topics.map((t) => [t.key, t]));
      const conflicts: ConflictInfo[] = [];

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
            conflicts.push(conflict);
            continue; // keep processing remaining topics instead of bailing
          }

          // ── Sync meta forward if remote is newer ─────────────────────────────────
          if ((rTopic.meta.version ?? 0) > (local.meta.version ?? 0)) {
            const updated: Topic = { ...local, meta: { ...rTopic.meta } };
            await saveTopic(updated);
            topics.update((ts) => ts.map((t) => (t.key === key ? updated : t)));
          }
        }
      }
      // After the `for (const [key, rTopic] of remote)` loop closes, add:
      if (conflicts.length) {
        conflictQueue.set(conflicts);
        syncState.set({ status: "conflict" });
        showToast(
          `${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} detected — review required`,
          "warning",
        );
      }

      if (newTopics.length) {
        topics.update((ts) =>
          [...ts, ...newTopics].sort((a, b) => a.key.localeCompare(b.key)),
        );
      }
      // ── Flag local topics no longer present on remote ──────────────────────
      for (const [key, local] of localMap) {
        if (!remote.has(key) && !local.meta.removedFromRemote) {
          const flagged: Topic = {
            ...local,
            meta: { ...local.meta, removedFromRemote: true },
          };
          await saveTopic(flagged);
          topics.update((ts) => ts.map((t) => (t.key === key ? flagged : t)));
        }
      }

      if (!conflicts.length) {
        const now = new Date().toISOString();
        syncState.set({ status: "success", lastSync: now });
        showToast(`Synced ${remote.size} remote topics`, "success");
      }
    } catch (err: any) {
      syncState.set({ status: "error", error: err.message });
      showToast("Sync failed — check connection", "error");
    } finally {
      syncing = false;
    }
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
      <button
        class="btn btn-secondary"
        on:click={() => (showTemplateModal = true)}
      >
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

  <div class="filter-bar">
    <button
      class="chip"
      class:chip-active={activeType === null}
      on:click={() => (activeType = null)}
    >All</button>
    {#each typePrefixes as [prefix, count]}
      <button
        class="chip"
        class:chip-active={activeType === prefix}
        on:click={() => (activeType = activeType === prefix ? null : prefix)}
      >{prefix} <span class="chip-count">{count}</span></button>
    {/each}

    <span class="chip-divider" aria-hidden="true"></span>

    <button
      class="chip"
      class:chip-active={activeStatus === "conflicts"}
      on:click={() =>
        (activeStatus = activeStatus === "conflicts" ? null : "conflicts")}
    >⚠ Conflicts</button>
    <button
      class="chip"
      class:chip-active={activeStatus === "removed"}
      on:click={() =>
        (activeStatus = activeStatus === "removed" ? null : "removed")}
    >🗑 Removed from Remote</button>
    <button
      class="chip"
      class:chip-active={activeStatus === "recent"}
      on:click={() =>
        (activeStatus = activeStatus === "recent" ? null : "recent")}
    >🕐 Recent</button>
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

  .icon {
    font-style: normal;
  }
</style>
