<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { topics, syncState, chatOpen, collapseSidebar } from '$lib/stores';
  import { getClaudeApiKey, getMcpApiKey } from '$lib/auth';
  import { mcpOpen } from '$lib/stores';

  export let currentPath: string = '/';
  /** On mobile the sidebar slides in/out; `open` controls visibility. */
  export let open: boolean = true;

  const dispatch = createEventDispatcher<{ close: void }>();

  let hasClaudeKey = false;
  let hasMcpKey = false;

  async function checkKeys() {
    hasClaudeKey = !!(await getClaudeApiKey());
    hasMcpKey = !!(await getMcpApiKey());
  }

  onMount(async () => {
    await checkKeys();
    // Re-check when page regains focus (e.g., after Settings modal closes)
    window.addEventListener('focus', checkKeys);
    return () => window.removeEventListener('focus', checkKeys);
  });

  const navItems = [
    { href: '/',              label: 'Topics',        icon: '📚' },
    { href: '/world-editor',  label: 'World Map',     icon: '🗺️' },
    { href: '/maps',          label: 'Maps',          icon: '🗺' },
    { href: '/import-export', label: 'Import/Export', icon: '↕️' },
    { href: '/settings',      label: 'Settings',      icon: '⚙️' },
  ];

  $: shouldCollapse = currentPath === '/world-editor' && $collapseSidebar;

  $: statusColor =
    $syncState.status === 'success'  ? '#4caf50' :
    $syncState.status === 'error'    ? '#e57373' :
    $syncState.status === 'syncing'  ? 'var(--accent)' :
    $syncState.status === 'conflict' ? '#ffb74d' :
    'var(--fg-muted)';

  $: lastSyncLabel = (() => {
    if (!$syncState.lastSync) return null;
    const d = new Date($syncState.lastSync);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  })();

  function handleNavClick() {
    dispatch('close');
  }
</script>

<nav class="sidebar" class:mobile-open={open} class:collapsed={shouldCollapse} aria-label="Main navigation">
  <div class="sidebar-brand">
    <span class="brand-rune">⚔</span>
    <div class="brand-text">
      <span class="brand-title">Holmgard</span>
      <span class="brand-sub">Lore Editor</span>
    </div>
    <!-- Close button shown only on mobile -->
    <button
      class="sidebar-close"
      on:click={() => dispatch('close')}
      aria-label="Close menu"
    >✕</button>
  </div>

  <ul class="nav-list" role="list">
    {#each navItems as item}
      <li>
        <a
          href={item.href}
          class="nav-link"
          class:active={currentPath === item.href}
          aria-current={currentPath === item.href ? 'page' : undefined}
          on:click={handleNavClick}
        >
          <span class="nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>

  {#if hasClaudeKey}
  <div class="chat-toggle-wrap">
    <button
      class="chat-toggle"
      class:chat-toggle-active={$chatOpen}
      on:click={() => chatOpen.update((v) => !v)}
      title="Claude chat (lore assistant)"
    >
      <span class="nav-icon" aria-hidden="true">✦</span>
      <span>Claude</span>
    </button>
  </div>
  {/if}
  <div class="chat-toggle-wrap">
    <button
      class="chat-toggle"
      class:chat-toggle-active={$mcpOpen}
      on:click={() => mcpOpen.update(v => !v)}
      title="MCP Tool Console"
    >
      <span class="nav-icon" aria-hidden="true">🛠️</span>
      <span>MCP</span>
    </button>
  </div>

  <div class="sidebar-footer">
    <div class="sync-status" title="Sync status: {$syncState.status}">
      <span class="sync-dot" style="background:{statusColor}"></span>
      <span class="sync-label">
        {#if $syncState.status === 'syncing'}Syncing…
        {:else if $syncState.status === 'success'}Synced{#if lastSyncLabel} · {lastSyncLabel}{/if}
        {:else if $syncState.status === 'error'}Error
        {:else if $syncState.status === 'conflict'}Conflict
        {:else}Offline
        {/if}
      </span>
    </div>
    <button
      class="mcp-badge"
      class:badge-ok={hasMcpKey}
      class:badge-warn={!hasMcpKey}
      on:click={() => goto('/settings')}
      title={hasMcpKey ? 'MCP API key configured' : 'MCP API key not configured — click to set'}
    >
      MCP Key: {hasMcpKey ? 'Set ✓' : 'Not set'}
    </button>
    <span class="topic-count">{$topics.length} topics</span>
  </div>
</nav>

<style>
  .sidebar {
    width: 220px;
    min-width: 220px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    user-select: none;
    transition: width 0.2s ease, min-width 0.2s ease, opacity 0.2s ease;
  }

  .sidebar.collapsed {
    width: 0;
    min-width: 0;
    opacity: 0;
    pointer-events: none;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 1.1rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .brand-rune {
    font-size: 1.5rem;
    line-height: 1;
    color: var(--accent);
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
  }

  .brand-title {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.2;
  }

  .brand-sub {
    font-size: 0.7rem;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Close button — hidden on desktop, visible on mobile */
  .sidebar-close {
    display: none;
    background: none;
    border: none;
    color: var(--fg-muted);
    font-size: 1rem;
    cursor: pointer;
    padding: 0.35rem;
    border-radius: 6px;
    line-height: 1;
    min-width: 36px;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
  }

  .sidebar-close:hover { color: var(--fg); background: var(--surface2); }

  .nav-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0.5rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.75rem;
    border-radius: 7px;
    color: var(--fg-muted);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background 0.12s, color 0.12s;
  }

  .nav-link:hover {
    background: var(--surface2);
    color: var(--fg);
  }

  .nav-link.active {
    background: rgba(201, 168, 76, 0.15);
    color: var(--accent);
    font-weight: 600;
  }

  .nav-icon { font-size: 1rem; line-height: 1; }

  .chat-toggle-wrap {
    padding: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .chat-toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.55rem 0.75rem;
    border-radius: 7px;
    border: none;
    background: none;
    color: var(--fg-muted);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    text-align: left;
  }

  .chat-toggle:hover {
    background: var(--surface2);
    color: var(--fg);
  }

  .chat-toggle-active {
    background: rgba(201, 168, 76, 0.15);
    color: var(--accent);
    font-weight: 600;
  }

  .sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
  }

  .sync-status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .sync-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.3s;
  }

  .sync-label {
    font-size: 0.75rem;
    color: var(--fg-muted);
  }

  .topic-count {
    font-size: 0.7rem;
    color: var(--fg-muted);
    opacity: 0.6;
  }

  .mcp-badge {
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.12s, color 0.12s;
  }

  .mcp-badge.badge-ok {
    background: rgba(76, 175, 80, 0.15);
    color: #4caf50;
  }

  .mcp-badge.badge-ok:hover {
    background: rgba(76, 175, 80, 0.25);
  }

  .mcp-badge.badge-warn {
    background: rgba(255, 183, 77, 0.15);
    color: #ffb74d;
  }

  .mcp-badge.badge-warn:hover {
    background: rgba(255, 183, 77, 0.25);
  }

  /* ── Mobile: sidebar becomes a fixed slide-in overlay ───────── */
  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      top: 48px; /* height of .mobile-topbar */
      left: 0;
      height: calc(100vh - 48px);
      z-index: 200;
      width: 260px;
      min-width: 260px;
      transform: translateX(-100%);
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }

    .sidebar.mobile-open {
      transform: translateX(0);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.6);
    }

    .sidebar-close {
      display: flex;
    }

    /* Larger touch targets for nav links */
    .nav-link {
      padding: 0.75rem 0.85rem;
      font-size: 1rem;
    }
  }
</style>
