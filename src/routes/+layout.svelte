<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { topics, settings, syncState, toasts, initialising, showToast, conflictQueue, isMobile } from '$lib/stores';
  import { loadAllTopics, loadSettings } from '$lib/storage';
  import { setupMarked } from '$lib/marked-config';
  import { loadDemoData } from '$lib/demo-data';
  import ConflictResolver from '$lib/components/ConflictResolver.svelte';
  import ChatPanel from '$lib/components/ChatPanel.svelte';
  import { runSync, runSmartSync } from '$lib/syncAll';
  import '../app.css';
  import MCPPanel from '$lib/components/MCPPanel.svelte';

  let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  let dataLoaded = false;
  let sidebarOpen = false;

  // Restart interval whenever the setting changes (or when data first loads)
  $: if (dataLoaded) {
    if (autoSyncTimer) clearInterval(autoSyncTimer)
    autoSyncTimer = null
    if ($settings.autoSync && $settings.autoSyncIntervalSecs > 0) {
      autoSyncTimer = setInterval(async () => {
        const lastSync = $syncState.lastSync
        if (lastSync) {
          const ok = await runSmartSync(lastSync)
          if (ok) return
        }
        await runSync()
      }, $settings.autoSyncIntervalSecs * 1000)
    }
  }

  onDestroy(() => {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
  });

  onMount(() => {
    // Mobile detection — drives read-only mode and sidebar overlay behaviour
    const mq = window.matchMedia('(max-width: 768px)');
    isMobile.set(mq.matches);
    const handleMq = (e: MediaQueryListEvent) => {
      isMobile.set(e.matches);
      if (!e.matches) sidebarOpen = false;
    };
    mq.addEventListener('change', handleMq);

    // Load initial data
    (async () => {
      setupMarked();
      try {
        const [storedTopics, storedSettings] = await Promise.all([
          loadAllTopics(),
          loadSettings(),
        ]);
        settings.set(storedSettings);
        if (storedTopics.length === 0) {
          const demo = await loadDemoData();
          topics.set(demo);
        } else {
          topics.set(storedTopics);
        }
      } catch (err) {
        console.error('Init error:', err);
        const msg = err instanceof Error ? err.message : 'Failed to load local data';
        if (msg.includes('quota') || msg.includes('Quota')) {
          showToast('Storage quota exceeded — try syncing to cloud first', 'error');
        } else if (msg.includes('IndexedDB') || msg.includes('IDB')) {
          showToast('Browser storage unavailable — app may be limited to demo data', 'warning');
        } else {
          showToast(msg, 'error');
        }
      } finally {
        initialising.set(false);
        dataLoaded = true;
      }
    })();

    return () => mq.removeEventListener('change', handleMq);
  });

  $: currentPath = $page.url.pathname;
</script>

<div class="app-wrapper">
  <!-- Mobile top bar (hidden on desktop via CSS) -->
  <div class="mobile-topbar">
    <button
      class="hamburger"
      on:click={() => (sidebarOpen = !sidebarOpen)}
      aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={sidebarOpen}
    >
      {sidebarOpen ? '✕' : '☰'}
    </button>
    <span class="mobile-brand">⚔ Holmgard</span>
  </div>

  <div class="app-shell">
    <Sidebar {currentPath} open={sidebarOpen} on:close={() => (sidebarOpen = false)} />

    <!-- Tap-outside backdrop for mobile sidebar -->
    {#if $isMobile && sidebarOpen}
      <div
        class="sidebar-backdrop"
        role="presentation"
        on:click={() => (sidebarOpen = false)}
      ></div>
    {/if}

    <main class="app-main">
      {#if $initialising}
        <div class="loading-screen">
          <div class="spinner" aria-label="Loading…"></div>
          <p>Loading Holmgard Lore Editor…</p>
        </div>
      {:else}
        <slot />
      {/if}
    </main>
  </div>
</div>

<!-- Conflict resolver — desktop only; mobile users are read-only -->
{#if !$isMobile}
  <ConflictResolver />
{/if}

<!-- Claude chat panel -->
<ChatPanel />

<!-- MCP Interface panel -->
<MCPPanel />

<!-- Toast notifications -->
<div class="toast-stack" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div class="toast toast--{toast.type}" role="alert">
      {toast.message}
    </div>
  {/each}
</div>

<style>
  .app-wrapper {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
  }

  .app-shell {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .app-main {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* ── Mobile top bar ─────────────────────────────────────────── */
  .mobile-topbar {
    display: none; /* shown only on mobile via media query */
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
    height: 48px;
    flex-shrink: 0;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: 100;
  }

  .hamburger {
    background: none;
    border: none;
    color: var(--fg);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.4rem;
    border-radius: 6px;
    line-height: 1;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s;
  }

  .hamburger:hover { background: var(--surface2); }

  .mobile-brand {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent);
  }

  /* ── Sidebar backdrop (mobile overlay) ──────────────────────── */
  .sidebar-backdrop {
    position: fixed;
    top: 48px; /* below mobile topbar */
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 150;
  }

  /* ── Loading screen ─────────────────────────────────────────── */
  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--fg-muted);
  }

  .spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Toast stack ────────────────────────────────────────────── */
  .toast-stack {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 1000;
    pointer-events: none;
  }

  .toast {
    padding: 0.65rem 1.1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    background: var(--surface2);
    border-left: 4px solid var(--accent);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    animation: slideIn 0.2s ease;
  }

  .toast--success { border-left-color: #4caf50; }
  .toast--error   { border-left-color: #e57373; }
  .toast--warning { border-left-color: #ffb74d; }

  @keyframes slideIn {
    from { transform: translateX(2rem); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }

  /* ── Mobile breakpoint ──────────────────────────────────────── */
  @media (max-width: 768px) {
    .mobile-topbar { display: flex; }

    .toast-stack {
      bottom: 1rem;
      right: 0.75rem;
      left: 0.75rem;
    }

    .toast { font-size: 0.82rem; }
  }
</style>
