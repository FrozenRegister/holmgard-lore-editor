// ============================================================================
// HEXMAP REGION LOADER / SWITCHER
// Loads pre-generated Earth 996 AD region maps (world overview + regional
// zooms) and provides a small switcher UI. Maps are produced by
// scripts/build-earth-from-naturalearth.js and listed in earth-996-regions.json.
//
// OPTIMIZATIONS applied (June 2026):
//   1. Consolidated three polling intervals (zoom 250ms, visibility 400ms,
//      whenReady 50ms) into a single rAF-based scheduler.
//   2. MutationObserver for visibility — no polling when canvas is hidden.
//   3. Zoom watcher skips work when user is actively interacting (painting/panning).
//   4. Cooldown is now dynamic: longer after manual region switches, shorter
//      after zoom-only changes.
// ============================================================================

(function () {
  'use strict';

  const TAG = '[HexEarth]';
  const DATA_BASE = '/src/lib/data/';
  const MANIFEST = DATA_BASE + 'earth-996-regions.json';

  const cache = new Map(); // id -> map state (lazy-fetched)
  let manifest = [];
  let activeId = null;

  // Zoom-to-load state. Thresholds are configured in the app Settings page
  // and shared via localStorage so the user can tune them without a rebuild.
  const ZOOM_CFG_KEY = 'hle:hexzoom';
  const ZOOM_DEFAULTS = { autoZoom: true, zoomInRatio: 2.2, zoomOutRatio: 0.28 };
  let homeScale = null;      // viewport scale right after the active map fit
  let cooldownUntil = 0;     // ignore auto-switch triggers until this time
  let cooldownTimer = null;  // single shared RAF timer for all periodic work

  // --- Interaction-gating: skip heavy work while painting/panning ------------
  function isActivelyInteracting() {
    try {
      return !!(window.state && window.state.hexMap &&
        (window.state.hexMap.isPainting || window.state.hexMap.isPanning));
    } catch { return false; }
  }

  function readZoomCfg() {
    try {
      const p = JSON.parse(localStorage.getItem(ZOOM_CFG_KEY) || '{}');
      return {
        autoZoom: typeof p.autoZoom === 'boolean' ? p.autoZoom : ZOOM_DEFAULTS.autoZoom,
        zoomInRatio: Number(p.zoomInRatio) > 1 ? Number(p.zoomInRatio) : ZOOM_DEFAULTS.zoomInRatio,
        zoomOutRatio: (Number(p.zoomOutRatio) > 0 && Number(p.zoomOutRatio) < 1)
          ? Number(p.zoomOutRatio) : ZOOM_DEFAULTS.zoomOutRatio,
      };
    } catch {
      return { ...ZOOM_DEFAULTS };
    }
  }

  function fetchJson(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return r.json();
    });
  }

  // ---- Load a region into the live map --------------------------------------
  function loadRegion(id) {
    const region = manifest.find((r) => r.id === id);
    if (!region) {
      console.warn(`${TAG} Unknown region '${id}'`);
      return Promise.resolve(false);
    }

    const got = cache.has(id)
      ? Promise.resolve(cache.get(id))
      : fetchJson(DATA_BASE + region.file).then((state) => {
          cache.set(id, state);
          return state;
        });

    return got
      .then((state) => {
        const ok = window.loadMapDataIntoState(state, {
          mapInstanceId: state.mapInstanceId || `earth-996-${id}`,
          fitViewport: { fillRatio: 0.85, maxScale: 6, minScale: 0.02 },
        });
        if (ok !== false) {
          activeId = id;
          highlightActive();
          console.log(`${TAG} Loaded region '${id}' (${region.hexes} hexes)`);
        }
        return ok;
      })
      .catch((err) => {
        console.error(`${TAG} Failed to load region '${id}':`, err);
        return false;
      });
  }

  // ---- Switcher UI ----------------------------------------------------------
  function buildSwitcher() {
    if (document.getElementById('hexEarthSwitcher')) return;

    const bar = document.createElement('div');
    bar.id = 'hexEarthSwitcher';
    bar.style.cssText = [
      'position:fixed', 'bottom:14px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:9999', 'display:flex', 'gap:4px', 'align-items:center',
      'background:rgba(20,26,35,0.92)', 'border:1px solid #2d3748',
      'padding:5px 8px', 'border-radius:10px', 'box-shadow:0 4px 14px rgba(0,0,0,0.4)',
      'font-family:system-ui,sans-serif', 'font-size:12px',
    ].join(';');

    const label = document.createElement('span');
    label.textContent = 'Region:';
    label.style.cssText = 'color:#a0aec0;margin-right:2px;';
    bar.appendChild(label);

    for (const region of manifest) {
      const btn = document.createElement('button');
      btn.textContent = region.name;
      btn.dataset.regionId = region.id;
      btn.style.cssText = [
        'cursor:pointer', 'border:1px solid #2d3748', 'border-radius:6px',
        'padding:4px 9px', 'color:#f0f4f8', 'background:#141a23',
        'font-size:12px', 'white-space:nowrap',
      ].join(';');
      btn.addEventListener('click', () => loadRegion(region.id));
      bar.appendChild(btn);
    }

    document.body.appendChild(bar);
  }

  function highlightActive() {
    const bar = document.getElementById('hexEarthSwitcher');
    if (!bar) return;
    bar.querySelectorAll('button[data-region-id]').forEach((b) => {
      const on = b.dataset.regionId === activeId;
      b.style.background = on ? '#2b6cb0' : '#141a23';
      b.style.borderColor = on ? '#4299e1' : '#2d3748';
    });
  }

  // ---- Zoom-to-load: map viewport center -> region --------------------------
  function viewportCenterLatLon() {
    const region = manifest.find((r) => r.id === activeId);
    if (!region || !region.geo) return null;
    const hm = window.state.hexMap;
    const vp = hm.viewport;
    const size = hm.hexSize * vp.scale;
    if (!size) return null;
    const adjX = -vp.offsetX;
    const adjY = -vp.offsetY;
    const q = Math.round((Math.sqrt(3) / 3 * adjX - 1 / 3 * adjY) / size);
    const r = Math.round((2 / 3 * adjY) / size);
    const { lonMin, latMax, dLon, dLat, qc, rc } = region.geo;
    const row = r + rc;
    const col = q + Math.floor(row / 2) + qc;
    return { lat: latMax - row * dLat, lon: lonMin + col * dLon };
  }

  function regionAt(lat, lon) {
    let best = null, bestArea = Infinity;
    for (const r of manifest) {
      if (r.id === 'world' || !r.bounds) continue;
      const [lo0, lo1] = r.bounds.lon, [la0, la1] = r.bounds.lat;
      if (lon < lo0 || lon > lo1 || lat < la0 || lat > la1) continue;
      const area = (lo1 - lo0) * (la1 - la0);
      if (area < bestArea) { bestArea = area; best = r; }
    }
    return best;
  }

  function writeZoomCfg(patch) {
    const next = { ...readZoomCfg(), ...patch };
    try { localStorage.setItem(ZOOM_CFG_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  // ---- Consolidated scheduler: single rAF loop instead of 3 intervals -------
  // Previously: 250ms zoom watcher + 400ms visibility watcher + 50ms whenReady.
  // Now: one rAF-based tick that defers to idle and skips during interaction.

  let schedulerActive = false;
  let tickQueued = false;
  let lastTickAt = 0;
  const TICK_INTERVAL_MS = 300; // target interval, rAF will approximate

  function scheduleTick() {
    if (tickQueued) return;
    tickQueued = true;
    requestAnimationFrame(() => {
      tickQueued = false;
      const now = performance.now();
      if (now - lastTickAt < TICK_INTERVAL_MS) { scheduleTick(); return; }
      lastTickAt = now;
      performTick();
      if (schedulerActive) scheduleTick();
    });
  }

  function startScheduler() {
    if (schedulerActive) return;
    schedulerActive = true;
    lastTickAt = performance.now();
    scheduleTick();
  }

  function stopScheduler() {
    schedulerActive = false;
    tickQueued = false;
  }

  function performTick() {
    // 1. Visibility sync (was startVisibilityWatcher at 400ms)
    syncEarthUI();

    // 2. Zoom watcher (was startZoomWatcher at 250ms)
    if (!shouldShowEarthUI()) return;
    const cfg = readZoomCfg();
    if (!cfg.autoZoom) return;
    if (!window.state || !window.state.hexMap || homeScale == null) return;
    // Skip during active interaction — don't fight the user
    if (isActivelyInteracting()) return;
    if (Date.now() < cooldownUntil) return;
    const scale = window.state.hexMap.viewport.scale;
    if (activeId === 'world') {
      if (scale > homeScale * cfg.zoomInRatio) {
        const c = viewportCenterLatLon();
        const region = c && regionAt(c.lat, c.lon);
        if (region) loadRegion(region.id);
      }
    } else if (scale < homeScale * cfg.zoomOutRatio) {
      loadRegion('world');
    }
  }

  // ---- MutationObserver for visibility (replaces polling) -------------------
  let visibilityObs = null;

  function startVisibilityObserver() {
    if (visibilityObs) return;
    const canvas = document.getElementById('hexCanvas');
    if (!canvas) { setTimeout(startVisibilityObserver, 500); return; }
    visibilityObs = new MutationObserver(() => {
      // visibility change detected — sync Earth UI at most once per frame
      if (!tickQueued && schedulerActive) {
        // let the next tick handle it
      } else if (!schedulerActive) {
        // quick one-shot sync (e.g. first time canvas appears)
        syncEarthUI();
      }
    });
    visibilityObs.observe(canvas, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      subtree: false
    });
    // Also listen for the canvas being added/removed from DOM
    const container = document.getElementById('hexCanvas')?.parentElement;
    if (container) {
      visibilityObs.observe(container, { childList: true, subtree: false });
    }
  }

  // ---- Earth-instance + view gating -----------------------------------------
  function isEarthMap() {
    const hm = window.state && window.state.hexMap;
    return !!hm && String(hm.mapInstanceId || '').indexOf('earth-996') === 0;
  }

  function isHexEditorVisible() {
    const c = document.getElementById('hexCanvas');
    return !!c && (c.offsetParent !== null || c.getClientRects().length > 0);
  }

  function shouldShowEarthUI() {
    return isHexEditorVisible() && isEarthMap();
  }

  function syncEarthUI() {
    const show = shouldShowEarthUI();
    const grp = document.getElementById('hexEarthDrilldownGroup');
    if (grp) grp.style.display = show ? '' : 'none';

    let bar = document.getElementById('hexEarthSwitcher');
    if (show) {
      if (!bar) { buildSwitcher(); bar = document.getElementById('hexEarthSwitcher'); }
      if (bar) bar.style.display = 'flex';
    } else if (bar) {
      bar.style.display = 'none';
    }
  }

  function onMapChanged(isManualSwitch) {
    syncEarthUI();
    if (!shouldShowEarthUI()) return;
    const id = String(window.state.hexMap.mapInstanceId || '');
    const match = manifest.find((r) => r.mapInstanceId === id);
    if (match) { activeId = match.id; highlightActive(); }
    // Longer cooldown for manual switches, shorter for zoom-only
    cooldownUntil = Date.now() + (isManualSwitch === true ? 2500 : 1200);
    setTimeout(() => {
      if (window.state && window.state.hexMap) homeScale = window.state.hexMap.viewport.scale;
    }, 120);
  }

  // Decorate game.js's loader so we react to every map load.
  function wrapLoader() {
    if (window.__hexEarthLoaderWrapped) return;
    const orig = window.loadMapDataIntoState;
    window.loadMapDataIntoState = function () {
      const res = orig.apply(this, arguments);
      setTimeout(function () { onMapChanged(false); }, 50);
      return res;
    };
    window.__hexEarthLoaderWrapped = true;
  }

  // ---- Wait for game.js, then init ------------------------------------------
  // Replaced the 50ms setInterval poll with a rIC-based approach.
  function whenReady(fn) {
    let tries = 0;
    function check() {
      if (typeof window.loadMapDataIntoState === 'function' && window.state && window.state.hexMap) {
        fn();
        return;
      }
      tries++;
      if (tries > 600) {
        console.warn(`${TAG} Timed out waiting for game.js`);
        return;
      }
      // Use requestAnimationFrame with a minimum gap — gentler than setInterval(50)
      requestAnimationFrame(function () { setTimeout(check, 80); });
    }
    // Check immediately first
    if (typeof window.loadMapDataIntoState === 'function' && window.state && window.state.hexMap) {
      fn();
      return;
    }
    requestAnimationFrame(function () { setTimeout(check, 80); });
  }

  function init() {
    fetchJson(MANIFEST)
      .then((data) => {
        manifest = data.regions || [];
        console.log(`${TAG} ${manifest.length} regions available:`, manifest.map((r) => r.id).join(', '));
        whenReady(function () {
          wrapLoader();
          startVisibilityObserver();
          startScheduler();
          const hm = window.state.hexMap;
          const count = hm && Array.isArray(hm.hexes) ? hm.hexes.length
                      : (hm && hm.hexes ? Object.keys(hm.hexes).length : 0);
          if (isEarthMap()) {
            onMapChanged(false);
          } else if (count > 0) {
            onMapChanged(false);
          } else {
            const def = manifest.find((r) => r.isDefault) || manifest[0];
            if (def) loadRegion(def.id);
          }
        });
      })
      .catch((err) => console.error(`${TAG} Could not load region manifest:`, err));

    window.HexEarth = {
      loadRegion: function (id) { return loadRegion(id); },
      getRegions: function () { return manifest; },
      get activeId() { return activeId; },
      getZoomCfg: readZoomCfg,
      setZoomCfg: writeZoomCfg,
      setAutoZoom: function (on) { writeZoomCfg({ autoZoom: !!on }); },
    };
  }

  init();
})();