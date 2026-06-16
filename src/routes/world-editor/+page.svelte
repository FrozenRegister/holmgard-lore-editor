<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { showToast } from '$lib/stores';
  import { exposeAggregationAPI } from '$lib/terrain-aggregation';
  import '$lib/importMap';

  let isLoaded = false;
  let pageContainer: HTMLElement;

  function handleFontLoadComplete(e: Event) {
    const link = e.currentTarget as HTMLLinkElement;
    link.media = 'all';
  }

  // Initialize telemetry tracking
  (() => {
    const now =
      window.performance && typeof window.performance.now === 'function'
        ? window.performance.now()
        : Date.now();
    const existing = (window as any).__hexmapSurfaceTelemetry || {};
    (window as any).__hexmapSurfaceTelemetry = Object.assign({}, existing, {
      surface: 'editor',
      route: window.location.pathname || '/world-editor',
      startedAtMs: existing.startedAtMs || now,
      marks: Object.assign({}, existing.marks || {}, {
        htmlBootMs: (existing.marks && existing.marks.htmlBootMs) || now
      })
    });

    document.addEventListener(
      'DOMContentLoaded',
      function () {
        const store = (window as any).__hexmapSurfaceTelemetry;
        if (!store || !store.marks || store.marks.domContentLoadedMs) return;
        store.marks.domContentLoadedMs =
          window.performance && typeof window.performance.now === 'function'
            ? window.performance.now()
            : Date.now();
      },
      { once: true }
    );

    window.addEventListener(
      'load',
      function () {
        const store = (window as any).__hexmapSurfaceTelemetry;
        if (!store || !store.marks || store.marks.windowLoadMs) return;
        store.marks.windowLoadMs =
          window.performance && typeof window.performance.now === 'function'
            ? window.performance.now()
            : Date.now();
      },
      { once: true }
    );
  })();

  // Initialize embed mode detection
  (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inIframe = window.self !== window.top;
      const isEmbedMode = params.has('embed') || inIframe;
      const isMarketingDemo = params.get('marketingDemo') === '1';
      (window as any).__hexmapMode = {
        embed: isEmbedMode,
        marketingDemo: isMarketingDemo
      };
      (window as any).isMarketingDemoMode = function () {
        return !!((window as any).__hexmapMode && (window as any).__hexmapMode.marketingDemo);
      };
      if (isEmbedMode) {
        document.documentElement.classList.add('embed-mode');
      }
      if (isMarketingDemo) {
        document.documentElement.classList.add('marketing-demo');
      }
    } catch (e) {
      document.documentElement.classList.add('embed-mode');
      (window as any).__hexmapMode = {
        embed: true,
        marketingDemo: false
      };
      (window as any).isMarketingDemoMode = function () {
        return false;
      };
    }
  })();

  // Initialize loading screen helpers
  (() => {
    (window as any).__loadingTimeout = setTimeout(function () {
      console.warn('[Loading] Timeout — forcing dismiss');
      (window as any).__dismissLoading?.();
    }, 10000);

    (window as any).__dismissLoading = function () {
      clearTimeout((window as any).__loadingTimeout);
      const ls = document.getElementById('loadingScreen');
      const app = document.querySelector('.app');
      if (app) (app as HTMLElement).style.visibility = 'visible';
      if (ls) {
        (ls as HTMLElement).style.transition = 'opacity 0.4s ease';
        (ls as HTMLElement).style.opacity = '0';
        setTimeout(function () {
          ls?.remove();
        }, 500);
      }
      setTimeout(function () {
        if (typeof (window as any).resizeCanvas === 'function')
          (window as any).resizeCanvas();
      }, 50);
    };

    (window as any).__loadingProgress = function (pct: number, msg?: string) {
      const bar = document.getElementById('loadingBar');
      const status = document.getElementById('loadingStatus');
      if (bar) (bar as HTMLElement).style.width = Math.min(100, pct) + '%';
      if (status) (status as HTMLElement).textContent = msg || '';
    };
  })();

  // Initialize modal and account functions
  (() => {
    function checkMobileDevice() {
      // Mobile is now fully supported
    }

    (window as any).openAccountModal = (window as any).openAccountModal || function () {
      if (typeof (window as any).showAuthModal === 'function') {
        (window as any).showAuthModal('login');
      } else {
        const m = document.getElementById('accountModal');
        if (m) (m as HTMLElement).style.display = 'flex';
      }
    };

    (window as any).closeAccountModal = (window as any).closeAccountModal || function () {
      const m = document.getElementById('accountModal');
      if (m) (m as HTMLElement).style.display = 'none';
    };

    document.addEventListener('DOMContentLoaded', function () {
      checkMobileDevice();
    });
  })();

  onMount(async () => {
    // The hex editor requires a full page structure with specific IDs and classes
    // We load it in a way that respects SvelteKit's routing while using the existing hex editor code

    // Expose terrain aggregation API to window (for parent-child terrain sync)
    exposeAggregationAPI();

    // Expose showNotification to game.js
    (window as any).showNotification = function(message: string, type: string = 'info', durationMs?: number) {
      const toastType = (type === 'error' || type === 'success' || type === 'warning' || type === 'info') ? type : 'info';
      showToast(message, toastType, durationMs);
    };

    // ---- Region drill-down zoom settings (read by hexmap-render-patch.js) ----
    const HEXZOOM_KEY = 'hle:hexzoom';
    const HEXZOOM_DEFAULTS = { autoZoom: true, zoomInRatio: 2.2, zoomOutRatio: 0.28 };
    const readHexZoom = () => {
      try { return { ...HEXZOOM_DEFAULTS, ...JSON.parse(localStorage.getItem(HEXZOOM_KEY) || '{}') }; }
      catch { return { ...HEXZOOM_DEFAULTS }; }
    };
    const writeHexZoom = (patch: Record<string, unknown>) => {
      localStorage.setItem(HEXZOOM_KEY, JSON.stringify({ ...readHexZoom(), ...patch }));
    };
    (window as any).hexEarthToggleAuto = function (el: HTMLElement) {
      const on = !el.classList.contains('active');
      el.classList.toggle('active', on);
      writeHexZoom({ autoZoom: on });
    };
    (window as any).hexEarthSetZoomIn = (v: string) => writeHexZoom({ zoomInRatio: Number(v) });
    (window as any).hexEarthSetZoomOut = (v: string) => writeHexZoom({ zoomOutRatio: Number(v) });
    // Reflect stored values onto the modal controls once they're in the DOM.
    setTimeout(() => {
      const cfg = readHexZoom();
      document.getElementById('hexEarthAutoZoomToggle')?.classList.toggle('active', !!cfg.autoZoom);
      const zi = document.getElementById('hexEarthZoomIn') as HTMLSelectElement | null;
      if (zi) zi.value = String(cfg.zoomInRatio);
      const zo = document.getElementById('hexEarthZoomOut') as HTMLSelectElement | null;
      if (zo) zo.value = String(cfg.zoomOutRatio);
    }, 0);

    // Set document title
    document.title = 'TbdHEX App - Hex Map Editor for Tabletop RPGs';

    // Check if scripts are already loaded (to avoid duplicate loading in SPA)
    if ((window as any).__hexMapScriptsLoaded) {
      console.log('Hex map scripts already loaded, skipping reload');
      isLoaded = true;
      return;
    }

    // Wait for DOM to be ready before loading scripts
    await new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      } else {
        resolve(null);
      }
    });

    // Initialize the hex editor scripts in the correct order
    // These scripts are loaded as static assets and expect certain DOM structures
    const scriptOrder = [
      '/hexmap/worker-patch.js',  // Patch Worker constructor for relative paths
      '/hexmap/map-worker.js',    // Vendor: Worker-based map utilities
      '/hexmap/auth.js',          // Vendor: Core authentication library
      '/hexmap/mcp-auth.js',      // MCP authentication bridge
      '/hexmap/cloud-storage.js', // Vendor: Cloud storage library
      '/hexmap/mcp-storage.js',   // MCP storage bridge
      '/hexmap/game.js',
      '/hexmap/hexmap-render-patch.js',  // Boundary-based sparse hex rendering
      '/hexmap/parent-child-terrain-sync.js',  // Aggregate detail hex terrain to parents
      '/hexmap/compendium.js',
      '/hexmap/mobile-companion.js',
      '/hexmap/river-edges.js',        // Edge-based river painting
      '/hexmap/game-ui-bindings.js'  // Exposes game.js functions to window
    ];

    for (const src of scriptOrder) {
      await new Promise<void>((resolve) => {
        const script = document.createElement('script');
        script.src = `${src}?v=2026-05-13-2`;
        script.onload = () => {
          console.log(`Loaded: ${src}`);
          resolve();
        };
        script.onerror = () => {
          console.warn(`Failed to load ${src}`);
          resolve();
        };
        document.body.appendChild(script);
      });
    }

    // Mark scripts as loaded
    (window as any).__hexMapScriptsLoaded = true;
    isLoaded = true;
  });

  onDestroy(() => {
    // Clean up if needed
  });
</script>

<svelte:head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="/hexmap/style.css?v=2026-05-13-2" />
  <link rel="stylesheet" href="/hexmap/mobile-companion.css?v=2026-05-13-2" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    rel="preload"
    as="style"
    href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=EB+Garamond:wght@400;700&family=Great+Vibes&family=MedievalSharp&family=Merriweather:wght@400;700&family=Montserrat:wght@400;700&family=Open+Sans:wght@400;700&family=Pirata+One&family=Playfair+Display:wght@400;700&family=Roboto:wght@400;700&family=Uncial+Antiqua&display=swap"
  />
  <link
    href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=EB+Garamond:wght@400;700&family=Great+Vibes&family=MedievalSharp&family=Merriweather:wght@400;700&family=Montserrat:wght@400;700&family=Open+Sans:wght@400;700&family=Pirata+One&family=Playfair+Display:wght@400;700&family=Roboto:wght@400;700&family=Uncial+Antiqua&display=swap"
    rel="stylesheet"
    media="print"
    on:load={handleFontLoadComplete}
  />
  <noscript
    ><link
      href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=EB+Garamond:wght@400;700&family=Great+Vibes&family=MedievalSharp&family=Merriweather:wght@400;700&family=Montserrat:wght@400;700&family=Open+Sans:wght@400;700&family=Pirata+One&family=Playfair+Display:wght@400;700&family=Roboto:wght@400;700&family=Uncial+Antiqua&display=swap"
      rel="stylesheet"
    /></noscript
  >
</svelte:head>

<style>
  html.embed-mode body { overflow: hidden; }
  html.embed-mode .topbar,
  html.embed-mode .sidebar-left,
  html.embed-mode .mobile-topbar-sidecluster,
  html.embed-mode .mobile-companion-header,
  html.embed-mode .mobile-companion-sheet,
  html.embed-mode .mobile-bottom-sheet,
  html.embed-mode .mobile-companion-minimap {
    display: none !important;
  }
  html.embed-mode .sidebar-right {
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    background: transparent !important;
    border: 0 !important;
    overflow: visible !important;
  }
  html.embed-mode .sidebar-right > *:not(.minimap-container) {
    display: none !important;
  }
  html.embed-mode .main {
    height: 100dvh;
    height: 100vh;
  }
  html.embed-mode .minimap-container {
    position: fixed !important;
    top: 12px;
    right: 12px;
    z-index: 150;
    width: 220px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color-emphasis);
    background: rgba(15, 20, 25, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: var(--shadow-lg);
  }
  html.embed-mode .minimap-wrapper {
    height: 160px;
  }
  html.marketing-demo .notification,
  html.marketing-demo .tool-tutorial,
  html.marketing-demo #runtimeLoadingOverlay,
  html.marketing-demo .canvas-overlay {
    display: none !important;
  }
  @keyframes ldSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes ldPulse { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }

  :global(.back-to-lore:hover) {
    background: rgba(160, 174, 192, 0.1) !important;
    color: #cbd5e1 !important;
  }
</style>

<div id="tooltip-container"></div>

<!-- Early Access Gate -->
<!-- Tool Tutorial Container -->
<div id="toolTutorialContainer"></div>

<!-- Loading Screen (inline styles so it renders before CSS loads) -->
<div id="loadingScreen" style="position:fixed;inset:0;z-index:10000;background:#0f1419;display:flex;align-items:center;justify-content:center;">
  <div style="display:flex;flex-direction:column;align-items:center;gap:16px;width:280px;">
    <img src="/hexmap/small_logo.svg" alt="TbdHEX" style="width:72px;height:72px;animation:ldPulse 2s ease-in-out infinite;" />
    <div style="font-size:28px;font-weight:700;letter-spacing:-0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
      <span style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">Hex</span><span style="color:#f0f4f8;">Map</span>
    </div>
    <div style="width:100%;height:4px;background:#1e2530;border-radius:2px;overflow:hidden;margin-top:4px;">
      <div id="loadingBar" style="height:100%;width:5%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:2px;transition:width 0.3s ease;"></div>
    </div>
    <div id="loadingStatus" style="font-size:13px;color:#718096;letter-spacing:0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">Loading...</div>
  </div>
</div>

<!-- Main hex editor app container -->
<div class="app" style="visibility:hidden;">
  <!-- Topbar with file menu, save, etc. - this is populated by game.js -->
  <div class="topbar" style="display: flex !important; align-items: center !important;">
    <div class="topbar-left" style="display: flex !important; align-items: center !important; flex: 1 !important;">
      <a href="/" class="back-to-lore" aria-label="Back to Lore" style="display: flex !important; align-items: center !important; gap: 6px !important; padding: 8px 12px !important; margin-right: 8px !important; text-decoration: none !important; color: #a0aec0 !important; font-size: 14px !important; border-radius: 6px !important; transition: all 0.2s !important; cursor: pointer !important;">
        <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>Lore</span>
      </a>
      <a href="/world-editor" class="logo" aria-label="HexMap home" style="display: flex !important; align-items: center !important; gap: 12px !important; text-decoration: none !important; color: inherit !important;">
        <img src="/hexmap/small_logo.svg" alt="TbdHEX" class="logo-icon" style="width: 40px; height: 40px;" />
        <span class="logo-text" style="display: flex !important; gap: 2px !important;"><span class="logo-hex-text" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">Hex</span><span class="logo-atlas-text" style="color: #f0f4f8;">Map</span></span>
        <span class="mobile-logo-wordmark" aria-hidden="true" style="display: flex !important; gap: 2px !important;"><span class="logo-hex-text" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">Hex</span><span class="logo-atlas-text" style="color: #f0f4f8;">Map</span></span>
        <span class="early-access-badge" style="font-size: 10px; padding: 2px 6px; background: rgba(102, 126, 234, 0.2); border-radius: 3px; color: #667eea;">Early Access</span>
      </a>
      <div class="breadcrumb" style="display: flex !important; align-items: center !important; margin-left: 24px !important; color: #cbd5e1; font-size: 14px !important;">
        <span id="viewName">Hex Map</span>
      </div>
    </div>
    <div class="topbar-right">
      <!-- File Dropdown -->
      <div class="dropdown">
        <button class="header-btn" id="fileBtn">
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/>
          </svg>
          <span>File</span>
        </button>
        <div class="dropdown-menu header-dropdown-menu" id="fileMenu">
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.newMap?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.newMap?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3v2zm-3-7V3.5L18.5 9H13z"/>
            </svg>
            New Map
          </div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.quickCloudSave?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.quickCloudSave?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            Save
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.importMapFromFile?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.importMapFromFile?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
            </svg>
            Import Map (JSON)
          </div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.exportAsPNG?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.exportAsPNG?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            Export as PNG
          </div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.exportAsJSON?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.exportAsJSON?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            Export as JSON
          </div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.showFoundryExportDialog?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.showFoundryExportDialog?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            Export to Foundry VTT
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.shareMap?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.shareMap?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
            </svg>
            Share Link
          </div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.openExamplesModal?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.openExamplesModal?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
            </svg>
            Example Maps
          </div>
        </div>
      </div>

      <!-- Save Button with Auto-save Indicator -->
      <button class="header-btn" id="saveBtn" title="Auto-save enabled">
        <svg class="icon" id="saveIcon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
        </svg>
        <span id="saveText">Saved</span>
      </button>

      <!-- Undo/Redo Buttons -->
      <button class="header-btn" id="undoBtn" on:click={() => window.undoRedoSystem?.undo?.()} title="Undo (Ctrl+Z)" disabled style="opacity: 0.5;">
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
        </svg>
      </button>
      <button class="header-btn" id="redoBtn" on:click={() => window.undoRedoSystem?.redo?.()} title="Redo (Ctrl+Shift+Z)" disabled style="opacity: 0.5;">
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
        </svg>
      </button>

      <!-- More Menu -->
      <div class="dropdown">
        <button class="header-btn-icon" id="moreBtn" title="More options">
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </button>
        <div class="dropdown-menu header-dropdown-menu" id="moreMenu">
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.openSettingsModal?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.openSettingsModal?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
            Settings
          </div>
          <div class="dropdown-item disabled-item">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
            Styles & Themes <span class="coming-soon-badge">Soon</span>
          </div>
          <div class="dropdown-item disabled">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
            </svg>
            Keyboard Shortcuts <span class="coming-soon-badge">Soon</span>
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.resetToolTutorials?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.resetToolTutorials?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
            </svg>
            Reset Tool Tutorials
          </div>
          <div class="dropdown-divider" data-dev-tools-item></div>
          <div class="dropdown-item" data-dev-tools-item role="button" tabindex="0" on:click={() => window.togglePerfHud?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.togglePerfHud?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 3h18v2H3V3zm2 6h3v10H5V9zm5-4h3v14h-3V5zm5 7h3v7h-3v-7z"/>
            </svg>
            Toggle Performance HUD
          </div>
          <div class="dropdown-item" data-dev-tools-item role="button" tabindex="0" on:click={() => window.runHexMapPerfBenchmarksFromUI?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.runHexMapPerfBenchmarksFromUI?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h7v8l10-12h-7z"/>
            </svg>
            Run Performance Benchmark
          </div>
          <div class="dropdown-item" data-dev-tools-item role="button" tabindex="0" on:click={() => window.saveLatestHexMapBenchmarkBaseline?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.saveLatestHexMapBenchmarkBaseline?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            Save Benchmark Baseline
          </div>
          <div class="dropdown-item" data-dev-tools-item role="button" tabindex="0" on:click={() => window.copyLatestHexMapBenchmarkReportFromUI?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.copyLatestHexMapBenchmarkReportFromUI?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z"/>
            </svg>
            Copy Benchmark Report
          </div>
          <div class="dropdown-item" data-dev-tools-item role="button" tabindex="0" on:click={() => window.copyLatestHexMapBenchmarkComparisonFromUI?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.copyLatestHexMapBenchmarkComparisonFromUI?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 3H5c-1.1 0-2 .9-2 2v5h2V5h5V3zm9 0h-5v2h5v5h2V5c0-1.1-.9-2-2-2zM5 14H3v5c0 1.1.9 2 2 2h5v-2H5v-5zm16 0v5h-5v2h5c1.1 0 2-.9 2-2v-5h-2zM8 16l3-8h2l3 8h-2l-.6-1.8H10.6L10 16H8zm3.1-3.6h1.8L12 9.8l-.9 2.6z"/>
            </svg>
            Copy Baseline Comparison
          </div>
          <div class="dropdown-item" data-dev-tools-item role="button" tabindex="0" on:click={() => window.clearHexMapBenchmarkBaseline?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.clearHexMapBenchmarkBaseline?.(); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1z"/>
            </svg>
            Clear Benchmark Baseline
          </div>
          <div class="dropdown-divider" data-dev-tools-item></div>
          <div class="dropdown-item disabled">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
            Documentation <span class="coming-soon-badge">Soon</span>
          </div>
          <div class="dropdown-item disabled">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
            </svg>
            Help & Support <span class="coming-soon-badge">Soon</span>
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.location.href='/world-editor?marketing=1'} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href='/world-editor?marketing=1'; } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            Homepage
          </div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.open('/world-editor?marketing=1#pricing', '_blank')} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open('/world-editor?marketing=1#pricing', '_blank'); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z"/>
            </svg>
            Pricing
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.open('privacy.html', '_blank')} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open('privacy.html', '_blank'); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
            Privacy Policy
          </div>
          <div class="dropdown-item" role="button" tabindex="0" on:click={() => window.open('terms.html', '_blank')} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open('terms.html', '_blank'); } }}>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            Terms of Service
          </div>
        </div>
      </div>

      <!-- Auth Container -->
      <div id="authContainer" style="position: relative;">
        <button class="header-btn" on:click={() => window.showAuthModal?.('login') || (window.showNotification?.('Auth not loaded', 'error') ?? console.error('Auth not loaded'))}>
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
          <span>Sign In</span>
        </button>
      </div>

      <div class="mobile-topbar-sidecluster" aria-label="Mobile quick actions">
        <button class="mobile-chip-btn mobile-icon-chip mobile-cluster-chip" id="mobileCompendiumBtn" on:click={() => window.handleMobileCompendiumButton?.()} type="button" aria-label="Open compendium" title="Open compendium">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 2H8C6.9 2 6 2.9 6 4V20C6 21.1 6.9 22 8 22H18C19.1 22 20 21.1 20 20V4C20 2.9 19.1 2 18 2ZM18 20H8V4H18V20ZM4 6H2V22C2 23.1 2.9 24 4 24H16V22H4V6Z"/>
          </svg>
        </button>
        <div class="mobile-touch-toggle" role="group" aria-label="Touch controls">
          <button class="mobile-touch-toggle-btn active" id="mobileTouchEditBtn" on:click={() => window.toggleMobilePanMode?.(false)} type="button">
            Edit
          </button>
          <button class="mobile-touch-toggle-btn" id="mobileTouchPanBtn" on:click={() => window.toggleMobilePanMode?.(true)} type="button">
            Move Map
          </button>
        </div>
        <div class="dropdown mobile-header-menu-wrap">
          <button class="header-btn mobile-header-menu-btn" id="mobileHeaderMenuBtn" type="button" aria-label="Open menu" aria-expanded="false">
            <span class="mobile-header-menu-glyph" aria-hidden="true">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 7h16v2H4V7zm0 5h16v2H4v-2zm0 5h10v2H4v-2z"/>
              </svg>
            </span>
          </button>
          <div class="dropdown-menu header-dropdown-menu mobile-header-dropdown-menu" id="mobileHeaderMenu"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Main layout with sidebars and canvas -->
  <div class="main">
    <!-- Left sidebar with tools -->
    <div class="sidebar-left">
      <!-- View Mode Toggle -->
      <div class="view-mode-section">
        <h3 style="margin-bottom: 12px;">Mode</h3>
        <div class="view-mode-toggle">
          <button class="view-mode-option active" on:click={() => window.setViewMode?.('builder')} data-view-mode="builder">
            <div class="view-mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </div>
            Edit
          </button>
          <button class="view-mode-option" on:click={() => window.setViewMode?.('explorer')} data-view-mode="explorer">
            <div class="view-mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2H8C6.9 2 6 2.9 6 4V20C6 21.1 6.9 22 8 22H18C19.1 22 20 21.1 20 20V4C20 2.9 19.1 2 18 2ZM18 20H8V4H18V20ZM4 6H2V22C2 23.1 2.9 24 4 24H16V22H4V6Z"/>
              </svg>
            </div>
            Compendium
          </button>
        </div>
      </div>

      <!-- Tools Section (Edit Mode Only) -->
      <div class="tool-section" id="toolsSection">
        <h3>Tools</h3>
        <div class="mode-selector">
          <button class="mode-btn" on:click={() => window.setHexMode?.('select')} data-mode="select" data-tooltip-id="select-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2 1-3.2-7.4L7 18.5V2z"/>
              </svg>
            </div>
            Select
          </button>
          <button class="mode-btn active" on:click={() => window.setHexMode?.('paint')} data-mode="paint" data-tooltip-id="paint-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 512 512" fill="currentColor">
                <path d="M54.438 29.794a24 24 0 0 0-1.204.01c-4.688.157-7.914 1.736-10.113 3.935c-2.932 2.932-4.761 7.689-3.588 15.305s5.683 17.754 15.272 28.941c67.894 79.21 132.935 155.56 183.703 211.969c12.273 13.637 23.693 26.08 34.125 37.135c12.095-31.902 34.57-54.144 62.902-64.715c-10.825-10.199-22.936-21.313-36.197-33.248C242.93 178.358 166.578 113.314 87.369 45.42c-11.186-9.589-21.325-14.098-28.941-15.272a30 30 0 0 0-3.99-.355zm295.783 246.64c-30.461 7.627-53.241 29.185-63.608 65.219c5.652 5.785 10.956 11.085 15.78 15.707c7.58 7.264 14.095 13.007 19.21 16.957c1.776-17.225 10.045-33.062 21.645-44.691c10.601-10.628 24.496-18.006 39.125-19.092c-3.871-4.836-9.14-10.751-15.63-17.524c-4.838-5.047-10.415-10.623-16.522-16.576m35.351 51.95c-10.397.137-20.929 5.28-29.582 13.955c-11.537 11.565-18.674 28.85-16.267 45.7c5.334 37.342 23.749 65.81 49.46 81.237c22.727 13.636 51.452 17.35 83.643 6.983c-24.222-4.01-46.475-30.706-48.197-50.65c10.63 12.814 23.94 24.547 38.426 31.75c-9.881-22.578-9.201-45.452-11.088-64.321c-1.352-13.522-3.891-24.982-11.377-35.162s-20.423-19.8-44.74-27.907a31 31 0 0 0-10.278-1.585"/>
              </svg>
            </div>
            <span class="mode-label">Paint</span>
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('erase')} data-mode="erase" data-tooltip-id="paint-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.24 3c-.44 0-.88.17-1.21.5L4.39 14.14a2 2 0 0 0 0 2.83l3.64 3.64A2 2 0 0 0 9.44 21h10.62a1 1 0 0 0 0-2h-5.65l4.62-4.62a2 2 0 0 0 0-2.83L17.66 3.5A1.71 1.71 0 0 0 16.24 3zm0 2.12 1.37 1.37-7.8 7.8-1.37-1.37 7.8-7.8zM7.02 14.26l1.37 1.37-1.37 1.37-1.37-1.37 1.37-1.37z"/>
              </svg>
            </div>
            <span class="mode-label">Erase</span>
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('token')} data-mode="token" data-tooltip-id="token-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 512 512" fill="currentColor">
                <circle cx="256" cy="256" r="200" fill="none" stroke="currentColor" stroke-width="40"/>
                <circle cx="256" cy="256" r="80" fill="currentColor"/>
              </svg>
            </div>
            <span class="mode-label">Token</span>
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('path')} data-mode="path" data-tooltip-id="path-mode">
            <div class="mode-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor">
                <path d="M149.9 27.2 34.25 56.74v76.76L157.8 93.85l46.7-44.67-54.6-21.98zm132.8 57c-7.4.18-10.1 1.88.9 7.13C346.9 121.6 441.7 206.8 391.3 216.9 232.2 249 130.4 292.3 48.51 390.8 25.42 418.6 18 494.8 18 494.8h432.6s-139-21.1-147.8-75.7c-14.9-92.2 194.5-102.7 196.5-199.9.9-43.2-88.3-124.99-184.4-132.52-5.6-.44-22.7-2.71-32.2-2.48zm-163.5 40.9-32.69 10.5v122.2l35.99-10-3.3-122.7z"/>
              </svg>
            </div>
            <span class="mode-label">Path</span>
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('landmark')} data-mode="landmark" data-tooltip-id="landmark-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 512 512" fill="currentColor">
                <path d="M97.812 23.375v92.875l46.22 51.72V351h-25.845L94.594 491.906H414.53L390.938 351h-25.875V167.97l46.22-51.72V23.375h-53.938v43.97H324.5v-43.97h-53.938v43.97h-32.437v-43.97h-53.938v43.97H151.75v-43.97zm73.75 152.875h18.688v50.22h-18.688zm73.594 0h18.688v50.22h-18.688zm74.156 0H338v50.22h-18.688z"/>
              </svg>
            </div>
            <span class="mode-label">Landmark</span>
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('text')} data-mode="text" data-tooltip-id="text-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 4v3h5.5v12h3V7H19V4H5z"/>
              </svg>
            </div>
            Text
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('image')} data-mode="image" data-tooltip-id="image-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
            </div>
            Image
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('fog')} data-mode="fog" data-tooltip-id="fog-mode">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" opacity="0.3"/>
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z"/>
              </svg>
            </div>
            Fog
          </button>
          <button class="mode-btn" on:click={() => window.setHexMode?.('dungeon-door')} data-mode="dungeon-door">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 3h9a2 2 0 0 1 2 2v14h-2v-1H8v1H6V3zm2 2v11h7V5H8zm4 5.5a1 1 0 1 0 .001 2.001A1 1 0 0 0 12 10.5z"/>
              </svg>
            </div>
            Door
          </button>
        </div>
      </div>

      <!-- Brush Settings -->
      <div class="tool-section" id="brushSettingsSection">
        <h3>Brush Settings</h3>

        <!-- Terrain Tool Selector - Centered Layout -->
        <div class="brush-control">
          <label class="section-label">Tool</label>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button class="path-type-btn active" data-tool="brush" on:click={() => window.selectTerrainTool?.('brush')} id="terrainTool_brush" style="flex: 1; max-width: 120px;">
              <div class="path-type-icon">
                <img src="https://api.iconify.design/game-icons/paint-brush.svg?color=white" style="width: 100%; height: 100%;" alt="Brush">
              </div>
              <span class="path-type-label">Brush</span>
            </button>
            <button class="path-type-btn" data-tool="fill" on:click={() => window.selectTerrainTool?.('fill')} id="terrainTool_fill" style="flex: 1; max-width: 120px;">
              <div class="path-type-icon">
                <img src="https://api.iconify.design/game-icons/paint-bucket.svg?color=white" style="width: 100%; height: 100%;" alt="Fill">
              </div>
              <span class="path-type-label">Fill</span>
            </button>
          </div>
        </div>

        <div class="brush-controls">
          <!-- Hide fill mode checkbox since we now have tool buttons -->
          <div class="brush-control" style="display: none;">
            <label>
              <input type="checkbox" id="fillMode" on:change={(e) => window.toggleFillMode?.(e.currentTarget.checked)} style="margin-right: 8px;">
              Fill Connected Area
            </label>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Paint all connected hexes at once</div>
          </div>

          <div class="brush-control" style="margin-top: 24px;">
            <label>Brush Size</label>
            <div class="slider-container">
              <input type="range" class="slider" id="brushSize"
                     min="1" max="15" value="1"
                     on:input={(e) => window.updateBrushSize?.(e.currentTarget.value)}>
              <span class="slider-value" id="brushSizeValue">1</span>
            </div>
          </div>

          <!-- Settlement-only: Brush Opacity slider (shown when settlement map active) -->
          <div class="brush-control" id="settlementBrushOpacityControl" style="margin-top: 16px; display: none;">
            <label>Opacity</label>
            <div class="slider-container">
              <input type="range" class="slider" id="settlementBrushOpacity"
                     min="0.05" max="1" step="0.01" value="0.92"
                     on:input={(e) => window.updateSettlementBrushOpacity?.(e.currentTarget.value)}>
              <span class="slider-value" id="settlementBrushOpacityValue">92%</span>
            </div>
          </div>

          <!-- Paint Speed removed - always set to max -->
          <input type="hidden" id="paintSpeed" value="10">
        </div>
      </div>

      <!-- Terrain Palette -->
      <div class="tool-section" id="terrainPaletteSection">
        <h3>Terrain Brush</h3>
        <div class="terrain-grid" id="terrainPalette">
          <!-- Populated by game.js -->
        </div>
      </div>

      <!-- Map Type Notice -->
      <div class="tool-section" id="mapTypeNoticeSection" style="display: none;">
        <div class="editor-note-box map-type-notice-box" id="mapTypeNoticeBody"></div>
      </div>

      <!-- Token Creator -->
      <div class="tool-section" id="tokenCreatorSection" style="display: none;">
        <h3>Create Token</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button class="btn btn-primary" style="width: 100%;" on:click={() => window.showTokenCreator?.()}>
            ➕ New Token
          </button>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5;">
            <strong>Token Mode:</strong><br>
            • Click hex to place new token<br>
            • Click token to select/view<br>
            • Drag token to move it<br>
          </div>
        </div>
      </div>

      <!-- Path Creator (populated by game.js) -->
      <div class="tool-section" id="pathCreatorSection" style="display: none;"></div>

      <!-- Landmark Creator -->
      <div class="tool-section" id="landmarkCreatorSection" style="display: none;">
        <h3>Create Landmark</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button class="btn btn-primary" style="width: 100%;" on:click={() => window.showLandmarkCreator?.()}>
            ➕ New Landmark
          </button>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5;">
            <strong>Landmark Mode:</strong><br>
            • Click hex to place landmark<br>
            • Shift+Click landmark to select<br>
            • Landmarks appear on hex terrain<br>
          </div>
        </div>
      </div>

      <!-- Text Creator -->
      <div class="tool-section" id="textCreatorSection" style="display: none;">
        <h3>Text Labels</h3>
        <div class="tool-config-stack">
          <div class="tool-config-card">
            <div class="tool-config-card-title">Placement Defaults</div>
            <div class="tool-config-card-note">New labels start with these defaults, then you can keep typing directly on the map.</div>
            <div class="form-group">
              <label class="form-label">Starter Text</label>
              <input type="text" class="form-input" id="newTextLabelText" placeholder="Optional label text...">
            </div>
            <div class="form-group">
              <label class="form-label">Visibility</label>
              <select class="form-select" id="newTextLabelVisibility">
                <option value="world">Always Visible</option>
                <option value="region">Region+</option>
                <option value="hex">Local+</option>
                <option value="settlement">Detail Only</option>
              </select>
            </div>
            <div class="tool-field-grid-2">
              <div class="form-group">
                <label class="form-label">Size</label>
                <input type="number" class="form-input" id="newTextLabelFontSize" min="8" max="120" step="1" value="24">
              </div>
              <div class="form-group">
                <label class="form-label">Color</label>
                <input type="color" class="form-input form-color-input" id="newTextLabelColor" value="#ffffff">
              </div>
            </div>
          </div>
          <div class="editor-note-box">
            Click a hex to place a label, click an existing label to edit it, and drag a selected label to reposition it.
          </div>
        </div>
      </div>

      <!-- Image Creator (populated by game.js) -->
      <div class="tool-section" id="imageCreatorSection" style="display: none;"></div>

      <!-- Fog Creator (populated by game.js) -->
      <div class="tool-section" id="fogCreatorSection" style="display: none;"></div>

      <!-- Layers Section -->
      <div class="tool-section tool-section--layers" id="layersSection" hidden>
        <button class="layers-toggle" id="layersToggleButton" type="button" on:click={() => window.toggleLayersPanel?.()} aria-expanded="false" aria-controls="layersList">
          <span class="layers-toggle-copy">
            <span class="layers-toggle-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
              </svg>
            </span>
            <span class="layers-toggle-title">Layers</span>
          </span>
          <span id="layersExpandIcon" class="layers-toggle-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.29 6.71a1 1 0 0 1 1.42 0l5 5a1 1 0 0 1 0 1.42l-5 5a1 1 0 1 1-1.42-1.42L13.59 12 9.29 7.71a1 1 0 0 1 0-1.42z"/>
            </svg>
          </span>
        </button>
        <div id="layersList" class="layers-panel-body" style="display:none;"></div>
      </div>
    </div>

    <!-- Canvas container -->
    <div class="canvas-container">
      <canvas id="hexCanvas"></canvas>
      <div id="inlineTextEdit" class="inline-text-edit" contenteditable="true" spellcheck="false" style="display: none;"></div>
      <div id="inlineNameEdit" class="inline-name-edit" style="display: none;">
        <div class="inline-name-preview" id="inlineNamePreview"></div>
        <input type="text" id="inlineNameInput" class="inline-name-input" placeholder="Name..." spellcheck="false" autocomplete="off" />
      </div>

      <div class="canvas-overlay">
        <strong id="modeText">Paint Mode</strong> · <span id="terrainText">Plains</span> selected<br />
        <span id="instructionText">Click to paint · Drag for multiple · Keys 1-5 for brush size</span>
      </div>

      <button id="dungeonBackFloat" class="dungeon-back-float" type="button" on:click={() => window.returnToParentMap?.()} style="display:none;" title="Return to the parent world map">
        <svg class="dungeon-back-float-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        <span class="dungeon-back-float-label">Back to <span id="dungeonBackFloatName">World</span></span>
      </button>

      <div class="zoom-controls">
        <button class="zoom-btn" on:click={() => window.zoomIn?.()}>+</button>
        <button class="zoom-btn zoom-level" id="zoomLevel">100%</button>
        <button class="zoom-btn" on:click={() => window.zoomOut?.()}>−</button>
      </div>

      <div class="mobile-footer-stack" id="mobileFooter">
        <div class="mobile-quick-controls" id="mobileQuickControls">
          <div class="mobile-context-controls" id="mobileContextControls"></div>
          <div class="mobile-toolbar" id="mobileToolbar">
            <!-- Populated by game.js -->
          </div>
        </div>
      </div>
    </div>

    <!-- Right sidebar with minimap and details -->
    <div class="sidebar-right" id="hexDetailsPanel">
      <!-- Compendium Panel (populated by game.js) -->
      <div id="compendiumPanel" style="display: none;"></div>

      <div class="minimap-container">
        <div class="minimap-header">
          <span class="minimap-title">Map Overview</span>
          <span class="minimap-stats" id="minimapStats">...</span>
        </div>
        <div class="minimap-wrapper">
          <canvas id="minimapCanvas" class="minimap-canvas"></canvas>
          <div id="minimapViewport" class="minimap-viewport"></div>
        </div>
      </div>

      <div class="no-selection">
        <div class="no-selection-icon"></div>
        <p>Select a hex to view details</p>
        <p style="margin-top: 8px; font-size: 12px;">Click any hex on the map</p>
      </div>
    </div>
    <div class="mobile-panel-backdrop" id="mobilePanelBackdrop" role="button" tabindex="0" on:click={() => window.closeMobilePanels?.()} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.closeMobilePanels?.(); } }}></div>
  </div>

  <!-- Settings Modal -->
  <div class="modal-overlay" id="settingsModal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <svg class="icon" style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
          Settings
        </div>
        <button class="modal-close" on:click={() => window.closeModal?.('settingsModal')}>
          <svg class="icon" style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="settings-content">
          <div class="settings-panel" style="flex: 1;">
            <div class="setting-group">
              <h3>Grid Settings</h3>
              <div class="setting-item">
                <div>
                  <div class="setting-label">Show Region Numbers</div>
                  <div class="setting-description">Display coordinate numbers on each region hex (0,0 at center)</div>
                </div>
                <div class="toggle-switch" id="hexCoordinatesToggle" role="button" tabindex="0" on:click={(e) => window.toggleHexCoordinates?.(e.currentTarget)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toggleHexCoordinates?.(e.currentTarget); } }}></div>
              </div>
              <div class="setting-item" id="continentGridSettingItem">
                <div>
                  <div class="setting-label setting-label-with-badge">Continent Layer <span class="pro-feature-indicator">PRO</span></div>
                  <div class="setting-description">Fade into a broader continent grid when you zoom far enough out</div>
                </div>
                <div class="toggle-switch" id="continentGridToggle" role="button" tabindex="0" on:click={(e) => window.toggleContinentGrid?.(e.currentTarget)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toggleContinentGrid?.(e.currentTarget); } }}></div>
              </div>
              <div class="setting-item" id="continentGridDensitySettingItem">
                <div>
                  <div class="setting-label setting-label-with-badge">Continent Density <span class="pro-feature-indicator">PRO</span></div>
                  <div class="setting-description">Choose how many region hexes are compacted into each continent cell</div>
                </div>
                <select class="form-select" id="continentGridDensity" on:change={(e) => window.updateContinentGridDensity?.(e.currentTarget.value)} style="max-width: 150px;">
                  <option value="7">7 cells</option>
                  <option value="19">19 cells</option>
                  <option value="37">37 cells</option>
                  <option value="61">61 cells</option>
                  <option value="91">91 cells</option>
                  <option value="127">127 cells</option>
                  <option value="169">169 cells</option>
                  <option value="217">217 cells</option>
                </select>
              </div>
              <div class="setting-item" id="detailGridSettingItem">
                <div>
                  <div class="setting-label setting-label-with-badge">Settlement Layer <span class="pro-feature-indicator">PRO</span></div>
                  <div class="setting-description">Fade into a denser editable settlement grid when zoomed far enough in</div>
                </div>
                <div class="toggle-switch" id="detailGridToggle" role="button" tabindex="0" on:click={(e) => window.toggleDetailGrid?.(e.currentTarget)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toggleDetailGrid?.(e.currentTarget); } }}></div>
              </div>
              <div class="setting-item" id="detailGridDensitySettingItem">
                <div>
                  <div class="setting-label setting-label-with-badge">Settlement Density <span class="pro-feature-indicator">PRO</span></div>
                  <div class="setting-description">Choose how much extra settlement detail becomes available when the zoomed-in grid activates</div>
                </div>
                <select class="form-select" id="detailGridDensity" on:change={(e) => window.updateDetailGridDensity?.(e.currentTarget.value)} style="max-width: 150px;">
                  <option value="7">7 cells</option>
                  <option value="19">19 cells</option>
                  <option value="37">37 cells</option>
                </select>
              </div>
            </div>

            <div class="setting-group" id="hexEarthDrilldownGroup">
              <h3>Region Drill-down</h3>
              <div class="setting-item">
                <div>
                  <div class="setting-label">Auto Zoom-to-Load</div>
                  <div class="setting-description">Zoom into a region on the World map to auto-load its detailed map; zoom back out to return to the overview</div>
                </div>
                <div class="toggle-switch" id="hexEarthAutoZoomToggle" role="button" tabindex="0" on:click={(e) => window.hexEarthToggleAuto?.(e.currentTarget)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.hexEarthToggleAuto?.(e.currentTarget); } }}></div>
              </div>
              <div class="setting-item">
                <div>
                  <div class="setting-label">Drill-in Sensitivity</div>
                  <div class="setting-description">How far you zoom in past the World fit before a region loads</div>
                </div>
                <select class="form-select" id="hexEarthZoomIn" on:change={(e) => window.hexEarthSetZoomIn?.(e.currentTarget.value)} style="max-width: 170px;">
                  <option value="1.6">Sensitive (1.6×)</option>
                  <option value="2.2">Default (2.2×)</option>
                  <option value="3">Relaxed (3×)</option>
                  <option value="4">Far (4×)</option>
                </select>
              </div>
              <div class="setting-item">
                <div>
                  <div class="setting-label">Return-to-World Threshold</div>
                  <div class="setting-description">How far you zoom out within a region before snapping back to the World overview (lower = more zoom-out room)</div>
                </div>
                <select class="form-select" id="hexEarthZoomOut" on:change={(e) => window.hexEarthSetZoomOut?.(e.currentTarget.value)} style="max-width: 170px;">
                  <option value="0.5">Quick (0.50×)</option>
                  <option value="0.35">Medium (0.35×)</option>
                  <option value="0.28">Default (0.28×)</option>
                  <option value="0.2">Roomy (0.20×)</option>
                  <option value="0.12">Max room (0.12×)</option>
                </select>
              </div>
            </div>

            <div class="setting-group">
              <h3>Hex Geometry</h3>
              <div class="setting-item">
                <div>
                  <div class="setting-label">Hex Orientation</div>
                  <div class="setting-description">Flat-top (horizontal) or pointy-top (vertical) hexagons</div>
                </div>
                <div class="hex-orientation-toggle" id="hexOrientationToggle">
                  <button class="hex-orient-btn active" data-orient="flat" on:click={() => window.setHexOrientationUI?.('flat')}>
                    <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="7,0 21,0 28,12 21,24 7,24 0,12" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                    <span>Flat</span>
                  </button>
                  <button class="hex-orient-btn" data-orient="pointy" on:click={() => window.setHexOrientationUI?.('pointy')}>
                    <svg width="24" height="28" viewBox="0 0 24 28"><polygon points="12,0 24,7 24,21 12,28 0,21 0,7" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                    <span>Pointy</span>
                  </button>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <div class="setting-label">Canvas Background</div>
                  <div class="setting-description">Choose the color that shows behind the map where no terrain is painted</div>
                </div>
                <input type="color" id="canvasBackgroundColor" value="#0f1419" style="width: 50px; height: 32px; border: none; border-radius: 4px; cursor: pointer; background: transparent;">
              </div>
            </div>

            <div class="setting-group">
              <h3>Developer</h3>
              <div class="setting-item">
                <div>
                  <div class="setting-label">Developer Tools</div>
                  <div class="setting-description">Show performance HUD and benchmark controls in the menus on this browser only</div>
                </div>
                <div class="toggle-switch" id="developerToolsToggle" role="button" tabindex="0" on:click={(e) => window.toggleDeveloperTools?.(e.currentTarget)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toggleDeveloperTools?.(e.currentTarget); } }}></div>
              </div>
            </div>

            <div class="setting-group">
              <h3>World Hex Tile Assets</h3>
              <div class="setting-description" style="margin-bottom: 10px;">Upload custom tile images for each terrain type on the world hex map. Images replace the default solid color + icon on painted hexes.</div>
              <div class="hex-tile-grid" id="hexTileGrid">
                <!-- Populated by game.js -->
              </div>
            </div>
            <div class="setting-group">
              <h3>Dungeon Tile Assets</h3>
              <div class="setting-description" style="margin-bottom: 10px;">Upload custom tile images for dungeon floor tiles. These textures show up when painting dungeon cells, just like world hex textures do on the main map.</div>
              <div class="hex-tile-grid" id="dungeonTileGrid">
                <!-- Populated by game.js -->
              </div>
            </div>
            <div class="setting-group">
              <h3>Settlement Brush Assets</h3>
              <div class="setting-description" style="margin-bottom: 10px;">Upload tileable PNGs for Settlement Mode's freeform terrain brushes. These textures are separate from world hex tile art.</div>
              <div class="hex-tile-grid" id="settlementBrushGrid">
                <!-- Populated by game.js -->
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => window.closeModal?.('settingsModal')}>Cancel</button>
        <button class="btn btn-primary" on:click={() => window.saveSettings?.()}>Save Settings</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="themesModal">
    <div class="modal">
      <!-- Modal content populated by game.js -->
    </div>
  </div>

  <div class="modal-overlay" id="shortcutsModal">
    <div class="modal">
      <!-- Modal content populated by game.js -->
    </div>
  </div>

  <div class="modal-overlay" id="examplesModal">
    <div class="modal">
      <!-- Modal content populated by game.js -->
    </div>
  </div>
</div>

<!-- Hidden file input for importing -->
<input type="file" id="importFileInput" accept=".json,image/*" style="display: none;" />
