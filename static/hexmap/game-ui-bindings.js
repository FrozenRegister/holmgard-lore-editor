// ============================================================================
// GAME.JS UI BINDINGS
// Exposes game.js functions and creates missing ones for onclick handlers
// This file runs after game.js loads
// ============================================================================

(function() {
  'use strict';

  // Wait for game.js and state to fully initialize before creating wrappers
  function exposeGameFunctions() {
    const w = window;

    // ========================================================================
    // ZOOM FUNCTIONS (zoomIn/zoomOut button handlers) with debouncing
    // ========================================================================
    let _zoomInProgress = false;

    if (typeof w.zoomIn !== 'function') {
      w.zoomIn = function() {
        if (_zoomInProgress || !w.state || !w.state.hexMap || !w.state.hexMap.viewport) return;
        _zoomInProgress = true;
        requestAnimationFrame(() => {
          try {
            const oldScale = w.state.hexMap.viewport.scale;
            // Default zoom step; most hex map editors use 1.25-1.5x
            const zoomStep = 1.3;
            const newScale = Math.min(500, oldScale * zoomStep);

            // Update scale and offset directly
            w.state.hexMap.viewport.scale = newScale;

            // Trigger re-render
            if (typeof w.renderHex === 'function') w.renderHex();

            // Update UI state
            const zoomLevel = document.getElementById('zoomLevel');
            if (zoomLevel) zoomLevel.textContent = Math.round(newScale * 100) + '%';
          } finally {
            _zoomInProgress = false;
          }
        });
      };
      console.log('[Game UI Bindings] Created zoomIn function');
    }

    if (typeof w.zoomOut !== 'function') {
      w.zoomOut = function() {
        if (_zoomInProgress || !w.state || !w.state.hexMap || !w.state.hexMap.viewport) return;
        _zoomInProgress = true;
        requestAnimationFrame(() => {
          try {
            const oldScale = w.state.hexMap.viewport.scale;
            const zoomStep = 1.3;
            const newScale = Math.max(0.02, oldScale / zoomStep);

            // Update scale and offset directly
            w.state.hexMap.viewport.scale = newScale;

            // Trigger re-render
            if (typeof w.renderHex === 'function') w.renderHex();

            // Update UI state
            const zoomLevel = document.getElementById('zoomLevel');
            if (zoomLevel) zoomLevel.textContent = Math.round(newScale * 100) + '%';
          } finally {
            _zoomInProgress = false;
          }
        });
      };
      console.log('[Game UI Bindings] Created zoomOut function');
    }

    // ========================================================================
    // UNDO/REDO SYSTEM - Try to find it or create wrapper
    // ========================================================================
    if (typeof w.undoRedoSystem !== 'object' || !w.undoRedoSystem) {
      w.undoRedoSystem = {
        undo: function() {
          console.log('[Game UI Bindings] Undo called - waiting for game.js initialization');
        },
        redo: function() {
          console.log('[Game UI Bindings] Redo called - waiting for game.js initialization');
        }
      };
    } else {
      console.log('[Game UI Bindings] undoRedoSystem found and exposed');
    }

    // ========================================================================
    // FILE OPERATIONS (newMap, quickCloudSave, shareMap, etc.)
    // ========================================================================
    if (typeof w.newMap !== 'function') {
      w.newMap = function() {
        if (confirm('Create a new map? Any unsaved changes will be lost.')) {
          w.showNotification?.('New map feature coming soon', 'info');
        }
      };
      console.log('[Game UI Bindings] Created newMap stub');
    }

    if (typeof w.quickCloudSave !== 'function') {
      w.quickCloudSave = function() {
        w.showNotification?.('Saving...', 'info');
      };
      console.log('[Game UI Bindings] Created quickCloudSave stub');
    }

    if (typeof w.shareMap !== 'function') {
      w.shareMap = function() {
        w.showNotification?.('Share feature coming soon', 'info');
      };
      console.log('[Game UI Bindings] Created shareMap stub');
    }

    if (typeof w.returnToParentMap !== 'function') {
      w.returnToParentMap = function() {
        console.log('[Game UI Bindings] Return to parent map - feature not yet available');
        w.showNotification?.('Cannot return to parent map', 'warning');
      };
      console.log('[Game UI Bindings] Created returnToParentMap stub');
    }

    // ========================================================================
    // AUTH FUNCTIONS
    // ========================================================================
    if (typeof w.showAuthModal !== 'function') {
      w.showAuthModal = function(mode = 'login') {
        const accountModal = document.getElementById('accountModal');
        if (accountModal) {
          accountModal.style.display = 'flex';
        } else {
          w.showNotification?.('Auth system not loaded', 'error');
        }
      };
      console.log('[Game UI Bindings] Created showAuthModal wrapper');
    }

    // ========================================================================
    // AUDIT: Check which functions are available
    // ========================================================================
    const expectedFunctions = [
      'setHexMode',
      'updateSettlementBrushOpacity',
      'updateBrushSize',
      'toggleFillMode',
      'setViewMode',
      'selectTerrainTool',
      'toggleHexCoordinates',
      'toggleContinentGrid',
      'toggleDetailGrid',
      'updateContinentGridDensity',
      'updateDetailGridDensity',
      'toggleDeveloperTools',
      'toggleLayersPanel',
      'toggleMobilePanMode',
      'closeMobilePanels',
      'handleMobileCompendiumButton',
      'showTokenCreator',
      'showLandmarkCreator',
      'openSettingsModal',
      'openThemesModal',
      'openShortcutsModal',
      'closeModal',
      'saveSettings',
      'importMapFromFile',
      'exportAsPNG',
      'exportAsJSON',
      'showFoundryExportDialog',
      'openExamplesModal',
      'resetToolTutorials',
      'renderHex'
    ];

    const missing = [];
    expectedFunctions.forEach(fname => {
      if (typeof w[fname] !== 'function') {
        missing.push(fname);
      }
    });

    if (missing.length > 0) {
      console.warn('[Game UI Bindings] Missing functions:', missing);
    } else {
      console.log('[Game UI Bindings] All expected game.js functions are exposed');
    }

    console.log('[Game UI Bindings] Initialization complete - menu system ready');
  }

  // Try to expose functions once game.js has loaded
  // Use multiple strategies to catch when game.js is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', exposeGameFunctions);
  } else {
    exposeGameFunctions();
  }

  // Also wait for window.state to be defined (a sign that game.js is ready)
  let waitAttempts = 0;
  const waitForGameJs = setInterval(() => {
    waitAttempts++;
    if (typeof window.state !== 'undefined') {
      clearInterval(waitForGameJs);
      // Give game.js another 200ms to fully initialize
      setTimeout(exposeGameFunctions, 200);
    } else if (waitAttempts > 150) {
      clearInterval(waitForGameJs);
      console.warn('[Game UI Bindings] Timeout waiting for game.js - some features may not be available');
      exposeGameFunctions();
    }
  }, 50);
})();
