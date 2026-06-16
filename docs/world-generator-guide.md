# World Generator Guide

This guide explains how to generate new regional hex maps for the Holmgard Lore Editor using the world generator system. It covers the technical architecture, workflow, and step-by-step instructions for creating maps like "Karelia 966 AD."

## System Overview

The world generator converts real-world geographic data into hex map data suitable for the Holmgard Lore Editor's game engine. It uses:

- **Natural Earth data** (`ne_50m_land.geojson`): Public-domain coastlines and landmass boundaries
- **Feature data** (`earth-996-features.json`): Curated list of historical cities, landmarks, and regions with lat/lon coordinates
- **Build script** (`build-earth-from-naturalearth.js`): Node.js script that rasterizes geography into hex grids

## How It Works

### 1. Coordinate System

The hex map uses **offset axial coordinates** (q, r) with a specific transformation to match the game engine's rendering:

```
q = col - floor(row/2)    (column offset by row parity)
r = row                   (row index)
```

This keeps the map rendering as a true screen rectangle, with:
- x-axis ∝ q + r/2 (longitude)
- y-axis ∝ r (latitude)

### 2. Regional Bounds & Resolution

Each region defines:
- **Longitude bounds**: [west, east]
- **Latitude bounds**: [south, north]
- **Row count** (vertical resolution): determines map detail; typical range 150–200

The script calculates column count to maintain proper proportions using:
```
cos(centerLat) = longitude correction factor (equidistant-cylindrical projection)
COLS = ROWS * (lonSpan * cosC / latSpan) * (1.5 / √3)
```

For regions far from the equator, `centerLat` is adjusted to prevent longitude stretching.

### 3. Terrain Classification

Terrain is determined by latitude bands, matching Civ-style biomes used by the game engine:

| Latitude | Terrain |
|----------|---------|
| > 66.5° | tundra |
| 55–66.5° | forest |
| 35–55° | plains |
| 23.5–35° | desert (Sahara/Arabia) or plains |
| 12–23.5° | desert (Sahel) or plains |
| < 12° | jungle |

Special cases handle named desert regions (Sahara, Sahel, Arabia, Iran).

### 4. Coastline Detection

The script uses **ray-casting point-in-polygon** to test each hex center against Natural Earth coastline rings:

```javascript
function rayCast(lon, lat, coords) {
  // Count intersections with polygon boundary
  // Odd count = inside; even = outside
}
function isLand(lon, lat) {
  // Check against all coastline rings with bounding-box optimization
}
```

Land hexes receive terrain biome; water hexes are marked `'water'`.

### 5. City/Landmark Stamping

Cities from `earth-996-features.json` are:
1. Filtered by region bounds (lat/lon)
2. Snapped to nearest grid cell
3. Stamped with name, description, and optional elevation override

Mountain cities get `terrain: 'mountain'`; others inherit biome terrain.

## Current Regional Presets

The generator includes built-in presets in `scripts/build-earth-from-naturalearth.js`:

```javascript
const REGIONS = {
  world:    { lon: [-180, 180], lat: [-85, 85],   rows: 150, centerLat: 0 },
  oldworld: { lon: [-25, 150],  lat: [-36, 72],   rows: 200 },
  europe:   { lon: [-12, 45],   lat: [34, 71],    rows: 170 },
  americas: { lon: [-130, -34], lat: [-56, 60],   rows: 200, centerLat: 8 },
  eastasia: { lon: [95, 150],   lat: [18, 54],    rows: 150 },
  africa:   { lon: [-20, 52],   lat: [-36, 38],   rows: 190, centerLat: 0 },
};
```

Each preset generates a separate JSON file: `earth-996-{region}.json`

---

## Creating a New Regional Map: Karelia 966 AD

This example walks through creating a hex map of the Karelia region (northeastern Europe) in 966 AD.

### Step 1: Define Region Bounds

Karelia is located in present-day Russia/Finland:
- **West**: 28.5°E (westernmost point near Finland border)
- **East**: 38°E (Arkhangelsk area)
- **South**: 61°N (Lake Ladoga)
- **North**: 67°N (White Sea coast)

```javascript
karelia: {
  name: 'Karelia',
  lon: [28.5, 38],
  lat: [61, 67],
  rows: 160
  // centerLat defaults to (61 + 67) / 2 = 64, which is near optimal for this latitude
}
```

### Step 2: Prepare Feature Data

Add Karelia cities to `src/lib/data/earth-996-features.json`. Example entries for 966 AD:

```json
{
  "name": "Novgorod",
  "description": "Major trading city",
  "type": "kingdom_capital",
  "region": "Novgorod Republic",
  "lat": 58.52,
  "lon": 31.27,
  "terrain": "forest"
},
{
  "name": "Ladoga",
  "description": "Ancient settlement",
  "type": "city",
  "region": "Karelia",
  "lat": 60.0,
  "lon": 32.3,
  "terrain": "forest"
},
{
  "name": "Arkhangelsk",
  "description": "Settlement (small)",
  "type": "city",
  "region": "Karelia",
  "lat": 64.54,
  "lon": 40.54,
  "terrain": "forest"
},
{
  "name": "Kola Mountains",
  "description": "Mountain range",
  "type": "mountain",
  "region": "Karelia",
  "lat": 66.8,
  "lon": 33.6,
  "terrain": "mountain"
}
```

### Step 3: Run the Generator

Add the `karelia` preset to `scripts/build-earth-from-naturalearth.js`:

```javascript
const REGIONS = {
  // ... existing regions ...
  karelia: {
    name: 'Karelia',
    lon: [28.5, 38],
    lat: [61, 67],
    rows: 160
  },
};
```

Then run:

```bash
node scripts/build-earth-from-naturalearth.js karelia
```

This generates:
- `src/lib/data/earth-996-karelia.json` — the hex map file
- Updates `src/lib/data/earth-996-regions.json` manifest with metadata

### Step 4: Verify the Output

Run diagnostic scripts to inspect the map:

```bash
# ASCII preview (shows terrain symbols)
node scripts/preview-ascii.js karelia

# Analyze the working map (hex count, city stamps, etc.)
node scripts/analyze-working-map.js karelia
```

### Step 5: Load in Editor

The map loads in the editor via the region manifest. The app shows it in the region selector dropdown.

---

## Workflow for AI Assistants

When delegating map generation to Claude or another AI assistant, provide these instructions:

### For Claude (or Claude Code)

```
Task: Generate a hex map of [REGION] in [YEAR] AD for the Holmgard Lore Editor.

Context:
- The world generator in scripts/build-earth-from-naturalearth.js converts real-world
  geography (lat/lon) into a hex grid format the game engine understands.
- Input: region bounds (west, east, south, north in degrees), vertical resolution (rows).
- Output: JSON file with ~10,000–30,000 hexes describing terrain, cities, landmarks.

Steps:
1. Research historical geography and major cities for [REGION] in [YEAR].
2. Define region bounds (lon: [W, E], lat: [S, N]) and estimate row count.
3. Add curated city/landmark entries to src/lib/data/earth-996-features.json with:
   - name, description, type (city/kingdom_capital/mountain/etc.)
   - region, lat, lon, optional terrain override
4. Add the region preset to scripts/build-earth-from-naturalearth.js REGIONS object.
5. Run: node scripts/build-earth-from-naturalearth.js [region-id]
6. Verify with: node scripts/preview-ascii.js [region-id]
7. Commit with conventional-commit format (feat: add [REGION] [YEAR] map).
```

### For Other Assistants (Cline, GitHub Copilot, Mistral, Deepseek)

These tools may not be as familiar with Node.js or the project structure. Provide a step-by-step scaffold:

```
You are helping generate a historical hex map for a world-building game editor.

Input for [REGION] [YEAR] AD:
- Region ID: [karelia]
- Name: [Karelia (966 AD)]
- Bounds: west=[28.5°], east=[38°], south=[61°], north=[67°]
- Rows: 160
- Center latitude: 64 (for equidistant projection)

File modifications:

1. In src/lib/data/earth-996-features.json, add this city block under the "features" array:

   {
     "name": "...",
     "description": "...",
     "type": "city|kingdom_capital|mountain|...",
     "region": "[REGION]",
     "lat": [LAT],
     "lon": [LON],
     "terrain": "plains|forest|tundra|..." (optional, auto-detected if omitted)
   }

   Add ~5–15 historically significant cities/landmarks in this region.

2. In scripts/build-earth-from-naturalearth.js, find the REGIONS object and add:

   karelia: {
     name: 'Karelia',
     lon: [28.5, 38],
     lat: [61, 67],
     rows: 160
   },

3. Run the generator and verify output by:
   a) Opening terminal in project root
   b) Run: node scripts/build-earth-from-naturalearth.js karelia
   c) Run: node scripts/preview-ascii.js karelia
   d) Check that output shows terrain symbols and city stamps

4. Commit changes with message:
   feat: add Karelia 966 AD hex map from Natural Earth coastlines
```

---

## Data Sources & Accuracy

### Historical Cities

Cities in `earth-996-features.json` are curated from:
- Historical records (extant chronicles, trade routes)
- Archaeological evidence
- Geographic constraints (navigable rivers, defensible positions)

Lat/lon coordinates are approximate, accurate to ~0.5–1.0 degree (50–100 km).

### Coastlines

`src/lib/data/ne_50m_land.geojson` is sourced from **Natural Earth 1:50m** (public domain):
- Simplified for rendering efficiency
- Modern coastlines (post-glacial stable)
- Does not capture paleo-coastlines (e.g., pre-9000 BC flooding, sea-level rise)

For alternate years or paleo-geography, consider:
- GEBCO bathymetry + isostatic rebound models
- Paleoclimate datasets (PMIP3, TRACE-21k)
- Custom coastline traces from geological surveys

### Terrain Biomes

Terrain classification uses simple latitude bands. For finer accuracy:
- Overlay Köppen-Geiger climate zones
- Cross-check with modern vegetation datasets (MODIS, ESA CCI)
- Adjust for local elevation (not yet implemented)

---

## Technical Details

### File Locations

```
scripts/
  build-earth-from-naturalearth.js   Main generator
  earth-generator.js                 Earlier lat/lon → axial converter (reference)
  fetch-coastlines.js                GeoJSON ingestion utility
  preview-ascii.js                   ASCII terrain visualization
  analyze-working-map.js             Hex count & metadata inspector

src/lib/data/
  earth-996-features.json            Master city/landmark database (cities/landmarks array)
  earth-996-regions.json             Manifest: region metadata & geotransform params
  earth-996-{region}.json            Generated hex maps (one per region)
  ne_50m_land.geojson                Natural Earth coastlines (public domain)
```

### Output JSON Structure

Each generated map file (`earth-996-{region}.json`) contains:

```javascript
{
  version: '1.0',
  year: 996,
  mapName: 'Earth 996 AD — Karelia',
  mapType: 'world',
  mapInstanceId: 'earth-996-karelia',
  orientation: 'pointy',
  hexSize: 30,
  hexes: [
    { q: -42, r: 18, terrain: 'forest', name: 'Novgorod', description: '...' },
    { q: -35, r: 22, terrain: 'mountain', name: 'Kola Mountains', description: '...' },
    // ... ~20,000 more hexes ...
  ],
  landmarks: [],
  textLabels: [],
  continentGridEnabled: true,
  continentGridDensity: 7,
  detailGridEnabled: false,
  detailHexes: [],
  metadata: { totalHexes: 18432 },
  exportMetadata: {
    exportType: 'naturalearth-rasterizer',
    region: 'karelia',
    exportedAt: '2026-06-15T12:34:56Z'
  }
}
```

### Geotransform Metadata

The manifest (`earth-996-regions.json`) includes inverse-transform parameters for viewport-to-lat/lon lookups:

```javascript
geo: {
  lonMin: 28.5,
  latMax: 67,
  dLon: 0.316,    // (lon_max - lon_min) / cols
  dLat: 0.0375,   // (lat_max - lat_min) / rows
  qc: -18,        // axial q center offset
  rc: 80          // axial r center offset
}
```

Used by the editor to zoom-to-load specific world coordinates.

---

## Troubleshooting

### Map appears stretched or distorted
- Check `centerLat` is appropriate for the region's latitude band
- Regions near poles need adjustment: `centerLat = (latMin + latMax) / 2`

### Cities not appearing
- Verify lat/lon are within region bounds in `earth-996-features.json`
- Check feature `region` field matches or is omitted
- Ensure JSON syntax is valid (trailing commas, quotes)

### ASCII preview shows all water or all land
- City stampings may be rare; increase feature density
- Check coastline data (`ne_50m_land.geojson`) is not corrupt
- Verify `isLand()` ray-casting isn't inverting land/water

### Generator crashes or hangs
- Check `rows` count is not too large (> 500 may be slow)
- Verify `earth-996-features.json` is valid JSON
- Ensure `ne_50m_land.geojson` file exists at expected path

---

## Future Enhancements

Possible extensions to the generator:

1. **Elevation support**: Parse GEBCO bathymetry; add elevation to water hexes
2. **Paleo-coastlines**: Load alternate GeoJSON for different epochs
3. **Climate overlay**: Use Köppen climate zones for terrain instead of latitude bands
4. **River generation**: Implement watershed/flow-based river placement
5. **Settlement density**: Scale city count by historical population estimates
6. **Custom terrain**: Allow region-specific terrain types (e.g., 'steppe' vs 'plains')
