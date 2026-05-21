<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Topic } from '$lib/types';

  export let topic: Topic;

  const dispatch = createEventDispatcher<{ open: void; delete: void }>();

  // Extract first heading or first 120 chars as preview
  function getPreview(text: string): string {
    const headingMatch = text.match(/^#{1,3}\s+(.+)$/m);
    if (headingMatch) return headingMatch[1];
    return text.replace(/```[\s\S]*?```/g, '').replace(/[#*_`]/g, '').trim().slice(0, 120);
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  $: preview = getPreview(topic.text);
  $: updatedLabel = timeAgo(topic.meta.updatedAt);

  // Detect content type hints
  $: hasJson = /```json/i.test(topic.text);
  $: hasXml  = /```xml/i.test(topic.text);
</script>

<article class="topic-card" on:click={() => dispatch('open')} on:keydown={(e) => e.key === 'Enter' && dispatch('open')} tabindex="0" role="button" aria-label="Open topic {topic.key}">
  <div class="card-top">
    <h3 class="topic-key">{topic.key}</h3>
    <div class="tag-row">
      {#if hasJson}<span class="tag tag-json">JSON</span>{/if}
      {#if hasXml}<span class="tag tag-xml">XML</span>{/if}
    </div>
  </div>

  <p class="topic-preview">{preview}</p>

  <div class="card-footer">
    <span class="updated">v{topic.meta.version} · {updatedLabel}</span>
    <button
      class="btn-delete"
      on:click|stopPropagation={() => dispatch('delete')}
      aria-label="Delete topic {topic.key}"
      title="Delete"
    >
      🗑
    </button>
  </div>
</article>

<style>
  .topic-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.1rem 1.2rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
    outline: none;
  }

  .topic-card:hover,
  .topic-card:focus {
    border-color: var(--accent);
    box-shadow: 0 4px 16px rgba(201, 168, 76, 0.15);
    transform: translateY(-1px);
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .topic-key {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
    word-break: break-all;
  }

  .tag-row {
    display: flex;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .tag {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .tag-json { background: rgba(79, 195, 247, 0.18); color: #4fc3f7; }
  .tag-xml  { background: rgba(255, 183, 77, 0.18); color: #ffb74d; }

  .topic-preview {
    font-size: 0.82rem;
    color: var(--fg-muted);
    margin: 0;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
  }

  .updated {
    font-size: 0.72rem;
    color: var(--fg-muted);
    opacity: 0.7;
  }

  .btn-delete {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    opacity: 0.4;
    padding: 0.2rem;
    border-radius: 4px;
    transition: opacity 0.15s, background 0.15s;
    line-height: 1;
  }

  .btn-delete:hover {
    opacity: 1;
    background: rgba(229, 115, 115, 0.18);
  }
</style>
