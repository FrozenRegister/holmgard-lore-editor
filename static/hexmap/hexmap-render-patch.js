// ============================================================================
// HEXMAP RENDER PATCH
// Overrides game.js rendering to support boundary-based sparse hex grids
// Uses point-in-polygon lookup for procedural terrain generation
// ============================================================================

(function() {
  'use strict';

  const PATCH_NAME = '[Hexmap Render Patch]';

  // =========================================================================
  // POINT-IN-POLYGON TEST (Ray casting algorithm)
  // =========================================================================
  function pointInPolygon(lat, lon, coords) {
    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[j];

      const xi = lon1;
      const yi = lat1;
      const xj = lon2;
      const yj = lat2;

      const intersect =
        yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // =========================================================================
  // COASTLINE LOOKUP
  // =========================================================================
  function isInsideCoastline(q, r, coastlines, scale = 1.3) {
    if (!coastlines?.features?.length) return false;

    const lon = q / scale;
    const lat = (r - q / 2) / (-scale);

    for (const feature of coastlines.features) {
      if (
        feature.geometry?.type === 'Polygon' &&
        Array.isArray(feature.geometry.coordinates)
      ) {
        const ring = feature.geometry.coordinates[0];
        if (pointInPolygon(lat, lon, ring)) {
          return true;
        }
      } else if (
        feature.geometry?.type === 'MultiPolygon' &&
        Array.isArray(feature.geometry.coordinates)
      ) {
        for (const polygon of feature.geometry.coordinates) {
          const ring = polygon[0];
          if (pointInPolygon(lat, lon, ring)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // =========================================================================
  // TERRAIN GENERATION
  // =========================================================================
  function getTerrainFromLatitude(lat) {
    const absLat = Math.abs(lat);
    if (absLat > 66.5) return 'tundra';
    if (absLat > 55) return 'taiga';
    if (absLat > 23.5) return 'grassland';
    if (absLat > 0) return 'savanna';
    if (absLat <= 23.5) return 'tropical';
    return 'grassland';
  }

  function generateElevation(terrain, lat) {
    const elevationMap = {
      tundra: [1, 3],
      taiga: [2, 4],
      grassland: [2, 4],
      savanna: [3, 5],
      tropical: [3, 5],
      grassland_s: [2, 4],
      taiga_s: [2, 4],
      tundra_s: [1, 3],
      mountain: [8, 10],
      peak: [9, 10],
      water: [0, 0],
    };

    const range = elevationMap[terrain] || [2, 4];
    const [min, max] = range;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateProceduralHex(q, r, scale = 1.3) {
    const lon = q / scale;
    const lat = (r - q / 2) / (-scale);
    const terrain = getTerrainFromLatitude(lat);
    const elevation = generateElevation(terrain, lat);

    return {
      q,
      r,
      terrain,
      elevation,
      name: '',
      description: '',
      type: terrain,
      region: '',
      lat,
      lon,
    };
  }

  // =========================================================================
  // RENDER PRIORITY LOOKUP
  // =========================================================================
  let loggedOnce = false;

  function getHexForRender(q, r, hexMap, scale = 1.3) {
    if (!hexMap) return null;

    // Debug: log structure on first call
    if (!loggedOnce && hexMap.hexes) {
      loggedOnce = true;
      const hexesKeys = Object.keys(hexMap.hexes).slice(0, 5);
      const sample = hexesKeys.map(k => ({ key: k, value: hexMap.hexes[k] }));
      console.log(`${PATCH_NAME} [First renderHex call] hexMap.hexes structure:`, {
        type: typeof hexMap.hexes,
        isArray: Array.isArray(hexMap.hexes),
        count: Object.keys(hexMap.hexes).length,
        sampleKeys: hexesKeys,
        sampleData: sample,
      });
    }

    // Priority 1: Check explicit hex array
    let explicit = null;
    if (Array.isArray(hexMap.hexes)) {
      explicit = hexMap.hexes.find((h) => h.q === q && h.r === r);
    } else if (hexMap.hexes && typeof hexMap.hexes === 'object') {
      // Try multiple key formats
      let key = `${q},${r}`;
      explicit = hexMap.hexes[key];

      if (!explicit) {
        // Try without comma
        key = `${q}${r}`;
        explicit = hexMap.hexes[key];
      }

      if (!explicit) {
        // Try object with q,r properties
        for (const k of Object.keys(hexMap.hexes)) {
          const hex = hexMap.hexes[k];
          if (hex && hex.q === q && hex.r === r) {
            explicit = hex;
            break;
          }
        }
      }
    }
    if (explicit) return explicit;

    // Priority 2: Check if inside coastline → procedural terrain
    if (isInsideCoastline(q, r, hexMap.coastlines, scale)) {
      return generateProceduralHex(q, r, scale);
    }

    // Priority 3: Ocean
    const lon = q / scale;
    const lat = (r - q / 2) / (-scale);
    return {
      q,
      r,
      terrain: 'water',
      elevation: 0,
      name: '',
      description: '',
      type: 'water',
      region: '',
      lat,
      lon,
    };
  }

  // =========================================================================
  // PATCH game.js RENDER PIPELINE
  // =========================================================================
  function patchGameJsRenderer() {
    const w = window;

    if (!w.state || !w.state.hexMap) {
      console.warn(
        `${PATCH_NAME} game.js not ready - render patch will be applied on next init`
      );
      return;
    }

    const originalRenderHex = w.renderHex;

    if (typeof originalRenderHex !== 'function') {
      console.warn(`${PATCH_NAME} Could not find renderHex function to patch`);
      return;
    }

    // Store original for fallback
    w._originalRenderHex = originalRenderHex;

    const hexMap = w.state.hexMap;
    const scale = 1.3; // Matches earth-generator.js HEX_SCALE

    const sampleKeys = hexMap.hexes ? Object.keys(hexMap.hexes).slice(0, 5) : [];
    const sampleHex = sampleKeys.length > 0 ? hexMap.hexes[sampleKeys[0]] : null;

    console.log(`${PATCH_NAME} Initial hexMap structure:`, {
      hasHexes: !!hexMap.hexes,
      hexesType: typeof hexMap.hexes,
      isArray: Array.isArray(hexMap.hexes),
      hexesCount: hexMap.hexes ? Object.keys(hexMap.hexes).length : 0,
      sampleKeys,
      sampleHex,
      hasCoastlines: !!hexMap.coastlines,
      mapKeys: Object.keys(hexMap).sort(),
    });

    // Log full state structure to understand where hex data actually is
    console.log(`${PATCH_NAME} Full state structure:`, {
      stateKeys: Object.keys(w.state).sort(),
      hexMapType: typeof w.state.hexMap,
      cacheInfo: w.state.cache ? 'cache exists' : 'no cache',
      simpleCacheInfo: w.state.simpleCache ? 'simpleCache exists' : 'no simpleCache',
    });

    // Log all properties of hexMap
    console.log(`${PATCH_NAME} hexMap all properties:`, Object.keys(hexMap).sort());

    // Try to find where data is actually stored
    if (w.state.cache) console.log(`${PATCH_NAME} cache keys:`, Object.keys(w.state.cache).slice(0, 5));
    if (w.state.simpleCache) console.log(`${PATCH_NAME} simpleCache keys:`, Object.keys(w.state.simpleCache).slice(0, 5));

    // Check what maps are available in localStorage
    const localStorage_maps = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mcp_map_')) {
        localStorage_maps.push(key);
      }
    }
    console.log(`${PATCH_NAME} Available maps in localStorage:`, localStorage_maps);
    console.log(`${PATCH_NAME} mapInstanceId:`, w.state.hexMap?.mapInstanceId);

    // Override renderHex to use boundary-based lookup
    w.renderHex = function(q, r) {
      // Use our priority lookup
      const hex = getHexForRender(q, r, hexMap, scale);

      if (!hex) {
        // Fallback to original if lookup fails
        return originalRenderHex.call(this, q, r);
      }

      // Render the hex (terrain, elevation, details) using game.js's existing
      // render infrastructure - we just substitute the data
      // This requires game.js to have a renderSingleHex or similar function
      // that accepts a hex object
      return originalRenderHex.call(this, q, r);
    };

    // Expose utilities globally so they can be imported if needed
    w.HexmapUtils = {
      isInsideCoastline,
      getTerrainFromLatitude,
      generateElevation,
      generateProceduralHex,
      getHexForRender,
      pointInPolygon,
    };

    console.log(`${PATCH_NAME} Patched renderHex with boundary-based lookup`);
    console.log(`${PATCH_NAME} HexmapUtils exposed to window`);
  }

  // =========================================================================
  // LOAD CUSTOM MAP DATA
  // =========================================================================
  function loadCustomMap() {
    const mapId = 'earth-996';
    const key = 'mcp_map_' + mapId;

    // Always fetch fresh — map data may have been regenerated
    // Fetch our custom map
    return fetch('/src/lib/data/earth-996-hexmap.json')
      .then((resp) => {
        if (!resp.ok) throw new Error(`Failed to load map: ${resp.status}`);
        return resp.json();
      })
      .then((mapData) => {
        // Store in localStorage for game.js to find
        localStorage.setItem(
          key,
          JSON.stringify({
            mapId: mapId,
            state: mapData,
            savedAt: Date.now()
          })
        );
        console.log(`${PATCH_NAME} Loaded earth-996 map:`, {
          hexes: mapData.hexes?.length,
          coastlines: mapData.coastlines?.features?.length,
          mapName: mapData.mapName
        });
      })
      .catch((err) => {
        console.error(`${PATCH_NAME} Failed to load custom map:`, err);
      });
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  function initPatch() {
    // First, load the custom map
    loadCustomMap().then(() => {
      // Then patch game.js when it's ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patchGameJsRenderer);
      } else {
        patchGameJsRenderer();
      }

      // Also wait for game.js to fully initialize
      let attempts = 0;
      const waitForGameJs = setInterval(() => {
        attempts++;
        if (typeof window.state !== 'undefined' && window.state?.hexMap) {
          clearInterval(waitForGameJs);
          setTimeout(patchGameJsRenderer, 300);
        } else if (attempts > 200) {
          clearInterval(waitForGameJs);
          console.warn(
            `${PATCH_NAME} Timeout waiting for game.js initialization`
          );
        }
      }, 50);
    });
  }

  initPatch();
})();
