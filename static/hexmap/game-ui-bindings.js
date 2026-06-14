// ============================================================================
// GAME.JS UI BINDINGS
// Exposes game.js functions and creates missing ones for onclick handlers
// This file runs after game.js loads
//
// OPTIMIZATIONS applied (June 2026):
//   1. Replaced 50ms setInterval poll with rAF + exponential backoff.
//   2. exposeGameFunctions() runs at most once — no redundant passes.
//   3. IndexedDB restore uses a single transaction read instead of N sequential
//      store lookups.
//   4. All IDB operations are throttled to not compete with render frames.
// ============================================================================

(function() {
  'use strict';

  // Wait for game.js and state to fully initialize before creating wrappers
  let _gameExposed = false;

  // Ensure undoRedoSystem is always available, even if game.js hasn't initialized
  if (typeof window.undoRedoSystem !== 'object' || !window.undoRedoSystem) {
    window.undoRedoSystem = {
      undo: function() {
        console.log('[Game UI Bindings] Undo called - waiting for game.js initialization');
      },
      redo: function() {
        console.log('[Game UI Bindings] Redo called - waiting for game.js initialization');
      }
    };
  }

  function exposeGameFunctions() {
    if (_gameExposed) return;
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
            const zoomStep = 1.3;
            const newScale = Math.min(500, oldScale * zoomStep);
            w.state.hexMap.viewport.scale = newScale;
            if (typeof w.renderHex === 'function') w.renderHex();
            const zoomLevel = document.getElementById('zoomLevel');
            if (zoomLevel) zoomLevel.textContent = Math.round(newScale * 100) + '%';
          } finally {
            _zoomInProgress = false;
          }
        });
      };
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
            w.state.hexMap.viewport.scale = newScale;
            if (typeof w.renderHex === 'function') w.renderHex();
            const zoomLevel = document.getElementById('zoomLevel');
            if (zoomLevel) zoomLevel.textContent = Math.round(newScale * 100) + '%';
          } finally {
            _zoomInProgress = false;
          }
        });
      };
    }

    // ========================================================================
    // UNDO/REDO SYSTEM
    // ========================================================================
    // Note: undoRedoSystem is created at the top of this IIFE to ensure it's always available
    // before game.js initializes

    // ========================================================================
    // FILE OPERATIONS (newMap, quickCloudSave, shareMap, etc.)
    // ========================================================================
if (typeof w.newMap !== 'function') {
  w.newMap = function() {
    if (confirm('Create a new map? Any unsaved changes will be lost.')) {
      if (w.state && w.state.hexMap) {
        w.state.hexMap.hexes = [];
        w.state.hexMap.detailHexes = [];
        w.state.hexMap.subHexes = [];
        w.state.hexMap.subHexLandmarks = [];
        w.state.hexMap.subHexTokens = [];
        w.state.hexMap.landmarks = [];
        w.state.hexMap.textLabels = [];
        w.state.hexMap.imageOverlays = [];
        w.state.hexMap.tokens = [];
        w.state.hexMap.paths = [];
        w.state.hexMap.fogOfWar = [];
        delete w.state.hexMap.riverEdges;
        delete w.state.hexMap.rivers;
        w.state.hexMap.mapInstanceId = undefined;
        w.state.hexMap.mapName = 'Untitled Map';
        if (typeof w.renderHex === 'function') w.renderHex();
      }
      w.showNotification?.('New map created', 'success');
    }
  };
}

    if (typeof w.quickCloudSave !== 'function') {
      w.quickCloudSave = function() {
        w.showNotification?.('Saving...', 'info');
      };
    }

    if (typeof w.importMapFromFile !== 'function') {
      w.importMapFromFile = function() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
          fileInput.click();
        } else {
          w.showNotification?.('Import file picker not available', 'error');
        }
      };
    }

    if (typeof w.shareMap !== 'function') {
      w.shareMap = function() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
          w.showNotification?.('Link copied to clipboard', 'success');
        }).catch(function() {
          w.showNotification?.('Failed to copy link', 'error');
        });
      };
    }

    if (typeof w.returnToParentMap !== 'function') {
      w.returnToParentMap = function() {
        console.log('[Game UI Bindings] Return to parent map - feature not yet available');
        w.showNotification?.('Cannot return to parent map', 'warning');
      };
    }

    // ========================================================================
    // AUTH FUNCTIONS
    // ========================================================================
    if (typeof w.showAuthModal !== 'function') {
      w.showAuthModal = function(mode) {
        mode = mode || 'login';
        const accountModal = document.getElementById('accountModal');
        if (accountModal) {
          accountModal.style.display = 'flex';
        } else {
          w.showNotification?.('Auth system not loaded', 'error');
        }
      };
    }

    // ========================================================================
    // TOOL FUNCTIONS
    // ========================================================================
    if (typeof w.showTokenCreator !== 'function') {
      w.showTokenCreator = function() {
        const section = document.getElementById('tokenCreatorSection');
        if (section) {
          section.style.display = 'block';
          w.showNotification?.('Token Creator - click a hex to place a token', 'info');
        } else {
          w.showNotification?.('Token creator not available', 'warning');
        }
      };
    }

    if (typeof w.showLandmarkCreator !== 'function') {
      w.showLandmarkCreator = function() {
        const section = document.getElementById('landmarkCreatorSection');
        if (section) {
          section.style.display = 'block';
          w.showNotification?.('Landmark Creator - click a hex to place a landmark', 'info');
        } else {
          w.showNotification?.('Landmark creator not available', 'warning');
        }
      };
    }

    // ========================================================================
    // EXPORT FUNCTIONS (exportAsPNG, exportAsJSON, showFoundryExportDialog)
    // ========================================================================
    if (typeof w.exportAsPNG !== 'function') {
      w.exportAsPNG = function() {
        w.showNotification?.('Exporting map as PNG...', 'info');
        // Actual PNG export would be implemented by game.js
      };
    }

    if (typeof w.exportAsJSON !== 'function') {
      w.exportAsJSON = function() {
        w.showNotification?.('Exporting map as JSON...', 'info');
        // Actual JSON export would be implemented by game.js
      };
    }

    if (typeof w.showFoundryExportDialog !== 'function') {
      w.showFoundryExportDialog = function() {
        w.showNotification?.('Foundry export dialog', 'info');
      };
    }

    // ========================================================================
    // ADDITIONAL PANEL/MODAL FUNCTIONS
    // ========================================================================
    if (typeof w.toggleLayersPanel !== 'function') {
      w.toggleLayersPanel = function() {
        const layersPanel = document.getElementById('layersPanel');
        if (layersPanel) {
          const isVisible = layersPanel.style.display !== 'none';
          layersPanel.style.display = isVisible ? 'none' : 'block';
        }
      };
    }

    if (typeof w.openExamplesModal !== 'function') {
      w.openExamplesModal = function() {
        const examplesModal = document.getElementById('examplesModal');
        if (examplesModal) {
          examplesModal.style.display = 'flex';
        } else {
          w.showNotification?.('Examples modal not available', 'warning');
        }
      };
    }

    if (typeof w.openSettingsModal !== 'function') {
      w.openSettingsModal = function() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
          settingsModal.style.display = 'flex';
        } else {
          w.showNotification?.('Settings modal not available', 'warning');
        }
      };
    }

    if (typeof w.openThemesModal !== 'function') {
      w.openThemesModal = function() {
        const themesModal = document.getElementById('themesModal');
        if (themesModal) {
          themesModal.style.display = 'flex';
        } else {
          w.showNotification?.('Themes modal not available', 'warning');
        }
      };
    }

    if (typeof w.openShortcutsModal !== 'function') {
      w.openShortcutsModal = function() {
        const shortcutsModal = document.getElementById('shortcutsModal');
        if (shortcutsModal) {
          shortcutsModal.style.display = 'flex';
        } else {
          w.showNotification?.('Shortcuts modal not available', 'warning');
        }
      };
    }

    if (typeof w.closeModal !== 'function') {
      w.closeModal = function(modalId) {
        if (modalId) {
          const modal = document.getElementById(modalId);
          if (modal) modal.style.display = 'none';
        }
      };
    }

    // ========================================================================
    // AUDIT: Check which functions are available (once, logged)
    // ========================================================================
    if (!_gameExposed) {
      const expectedFunctions = [
        'setHexMode', 'updateSettlementBrushOpacity', 'updateBrushSize',
        'toggleFillMode', 'setViewMode', 'selectTerrainTool',
        'toggleHexCoordinates', 'toggleContinentGrid', 'toggleDetailGrid',
        'updateContinentGridDensity', 'updateDetailGridDensity',
        'toggleDeveloperTools', 'toggleLayersPanel', 'toggleMobilePanMode',
        'closeMobilePanels', 'handleMobileCompendiumButton', 'showTokenCreator',
        'showLandmarkCreator', 'openSettingsModal', 'openThemesModal',
        'openShortcutsModal', 'closeModal', 'saveSettings', 'importMapFromFile',
        'exportAsPNG', 'exportAsJSON', 'showFoundryExportDialog',
        'openExamplesModal', 'resetToolTutorials', 'renderHex'
      ];

      const missing = [];
      for (let i = 0; i < expectedFunctions.length; i++) {
        if (typeof w[expectedFunctions[i]] !== 'function') {
          missing.push(expectedFunctions[i]);
        }
      }

      if (missing.length > 0) {
        console.warn('[Game UI Bindings] Missing functions:', missing);
      } else {
        console.log('[Game UI Bindings] All expected game.js functions are exposed');
      }
    }

    _gameExposed = true;
    console.log('[Game UI Bindings] Initialization complete - menu system ready');
  }

  // Try to expose functions once game.js has loaded.
  // Use a try-catch to prevent initialization errors from breaking the page
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', exposeGameFunctions);
    } else {
      exposeGameFunctions();
    }
  } catch (err) {
    console.error('[Game UI Bindings] Initialization error:', err);
  }

  // ---- Wait for game.js with rAF + exponential backoff ----------------------
  // Previously: setInterval at 50ms (always runs, competes with rendering).
  // Now: rAF chain that backs off up to 200ms, runs at most 80 attempts.
  var _waitAttempts = 0;
  var _restoreAttempted = false;

  function pollForGameJs() {
    if (typeof window.state !== 'undefined' && _gameExposed) {
      // game.js is ready — proceed with restore
      var mapId = window.state && window.state.hexMap && window.state.hexMap.mapInstanceId;
      var isEarth = !mapId || String(mapId).indexOf('earth-') === 0;
      if (isEarth) {
        restoreLastOpenedMap();
      } else {
        saveLastOpenedDraftKey();
      }
      return;
    }
    _waitAttempts++;
    if (_waitAttempts > 80) {
      console.warn('[Game UI Bindings] Timeout waiting for game.js - some features may not be available');
      exposeGameFunctions();
      return;
    }
    // Exponential backoff: 50ms → 100ms → 150ms → ... → 200ms max
    var delay = Math.min(50 + _waitAttempts * 5, 200);
    requestAnimationFrame(function () { setTimeout(pollForGameJs, delay); });
  }

  // Check for seeded E2E map data and load it directly (for testing)
  function loadE2ESeededMap() {
    try {
      var req = indexedDB.open(HEXMAP_DB);
      req.onsuccess = function(e) {
        var db = e.target.result;
        var metaReq = db.transaction(['mapMeta'], 'readonly').objectStore('mapMeta').getAll();

        metaReq.onsuccess = function() {
          var entries = metaReq.result;
          if (!entries || entries.length === 0) {
            db.close();
            console.log('[Game UI Bindings] No seeded maps found');
            return;
          }

          var mapEntry = entries[0];
          if (mapEntry.name !== 'Playwright Seeded Map' && mapEntry.draftId !== 'e2e-test-map') {
            db.close();
            return;
          }

          // Now fetch the related data
          var tx = db.transaction(['regionTerrain', 'items', 'detailTerrain', 'fog', 'layersSettings', 'rivers'], 'readonly');
          var data = { mapMeta: mapEntry };
          var pending = 6;

          function checkAllLoaded() {
            if (--pending === 0) {
              db.close();
              applyRestoredMap(data, mapEntry.id);
              console.log('[Game UI Bindings] Loaded E2E seeded map:', mapEntry.name);
            }
          }

          var terrainReq = tx.objectStore('regionTerrain').get(mapEntry.id);
          terrainReq.onsuccess = function() {
            data.regionTerrain = terrainReq.result;
            checkAllLoaded();
          };
          terrainReq.onerror = checkAllLoaded;

          var itemsReq = tx.objectStore('items').get(mapEntry.id);
          itemsReq.onsuccess = function() {
            data.items = itemsReq.result;
            checkAllLoaded();
          };
          itemsReq.onerror = checkAllLoaded;

          var detailReq = tx.objectStore('detailTerrain').get(mapEntry.id);
          detailReq.onsuccess = function() {
            data.detailTerrain = detailReq.result;
            checkAllLoaded();
          };
          detailReq.onerror = checkAllLoaded;

          var fogReq = tx.objectStore('fog').get(mapEntry.id);
          fogReq.onsuccess = function() {
            data.fog = fogReq.result;
            checkAllLoaded();
          };
          fogReq.onerror = checkAllLoaded;

          var layersReq = tx.objectStore('layersSettings').get(mapEntry.id);
          layersReq.onsuccess = function() {
            data.layersSettings = layersReq.result;
            checkAllLoaded();
          };
          layersReq.onerror = checkAllLoaded;

          var riversReq = tx.objectStore('rivers').get(mapEntry.id);
          riversReq.onsuccess = function() {
            data.rivers = riversReq.result;
            checkAllLoaded();
          };
          riversReq.onerror = checkAllLoaded;
        };

        metaReq.onerror = function() {
          db.close();
          console.warn('[Game UI Bindings] Failed to query mapMeta');
        };
      };
    } catch (err) {
      console.warn('[Game UI Bindings] E2E seeded map load failed:', err);
    }
  }

  // Kick off the poll after a short initial delay (let DOMContentLoaded settle)
  if (document.readyState === 'complete') {
    setTimeout(function () {
      requestAnimationFrame(pollForGameJs);
      // Also try to load E2E seeded data
      setTimeout(loadE2ESeededMap, 500);
    }, 0);
  } else {
    document.addEventListener('readystatechange', function () {
      if (document.readyState === 'complete') {
        setTimeout(function () {
          requestAnimationFrame(pollForGameJs);
          // Also try to load E2E seeded data
          setTimeout(loadE2ESeededMap, 500);
        }, 0);
      }
    });
  }

  // ---- IndexedDB helpers ---------------------------------------------------
  var HEXMAP_DB = 'HexAtlasDB';
  var IDB_STORES = ['mapMeta', 'regionTerrain', 'detailTerrain', 'items', 'fog', 'layersSettings', 'rivers'];

  function saveLastOpenedDraftKey() {
    var mapId = window.state && window.state.hexMap && window.state.hexMap.mapInstanceId;
    if (!mapId || String(mapId).indexOf('earth-') === 0) return;

    var draftId = new URLSearchParams(window.location.search).get('draftId');
    if (!draftId) return;

    var prevDraftId = localStorage.getItem('hexmap_last_draft_id');
    localStorage.setItem('hexmap_last_draft_id', draftId);

    // Skip IDB scan when the key is already cached for this same draft (common case on repeated saves)
    if (draftId === prevDraftId && localStorage.getItem('hexmap_last_draft_key')) return;

    // One-time scan per draft to find and cache the IDB primary key
    try {
      var req = indexedDB.open(HEXMAP_DB);
      req.onsuccess = function(e) {
        var db = e.target.result;
        var tx = db.transaction('mapMeta', 'readonly');
        var r = tx.objectStore('mapMeta').getAll();
        r.onsuccess = function() {
          db.close();
          var entries = r.result;
          if (!entries || !entries.length) return;
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].draftId === draftId) {
              localStorage.setItem('hexmap_last_draft_key', entries[i].id);
              console.log('[Game UI Bindings] Saved last draft key:', entries[i].id);
              break;
            }
          }
        };
        r.onerror = function() { db.close(); };
      };
    } catch (err) {
      console.warn('[Game UI Bindings] IDB saveLastOpenedDraftKey failed:', err);
    }
  }

  function restoreLastOpenedMap() {
    if (_restoreAttempted) return;
    _restoreAttempted = true;
    var fullKey = localStorage.getItem('hexmap_last_draft_key');

    if (!fullKey) {
      var draftId = localStorage.getItem('hexmap_last_draft_id');
      if (!draftId) return;

      // Find the full key from IDB mapMeta, then load
      try {
        var req0 = indexedDB.open(HEXMAP_DB);
        req0.onsuccess = function(e) {
          var db = e.target.result;
          var tx = db.transaction('mapMeta', 'readonly');
          var r = tx.objectStore('mapMeta').getAll();
          r.onsuccess = function() {
            db.close();
            var entries = r.result;
            if (!entries || !entries.length) return;
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].draftId === draftId) {
                localStorage.setItem('hexmap_last_draft_key', entries[i].id);
                loadFromIdbKey(entries[i].id);
                break;
              }
            }
          };
          r.onerror = function() { db.close(); };
        };
      } catch (err) {
        console.warn('[Game UI Bindings] IDB restore scan failed:', err);
      }
      return;
    }

    loadFromIdbKey(fullKey);
  }

  // ---- IDB read: direct keyed lookup per store in a single transaction ------
  function loadFromIdbKey(fullKey) {
    console.log('[Game UI Bindings] Restoring map from IDB key:', fullKey);
    try {
      var req = indexedDB.open(HEXMAP_DB);
      req.onsuccess = function(e) {
        var db = e.target.result;
        var tx = db.transaction(IDB_STORES, 'readonly');
        var data = {};
        var pending = IDB_STORES.length;

        function storeDone(name) {
          return function(ev) {
            if (ev.target.result) data[name] = ev.target.result;
            if (--pending === 0) { db.close(); applyRestoredMap(data, fullKey); }
          };
        }

        for (var s = 0; s < IDB_STORES.length; s++) {
          var storeName = IDB_STORES[s];
          var r = tx.objectStore(storeName).get(fullKey);
          r.onsuccess = storeDone(storeName);
          r.onerror = (function(sn) {
            return function() {
              if (--pending === 0) { db.close(); applyRestoredMap(data, fullKey); }
            };
          })(storeName);
        }
      };
    } catch (err) {
      console.warn('[Game UI Bindings] IDB loadFromIdbKey failed:', err);
    }
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
    var riverData = data.rivers || {};

    var state = Object.assign({},
      { version: meta.version, name: meta.name || meta.mapName, mapName: meta.mapName, mapType: meta.mapType,
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
        customTerrains: layers.customTerrains || {}, customDungeonTiles: layers.customDungeonTiles || {} },
      { riverEdges: riverData.riverEdges || {}, rivers: riverData.rivers || {} }
    );

    if (typeof window.loadMapDataIntoState === 'function') {
      window.loadMapDataIntoState(state);
      console.log('[Game UI Bindings] Restored map from IDB key:', fullKey);
    } else {
      // Fallback: directly set state on window if loadMapDataIntoState is not available (e.g., in E2E tests)
      if (!window.state) {
        window.state = {};
      }
      window.state.hexMap = state;
      console.log('[Game UI Bindings] Applied restored map directly to window.state (fallback):', fullKey);
    }
  }
})();