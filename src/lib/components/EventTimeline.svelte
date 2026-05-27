<script lang="ts">
  import type { McpEvent } from '$lib/types';

  export let events: McpEvent[] = [];
  export let loading = false;
  export let error: string | null = null;

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // Deterministic hue from verb string for consistent badge colors
  function verbHue(verb: string): number {
    let h = 0;
    for (let i = 0; i < verb.length; i++) h = (h * 31 + verb.charCodeAt(i)) % 360;
    return h;
  }
</script>

{#if loading}
  <div class="tl-state">Loading…</div>
{:else if error}
  <div class="tl-state tl-error">{error}</div>
{:else if events.length === 0}
  <div class="tl-state">No events logged for this entity.</div>
{:else}
  <ul class="tl-list">
    {#each events as ev (ev.at + ev.verb)}
      <li class="tl-event">
        <span
          class="tl-verb"
          style="background: hsl({verbHue(ev.verb)}deg 40% 22%); color: hsl({verbHue(ev.verb)}deg 70% 72%); border-color: hsl({verbHue(ev.verb)}deg 50% 35%)"
        >{ev.verb}</span>
        <div class="tl-body">
          {#if ev.object}
            <span class="tl-obj">{ev.object}</span>
          {/if}
          {#if ev.location}
            <span class="tl-loc">@ {ev.location}</span>
          {/if}
          {#if ev.detail}
            <p class="tl-detail">{ev.detail}</p>
          {/if}
          <div class="tl-meta">
            {#if ev.thread}
              <span class="tl-thread">{ev.thread}</span>
            {/if}
            <time class="tl-time" title={new Date(ev.at).toLocaleString()}>{relativeTime(ev.at)}</time>
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .tl-state {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--fg-muted);
    font-size: 0.85rem;
  }
  .tl-error { color: #f87171; }

  .tl-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .tl-event {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.6rem 0.5rem;
    border-radius: 6px;
    border-bottom: 1px solid var(--border);
  }
  .tl-event:last-child { border-bottom: none; }
  .tl-event:hover { background: var(--surface2); }

  .tl-verb {
    flex-shrink: 0;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    border: 1px solid;
    margin-top: 0.1rem;
    white-space: nowrap;
  }

  .tl-body {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
    flex: 1;
  }

  .tl-obj {
    font-size: 0.875rem;
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tl-loc {
    font-size: 0.75rem;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tl-detail {
    margin: 0.1rem 0 0;
    font-size: 0.8rem;
    color: var(--fg-muted);
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .tl-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.15rem;
    flex-wrap: wrap;
  }

  .tl-thread {
    font-size: 0.67rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--accent);
    background: rgba(201, 168, 76, 0.12);
    border: 1px solid rgba(201, 168, 76, 0.25);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
  }

  .tl-time {
    font-size: 0.72rem;
    color: var(--fg-muted);
    cursor: default;
  }
</style>
