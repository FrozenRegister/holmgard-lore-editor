<script lang="ts">
  import { settings, auth } from '$lib/stores';
  import { fetchQuestMilestones, updateQuestMilestone, createQuestMilestone, deleteQuestMilestone, type QuestMilestone, type CreateMilestoneParams } from '$lib/d1-reads';
  import type { EntityRecord } from '$lib/d1-reads';

  export let questId: string;
  export let onClose: () => void = () => {};

  let milestones: QuestMilestone[] = [];
  let loading = false;
  let error: string | null = null;
  let showForm = false;
  let editingId: string | null = null;
  let adminSecret = '';

  let formData: CreateMilestoneParams = {
    title: '',
    notes: '',
    status: 'pending',
    linked_entity_type: null,
    linked_entity_id: null,
    color: null,
    is_private: false,
  };

  $: if (questId && $settings.workerHost) load();

  $: if ($auth.adminSecret) adminSecret = $auth.adminSecret;

  async function load() {
    loading = true;
    error = null;
    try {
      milestones = await fetchQuestMilestones($settings.workerHost, questId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load milestones';
    } finally {
      loading = false;
    }
  }

  async function handleSave() {
    if (!formData.title?.trim()) {
      error = 'Title is required';
      return;
    }

    try {
      if (editingId) {
        await updateQuestMilestone($settings.workerHost, questId, editingId, formData, adminSecret);
      } else {
        await createQuestMilestone($settings.workerHost, questId, formData, adminSecret);
      }
      resetForm();
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Save failed';
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this milestone?')) return;
    try {
      await deleteQuestMilestone($settings.workerHost, questId, id, adminSecret);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    }
  }

  function editMilestone(milestone: QuestMilestone) {
    editingId = milestone.id;
    formData = { ...milestone };
    showForm = true;
  }

  function resetForm() {
    showForm = false;
    editingId = null;
    formData = {
      title: '',
      notes: '',
      status: 'pending',
      linked_entity_type: null,
      linked_entity_id: null,
      color: null,
      is_private: false,
    };
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '#81c784';
      case 'in_progress': return '#64b4ff';
      case 'failed': return '#e57373';
      default: return 'var(--fg-muted)';
    }
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    const idx = milestones.findIndex((m) => m.id === id);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= milestones.length) return;

    try {
      const newOrder = milestones[targetIdx].sort_order;
      await updateQuestMilestone($settings.workerHost, questId, id, { sort_order: newOrder }, adminSecret);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Reorder failed';
    }
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const statuses: Array<'pending' | 'in_progress' | 'completed' | 'failed'> = ['pending', 'in_progress', 'completed', 'failed'];
    const nextStatus = statuses[(statuses.indexOf(currentStatus as any) + 1) % statuses.length];

    try {
      await updateQuestMilestone($settings.workerHost, questId, id, { status: nextStatus }, adminSecret);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Update failed';
    }
  }
</script>

<div class="milestones-panel">
  <div class="panel-header">
    <h3>Milestones</h3>
    <button class="btn-close" on:click={onClose}>×</button>
  </div>

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  {#if loading}
    <p class="status-msg">Loading milestones…</p>
  {:else}
    <div class="milestones-list">
      {#each milestones as milestone (milestone.id)}
        <div class="milestone-row">
          <div class="milestone-content">
            <div class="milestone-header">
              <button
                class="status-dot"
                on:click={() => toggleStatus(milestone.id, milestone.status)}
                style="background: {getStatusColor(milestone.status)};"
                title="Click to change status"
              ></button>
              <span class="milestone-title">{milestone.title}</span>
              {#if milestone.color}
                <span class="color-dot" style="background: {milestone.color};"></span>
              {/if}
            </div>
            {#if milestone.notes}
              <p class="milestone-notes">{milestone.notes}</p>
            {/if}
            {#if milestone.linked_entity_id}
              <span class="entity-chip">
                {milestone.linked_entity_type}: {milestone.linked_entity_id}
              </span>
            {/if}
            <span class="status-label">{milestone.status}</span>
          </div>
          <div class="milestone-actions">
            <button on:click={() => handleReorder(milestone.id, 'up')} class="btn-sm" title="Move up">↑</button>
            <button on:click={() => handleReorder(milestone.id, 'down')} class="btn-sm" title="Move down">↓</button>
            <button on:click={() => editMilestone(milestone)} class="btn-sm">Edit</button>
            <button on:click={() => handleDelete(milestone.id)} class="btn-sm btn-danger">Delete</button>
          </div>
        </div>
      {/each}
    </div>

    <div class="panel-footer">
      <button
        class="btn-add"
        on:click={() => {
          showForm = !showForm;
          if (!showForm) resetForm();
        }}
      >
        {showForm ? '✕ Close' : '+ Add Milestone'}
      </button>
    </div>

    {#if showForm}
      <div class="milestone-form">
        <div class="form-group">
          <label>Title *</label>
          <input type="text" bind:value={formData.title} placeholder="Milestone title" />
        </div>

        <div class="form-group">
          <label>Notes</label>
          <textarea bind:value={formData.notes} placeholder="Additional notes…" rows="2"></textarea>
        </div>

        <div class="form-group">
          <label>Status</label>
          <select bind:value={formData.status}>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div class="form-group">
          <label>Linked Entity Type</label>
          <input type="text" bind:value={formData.linked_entity_type} placeholder="e.g., character, location" />
        </div>

        <div class="form-group">
          <label>Linked Entity ID</label>
          <input type="text" bind:value={formData.linked_entity_id} placeholder="e.g., entity-id-123" />
        </div>

        <div class="form-group">
          <label>Color</label>
          <input type="color" bind:value={formData.color} title="Milestone color indicator" />
        </div>

        <div class="form-group checkbox">
          <input type="checkbox" id="is-private" bind:checked={formData.is_private} />
          <label for="is-private">Private</label>
        </div>

        <div class="form-actions">
          <button class="btn-primary" on:click={handleSave}>
            {editingId ? 'Update' : 'Create'} Milestone
          </button>
          <button class="btn-secondary" on:click={resetForm}>Cancel</button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .milestones-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--fg-muted);
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-close:hover {
    color: var(--fg);
  }

  .error-msg {
    color: #e57373;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .status-msg {
    color: var(--fg-muted);
    font-size: 0.9rem;
  }

  .milestones-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .milestone-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    gap: 0.5rem;
  }

  .milestone-content {
    flex: 1;
  }

  .milestone-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .milestone-title {
    font-weight: 500;
    flex: 1;
  }

  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .milestone-notes {
    margin: 0.25rem 0 0 0;
    font-size: 0.85rem;
    color: var(--fg-muted);
    line-height: 1.4;
  }

  .entity-chip {
    display: inline-block;
    background: rgba(100, 180, 255, 0.1);
    border: 1px solid rgba(100, 180, 255, 0.3);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    color: #64b4ff;
    margin-top: 0.25rem;
  }

  .status-label {
    display: inline-block;
    font-size: 0.7rem;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--fg-muted);
    margin-top: 0.25rem;
  }

  .milestone-actions {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .btn-sm {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 4px;
    cursor: pointer;
    color: var(--fg);
    white-space: nowrap;
  }

  .btn-sm:hover {
    background: var(--surface);
    opacity: 0.8;
  }

  .btn-sm.btn-danger:hover {
    border-color: #e57373;
    color: #e57373;
  }

  .panel-footer {
    display: flex;
    justify-content: center;
    padding-top: 0.75rem;
  }

  .btn-add {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-add:hover {
    opacity: 0.9;
  }

  .milestone-form {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    margin-top: 0.75rem;
  }

  .form-group {
    margin-bottom: 0.75rem;
  }

  .form-group label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--fg);
  }

  .form-group input[type='text'],
  .form-group input[type='color'],
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--fg);
    font-size: 0.9rem;
    font-family: inherit;
  }

  .form-group input[type='color'] {
    height: 2.5rem;
    cursor: pointer;
  }

  .form-group.checkbox {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .form-group.checkbox input {
    width: auto;
    margin-right: 0.5rem;
  }

  .form-group.checkbox label {
    margin-bottom: 0;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding-top: 0.75rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--bg);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
  }

  .btn-secondary:hover {
    background: var(--surface);
    opacity: 0.8;
  }
</style>
