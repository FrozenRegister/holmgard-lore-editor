<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { goto } from '$app/navigation';
  import { topics, showToast } from '$lib/stores';
  import { saveTopic } from '$lib/storage';
  import type { Topic } from '$lib/types';

  const dispatch = createEventDispatcher<{ close: void }>();

  const TEMPLATES = [
    {
      id: 'character',
      label: 'Character',
      icon: '🧙',
      description: 'NPC or player character with traits, backstory, and stat block.',
    },
    {
      id: 'location',
      label: 'Location',
      icon: '🗺️',
      description: 'Place or region with atmosphere, NPCs, and points of interest.',
    },
  ] as const;

  type TemplateId = typeof TEMPLATES[number]['id'];

  let selectedTemplate: TemplateId | null = null;
  let topicKey = '';
  let creating = false;
  let error = '';

  async function fetchTemplate(id: TemplateId): Promise<string> {
    // Try fetching from static assets first, then fall back to inline
    try {
      const res = await fetch(`/templates/${id}-template.md`);
      if (res.ok) return res.text();
    } catch { /* fall through */ }
    // Inline fallbacks
    if (id === 'character') return characterFallback();
    if (id === 'location')  return locationFallback();
    return '';
  }

  function characterFallback(): string {
    return `# Character Name

## Overview
_Brief description of this character._

## Traits
- **Archetype**: 
- **Alignment**: 
- **Faction**: 

## Backstory
_Character history and motivations._

## Relationships
| Name | Relationship |
|------|-------------|
|      |             |

## Stats
\`\`\`json
{
  "profile_type": "character",
  "name": "Character Name",
  "race": "",
  "class": "",
  "level": 1,
  "attributes": {
    "STR": 10, "DEX": 10, "CON": 10,
    "INT": 10, "WIS": 10, "CHA": 10
  },
  "hp": { "current": 8, "max": 8 }
}
\`\`\`

## Notes
_GM notes, plot hooks, etc._
`;
  }

  function locationFallback(): string {
    return `# Location Name

## Overview
_Brief description of this place._

## Atmosphere
_Sights, sounds, smells — what players experience when they arrive._

## Key NPCs
| Name | Role |
|------|------|
|      |      |

## Points of Interest
1. 
2. 
3. 

## Location Data
\`\`\`json
{
  "profile_type": "location",
  "name": "Location Name",
  "region": "",
  "population": null,
  "danger_level": "low",
  "tags": []
}
\`\`\`

## GM Notes
_Hidden information, secrets, plot hooks._
`;
  }

  async function createFromTemplate() {
    error = '';
    const key = topicKey.trim();
    if (!key) { error = 'Topic key is required.'; return; }
    if (!selectedTemplate) { error = 'Select a template.'; return; }
    if ($topics.find((t) => t.key === key)) {
      error = `Topic "${key}" already exists.`;
      return;
    }

    creating = true;
    try {
      let text = await fetchTemplate(selectedTemplate);
      // Replace placeholder name with key
      text = text.replace(/Character Name|Location Name/g, key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

      const now = new Date().toISOString();
      const topic: Topic = {
        key,
        text,
        meta: { updatedAt: now, version: 1 },
      };
      await saveTopic(topic);
      topics.update((ts) => [...ts, topic].sort((a, b) => a.key.localeCompare(b.key)));
      dispatch('close');
      goto(`/editor/${encodeURIComponent(key)}`);
    } catch (err: any) {
      error = `Failed: ${err.message}`;
    } finally {
      creating = false;
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close');
  }
</script>

<svelte:window on:keydown={handleKey} />

<div class="overlay" role="dialog" aria-modal="true" aria-label="New topic from template">
  <div class="modal">
    <div class="modal-header">
      <h2>New from Template</h2>
      <button class="btn-icon" on:click={() => dispatch('close')} aria-label="Close">✕</button>
    </div>

    <div class="template-grid">
      {#each TEMPLATES as tpl}
        <button
          class="template-card"
          class:selected={selectedTemplate === tpl.id}
          on:click={() => (selectedTemplate = tpl.id)}
          aria-pressed={selectedTemplate === tpl.id}
        >
          <span class="tpl-icon">{tpl.icon}</span>
          <span class="tpl-label">{tpl.label}</span>
          <span class="tpl-desc">{tpl.description}</span>
        </button>
      {/each}
    </div>

    <div class="field">
      <label for="newKey">Topic Key</label>
      <input
        id="newKey"
        type="text"
        bind:value={topicKey}
        placeholder="e.g. elena-brightwood"
        class="text-input"
        pattern="[a-z0-9\-_]+"
        title="Lowercase letters, numbers, hyphens, underscores"
      />
      <span class="field-hint">Lowercase, hyphens ok. Will become the unique ID.</span>
    </div>

    {#if error}
      <p class="form-error">{error}</p>
    {/if}

    <div class="modal-actions">
      <button class="btn btn-ghost" on:click={() => dispatch('close')}>Cancel</button>
      <button
        class="btn btn-primary"
        on:click={createFromTemplate}
        disabled={creating || !selectedTemplate || !topicKey.trim()}
      >
        {creating ? 'Creating…' : 'Create Topic'}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: min(540px, 95vw);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    box-shadow: 0 20px 60px rgba(0,0,0,0.45);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-header h2 {
    font-size: 1.05rem;
    font-weight: 700;
    margin: 0;
    color: var(--accent);
  }

  .btn-icon {
    background: none;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
    border-radius: 4px;
    line-height: 1;
  }
  .btn-icon:hover { color: var(--fg); background: var(--surface2); }

  .template-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .template-card {
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }

  .template-card:hover { border-color: var(--accent2); }
  .template-card.selected { border-color: var(--accent); background: rgba(201,168,76,0.08); }

  .tpl-icon  { font-size: 1.5rem; line-height: 1; }
  .tpl-label { font-size: 0.9rem; font-weight: 700; color: var(--fg); }
  .tpl-desc  { font-size: 0.78rem; color: var(--fg-muted); line-height: 1.4; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--fg);
  }

  .text-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 0.9rem;
    font-family: var(--font-mono);
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .text-input:focus { border-color: var(--accent); }

  .field-hint { font-size: 0.75rem; color: var(--fg-muted); }

  .form-error {
    margin: 0;
    font-size: 0.85rem;
    color: #e57373;
    background: rgba(229,115,115,0.1);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border-left: 3px solid #e57373;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
