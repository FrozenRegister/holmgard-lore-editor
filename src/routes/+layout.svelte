<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
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
        showToast('Loading topics…', 'info', 30000);
        const storedTopics = await loadAllTopics();
        showToast('Loading settings…', 'info', 30000);
        const storedSettings = await loadSettings();
        settings.set(storedSettings);
        if (storedTopics.length === 0) {
          showToast('Loading demo data…', 'info', 30000);
          const demo = await loadDemoData();
          topics.set(demo);
        } else {
          topics.set(storedTopics);
        }
        toasts.set([]); // clear loading-step status toasts before splash fades out
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
        role="button"
        tabindex="0"
        on:click={() => (sidebarOpen = false)}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sidebarOpen = false; } }}
      ></div>
    {/if}

    <main class="app-main">
      <slot />
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

<!-- Branded loading splash — fixed overlay, covers sidebar and all chrome -->
{#if $initialising}
  <div class="splash-screen" transition:fade={{ duration: 300 }} aria-label="Loading application" aria-live="polite">
    <div class="splash-inner">
      <div class="splash-icon" aria-hidden="true">⚔</div>
      <div class="splash-title">
        <span class="splash-name">Holmgard</span>
        <span class="splash-sub">Lore Editor</span>
      </div>
      <p class="splash-status">
        {$toasts.length > 0 ? $toasts[$toasts.length - 1].message : 'Starting up…'}
      </p>
    </div>
  </div>
{/if}

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

  /* ── Branded loading splash ─────────────────────────────────── */
  .splash-screen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #0f1419;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .splash-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 280px;
  }

  .splash-icon {
    font-size: 52px;
    line-height: 1;
    animation: ldPulse 2s ease-in-out infinite;
  }

  .splash-title {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .splash-name {
    font-size: 30px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .splash-sub {
    font-size: 12px;
    font-weight: 500;
    color: #718096;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .splash-status {
    font-size: 13px;
    color: #718096;
    margin: 0;
    min-height: 20px;
    text-align: center;
  }

  @keyframes ldPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.65; transform: scale(0.92); }
  }

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
