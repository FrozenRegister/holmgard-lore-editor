<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { topics, settings, syncState, toasts, initialising, showToast, conflictQueue } from '$lib/stores';
  import { loadAllTopics, loadSettings } from '$lib/storage';
  import { setupMarked } from '$lib/marked-config';
  import { loadDemoData } from '$lib/demo-data';
  import ConflictResolver from '$lib/components/ConflictResolver.svelte';
  import ChatPanel from '$lib/components/ChatPanel.svelte';
  import { runSync } from '$lib/syncAll';
  import '../app.css';

  let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  let dataLoaded = false;

  // Restart interval whenever the setting changes (or when data first loads)
  $: if (dataLoaded) {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    if ($settings.autoSyncIntervalSecs > 0) {
      autoSyncTimer = setInterval(runSync, $settings.autoSyncIntervalSecs * 1000);
    }
  }

  onDestroy(() => {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
  });

  onMount(async () => {
    setupMarked();
    try {
      const [storedTopics, storedSettings] = await Promise.all([
        loadAllTopics(),
        loadSettings(),
      ]);
      settings.set(storedSettings);

      if (storedTopics.length === 0) {
        // First run — seed with demo data
        const demo = await loadDemoData();
        topics.set(demo);
      } else {
        topics.set(storedTopics);
      }
    } catch (err) {
      console.error('Init error:', err);
      showToast('Failed to load local data', 'error');
    } finally {
      initialising.set(false);
      dataLoaded = true;
    }
  });

  $: currentPath = $page.url.pathname;
</script>

<div class="app-shell">
  <Sidebar {currentPath} />

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

<!-- Conflict resolver modal -->
<ConflictResolver />

<!-- Claude chat panel -->
<ChatPanel />

<!-- Toast notifications -->
<div class="toast-stack" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div class="toast toast--{toast.type}" role="alert">
      {toast.message}
    </div>
  {/each}
</div>

<style>
  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
  }

  .app-main {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

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
</style>