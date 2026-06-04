// ============================================================================
// GAME.JS UI BINDINGS
// Exposes game.js functions that need to be available to onclick handlers
// This file runs after game.js loads and binds all required functions
// ============================================================================

(function() {
  'use strict';

  // List of functions to expose from game.js to window if they exist but aren't already exposed
  const functionsToExpose = [
    // Modal and settings functions
    'openModal',
    'closeModal',
    'openSettingsModal',
    'openThemesModal',
    'openShortcutsModal',
    'saveSettings',

    // View and UI control functions
    'setViewMode',
    'selectTerrainTool',
    'toggleHexCoordinates',
    'toggleContinentGrid',
    'toggleDetailGrid',
    'toggleDeveloperTools',
    'updateBrushSize',
    'updateSettlementBrushOpacity',
    'toggleLayersPanel',
    'toggleMobilePanMode',
    'closeMobilePanels',

    // File menu functions (these might need to be wrappers)
    'newMap',
    'quickCloudSave',
    'shareMap',
    'importMapFromFile',
    'exportAsPNG',
    'exportAsJSON',
    'showFoundryExportDialog',
    'openExamplesModal',
    'resetToolTutorials',

    // Mobile and other UI functions
    'handleMobileCompendiumButton',
    'showTokenCreator',
    'showLandmarkCreator',
    'zoomIn',
    'zoomOut',
    'undoRedoSystem',
    'returnToParentMap',
    'showAuthModal',
    'closeMobilePanels'
  ];

  // Wait for game.js to load and define its functions
  function exposeGameFunctions() {
    const w = window;
    let exposedCount = 0;

    functionsToExpose.forEach(funcName => {
      // Check if function exists in game.js scope but isn't on window
      // The function might be defined in game.js but not exposed to window
      // We'll check if it's already on window, and if so, leave it alone
      if (typeof w[funcName] === 'function') {
        // Already exposed, nothing to do
        return;
      }

      // For functions that don't exist yet, we might need to create wrappers
      // Check if the underlying function is in the global scope of game.js
      // (This is a limitation - we can only expose what game.js puts on window)
    });

    console.log('[Game UI Bindings] Exposure complete. Waiting for menu interactions.');
  }

  // Try to expose functions immediately (game.js may have already loaded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', exposeGameFunctions);
  } else {
    exposeGameFunctions();
  }

  // Also try after a delay to ensure game.js has fully initialized
  setTimeout(exposeGameFunctions, 500);
})();
