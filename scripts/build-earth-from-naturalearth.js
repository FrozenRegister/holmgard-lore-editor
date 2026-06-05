#!/usr/bin/env node
/**
 * Build a Civ-style hex Earth (996 AD Old World) from real public-domain
 * Natural Earth coastline data (ne_50m_land.geojson).
 *
 * Key fixes vs. the old approach:
 *  - Uses game.js's REAL terrain vocabulary (plains/desert/jungle/forest/
 *    tundra/mountain/water) so adjacency borders actually render.
 *  - Uses OFFSET axial coords q = col - floor(row/2), r = row so the map
 *    renders as a true screen rectangle (game.js: x ∝ q + r/2, y ∝ r).
 *  - Minimal hex schema {q,r,terrain,name,description} matching workingMap.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'src', 'lib', 'data');
const LAND = path.join(DATA, 'ne_50m_land.geojson');
const MAP = path.join(DATA, 'earth-996-hexmap.json');
const FEATURES = path.join(DATA, 'earth-996-features.json'); // stable city source

// --- Region & resolution (Old World) ---------------------------------------
const LON_MIN = -25, LON_MAX = 150;   // Iberia/Morocco -> Japan/Kamchatka edge
const LAT_MIN = -36, LAT_MAX = 72;    // S. Africa tip -> North Cape
const COLS = 280;                      // horizontal hex resolution
const DLON = (LON_MAX - LON_MIN) / COLS;
// Match hex aspect: col step = √3·size, row step = 1.5·size -> dLat = 0.866·dLon
const DLAT = DLON * (1.5 / Math.sqrt(3));
const ROWS = Math.round((LAT_MAX - LAT_MIN) / DLAT);

// --- Load real coastlines, flatten to rings with bounding boxes ------------
console.log('Loading Natural Earth land polygons...');
const geo = JSON.parse(fs.readFileSync(LAND, 'utf8'));
const rings = []; // { coords:[[lon,lat]...], minLon,maxLon,minLat,maxLat }

function addRing(coords) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  rings.push({ coords, minLon, maxLon, minLat, maxLat });
}

for (const f of geo.features) {
  const g = f.geometry;
  if (!g) continue;
  if (g.type === 'Polygon') {
    addRing(g.coordinates[0]); // outer ring (ignore holes/lakes for v1)
  } else if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates) addRing(poly[0]);
  }
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
  if (a > 55) return 'forest';          // boreal/taiga
  if (a > 35) return 'plains';          // temperate
  // Subtropical/tropical belt: split arid vs. wet by region
  if (a > 23.5) {
    // Sahara / Arabia / Iran arid belt
    if (lon >= -18 && lon <= 62) return 'desert';
    return 'plains';
  }
  if (a > 12) {
    if (lon >= -18 && lon <= 50) return 'desert';   // Sahara/Sahel/Arabia
    return 'plains';                                  // monsoon India/SE Asia
  }
  return 'jungle';                       // equatorial
}

// --- Load named features from stable source; envelope from current map -----
console.log('Reading named features (stable source) + map envelope...');
const named = JSON.parse(fs.readFileSync(FEATURES, 'utf8')).features;
const mapData = JSON.parse(fs.readFileSync(MAP, 'utf8')); // for top-level structure only
console.log(`  ${named.length} named features`);

// Map each named feature to a grid cell
function cellOf(lat, lon) {
  const col = Math.round((lon - LON_MIN) / DLON);
  const row = Math.round((LAT_MAX - lat) / DLAT);
  return { col, row };
}
const cityByCell = new Map();
for (const h of named) {
  if (h.lat === undefined || h.lon === undefined) continue;
  const { col, row } = cellOf(h.lat, h.lon);
  if (col < 0 || col > COLS || row < 0 || row > ROWS) continue;
  const isMountain = (h.type || '').startsWith('mountain');
  cityByCell.set(`${col},${row}`, {
    name: h.name,
    description: h.description || '',
    terrain: isMountain ? 'mountain' : null, // null = use biome
  });
}

// --- Generate the grid ------------------------------------------------------
console.log(`Generating ${COLS}x${ROWS} grid (${COLS * ROWS} cells)...`);
const hexes = [];
let land = 0, water = 0, stamped = 0;

// Translate axial coords so the grid centers on (0,0) for the default viewport.
// Pure constant translation preserves the screen-rectangle property.
const RC = Math.round(ROWS / 2);
const QC = Math.round(COLS / 2) - Math.floor(RC / 2);

for (let row = 0; row <= ROWS; row++) {
  const lat = LAT_MAX - row * DLAT;
  const q0 = -Math.floor(row / 2);
  for (let col = 0; col <= COLS; col++) {
    const lon = LON_MIN + col * DLON;
    const q = col + q0 - QC;     // q = col - floor(row/2), centered
    const r = row - RC;

    let terrain, name = '', description = '';
    const city = cityByCell.get(`${col},${row}`);

    if (city) {
      terrain = city.terrain || (isLand(lon, lat) ? biome(lat, lon) : 'plains');
      name = city.name;
      description = city.description;
      stamped++;
      land++;
    } else if (isLand(lon, lat)) {
      terrain = biome(lat, lon);
      land++;
    } else {
      terrain = 'water';
      water++;
    }

    hexes.push({ q, r, terrain, name, description });
  }
}

console.log(`  land=${land} water=${water} namedStamped=${stamped}/${named.length}`);

// --- Write, preserving top-level structure game.js expects -----------------
mapData.hexes = hexes;
mapData.orientation = 'pointy';
delete mapData.coastlines; // no longer needed — borders come from adjacency
if (mapData.metadata) mapData.metadata.totalHexes = hexes.length;

fs.writeFileSync(MAP, JSON.stringify(mapData, null, 2), 'utf8');
const mb = (fs.statSync(MAP).size / 1024 / 1024).toFixed(2);
console.log(`\n✓ Wrote ${hexes.length} hexes -> earth-996-hexmap.json (${mb} MB)`);
console.log(`  Region lon[${LON_MIN}..${LON_MAX}] lat[${LAT_MIN}..${LAT_MAX}]`);
console.log(`  Grid ${COLS}x${ROWS}, dLon=${DLON.toFixed(3)}° dLat=${DLAT.toFixed(3)}°`);
