<script lang="ts">
  import { settings } from '$lib/stores';
  import { getAdminSecret } from '$lib/auth';
  import { fetchEntityRelations } from '$lib/d1-reads';
  import { createEntityRelation, deleteEntityRelation, updateEntityRelation } from '$lib/d1-writes';
  import { ENTITY_FETCHERS } from '$lib/d1-reads';
  import type { EntityRelationRecord } from '$lib/d1-reads';

  // ── Props ─────────────────────────────────────────────────────────────────────
  // entityTypeSlug: plural API slug, e.g. "characters", "locations"
  export let entityTypeSlug: string;
  export let entityId: string;
  export let onClose: () => void = () => {};

  // ── State ─────────────────────────────────────────────────────────────────────
  let relations: EntityRelationRecord[] = [];
  let loading = false;
  let error: string | null = null;

  let showAddForm = false;
  let addError: string | null = null;
  let adding = false;

  let form = {
    to_type: 'characters',
    to_id: '',
    relation_type: '',
    attitude: 0,
    has_attitude: false,
    is_bidirectional: true,
    is_pinned: false,
    is_private: false,
    notes: '',
  };

  // For target entity autocomplete
  let targetOptions: { id: string; name: string }[] = [];
  let loadingTargets = false;

  const ENTITY_TYPES = [
    { slug: 'characters', label: 'Character' },
    { slug: 'locations',  label: 'Location' },
    { slug: 'nations',    label: 'Nation' },
    { slug: 'regions',    label: 'Region' },
    { slug: 'quests',     label: 'Quest' },
    { slug: 'items',      label: 'Item' },
  ];

  const RELATION_SUGGESTIONS = [
    'ally', 'enemy', 'friend', 'rival', 'neutral', 'partner',
    'knows', 'serves', 'commands', 'protects', 'hunts', 'fears',
    'owns', 'visits', 'involves', 'participates', 'guards', 'haunts',
  ];

  // ── Load ──────────────────────────────────────────────────────────────────────
  $: if (entityTypeSlug && entityId && $settings.workerHost) loadRelations();

  async function loadRelations() {
    loading = true;
    error = null;
    try {
      relations = await fetchEntityRelations($settings.workerHost, entityTypeSlug, entityId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load relations';
    } finally {
      loading = false;
    }
  }

  async function loadTargetOptions() {
    loadingTargets = true;
    targetOptions = [];
    try {
      const fetcher = ENTITY_FETCHERS[form.to_type];
      if (fetcher) {
        const entities = await fetcher($settings.workerHost);
        targetOptions = entities.map(e => ({ id: (e as unknown as Record<string, unknown>).id as string, name: (e as unknown as Record<string, unknown>).name as string }));
      }
    } catch {
      targetOptions = [];
    } finally {
      loadingTargets = false;
    }
  }

  $: if (form.to_type) { form.to_id = ''; loadTargetOptions(); }

  // ── Add ───────────────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!form.to_id || !form.relation_type.trim()) {
      addError = 'Target entity and relation type are required.';
      return;
    }
    addError = null;
    adding = true;
    try {
      const secret = await getAdminSecret();
      if (!secret) { addError = 'No admin secret — configure in Settings'; return; }
      await createEntityRelation($settings.workerHost, {
        from_type: entityTypeSlug,
        from_id:   entityId,
        to_type:   form.to_type,
        to_id:     form.to_id,
        relation_type: form.relation_type.trim(),
        attitude:  form.has_attitude ? form.attitude : null,
        is_bidirectional: form.is_bidirectional,
        is_pinned:   form.is_pinned,
        is_private:  form.is_private,
        notes: form.notes.trim() || null,
      }, secret);
      showAddForm = false;
      resetForm();
      await loadRelations();
    } catch (e) {
      addError = e instanceof Error ? e.message : 'Failed to create relation';
    } finally {
      adding = false;
    }
  }

  function resetForm() {
    form = { to_type: 'characters', to_id: '', relation_type: '', attitude: 0, has_attitude: false, is_bidirectional: true, is_pinned: false, is_private: false, notes: '' };
    addError = null;
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      const secret = await getAdminSecret();
      if (!secret) return;
      await deleteEntityRelation($settings.workerHost, id, secret);
      await loadRelations();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    }
  }

  // ── Toggle pin ────────────────────────────────────────────────────────────────
  async function togglePin(rel: EntityRelationRecord) {
    try {
      const secret = await getAdminSecret();
      if (!secret) return;
      await updateEntityRelation($settings.workerHost, rel.id, { is_pinned: !rel.is_pinned }, secret);
      await loadRelations();
    } catch { /* ignore */ }
  }

  // ── Attitude helpers ──────────────────────────────────────────────────────────
  function attitudeClass(attitude: number | null): string {
    if (attitude === null || attitude === undefined) return '';
    if (attitude > 33) return 'attitude--ally';
    if (attitude < -33) return 'attitude--hostile';
    return 'attitude--neutral';
  }

  function attitudeLabel(attitude: number | null): string {
    if (attitude === null || attitude === undefined) return '';
    if (attitude > 33) return `ally (${attitude})`;
    if (attitude < -33) return `hostile (${attitude})`;
    return `neutral (${attitude})`;
  }

  function otherEntityLabel(rel: EntityRelationRecord): string {
    const isSelf = rel.from_type === entityTypeSlug && rel.from_id === entityId;
    const t = isSelf ? rel.to_type : rel.from_type;
    const id = isSelf ? rel.to_id : rel.from_id;
    const typeLabel = ENTITY_TYPES.find(e => e.slug === t)?.label ?? t;
    return `${typeLabel}: ${id}`;
  }
</script>

<div class="ctx-overlay" role="dialog" aria-modal="true" aria-label="Relations">
  <div class="ctx-panel">
    <div class="ctx-header">
      <h3>Relations</h3>
      <button class="btn-icon" on:click={onClose} aria-label="Close">✕</button>
    </div>

    <div class="ctx-body">
      {#if loading}
        <p class="ctx-empty">Loading…</p>
      {:else if error}
        <p class="ctx-empty ctx-error">{error}</p>
      {:else if relations.length === 0 && !showAddForm}
        <p class="ctx-empty">No relations yet.</p>
      {:else}
        <ul class="ctx-list">
          {#each relations as rel (rel.id)}
            <li class="ctx-row" class:pinned={rel.is_pinned}>
              {#if rel.is_pinned}
                <span class="pin-indicator" title="Pinned">📌</span>
              {/if}
              <span class="ctx-name">{otherEntityLabel(rel)}</span>
              <span class="ctx-tag">{rel.relation_type}</span>
              {#if rel.attitude !== null}
                <span class="ctx-tag attitude-chip {attitudeClass(rel.attitude)}">{attitudeLabel(rel.attitude)}</span>
              {/if}
              {#if rel.is_private}
                <span class="ctx-tag private-chip">private</span>
              {/if}
              <span class="row-actions">
                <button class="btn-icon-sm" title={rel.is_pinned ? 'Unpin' : 'Pin'} on:click={() => togglePin(rel)}>
                  {rel.is_pinned ? '📌' : '·'}
                </button>
                <button class="btn-icon-sm danger" title="Delete" on:click={() => handleDelete(rel.id)}>✕</button>
              </span>
              {#if rel.notes}
                <div class="ctx-notes">{rel.notes}</div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      <!-- Add form -->
      {#if showAddForm}
        <div class="add-form">
          <div class="form-row">
            <label class="form-label">Target type</label>
            <select class="form-select" bind:value={form.to_type}>
              {#each ENTITY_TYPES as et}
                <option value={et.slug}>{et.label}</option>
              {/each}
            </select>
          </div>

          <div class="form-row">
            <label class="form-label">Target entity</label>
            {#if loadingTargets}
              <span class="form-hint">Loading…</span>
            {:else if targetOptions.length > 0}
              <select class="form-select" bind:value={form.to_id}>
                <option value="">— select —</option>
                {#each targetOptions as opt}
                  <option value={opt.id}>{opt.name}</option>
                {/each}
              </select>
            {:else}
              <input class="form-input" type="text" placeholder="Entity ID" bind:value={form.to_id} />
            {/if}
          </div>

          <div class="form-row">
            <label class="form-label">Relation type</label>
            <input
              class="form-input"
              type="text"
              placeholder="e.g. ally, serves, knows…"
              list="relation-suggestions"
              bind:value={form.relation_type}
            />
            <datalist id="relation-suggestions">
              {#each RELATION_SUGGESTIONS as s}
                <option value={s} />
              {/each}
            </datalist>
          </div>

          <div class="form-row form-row--inline">
            <label class="form-label">
              <input type="checkbox" bind:checked={form.has_attitude} /> Attitude
            </label>
            {#if form.has_attitude}
              <input class="form-range" type="range" min="-100" max="100" step="5" bind:value={form.attitude} />
              <span class="attitude-chip {attitudeClass(form.attitude)}">{attitudeLabel(form.attitude)}</span>
            {/if}
          </div>

          <div class="form-row form-row--inline">
            <label class="form-label">
              <input type="checkbox" bind:checked={form.is_bidirectional} /> Bidirectional
            </label>
            <label class="form-label">
              <input type="checkbox" bind:checked={form.is_pinned} /> Pin
            </label>
            <label class="form-label">
              <input type="checkbox" bind:checked={form.is_private} /> Private
            </label>
          </div>

          <div class="form-row">
            <label class="form-label">Notes (optional)</label>
            <textarea class="form-textarea" rows="2" placeholder="Brief note…" bind:value={form.notes}></textarea>
          </div>

          {#if addError}
            <p class="add-error">{addError}</p>
          {/if}

          <div class="form-actions">
            <button class="btn btn-primary btn-sm" on:click={handleAdd} disabled={adding}>
              {adding ? 'Adding…' : 'Add Relation'}
            </button>
            <button class="btn btn-ghost btn-sm" on:click={() => { showAddForm = false; resetForm(); }}>
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button class="btn btn-ghost btn-sm add-btn" on:click={() => (showAddForm = true)}>
          + Add Relation
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Context drawer */
  .ctx-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 500;
    display: flex;
    justify-content: flex-end;
  }
  .ctx-panel {
    width: min(400px, 90vw);
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
  .ctx-list { list-style: none; margin: 0 0 0.5rem; padding: 0; }
  .ctx-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    flex-wrap: wrap;
    position: relative;
  }
  .ctx-row:hover { background: var(--surface2); }
  .ctx-row.pinned { border-left: 2px solid var(--accent); }
  .ctx-name { font-size: 0.875rem; font-weight: 600; }
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
  .ctx-notes {
    width: 100%;
    font-size: 0.75rem;
    color: var(--fg-muted);
    padding-top: 0.2rem;
    font-style: italic;
  }
  .ctx-empty { color: var(--fg-muted); text-align: center; padding: 2rem 1rem; font-size: 0.875rem; }
  .ctx-error { color: #e57373; }

  /* Attitude chips */
  .attitude-chip { }
  .attitude--ally { background: rgba(76,175,80,0.15); color: #81c784; }
  .attitude--hostile { background: rgba(229,115,115,0.15); color: #e57373; }
  .attitude--neutral { background: var(--surface2); color: var(--fg-muted); }
  .private-chip { background: rgba(201,168,76,0.2); color: var(--accent); }

  .pin-indicator { font-size: 0.75rem; }

  /* Row actions */
  .row-actions {
    display: flex;
    gap: 0.2rem;
    margin-left: auto;
    flex-shrink: 0;
  }
  .btn-icon-sm {
    background: none; border: none; cursor: pointer;
    font-size: 0.8rem; padding: 0.15rem 0.25rem; border-radius: 3px;
    color: var(--fg-muted); line-height: 1;
  }
  .btn-icon-sm:hover { background: var(--surface2); color: var(--fg); }
  .btn-icon-sm.danger:hover { color: #e57373; }
  .btn-icon {
    background: none; border: none; color: var(--fg-muted); cursor: pointer;
    font-size: 1rem; padding: 0.25rem; border-radius: 4px; line-height: 1;
  }
  .btn-icon:hover { color: var(--fg); background: var(--surface2); }

  /* Add button */
  .add-btn { margin: 0.5rem 0.75rem; }

  /* Add form */
  .add-form {
    background: var(--surface2);
    border-radius: 8px;
    padding: 1rem;
    margin: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .form-row { display: flex; flex-direction: column; gap: 0.25rem; }
  .form-row--inline { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
  .form-label { font-size: 0.75rem; color: var(--fg-muted); font-weight: 600; display: flex; align-items: center; gap: 0.3rem; }
  .form-input, .form-select, .form-textarea {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    color: var(--fg);
    width: 100%;
  }
  .form-range { flex: 1; accent-color: var(--accent); }
  .form-textarea { resize: vertical; }
  .form-hint { font-size: 0.75rem; color: var(--fg-muted); }

  .add-error { font-size: 0.8rem; color: #e57373; margin: 0; }
  .form-actions { display: flex; gap: 0.5rem; }
</style>
