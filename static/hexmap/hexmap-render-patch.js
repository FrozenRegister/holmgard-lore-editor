// ============================================================================
// HEXMAP REGION LOADER / SWITCHER
// Loads pre-generated Earth 996 AD region maps (world overview + regional
// zooms) and provides a small switcher UI. Maps are produced by
// scripts/build-earth-from-naturalearth.js and listed in earth-996-regions.json.
//
// All hexes are pre-generated with game.js terrain vocabulary, so rendering &
// borders come straight from the engine — no render patching needed here.
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
          // homeScale + cooldown are (re)captured by onMapChanged, which fires
          // via the wrapped loadMapDataIntoState for every map load.
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
  // Lat/lon at the screen center of the currently active map.
  function viewportCenterLatLon() {
    const region = manifest.find((r) => r.id === activeId);
    if (!region || !region.geo) return null;
    const hm = window.state.hexMap;
    const vp = hm.viewport;
    const size = hm.hexSize * vp.scale;
    if (!size) return null;
    // At screen center the canvas.width/2 terms cancel, leaving -offset.
    const adjX = -vp.offsetX;
    const adjY = -vp.offsetY;
    const q = Math.round((Math.sqrt(3) / 3 * adjX - 1 / 3 * adjY) / size);
    const r = Math.round((2 / 3 * adjY) / size);
    const { lonMin, latMax, dLon, dLat, qc, rc } = region.geo;
    const row = r + rc;
    const col = q + Math.floor(row / 2) + qc;
    return { lat: latMax - row * dLat, lon: lonMin + col * dLon };
  }

  // Smallest region (excluding world) whose bounds contain the point.
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

  function startZoomWatcher() {
    setInterval(() => {
      if (!isEarthMap()) return; // never act on other worlds (e.g. workingMap)
      const cfg = readZoomCfg();
      if (!cfg.autoZoom) return;
      if (!window.state || !window.state.hexMap || homeScale == null) return;
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
    }, 250);
  }

  // ---- Earth-instance gating ------------------------------------------------
  // The region switcher, zoom-to-load, and drill-down settings only apply to
  // the Earth 996 world. Any other world (e.g. workingMap.json) is left alone.
  function isEarthMap() {
    const hm = window.state && window.state.hexMap;
    return !!hm && String(hm.mapInstanceId || '').indexOf('earth-996') === 0;
  }

  // Show/hide the Earth-only UI and (re)sync state whenever the active map
  // changes. Called after every loadMapDataIntoState via the wrapper below.
  function onMapChanged() {
    const earth = isEarthMap();

    // Drill-down settings section lives in the Svelte settings modal.
    const grp = document.getElementById('hexEarthDrilldownGroup');
    if (grp) grp.style.display = earth ? '' : 'none';

    let bar = document.getElementById('hexEarthSwitcher');
    if (earth) {
      if (!bar) { buildSwitcher(); bar = document.getElementById('hexEarthSwitcher'); }
      if (bar) bar.style.display = 'flex';
      // Sync active region from the loaded map + recapture the fitted scale.
      const id = String(window.state.hexMap.mapInstanceId || '');
      const match = manifest.find((r) => r.mapInstanceId === id);
      if (match) { activeId = match.id; highlightActive(); }
      cooldownUntil = Date.now() + 1500;
      setTimeout(() => {
        if (window.state && window.state.hexMap) homeScale = window.state.hexMap.viewport.scale;
      }, 120);
    } else if (bar) {
      bar.style.display = 'none';
    }
  }

  // Decorate game.js's loader so we react to every map load (ours + Open Map).
  function wrapLoader() {
    if (window.__hexEarthLoaderWrapped) return;
    const orig = window.loadMapDataIntoState;
    window.loadMapDataIntoState = function () {
      const res = orig.apply(this, arguments);
      setTimeout(onMapChanged, 50);
      return res;
    };
    window.__hexEarthLoaderWrapped = true;
  }

  // ---- Wait for game.js, then init ------------------------------------------
  function whenReady(fn) {
    let tries = 0;
    const timer = setInterval(() => {
      if (typeof window.loadMapDataIntoState === 'function' && window.state && window.state.hexMap) {
        clearInterval(timer);
        fn();
      } else if (++tries > 300) {
        clearInterval(timer);
        console.warn(`${TAG} Timed out waiting for game.js`);
      }
    }, 50);
  }

  function init() {
    fetchJson(MANIFEST)
      .then((data) => {
        manifest = data.regions || [];
        console.log(`${TAG} ${manifest.length} regions available:`, manifest.map((r) => r.id).join(', '));
        whenReady(() => {
          wrapLoader();
          startZoomWatcher();
          const hm = window.state.hexMap;
          const count = hm && Array.isArray(hm.hexes) ? hm.hexes.length
                      : (hm && hm.hexes ? Object.keys(hm.hexes).length : 0);
          if (isEarthMap()) {
            onMapChanged();              // already on an Earth map -> sync UI
          } else if (count > 0) {
            onMapChanged();              // another world is loaded -> leave it alone
          } else {
            const def = manifest.find((r) => r.isDefault) || manifest[0];
            if (def) loadRegion(def.id); // blank -> default to the Earth world
          }
        });
      })
      .catch((err) => console.error(`${TAG} Could not load region manifest:`, err));

    // Public API for console / future UI
    window.HexEarth = {
      loadRegion,
      getRegions: () => manifest,
      get activeId() { return activeId; },
      getZoomCfg: readZoomCfg,
      setZoomCfg: writeZoomCfg,
      setAutoZoom: (on) => writeZoomCfg({ autoZoom: !!on }),
    };
  }

  init();
})();
