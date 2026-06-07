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
          if (w.state && w.state.hexMap) {
            w.state.hexMap.hexes = [];
            w.state.hexMap.landmarks = [];
            if (typeof w.renderHex === 'function') w.renderHex();
          }
          w.showNotification?.('New map created', 'success');
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

    // importMapFromFile is defined in game.js but the vendor R2 deploy overwrites it.
    // Expose it here so the "Import Map (JSON)" menu item always works.
    if (typeof w.importMapFromFile !== 'function') {
      w.importMapFromFile = function() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
          fileInput.click();
        } else {
          w.showNotification?.('Import file picker not available', 'error');
        }
      };
      console.log('[Game UI Bindings] Created importMapFromFile stub');
    }

    if (typeof w.shareMap !== 'function') {
      w.shareMap = function() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
          w.showNotification?.('Link copied to clipboard', 'success');
        }).catch(err => {
          console.error('Could not copy link:', err);
          w.showNotification?.('Failed to copy link', 'error');
        });
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
      setTimeout(() => {
        exposeGameFunctions();
        var mapId = window.state && window.state.hexMap && window.state.hexMap.mapInstanceId;
        var isEarth = !mapId || String(mapId).indexOf('earth-') === 0;
        if (isEarth) {
          restoreLastOpenedMap();
        } else {
          saveLastOpenedDraftKey();
        }
      }, 200);
    } else if (waitAttempts > 150) {
      clearInterval(waitForGameJs);
      console.warn('[Game UI Bindings] Timeout waiting for game.js - some features may not be available');
      exposeGameFunctions();
    }
  }, 50);

  var HEXMAP_DB = 'HexAtlasDB'; // database name is fixed by game.js; only the variable is ours
  var IDB_STORES = ['mapMeta', 'regionTerrain', 'detailTerrain', 'items', 'fog', 'layersSettings'];
  var _restoreAttempted = false;

  // When a non-earth map is loaded, find its full IDB key and persist it so
  // restoreLastOpenedMap() can reload it next session.
  function saveLastOpenedDraftKey() {
    var mapId = window.state && window.state.hexMap && window.state.hexMap.mapInstanceId;
    if (!mapId || String(mapId).indexOf('earth-') === 0) return;

    var draftId = new URLSearchParams(window.location.search).get('draftId');
    if (!draftId) return;

    localStorage.setItem('hexmap_last_draft_id', draftId);

    // Find the full IDB key (includes the tab ID) by scanning mapMeta.
    var req = indexedDB.open(HEXMAP_DB);
    req.onsuccess = function(e) {
      var db = e.target.result;
      var tx = db.transaction('mapMeta', 'readonly');
      var r = tx.objectStore('mapMeta').getAll();
      r.onsuccess = function() {
        db.close();
        var entry = r.result.find(function(m) { return m.draftId === draftId; });
        if (entry && entry.id) {
          localStorage.setItem('hexmap_last_draft_key', entry.id);
          console.log('[Game UI Bindings] Saved last draft key:', entry.id);
        }
      };
    };
  }

  // When earth-996 loaded (wrong default), check for a saved user map and restore it
  // by reading all stores from the game's IDB and calling loadMapDataIntoState.
  function restoreLastOpenedMap() {
    if (_restoreAttempted) return;
    _restoreAttempted = true;
    var fullKey = localStorage.getItem('hexmap_last_draft_key');

    // If we have a draftId but no full key yet, try to find it from IDB mapMeta.
    if (!fullKey) {
      var draftId = localStorage.getItem('hexmap_last_draft_id');
      if (!draftId) return;

      var req0 = indexedDB.open(HEXMAP_DB);
      req0.onsuccess = function(e) {
        var db = e.target.result;
        var tx = db.transaction('mapMeta', 'readonly');
        var r = tx.objectStore('mapMeta').getAll();
        r.onsuccess = function() {
          db.close();
          var entry = r.result.find(function(m) { return m.draftId === draftId; });
          if (entry && entry.id) {
            localStorage.setItem('hexmap_last_draft_key', entry.id);
            loadFromIdbKey(entry.id);
          }
        };
      };
      return;
    }

    loadFromIdbKey(fullKey);
  }

  function loadFromIdbKey(fullKey) {
    console.log('[Game UI Bindings] Restoring map from IDB key:', fullKey);
    var req = indexedDB.open(HEXMAP_DB);
    req.onsuccess = function(e) {
      var db = e.target.result;
      var data = {};
      var pending = IDB_STORES.length;
      IDB_STORES.forEach(function(name) {
        var tx = db.transaction(name, 'readonly');
        var r = tx.objectStore(name).get(fullKey);
        r.onsuccess = function() {
          data[name] = r.result;
          if (--pending === 0) { db.close(); applyRestoredMap(data, fullKey); }
        };
        r.onerror = function() {
          if (--pending === 0) { db.close(); applyRestoredMap(data, fullKey); }
        };
      });
    };
  }

  function applyRestoredMap(data, fullKey) {
    var meta = data.mapMeta;
    if (!meta) {
      console.warn('[Game UI Bindings] No mapMeta found for key:', fullKey);
      localStorage.removeItem('hexmap_last_draft_key');
      return;
    }
    var terrain = data.regionTerrain || {};
    var detail = data.detailTerrain || {};
    var items = data.items || {};
    var fog = data.fog || {};
    var layers = data.layersSettings || {};

    var state = Object.assign({},
      { version: meta.version, mapName: meta.mapName, mapType: meta.mapType,
        mapInstanceId: meta.mapInstanceId, canvasBackground: meta.canvasBackground,
        orientation: meta.orientation, hexSize: meta.hexSize, viewport: meta.viewport,
        nextLandmarkId: meta.nextLandmarkId, nextTextLabelId: meta.nextTextLabelId,
        nextImageOverlayId: meta.nextImageOverlayId, nextTokenId: meta.nextTokenId,
        nextPathId: meta.nextPathId, dungeonLayout: meta.dungeonLayout, settlementLayout: meta.settlementLayout },
      { hexes: terrain.hexes || [] },
      { detailHexes: detail.detailHexes || [], subHexes: detail.subHexes || [],
        subHexLandmarks: detail.subHexLandmarks || [], subHexTokens: detail.subHexTokens || [] },
      { landmarks: items.landmarks || [], textLabels: items.textLabels || [],
        imageOverlays: items.imageOverlays || [], tokens: items.tokens || [], paths: items.paths || [] },
      { fogOfWar: fog.fogOfWar || [], fogSettings: fog.fogSettings || {} },
      { detailGridEnabled: layers.detailGridEnabled, detailGridDensity: layers.detailGridDensity,
        showHexCoordinates: layers.showHexCoordinates, layers: layers.layers || [],
        customTerrains: layers.customTerrains || {}, customDungeonTiles: layers.customDungeonTiles || {} }
    );

    if (typeof window.loadMapDataIntoState === 'function') {
      window.loadMapDataIntoState(state);
      console.log('[Game UI Bindings] Restored map from IDB key:', fullKey);
    }
  }
})();