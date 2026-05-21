<script lang="ts">
  import { goto } from '$app/navigation';
  import { topics, syncState } from '$lib/stores';

  export let currentPath: string = '/';

  const navItems = [
    { href: '/',              label: 'Topics',        icon: '📚' },
    { href: '/import-export', label: 'Import/Export', icon: '↕️' },
    { href: '/settings',      label: 'Settings',      icon: '⚙️' },
  ];

  $: statusColor =
    $syncState.status === 'success'  ? '#4caf50' :
    $syncState.status === 'error'    ? '#e57373' :
    $syncState.status === 'syncing'  ? 'var(--accent)' :
    $syncState.status === 'conflict' ? '#ffb74d' :
    'var(--fg-muted)';
</script>

<nav class="sidebar" aria-label="Main navigation">
  <div class="sidebar-brand">
    <span class="brand-rune">⚔</span>
    <div class="brand-text">
      <span class="brand-title">Holmgard</span>
      <span class="brand-sub">Lore Editor</span>
    </div>
  </div>

  <ul class="nav-list" role="list">
    {#each navItems as item}
      <li>
        <a
          href={item.href}
          class="nav-link"
          class:active={currentPath === item.href}
          aria-current={currentPath === item.href ? 'page' : undefined}
        >
          <span class="nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>

  <div class="sidebar-footer">
    <div class="sync-status" title="Sync status: {$syncState.status}">
      <span class="sync-dot" style="background:{statusColor}"></span>
      <span class="sync-label">
        {#if $syncState.status === 'syncing'}Syncing…
        {:else if $syncState.status === 'success'}Synced
        {:else if $syncState.status === 'error'}Error
        {:else if $syncState.status === 'conflict'}Conflict
        {:else}Offline
        {/if}
      </span>
    </div>
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
</style>
