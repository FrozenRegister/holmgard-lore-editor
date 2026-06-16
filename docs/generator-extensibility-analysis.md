# Generator Extensibility Analysis

Assessment of how easy it would be to extend the world generator to accept images, procedural data, or other data sources. Also covers current detailHex usage.

## Current Generator Architecture

```
Input:          Processing:                Output:
────────────────────────────────────────────────────────
Region bounds   1. Load GeoJSON             Hex grid
(lat/lon)       2. Rasterize to hexes       (~20k hexes)
                3. Terrain from latitude    
Cities          4. Land/water detection     HexMap JSON
(lat/lon)       5. City stamping            (empty detail
                6. Write JSON               grid)
```

**Current implementation:**

- **Input**: Real-world geography (lat/lon)
- **Output**: Single-level hex grid only
- **Detail hexes**: Currently **NOT USED** (`detailHexes: []`)

---

## DetailHex Status

### Current Usage

Looking at the generated maps:

```javascript
// In build-earth-from-naturalearth.js (line 164-169):
detailGridEnabled: false,
detailGridDensity: 7,
detailHexes: [],        // Empty array — not populated
subHexes: [],
subHexLandmarks: [],
subHexTokens: [],
```

**State: Not Implemented**

The comment suggests detail hexes are "added per-region later" but this is not done by the generator. Detail grid is architecture for a **future feature**: zoom-in to see settlement-level detail.

### What DetailHexes Would Do

If implemented, the system would support a **two-level hierarchy**:

```
Continent Level (current):
  Hex(-42, 18) = forest, "Novgorod"
  
Settlement Level (future):
  Hex(-42, 18) contains 49 detail hexes (7×7 sub-grid)
    DetailHex(0, 0) = city wall
    DetailHex(1, 1) = marketplace
    DetailHex(2, 2) = farm
    ...
```

**Rendering**: When user zooms past threshold, show detail grid inside parent hex. This is the "continentGridDensity: 7" setting (7×7 = 49 sub-hexes per parent).

---

## Image-Based Generator: Feasibility

### High-Level Approach

```
Image File (PNG/JPG)
    ↓
Color → Terrain Mapping
(red=mountain, blue=water, green=plains, etc.)
    ↓
Hex Grid Generation
(with same offset-axial algorithm)
    ↓
HexMap JSON Output
```

### Difficulty: **Medium (2-3 days work)**

### Pros (Easy Parts)

1. **Reuse existing hex grid generation code**
   - Same offset-axial coordinate math
   - Same JSON output structure
   - Same region bounds → cols/rows calculation

2. **Simple color-to-terrain mapping**

   ```javascript
   function terrainFromPixel(r, g, b) {
     if (b > 200) return 'water';
     if (r > 100 && g < 100) return 'mountain';
     if (g > 100) return 'forest';
     if (Math.abs(r - g) < 50) return 'plains';
     return 'desert';
   }
   ```

3. **No coastline processing needed**
   - Image is the source of truth
   - Skip the expensive ray-casting logic

### Cons (Harder Parts)

1. **Image → Hex Grid Alignment**
   - Images are pixel-grids; hexes are offset-axial
   - Need to define: which pixel = which hex center?
   - Projection mismatch near edges (image rectangle ≠ hex rectangle)

   **Solution**: Define image bounds as `[lonMin, lonMax] × [latMin, latMax]`, then:

   ```javascript
   const pixelLon = lonMin + (x / imageWidth) * (lonMax - lonMin);
   const pixelLat = latMax - (y / imageHeight) * (latMax - latMin);
   const { q, r } = latLonToAxial(pixelLat, pixelLon);
   ```

2. **Image Resolution vs. Hex Density**
   - 1000×1000 image → how many hexes?
   - If 1 pixel = 1 hex: 1M hexes → 100+ MB JSON
   - If 1 pixel = 10×10 hex blocks: 10k hexes, but loses detail

   **Solution**: Let user specify target hex count, then downsample image accordingly

3. **City/Landmark Detection**
   - Natural Earth approach: explicit city list
   - Image approach: needs heuristics or manual annotation

   **Options**:
   - a) User provides separate JSON of city locations (like current system)
   - b) Auto-detect via color clustering (e.g., red pixels = cities)
   - c) Read from image metadata or embedded GeoJSON

4. **Terrain Blending**
   - Real coastlines have smooth gradients
   - Image colors are discrete pixels
   - Adjacent hexes with different terrain should blend naturally

   **Solution**: Smooth terrain by blending with neighbors

   ```javascript
   // After assigning terrain from pixels, smooth edges
   for (let iter = 0; iter < 3; iter++) {
     for (const hex of hexes) {
       const neighbors = getNeighbors(hex);
       const terrainVotes = neighbors.map(n => n.terrain);
       if (singleCommonTerrain(terrainVotes)) {
         hex.terrain = terrainVotes[0];  // Smooth isolated tiles
       }
     }
   }
   ```

### Implementation Sketch

```javascript
// scripts/build-from-image.js

import sharp from 'sharp';  // Image processing
import path from 'path';

const IMAGE_PATH = process.argv[2];  // e.g., 'karelia-map.png'
const REGION_ID = process.argv[3];   // e.g., 'karelia'
const BOUNDS = {
  lon: [-12, 45],   // Same as before
  lat: [34, 71],
  rows: 170,        // Target hex resolution
};

async function buildFromImage(imagePath, regionId, bounds) {
  // 1. Load image
  const image = sharp(imagePath);
  const { width, height, space } = await image.metadata();
  const pixels = await image.raw().toBuffer();  // [R, G, B, A, R, G, B, A, ...]

  // 2. Calculate hex grid (same as before)
  const ROWS = bounds.rows;
  const COLS = Math.round(ROWS * ...);  // Same formula
  const RC = ..., QC = ...;

  // 3. For each hex, find corresponding pixel and map to terrain
  const hexes = [];
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      // Map hex center to image coordinates
      const lat = latMax - row * dLat;
      const lon = lonMin + col * dLon;
      const pixelX = Math.round((lon - lonMin) / (lonMax - lonMin) * width);
      const pixelY = Math.round((latMax - lat) / (latMax - latMin) * height);

      // Sample pixel color
      const offset = (pixelY * width + pixelX) * 4;  // RGBA
      const [r, g, b, a] = [pixels[offset], pixels[offset+1], pixels[offset+2], pixels[offset+3]];

      // Map to terrain
      const terrain = terrainFromPixel(r, g, b);
      
      // Convert to axial
      const q = col + (-Math.floor(row / 2)) - QC;
      const r = row - RC;

      hexes.push({ q, r, terrain, name: '', description: '' });
    }
  }

  // 4. Apply terrain smoothing (optional)
  smoothTerrain(hexes, 3);  // 3 iterations

  // 5. Stamp cities (same as before, uses earth-996-features.json)
  // ... (reuse existing logic)

  // 6. Write output
  // ... (same as before)
}

function terrainFromPixel(r, g, b) {
  // Customize this for your image color scheme
  // Example: user provides CSV mapping { "FF0000": "mountain", "0000FF": "water", ... }
}
```

### Estimated Effort

| Task | Time |
|------|------|
| Image loading & sampling | 2 hours |
| Terrain mapping logic | 2 hours |
| Hex grid alignment | 3 hours |
| Terrain smoothing | 2 hours |
| Testing + debug | 4 hours |
| **Total** | **~13 hours (1-2 days)** |

### Risks

- **Image distortion**: Flat image → spherical world; polar regions will stretch
  - Mitigation: Add warning for high-latitude maps; suggest smaller regions
  
- **Color ambiguity**: Hard to distinguish terrain types from pixel colors alone
  - Mitigation: Let user define color palette; show preview
  
- **Performance**: 1000×1000 image → 1M samples, expensive
  - Mitigation: Downsample image first; process in tiles

---

## Other Data Sources

Beyond images, you could build generators for:

### 1. Fractal/Procedural Generation

**Difficulty: Easy (1 day)**

```javascript
// scripts/build-from-fractal.js
import SimplexNoise from 'simplex-noise';

const noise = new SimplexNoise();

function buildFromFractal(regionId, bounds) {
  const ROWS = bounds.rows;
  const hexes = [];
  
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      const lat = latMax - row * dLat;
      const lon = lonMin + col * dLon;
      
      // Simplex noise → height
      const height = noise.noise2D(
        lon / 10,  // Frequency tuning
        lat / 10
      );
      
      // Height → terrain
      let terrain;
      if (height > 0.6) terrain = 'mountain';
      else if (height > 0.3) terrain = 'forest';
      else if (height > 0) terrain = 'plains';
      else if (height > -0.3) terrain = 'desert';
      else terrain = 'water';
      
      hexes.push({ q, r, terrain, name: '', description: '' });
    }
  }
  
  return hexes;
}
```

**Advantages:**

- Infinite variety
- Fast (no I/O)
- Seed-based reproducibility

**Use case:** Procedurally-generated fantasy worlds, alt-history scenarios

### 2. GeoJSON Import (Beyond Natural Earth)

**Difficulty: Easy (2 hours)**

Current system already does this! You could swap out data sources:

```javascript
// Load custom GeoJSON instead of ne_50m_land.geojson
const customGeo = JSON.parse(fs.readFileSync('my-coastlines.geojson'));
const rings = [];
// ... (same processing as before)
```

**Sources:**

- OpenStreetMap export
- GEBCO bathymetry (paleo-coastlines)
- User-drawn boundaries
- Historical map overlays (georeferenced)

### 3. Database/API Source

**Difficulty: Medium (1 day)**

```javascript
// scripts/build-from-database.js
import fetch from 'node-fetch';

async function buildFromAPI(regionId, bounds) {
  // Query remote API for terrain data
  const tileUrl = `https://api.example.com/tiles/{z}/{x}/{y}.json`;
  
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      const lat = latMax - row * dLat;
      const lon = lonMin + col * dLon;
      
      // Fetch terrain at this location
      const tile = await fetch(
        tileUrl.replace('{z}', zoom)
                .replace('{x}', getTileX(lon))
                .replace('{y}', getTileY(lat))
      ).then(r => r.json());
      
      const terrain = classifyTerrain(tile.properties);
      hexes.push({ q, r, terrain, ... });
    }
  }
}
```

**Sources:**

- MapBox Tilesets
- Copernicus Climate Data Store
- NOAA Ocean Data
- Custom game asset tiles

### 4. Hand-Drawn / ASCII Map

**Difficulty: Easy (2 hours)**

```javascript
// scripts/build-from-ascii.js
// User provides map in ASCII format:
//
// MMFFFWWWMMM
// MFFFPPWWFFF
// FFPPPPPWWFF
// PPPPPPWWWWF
// etc.

const TERRAIN_MAP = {
  'M': 'mountain',
  'F': 'forest',
  'P': 'plains',
  'W': 'water',
  'D': 'desert',
  'T': 'tundra',
};

const asciiMap = fs.readFileSync('map.txt', 'utf8').split('\n');
const hexes = [];

for (let row = 0; row < asciiMap.length; row++) {
  const line = asciiMap[row];
  for (let col = 0; col < line.length; col++) {
    const terrain = TERRAIN_MAP[line[col]] || 'plains';
    const q = col + (-Math.floor(row / 2)) - QC;
    const r = row - RC;
    hexes.push({ q, r, terrain, ... });
    }
}
```

**Use case:** Rapid prototyping, creative control, designer-friendly

---

## Recommended Implementation Order

If you want to support multiple input sources:

### Phase 1: Refactor (Done Once)

Extract common logic into a shared library:

```javascript
// lib/hex-generator.js
export function buildHexGrid(regions, bounds, hexContent) {
  // Hex generation + JSON output (no input parsing)
}

export function stampCities(hexes, features, bounds) {
  // Shared city stamping logic
}

export function smoothTerrain(hexes, iterations) {
  // Shared terrain smoothing
}
```

### Phase 2: Add Generators (One Each)

Each generator plugs into the shared library:

```javascript
// scripts/build-from-image.js
const imageTerrainData = await loadImage(...);
const hexContent = getHexContentFromImage(imageTerrainData, bounds);
const map = buildHexGrid(regionId, bounds, hexContent);

// scripts/build-from-fractal.js
const fractalTerrainData = generateFractal(bounds);
const hexContent = getHexContentFromFractal(fractalTerrainData, bounds);
const map = buildHexGrid(regionId, bounds, hexContent);

// scripts/build-from-naturalearth.js (existing)
// ... etc.
```

### Phase 3: Unified CLI (Optional)

```bash
node scripts/build.js --type naturalearth --region karelia
node scripts/build.js --type image --input map.png --region myworld
node scripts/build.js --type fractal --seed 12345 --region fantasy
node scripts/build.js --type ascii --input map.txt --region ascii-world
```

---

## Summary Table

| Input Source | Difficulty | Time | Reuse | Output Quality |
|---|---|---|---|---|
| **Natural Earth** (current) | ✅ | — | 100% | ⭐⭐⭐⭐⭐ |
| **Image** | 🟡 Medium | 1-2 days | 80% | ⭐⭐⭐ |
| **Fractal** | ✅ Easy | 1 day | 90% | ⭐⭐⭐ |
| **GeoJSON** (custom) | ✅ Easy | 2 hours | 95% | ⭐⭐⭐⭐ |
| **API/Database** | 🟡 Medium | 1 day | 85% | ⭐⭐⭐⭐ |
| **ASCII Map** | ✅ Easy | 2 hours | 75% | ⭐⭐ |
| **Hand-drawn** (georef'd) | 🟡 Medium | 2 days | 70% | ⭐⭐⭐ |

---

## Recommendations

### If You Want Image Support

**Do it. It's worth the effort.**

- Design: User provides image + color-to-terrain mapping CSV
- Generate: 1-2 day implementation
- Output: Same JSON format, seamlessly loads in editor
- Example use case: Adapt from published game maps, fantasy book illustrations, procedural art

### If You Want Procedural Worlds

**Start with Simplex noise (easy), advance to multi-octave Perlin if needed.**

- Fast, reproducible, infinite variety
- Great for random campaigns or testing
- 1-day implementation

### If You Want Detail Hexes

**Not yet.** Current architecture is ready for it, but:

- Requires UI changes (zoom UI, detail rendering)
- Adds JSON size significantly
- Start with 1-level hex grid first; add detail grid support later

**When to add:**

- After you have 5+ regional maps and want settlement-level play
- After implementing viewport zoom thresholds in game.js
- After user testing shows demand for granular detail

### If You Want Other Sources

**GeoJSON/API support is trivial; do it as a refactoring pass** after Image support, so you have proven the abstraction layer.
