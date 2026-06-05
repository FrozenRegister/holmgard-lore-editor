#!/usr/bin/env node
/**
 * Build Civ-style hex Earth maps (996 AD) from real public-domain
 * Natural Earth coastlines (ne_50m_land.geojson), one map per REGION.
 *
 * Usage:
 *   node scripts/build-earth-from-naturalearth.js            # all regions
 *   node scripts/build-earth-from-naturalearth.js europe     # one region
 *
 * Design notes:
 *  - game.js terrain vocabulary (plains/desert/jungle/forest/tundra/mountain/
 *    water) so adjacency borders render.
 *  - Offset axial coords q = col - floor(row/2), r = row  -> the map renders
 *    as a true screen rectangle (game.js pointy-top: x ∝ q + r/2, y ∝ r).
 *  - Per-region cos(centerLat) longitude correction (equidistant-cylindrical
 *    with standard parallel) so distances/proportions look right. The whole
 *    "world" map uses centerLat 0 (plain equirectangular) and is necessarily
 *    stretched near the poles — a flat hex grid can't tile a sphere.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'src', 'lib', 'data');
const LAND = path.join(DATA, 'ne_50m_land.geojson');
const FEATURES = path.join(DATA, 'earth-996-features.json');

// --- Region presets ---------------------------------------------------------
// rows = vertical resolution knob. centerLat defaults to the mid-latitude.
const REGIONS = {
  world:    { name: 'World (overview)', lon: [-180, 180], lat: [-85, 85], rows: 150, centerLat: 0 },
  oldworld: { name: 'Old World',        lon: [-25, 150],  lat: [-36, 72], rows: 200 },
  europe:   { name: 'Europe',           lon: [-12, 45],   lat: [34, 71],  rows: 170 },
  americas: { name: 'Americas',         lon: [-130, -34], lat: [-56, 60], rows: 200, centerLat: 8 },
  eastasia: { name: 'East Asia',        lon: [95, 150],   lat: [18, 54],  rows: 150 },
  africa:   { name: 'Africa',           lon: [-20, 52],   lat: [-36, 38], rows: 190, centerLat: 0 },
};

// --- Load real coastlines, flatten to rings with bounding boxes ------------
console.log('Loading Natural Earth land polygons...');
const geo = JSON.parse(fs.readFileSync(LAND, 'utf8'));
const rings = [];
function addRing(coords) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  rings.push({ coords, minLon, maxLon, minLat, maxLat });
}
for (const f of geo.features) {
  const g = f.geometry; if (!g) continue;
  if (g.type === 'Polygon') addRing(g.coordinates[0]);
  else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) addRing(poly[0]);
}
console.log(`  ${rings.length} coastline rings loaded`);

function rayCast(lon, lat, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];
    const intersect = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function isLand(lon, lat) {
  for (const r of rings) {
    if (lon < r.minLon || lon > r.maxLon || lat < r.minLat || lat > r.maxLat) continue;
    if (rayCast(lon, lat, r.coords)) return true;
  }
  return false;
}

// --- Latitude/longitude -> Civ terrain (crude biomes, refine later) --------
function biome(lat, lon) {
  const a = Math.abs(lat);
  if (a > 66.5) return 'tundra';
  if (a > 55) return 'forest';
  if (a > 35) return 'plains';
  if (a > 23.5) return (lon >= -18 && lon <= 62) ? 'desert' : 'plains';   // Sahara/Arabia/Iran
  if (a > 12) return (lon >= -18 && lon <= 50) ? 'desert' : 'plains';     // Sahel belt
  return 'jungle';                                                         // equatorial
}

const allFeatures = JSON.parse(fs.readFileSync(FEATURES, 'utf8')).features;

// --- Build one region -------------------------------------------------------
function buildRegion(id) {
  const R = REGIONS[id];
  const [LON_MIN, LON_MAX] = R.lon;
  const [LAT_MIN, LAT_MAX] = R.lat;
  const ROWS = R.rows;
  const centerLat = R.centerLat ?? (LAT_MIN + LAT_MAX) / 2;
  const cosC = Math.cos(centerLat * Math.PI / 180);

  const lonSpan = LON_MAX - LON_MIN;
  const latSpan = LAT_MAX - LAT_MIN;
  // Accurate proportions: COLS*√3 / (ROWS*1.5) = (lonSpan*cosC) / latSpan
  const COLS = Math.max(1, Math.round(ROWS * (lonSpan * cosC / latSpan) * (1.5 / Math.sqrt(3))));
  const DLON = lonSpan / COLS;
  const DLAT = latSpan / ROWS;

  // Features within this region's bounds, mapped to grid cells
  const cityByCell = new Map();
  let inRegion = 0;
  for (const h of allFeatures) {
    if (h.lat == null || h.lon == null) continue;
    if (h.lon < LON_MIN || h.lon > LON_MAX || h.lat < LAT_MIN || h.lat > LAT_MAX) continue;
    const col = Math.round((h.lon - LON_MIN) / DLON);
    const row = Math.round((LAT_MAX - h.lat) / DLAT);
    const isMountain = (h.type || '').startsWith('mountain');
    cityByCell.set(`${col},${row}`, {
      name: h.name, description: h.description || '',
      terrain: isMountain ? 'mountain' : null,
    });
    inRegion++;
  }

  // Center axial coords on origin (pure translation; keeps screen rectangle)
  const RC = Math.round(ROWS / 2);
  const QC = Math.round(COLS / 2) - Math.floor(RC / 2);

  const hexes = [];
  let land = 0, water = 0, stamped = 0;
  for (let row = 0; row <= ROWS; row++) {
    const lat = LAT_MAX - row * DLAT;
    const q0 = -Math.floor(row / 2);
    for (let col = 0; col <= COLS; col++) {
      const lon = LON_MIN + col * DLON;
      const q = col + q0 - QC;
      const r = row - RC;
      let terrain, name = '', description = '';
      const city = cityByCell.get(`${col},${row}`);
      if (city) {
        terrain = city.terrain || (isLand(lon, lat) ? biome(lat, lon) : 'plains');
        name = city.name; description = city.description; stamped++; land++;
      } else if (isLand(lon, lat)) {
        terrain = biome(lat, lon); land++;
      } else {
        terrain = 'water'; water++;
      }
      hexes.push({ q, r, terrain, name, description });
    }
  }

  const mapInstanceId = `earth-996-${id}`;
  const map = {
    version: '1.0', year: 996, mapName: `Earth 996 AD — ${R.name}`,
    mapType: 'world', mapInstanceId, orientation: 'pointy', hexSize: 30,
    hexes,
    landmarks: [], textLabels: [], imageOverlays: [], tokens: [], paths: [],
    fogOfWar: [], fogSettings: { enabled: false, opacity: 0.5, color: '#000000', hideIcons: false },
    canvasBackground: '#1a3a4a',
    showHexCoordinates: false,
    showSubHexCoordinates: false,
    // Hybrid zoom: CONTINENT overview aggregates from this PARENT grid when
    // zoomed out. DETAIL ("settlement") sub-hexes are added per-region later.
    continentGridEnabled: true,
    continentGridDensity: 7,
    detailGridEnabled: false,
    detailGridDensity: 7,
    detailHexes: [],
    subHexes: [],
    subHexLandmarks: [],
    subHexTokens: [],
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    metadata: { totalHexes: hexes.length },
    exportMetadata: { exportType: 'naturalearth-rasterizer', region: id, exportedAt: new Date().toISOString() },
  };

  const outPath = path.join(DATA, `earth-996-${id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(map), 'utf8');
  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`  ${id.padEnd(9)} ${COLS}x${ROWS} -> ${hexes.length} hexes (land ${land}/water ${water}), ` +
    `cities ${stamped}/${inRegion}, cosLat ${cosC.toFixed(2)}, ${mb} MB`);

  return { id, name: R.name, mapInstanceId, file: `earth-996-${id}.json`,
    bounds: { lon: R.lon, lat: R.lat }, hexes: hexes.length, isDefault: id === 'world',
    // Inverse transform for viewport-center -> lat/lon (zoom-to-load):
    //   row = r + rc; col = q + floor(row/2) + qc
    //   lat = latMax - row*dLat; lon = lonMin + col*dLon
    geo: { lonMin: LON_MIN, latMax: LAT_MAX, dLon: DLON, dLat: DLAT, qc: QC, rc: RC } };
}

// --- Main -------------------------------------------------------------------
const arg = process.argv[2];
const ids = arg ? [arg] : Object.keys(REGIONS);
if (arg && !REGIONS[arg]) {
  console.error(`Unknown region '${arg}'. Options: ${Object.keys(REGIONS).join(', ')}`);
  process.exit(1);
}

console.log(`Building regions: ${ids.join(', ')}`);
const manifest = ids.map(buildRegion);

// Merge into existing manifest if building a single region
const manifestPath = path.join(DATA, 'earth-996-regions.json');
let existing = [];
if (fs.existsSync(manifestPath)) {
  try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).regions || []; } catch {}
}
const byId = new Map(existing.map(r => [r.id, r]));
for (const m of manifest) byId.set(m.id, m);
const merged = Object.keys(REGIONS).map(id => byId.get(id)).filter(Boolean);
fs.writeFileSync(manifestPath, JSON.stringify({ regions: merged }, null, 2), 'utf8');
console.log(`\n✓ Wrote ${manifest.length} region map(s) + manifest (${merged.length} total regions)`);
