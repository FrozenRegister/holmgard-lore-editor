<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { topics, settings, showToast, isMobile, backlinksIndex } from '$lib/stores';
  import { saveTopic, loadTopic } from '$lib/storage';
  import { pushHistory } from '$lib/history';
  import { adminSave, enqueue } from '$lib/sync';
  import { getAdminSecret } from '$lib/auth';
  import { renderMarkdown } from '$lib/marked-config';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
  import { fetchCharacterById, patchCharacter } from '$lib/d1-writes';
  import { parseCharacterSheet, generateCharacterTopic } from '$lib/character-sheet';
  import {
    fetchCharacterRelationships, fetchCharacterInventory, fetchLocationById,
  } from '$lib/d1-reads';
  import type {
    CharacterRecord, CharacterRelationships, CharacterInventoryItem, LocationDetailRecord,
  } from '$lib/d1-reads';
  import type { Topic } from '$lib/types';

  // ── Route param ───────────────────────────────────────────────────────────────
  $: id = $page.params.id ?? '';

  // ── Character D1 state ────────────────────────────────────────────────────────
  let character: CharacterRecord | null = null;
  let charLoading = false;
  let charError: string | null = null;
  let relationships: CharacterRelationships = { npc_relationships: [], party_members: [] };
  let inventory: CharacterInventoryItem[] = [];
  let currentLocation: LocationDetailRecord | null = null;
  let showRelationships = false;
  let showInventory = false;

  // ── Topic / editor state ──────────────────────────────────────────────────────
  let topic: Topic | null = null;
  let editorText = '';
  let isSaving = false;
  let isSyncing = false;
  let isDirty = false;
  let showPreview = true;
  let d1SyncStatus: 'idle' | 'syncing' | 'synced' | 'no-lore' | 'error' = 'idle';
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  const AUTOSAVE_DELAY = 5000;

  // ── Load character from D1 ────────────────────────────────────────────────────
  $: if (id && $settings.workerHost) loadCharacter();

  async function loadCharacter() {
    charLoading = true;
    charError = null;
    character = null;
    topic = null;
    relationships = { npc_relationships: [], party_members: [] };
    inventory = [];
    currentLocation = null;
    try {
      character = await fetchCharacterById($settings.workerHost, id);
      if (!character) { charError = 'Character not found'; return; }

      // Load topic + contextual data in parallel
      const [relResult, invResult, locResult] = await Promise.allSettled([
        fetchCharacterRelationships($settings.workerHost, id),
        fetchCharacterInventory($settings.workerHost, id),
        character.current_room_id
          ? fetchLocationById($settings.workerHost, character.current_room_id)
          : Promise.resolve(null),
      ]);
      if (relResult.status === 'fulfilled') relationships = relResult.value;
      if (invResult.status === 'fulfilled') inventory = invResult.value;
      if (locResult.status === 'fulfilled') currentLocation = locResult.value;

      if (character.kv_origin) {
        await loadTopicForKey(character.kv_origin);
      } else {
        d1SyncStatus = 'no-lore';
      }
    } catch (e) {
      charError = e instanceof Error ? e.message : 'Failed to load character';
    } finally {
      charLoading = false;
    }
  }

  async function loadTopicForKey(key: string) {
    const t = await loadTopic(key) ?? $topics.find(x => x.key === key) ?? null;
    if (!t) { d1SyncStatus = 'no-lore'; return; }
    topic = t;
    editorText = t.text;
    isDirty = false;
    d1SyncStatus = 'idle';
  }

  // ── Autosave ──────────────────────────────────────────────────────────────────
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(performSave, AUTOSAVE_DELAY);
  }

  function handleEditorChange(event: CustomEvent<string>) {
    editorText = event.detail;
    isDirty = true;
    scheduleAutosave();
  }

  async function performSave() {
    if (!topic || !isDirty) return;
    isSaving = true;
    try {
      const updated: Topic = {
        ...topic,
        text: editorText,
        meta: {
          ...topic.meta,
          updatedAt: new Date().toISOString(),
          version: topic.meta.version + 1,
        },
      };
      await saveTopic(updated);
      await pushHistory(topic.key, editorText, updated.meta.version, 'local');
      topic = updated;
      isDirty = false;
      topics.update(ts => ts.map(t => (t.key === updated.key ? updated : t)));
      // Silently sync sheet fields to D1 if we have a character and admin secret
      await syncSheetToD1(editorText);
    } catch (err) {
      console.error('Save error:', err);
      showToast('Save failed', 'error');
    } finally {
      isSaving = false;
    }
  }

  async function syncSheetToD1(markdown: string) {
    if (!character) return;
    const patch = parseCharacterSheet(markdown);
    if (!patch) return;
    const secret = await getAdminSecret();
    if (!secret) return;
    d1SyncStatus = 'syncing';
    try {
      await patchCharacter($settings.workerHost, character.id, patch, secret);
      d1SyncStatus = 'synced';
    } catch (err) {
      console.error('[D1 sync]', err);
      d1SyncStatus = 'error';
    }
  }

  // ── Sync to remote KV ─────────────────────────────────────────────────────────
  async function syncTopic() {
    if (!topic) return;
    if (isDirty) await performSave();
    isSyncing = true;
    try {
      const secret = await getAdminSecret();
      if (!secret) { showToast('No admin secret — configure in Settings', 'warning'); return; }
      await adminSave($settings.workerHost, topic.key, topic.text, secret);
      const now = new Date().toISOString();
      const synced: Topic = { ...topic, meta: { ...topic.meta, syncedAt: now } };
      await saveTopic(synced);
      topic = synced;
      topics.update(ts => ts.map(t => (t.key === synced.key ? synced : t)));
      showToast('Synced to remote', 'success');
    } catch (err: any) {
      await enqueue(topic.key, topic.text);
      showToast('Sync failed — added to offline queue', 'warning');
    } finally {
      isSyncing = false;
    }
  }

  // ── Create lore topic from D1 template ────────────────────────────────────────
  async function createLoreTopic() {
    if (!character) return;
    const key = `character:${character.name.toLowerCase().replace(/\s+/g, '-')}`;
    if ($topics.find(t => t.key === key)) {
      showToast(`Topic "${key}" already exists`, 'error');
      return;
    }
    const text = generateCharacterTopic(character);
    const now = new Date().toISOString();
    const newTopic: Topic = { key, text, meta: { updatedAt: now, version: 1 } };
    await saveTopic(newTopic);
    topics.update(ts => [...ts, newTopic].sort((a, b) => a.key.localeCompare(b.key)));
    topic = newTopic;
    editorText = text;
    isDirty = false;
    d1SyncStatus = 'idle';
    showToast(`Created lore topic "${key}"`, 'success');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  onDestroy(() => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (isDirty) performSave();
  });

  $: d1SyncLabel = d1SyncStatus === 'syncing' ? 'Syncing D1…'
    : d1SyncStatus === 'synced' ? 'D1 synced'
    : d1SyncStatus === 'error' ? 'D1 sync failed'
    : d1SyncStatus === 'no-lore' ? 'No lore topic'
    : '';

  $: footerBacklinks = topic ? ($backlinksIndex.get(topic.key) ?? []) : [];
</script>

<svelte:window on:beforeunload={(e) => { if (!$isMobile && isDirty) { e.preventDefault(); e.returnValue = ''; } }} />

<div class="entity-editor-page">
  <!-- Toolbar / breadcrumb -->
  <div class="editor-toolbar">
    <a href="/entities/character" class="btn btn-ghost btn-sm breadcrumb-link">← Characters</a>
    <h2 class="topic-key">
      {character?.name ?? id}
      {#if character?.character_type === 'pc'}
        <span class="type-chip">PC</span>
      {:else if character}
        <span class="type-chip npc">NPC</span>
      {/if}
    </h2>

    {#if !$isMobile && d1SyncLabel}
      <span class="d1-chip d1-chip--{d1SyncStatus}">{d1SyncLabel}</span>
    {/if}

    {#if !$isMobile && character}
      <div class="toolbar-right">
        {#if currentLocation}
          <a class="btn btn-ghost btn-sm location-link" href="/entities/location/{encodeURIComponent(character.current_room_id ?? '')}"
            title="Current location">
            📍 {currentLocation.name}
          </a>
        {/if}
        <button class="btn btn-ghost btn-sm" on:click={() => { showRelationships = !showRelationships; showInventory = false; }}
          title="NPC relationships and party members">
          Relations
          {#if relationships.npc_relationships.length + relationships.party_members.length > 0}
            <span class="ctx-count">{relationships.npc_relationships.length + relationships.party_members.length}</span>
          {/if}
        </button>
        <button class="btn btn-ghost btn-sm" on:click={() => { showInventory = !showInventory; showRelationships = false; }}
          title="Character inventory">
          Inventory
          {#if inventory.length > 0}
            <span class="ctx-count">{inventory.length}</span>
          {/if}
        </button>
        {#if topic}
          {#if isSaving}
            <span class="status-badge saving">Saving…</span>
          {:else if isDirty}
            <span class="status-badge dirty">Unsaved</span>
          {:else}
            <span class="status-badge saved">Saved</span>
          {/if}
          <button class="btn btn-ghost btn-sm" on:click={() => (showPreview = !showPreview)}>
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button class="btn btn-ghost btn-sm" on:click={performSave} disabled={!isDirty || isSaving}>
            Save
          </button>
          <button class="btn btn-primary btn-sm" on:click={syncTopic} disabled={isSyncing}>
            {isSyncing ? 'Syncing…' : 'Sync ↑'}
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Loading / error states -->
  {#if charLoading}
    <div class="center-state">Loading character…</div>
  {:else if charError}
    <div class="center-state error-state">
      <p>{charError}</p>
      <a href="/entities/character" class="btn btn-secondary">Back to Characters</a>
    </div>

  <!-- No lore topic yet -->
  {:else if d1SyncStatus === 'no-lore' && !topic}
    <div class="center-state no-lore-state">
      {#if character}
        <div class="char-summary">
          <div class="char-name">{character.name}</div>
          <div class="char-meta">
            {character.race} {character.character_class} · Lv.{character.level} ·
            {character.hp}/{character.max_hp} HP · AC {character.ac}
          </div>
          {#if currentLocation}
            <div class="char-location">
              Currently in:
              <a href="/entities/location/{encodeURIComponent(character.current_room_id ?? '')}" class="location-inline">{currentLocation.name}</a>
            </div>
          {/if}
        </div>
        <p class="no-lore-hint">This character has no lore topic yet.</p>
        <button class="btn btn-primary" on:click={createLoreTopic}>
          Create Lore Topic
        </button>
        <p class="no-lore-hint-sub">
          Generates a markdown document pre-filled from D1 with a
          <code>## Character Sheet</code> section.
        </p>
        {#if character.kv_origin}
          {@const refs = $backlinksIndex.get(character.kv_origin) ?? []}
          {#if refs.length > 0}
            <div class="backlinks-hint">
              <span class="backlinks-hint-label">Referenced by {refs.length} {refs.length === 1 ? 'topic' : 'topics'}:</span>
              <ul class="backlinks-hint-list">
                {#each refs as refKey}
                  <li><a href="/editor/{encodeURIComponent(refKey)}">{refKey}</a></li>
                {/each}
              </ul>
            </div>
          {/if}
        {/if}
      {/if}
    </div>

  <!-- Editor -->
  {:else if $isMobile}
    <div class="preview-full">
      <MarkdownPreview markdown={editorText} />
    </div>
  {:else if topic}
    <div class="editor-body" class:preview-hidden={!showPreview}>
      <div class="editor-pane">
        <MonacoEditor value={editorText} on:change={handleEditorChange} />
      </div>
      {#if showPreview}
        <div class="preview-pane">
          <MarkdownPreview markdown={editorText} />
        </div>
      {/if}
    </div>
  {/if}

  <!-- Footer -->
  {#if topic}
    <div class="editor-footer">
      <span>v{topic.meta.version}</span>
      <span>·</span>
      <span>Updated {new Date(topic.meta.updatedAt).toLocaleString()}</span>
      {#if topic.meta.syncedAt}
        <span>· Synced {new Date(topic.meta.syncedAt).toLocaleString()}</span>
      {/if}
      <span class="footer-key">· {topic.key}</span>
      {#if footerBacklinks.length > 0}
        <span class="footer-separator">·</span>
        <span class="footer-backlinks">
          Referenced by:
          {#each footerBacklinks as refKey, i}
            <a href="/editor/{encodeURIComponent(refKey)}" class="footer-backlink">{refKey}</a>{#if i < footerBacklinks.length - 1},{/if}
          {/each}
        </span>
      {/if}
    </div>
  {/if}
</div>

<!-- Relationships drawer -->
{#if !$isMobile && showRelationships}
  <div class="ctx-overlay" role="dialog" aria-modal="true" aria-label="Relationships">
    <div class="ctx-panel">
      <div class="ctx-header">
        <h3>Relationships</h3>
        <button class="btn-icon" on:click={() => (showRelationships = false)} aria-label="Close">✕</button>
      </div>
      <div class="ctx-body">
        {#if relationships.party_members.length > 0}
          <div class="ctx-section-title">Party</div>
          <ul class="ctx-list">
            {#each relationships.party_members as m}
              <li class="ctx-row">
                <span class="ctx-name">
                  {#if m.kv_origin}
                    <a href="/editor/{encodeURIComponent(m.kv_origin)}">{m.name}</a>
                  {:else}
                    {m.name}
                  {/if}
                </span>
                <span class="ctx-tag">{m.role}</span>
                <span class="ctx-muted">{m.party_name}</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if relationships.npc_relationships.length > 0}
          <div class="ctx-section-title">Known Characters</div>
          <ul class="ctx-list">
            {#each relationships.npc_relationships as r}
              <li class="ctx-row">
                <span class="ctx-name">
                  {#if r.target_kv_origin}
                    <a href="/editor/{encodeURIComponent(r.target_kv_origin)}">{r.target_name}</a>
                  {:else}
                    {r.target_name}
                  {/if}
                </span>
                <span class="ctx-tag ctx-tag--{r.familiarity}">{r.familiarity}</span>
                <span class="ctx-muted">{r.disposition} · {r.interaction_count}×</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if relationships.npc_relationships.length === 0 && relationships.party_members.length === 0}
          <p class="ctx-empty">No relationships recorded in D1 yet.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Inventory drawer -->
{#if !$isMobile && showInventory}
  <div class="ctx-overlay" role="dialog" aria-modal="true" aria-label="Inventory">
    <div class="ctx-panel">
      <div class="ctx-header">
        <h3>Inventory</h3>
        <button class="btn-icon" on:click={() => (showInventory = false)} aria-label="Close">✕</button>
      </div>
      <div class="ctx-body">
        {#if inventory.length === 0}
          <p class="ctx-empty">No items in inventory.</p>
        {:else}
          <ul class="ctx-list">
            {#each inventory as item}
              <li class="ctx-row">
                <span class="ctx-name">{item.name}</span>
                {#if item.equipped}
                  <span class="ctx-tag ctx-tag--equipped">equipped{item.slot ? ` (${item.slot})` : ''}</span>
                {/if}
                <span class="ctx-muted">{item.type}{item.quantity > 1 ? ` ×${item.quantity}` : ''} · {item.value}gp</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .entity-editor-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .breadcrumb-link {
    color: var(--fg-muted);
    white-space: nowrap;
  }

  .topic-key {
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent);
    margin: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type-chip {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    background: rgba(100, 180, 255, 0.15);
    color: #64b4ff;
    flex-shrink: 0;
  }
  .type-chip.npc {
    background: rgba(180, 140, 255, 0.15);
    color: #b48cff;
  }

  .d1-chip {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .d1-chip--synced { background: rgba(76, 175, 80, 0.15); color: #81c784; }
  .d1-chip--syncing { background: rgba(201, 168, 76, 0.2); color: var(--accent); }
  .d1-chip--error { background: rgba(229, 115, 115, 0.15); color: #e57373; }
  .d1-chip--no-lore { background: var(--surface2); color: var(--fg-muted); }

  .toolbar-right { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }

  .status-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .saving { background: rgba(201, 168, 76, 0.2); color: var(--accent); }
  .dirty  { background: rgba(255, 183, 77, 0.2); color: #ffb74d; }
  .saved  { background: rgba(76, 175, 80, 0.15); color: #81c784; }

  .editor-body {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    overflow: hidden;
  }
  .editor-body.preview-hidden { grid-template-columns: 1fr; }
  .editor-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border);
  }
  .preview-pane { overflow: auto; background: var(--bg); }

  .preview-full { flex: 1; overflow: auto; background: var(--bg); }

  .editor-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.35rem 1rem;
    font-size: 0.75rem;
    color: var(--fg-muted);
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .footer-key { opacity: 0.6; }

  .center-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--fg-muted);
    padding: 2rem;
    text-align: center;
  }

  .error-state { color: #e57373; }

  .no-lore-state {
    max-width: 480px;
    margin: auto;
  }

  .char-summary {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem 1.5rem;
    text-align: left;
    width: 100%;
  }
  .char-name { font-size: 1.25rem; font-weight: 700; color: var(--accent); }
  .char-meta { font-size: 0.85rem; color: var(--fg-muted); margin-top: 0.25rem; }
  .char-location { font-size: 0.85rem; color: var(--fg-muted); margin-top: 0.35rem; }
  .location-inline { color: var(--accent); text-decoration: none; }
  .location-inline:hover { text-decoration: underline; }
  .location-link { text-decoration: none; }

  .no-lore-hint { color: var(--fg-muted); margin: 0; }
  .no-lore-hint-sub { font-size: 0.8rem; color: var(--fg-muted); opacity: 0.75; margin: 0; }
  .no-lore-hint-sub code { background: var(--surface2); padding: 0.1rem 0.3rem; border-radius: 3px; }

  .backlinks-hint {
    margin-top: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface2);
    border-radius: 8px;
    text-align: left;
    width: 100%;
  }
  .backlinks-hint-label { font-size: 0.8rem; color: var(--fg-muted); font-weight: 600; }
  .backlinks-hint-list {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .backlinks-hint-list li a {
    font-size: 0.8rem;
    color: var(--accent);
    text-decoration: none;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }
  .backlinks-hint-list li a:hover { text-decoration: underline; }

  .footer-separator { opacity: 0.5; }
  .footer-backlinks { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .footer-backlink { color: var(--accent); text-decoration: none; font-size: 0.75rem; }
  .footer-backlink:hover { text-decoration: underline; }

  /* Context count badge in toolbar buttons */
  .ctx-count {
    display: inline-block;
    background: var(--accent);
    color: var(--bg);
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0.05rem 0.32rem;
    border-radius: 999px;
    margin-left: 0.2rem;
    line-height: 1.4;
    vertical-align: middle;
  }

  /* Context drawer (relationships / inventory) */
  .ctx-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 500;
    display: flex;
    justify-content: flex-end;
  }
  .ctx-panel {
    width: min(360px, 90vw);
    background: var(--surface);
    height: 100%;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
  }
  .ctx-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .ctx-header h3 { margin: 0; font-size: 1rem; }
  .ctx-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 0.5rem;
  }
  .ctx-section-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    padding: 0.5rem 0.75rem 0.25rem;
  }
  .ctx-list {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
  }
  .ctx-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    flex-wrap: wrap;
  }
  .ctx-row:hover { background: var(--surface2); }
  .ctx-name { font-size: 0.875rem; font-weight: 600; }
  .ctx-name a { color: var(--accent); text-decoration: none; }
  .ctx-name a:hover { text-decoration: underline; }
  .ctx-muted { font-size: 0.75rem; color: var(--fg-muted); margin-left: auto; }
  .ctx-tag {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: capitalize;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    background: var(--surface2);
    color: var(--fg-muted);
    white-space: nowrap;
  }
  .ctx-tag--friend, .ctx-tag--close_friend { background: rgba(76,175,80,0.15); color: #81c784; }
  .ctx-tag--rival, .ctx-tag--enemy { background: rgba(229,115,115,0.15); color: #e57373; }
  .ctx-tag--equipped { background: rgba(100,180,255,0.15); color: #64b4ff; }
  .ctx-empty { color: var(--fg-muted); text-align: center; padding: 2rem 1rem; font-size: 0.875rem; }
  .btn-icon {
    background: none; border: none; color: var(--fg-muted); cursor: pointer;
    font-size: 1rem; padding: 0.25rem; border-radius: 4px; line-height: 1;
  }
  .btn-icon:hover { color: var(--fg); background: var(--surface2); }
</style>
