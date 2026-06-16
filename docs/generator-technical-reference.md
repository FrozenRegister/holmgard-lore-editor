# World Generator — Technical Reference

Deep dive into the world generator architecture for developers who need to understand, debug, or extend the system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Natural Earth GeoJSON (ne_50m_land.geojson)                    │
│ Public-domain coastlines: Polygon/MultiPolygon features        │
└────────────────────┬────────────────────────────────────────────┘
                     │ (load & flatten to rings)
┌────────────────────▼────────────────────────────────────────────┐
│ build-earth-from-naturalearth.js                               │
│                                                                 │
│ 1. Load coastline rings (point-in-polygon ray-casting)        │
│ 2. Load feature database (cities, landmarks)                  │
│ 3. For each region preset:                                    │
│    a. Rasterize to hex grid (lat/lon → q,r)                 │
│    b. Test each hex: isLand() → determine terrain            │
│    c. Stamp cities into grid                                 │
│    d. Write JSON + update manifest                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐
   │ Output  │  │ Manifest │  │Diagnostic│
   │ Maps    │  │ Metadata │  │  Scripts │
   │(.json)  │  │          │  │          │
   └─────────┘  └──────────┘  └──────────┘
```

## Core Algorithm: Rasterization

### 1. Grid Layout

For a region with bounds `[lonMin, lonMax] × [latMin, latMax]` and `ROWS` vertical cells:

```javascript
const ROWS = region.rows;                    // e.g., 160
const latSpan = latMax - latMin;             // e.g., 6° for Karelia
const lonSpan = lonMax - lonMin;             // e.g., 9.5°
const centerLat = region.centerLat ?? (latMin + latMax) / 2;
const cosC = Math.cos(centerLat * π/180);   // Longitude correction

// Maintain aspect ratio: map rectangle stays square on screen
const COLS = Math.max(1, Math.round(
  ROWS * (lonSpan * cosC / latSpan) * (1.5 / √3)
));

const DLON = lonSpan / COLS;  // Degrees per column
const DLAT = latSpan / ROWS;  // Degrees per row
```

**Why `1.5 / √3`?**

- Hex grids with pointy-top orientation have aspect ratio √3:2 (column:row spacing)
- We want screen pixels to match hex geometry, so width:height = √3:2
- Solving: `COLS·√3 / (ROWS·1.5) = lonSpan·cosC / latSpan` gives the formula above

### 2. Axial Coordinate Conversion

For each grid cell at (col, row), compute axial hex coords (q, r):

```javascript
const RC = Math.round(ROWS / 2);           // Row center
const QC = Math.round(COLS / 2) - Math.floor(RC / 2);

for (let row = 0; row <= ROWS; row++) {
  const q0 = -Math.floor(row / 2);  // Offset per row (odd rows shift by 0.5)
  for (let col = 0; col <= COLS; col++) {
    const q = col + q0 - QC;  // Centered axial q
    const r = row - RC;        // Centered axial r
  }
}
```

This offset system keeps the rendered hex grid as a perfect rectangle on screen:

- Screen x-position ∝ `q + r/2`
- Screen y-position ∝ `r`

### 3. Land/Water Detection: Ray-Casting

For each hex center at (lon, lat), test if it's inside a coastline polygon:

```javascript
function rayCast(lon, lat, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];
    
    // Count how many times ray crosses polygon boundary
    const intersect = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    
    if (intersect) inside = !inside;
  }
  return inside;
}

function isLand(lon, lat) {
  for (const ring of coastlineRings) {
    // Bounding-box culling for speed
    if (lon < ring.minLon || lon > ring.maxLon ||
        lat < ring.minLat || lat > ring.maxLat) continue;
    
    if (rayCast(lon, lat, ring.coords)) return true;
  }
  return false;
}
```

**Complexity:** O(n × m) where n = hexes, m = coastline points

- ~20k hexes × ~10k coastline points → 200M operations
- Mitigated by bounding-box pre-checks; typical runtime ~1–5s per region

### 4. Terrain Biome Classification

Terrain type is determined by latitude (Civ-style bands):

```javascript
function biome(lat, lon) {
  const a = Math.abs(lat);
  if (a > 66.5) return 'tundra';
  if (a > 55) return 'forest';
  if (a > 35) return 'plains';
  if (a > 23.5) {
    // Sahara/Arabia/Iran
    return (lon >= -18 && lon <= 62) ? 'desert' : 'plains';
  }
  if (a > 12) {
    // Sahel belt
    return (lon >= -18 && lon <= 50) ? 'desert' : 'plains';
  }
  return 'jungle';
}
```

**Extensions needed:**

- Elevation (currently ignored; could add GEBCO bathymetry lookup)
- Climate zones (Köppen classification more accurate than lat bands)
- Local overrides (manual terrain edits per hex)

### 5. City Stamping

Cities from `earth-996-features.json` are snapped to the nearest grid cell:

```javascript
const cityByCell = new Map();  // key: "col,row"

for (const feature of allFeatures) {
  if (feature.lat == null || feature.lon == null) continue;
  
  // Skip if outside region bounds
  if (feature.lon < lonMin || feature.lon > lonMax ||
      feature.lat < latMin || feature.lat > latMax) continue;
  
  // Snap to nearest grid cell
  const col = Math.round((feature.lon - lonMin) / dLon);
  const row = Math.round((latMax - feature.lat) / dLat);
  
  const isMountain = (feature.type || '').startsWith('mountain');
  
  cityByCell.set(`${col},${row}`, {
    name: feature.name,
    description: feature.description || '',
    terrain: isMountain ? 'mountain' : null,  // Override terrain for mountains
  });
}
```

Then during hex generation:

```javascript
if (city) {
  terrain = city.terrain || (isLand(lon, lat) ? biome(lat, lon) : 'plains');
  name = city.name;
  description = city.description;
  stamped++;
}
```

**Note:** Each grid cell can only have one city. Multiple cities at the same location will overwrite.

## Data Structures

### Input: earth-996-features.json

```typescript
interface Feature {
  name: string;
  description?: string;
  type?: 'city' | 'kingdom_capital' | 'mountain' | 'mountain_range' | 'landmark' | 'settlement';
  region?: string;
  lat: number;      // -90 to 90
  lon: number;      // -180 to 180
  terrain?: 'plains' | 'forest' | 'tundra' | 'desert' | 'jungle' | 'mountain' | 'water';
}

interface FeatureDatabase {
  features: Feature[];
}
```

### Output: earth-996-{region}.json

```typescript
interface Hex {
  q: number;          // Axial coordinate (column + row offset)
  r: number;          // Axial coordinate (row)
  terrain: string;    // 'plains' | 'forest' | 'tundra' | 'desert' | 'jungle' | 'water' | 'mountain'
  name: string;       // City name (empty if not stamped)
  description: string; // City description
}

interface HexMap {
  version: '1.0';
  year: number;
  mapName: string;
  mapType: 'world' | 'region' | 'settlement';
  mapInstanceId: string;  // Unique ID, e.g., 'earth-996-karelia'
  orientation: 'pointy' | 'flat';  // Hex point orientation
  hexSize: number;        // Pixels (for rendering)
  hexes: Hex[];
  
  // Legacy/future use:
  landmarks: any[];
  textLabels: any[];
  imageOverlays: any[];
  tokens: any[];
  paths: any[];
  fogOfWar: any[];
  detailGridEnabled: boolean;
  detailHexes: any[];
  subHexes: any[];
  
  // Metadata:
  metadata: {
    totalHexes: number;
  };
  exportMetadata: {
    exportType: 'naturalearth-rasterizer';
    region: string;
    exportedAt: string;  // ISO 8601 timestamp
  };
}
```

### Manifest: earth-996-regions.json

```typescript
interface RegionMetadata {
  id: string;          // Region ID, e.g., 'karelia'
  name: string;        // Human-readable name
  mapInstanceId: string;
  file: string;        // Relative path, e.g., 'earth-996-karelia.json'
  bounds: {
    lon: [number, number];  // [west, east]
    lat: [number, number];  // [south, north]
  };
  hexes: number;       // Total hex count in map
  isDefault: boolean;  // true for world overview
  geo: {
    lonMin: number;
    latMax: number;
    dLon: number;       // Degrees per grid column
    dLat: number;       // Degrees per grid row
    qc: number;         // Axial q center offset
    rc: number;         // Axial r center offset
  };
}

interface Manifest {
  regions: RegionMetadata[];
}
```

**Why `geo` metadata?** The editor needs to convert viewport-center coordinates → lat/lon for zoom-to-load:

```javascript
// Inverse transform (in the editor):
const row = r + rc;
const col = q + Math.floor(row / 2) + qc;
const lat = latMax - row * dLat;
const lon = lonMin + col * dLon;
```

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Typical Time |
|-----------|------------|--------------|
| Load GeoJSON | O(c) | ~0.5s (c = coastline points) |
| Load features | O(f) | <0.1s (f = features) |
| Rasterize grid | O(h × c) | ~2s (h = hexes, c = rings) |
| Stamp cities | O(f) | <0.1s |
| Write JSON | O(h) | ~0.5s |
| **Total** | | **~3–5s per region** |

### Space Complexity

| Data | Size | Notes |
|------|------|-------|
| GeoJSON coastlines | ~1 MB | Loaded in memory (cached) |
| Region hex map | 5–15 MB | JSON file (gzip: 1–3 MB) |
| Manifest | ~10 KB | All regions combined |

### Optimization Opportunities

1. **Multi-threading**: Use Node.js `worker_threads` for hex generation (embarrassingly parallel)
2. **Spatial index**: R-tree for coastline bounding boxes (currently linear O(rings))
3. **Incremental generation**: Cache ray-cast results; only regenerate changed region
4. **Compression**: Store hex map as binary + text manifest (4–8× smaller)

## Extending the Generator

### Adding a New Biome

Edit `biome()` function in `build-earth-from-naturalearth.js`:

```javascript
function biome(lat, lon) {
  const a = Math.abs(lat);
  
  // Add new band: grassland (35–55°) differentiated by elevation
  if (a > 50) return 'steppe';      // High-altitude plains
  if (a > 35) return 'grassland';   // Low-altitude plains
  
  // ... rest unchanged ...
}
```

Or overlay Köppen climate data:

```javascript
function biomeFromClimate(lon, lat) {
  const climate = koeppenGrid.sample(lon, lat);
  return {
    'Af': 'jungle',    // Tropical rainforest
    'Am': 'jungle',    // Tropical monsoon
    'Aw': 'jungle',    // Tropical savanna
    'Bh': 'desert',    // Hot desert
    'Bs': 'plains',    // Semi-arid
    'Cw': 'forest',    // Temperate
    'Dw': 'forest',    // Boreal
    'E': 'tundra',     // Polar
  }[climate] || 'plains';
}
```

### Adding Elevation Data

Integrate GEBCO bathymetry:

```javascript
import { readGeotiff } from 'geotiff';

const gebcoData = await readGeotiff('gebco_2024.tif');

function getElevation(lon, lat) {
  const [x, y] = gebcoData.geoToPixel(lon, lat);
  return gebcoData.getPixel(x, y);  // meters
}

// In hex generation:
const elevation = Math.max(0, Math.min(10, getElevation(lon, lat) / 1000));
hexes.push({ q, r, terrain, elevation, ... });
```

### Parameterized Region Generation

Instead of hardcoded REGIONS, allow CLI arguments:

```bash
node build-earth.js --region karelia --lat 61:67 --lon 28.5:38 --rows 160
node build-earth.js --all-from regions.csv
```

### River Generation (Future)

Implement watershed-based river placement:

```javascript
function generateRivers(hexGrid) {
  const elevation = new Map();  // q,r → height
  
  // 1. Assign elevation per hex (from GEBCO)
  for (const hex of hexGrid) {
    elevation.set(`${hex.q},${hex.r}`, getElevation(hex.lon, hex.lat));
  }
  
  // 2. Dijkstra: each hex flows downhill to neighbor
  const flowDirection = new Map();
  for (const hex of hexGrid) {
    let lowest = hex;
    for (const neighbor of getNeighbors(hex)) {
      if (elevation.get(neighbor) < elevation.get(lowest)) {
        lowest = neighbor;
      }
    }
    flowDirection.set(hex, lowest);
  }
  
  // 3. Accumulation: count hexes flowing into each cell
  const accumulation = new Map();
  for (const hex of hexGrid) {
    accumulation.set(`${hex.q},${hex.r}`, 0);
  }
  for (const [hex, target] of flowDirection.entries()) {
    accumulation.set(target, (accumulation.get(target) || 0) + 1);
  }
  
  // 4. Mark high-accumulation paths as rivers
  const RIVER_THRESHOLD = 10;  // Hexes
  return hexGrid.filter(h => accumulation.get(h) >= RIVER_THRESHOLD);
}
```

## Debugging

### ASCII Preview Script

`scripts/preview-ascii.js` renders the hex map as ASCII for quick inspection:

```
f f f f w w w w f f f f
f c f w w w w w f c f f
f f f f w w w m f f f f
```

Legend:

- `f` = forest
- `p` = plains
- `d` = desert
- `t` = tundra
- `w` = water
- `m` = mountain
- `c` = city (stamped from features)
- `.` = uninitialized (shouldn't appear)

### Diagnostic Script

`scripts/analyze-working-map.js` outputs statistics:

```
Region: karelia
Total hexes: 22847
Land: 18432 (80.7%)
Water: 4415 (19.3%)
Cities stamped: 6 / 8 (75%)
  Novgorod: 58.52, 31.27 → grid [142, 98]
  Ladoga: 60.0, 32.3 → grid [145, 88]
  ...

Coastline rings: 12
  Ring 0: 4521 points, bounds [28.5, 38.0] × [61.0, 67.0]
  Ring 1: 2103 points, bounds [22.1, 28.3] × [55.0, 62.0]
  ...
```

### Common Issues

**Map is all water or all land:**

- Check `ne_50m_land.geojson` is not corrupted
- Verify `isLand()` logic (try inverting ray-cast result)
- Confirm region bounds don't straddle coastline gaps

**Cities not appearing:**

- Ensure features are within region `[lonMin, lonMax] × [latMin, latMax]`
- Check feature JSON syntax (trailing commas, quotes)
- Run with console logging to see which cities are within bounds

**Stretched/distorted map:**

- Verify `centerLat` is set appropriately for the region
- For high latitudes (> 60°), set `centerLat` to midpoint: `(latMin + latMax) / 2`
- Check `cos(centerLat)` is not near zero (would require extreme col count)

**Generator hangs or crashes:**

- Reduce `rows` (if > 500, rasterization becomes slow)
- Check for infinite loops in coastline processing
- Profile with `node --prof` to identify bottleneck

---

## Related Code

- **Game engine render**: `static/hexmap/game.js` (external; see [game.js internals reference](reference_gamejs_internals.md) in memory)
- **Hex storage**: `src/lib/storage.ts` (CRUD for maps)
- **Sync/conflict**: `src/lib/sync.ts` (JSON-RPC to MCP Worker)
- **Types**: `src/lib/types.ts` (`HexMap`, `Hex`, `Topic` interfaces)

---

## Version History

- **v1.0** (2026-06-04): Initial Natural Earth rasterizer (Claude Opus 4.8)
  - Full algorithm: ray-casting, biome classification, city stamping
  - 6 region presets (world, oldworld, europe, americas, eastasia, africa)

- **Earlier** (2026-06-03): Proof-of-concept with lat/lon→axial converter (Claude Haiku 4.5)
  - Basic city-to-hex mapping
  - Placeholder coastlines (8 polygons)
