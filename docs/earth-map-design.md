# Earth Map Generation Design

> **Status (as of 2026-06-08): The implementation took a fundamentally different path than this design describes.** The original design called for a *sparse* hex array (~10–20k explicit hexes) with *runtime procedural rendering* via a 3-tier `getHexForRender(q, r)` lookup against an inline coastline GeoJSON. What shipped instead is *dense pre-baked per-region grids* (20–50k hexes per region, ~203k total) that read a separate `ne_50m_land.geojson` at **build time** to rasterise land/water. The procedural pipeline (`isInsideCoastline`, `getHexForRender`, `generateProceduralHex`, `pointInPolygon`, `COASTLINE_CACHE`) exists in `src/lib/hexmap-utils.ts` with full test coverage, but is **not wired into `static/hexmap/game.js` or any Svelte component** — `game.js` reads `state.hexMap.hexes` directly from the pre-baked JSON. The coastline polygon is therefore not stored inline in the HexMap JSON (no `coastlines` field on the produced files), and no elevation is persisted. A region-switcher (`static/hexmap/hexmap-render-patch.js`) was added on top of the dense-grids approach to lazy-load zoom-appropriate regions from `earth-996-regions.json`. See per-item tags below for the granular state.

## Overview
Generate a realistic Earth hex map (~250k hex grid space) with optimized storage using boundary-based rendering.

## Storage Optimization Strategy

### Explicit Hex Storage (Sparse)  [SUPERSEDED → dense pre-baked grids]
Only store hexes for:
1. **Boundary hexes** — coastline/ocean-land boundaries (~5-8k hexes)  [NOT DONE — full grid is stored; boundary-only layer was never built]
2. **Major cities** — significant settlements (~500-1k hexes)  [PARTIAL — `earth-996-features.json` contains 322 features, not 500–1k; cities are stamped on the grid at build time, not a separate layer]
3. **Landmarks** — mountains, landmarks, points of interest (~200-500 hexes)  [PARTIAL — mountains appear as `terrain: 'mountain'` on stamped features; no separate landmark layer]

**Total explicit hexes: ~10-20k** (vs. 250k without optimization = **92-96% reduction**)  [NOT DONE — world map is 41,676 hexes (16.7% of 250k); total across 6 regions is ~203k hexes. The dense approach traded sparse storage for simpler runtime rendering.]

**Actual stored sizes (per region, dense pre-baked):**
| Region | Hexes | File size |
|---|---|---|
| world | 41,676 | 2.6 MB |
| oldworld | 53,868 | 3.4 MB |
| europe | 23,769 | 1.5 MB |
| americas | 28,743 | 1.8 MB |
| eastasia | 24,462 | 1.5 MB |
| africa | 30,751 | 1.9 MB |
| **Total** | **~203k** | **~12.7 MB across regions** |

### Procedural Infill  [NOT DONE at runtime — done at build time]
All other land hexes (unmarked terrain) render as:
- **Terrain:** Derived procedurally from latitude/elevation/noise  [DONE at build time via `biome(lat, lon)` in `build-earth-from-naturalearth.js`; runtime version exists in `hexmap-utils.ts` but is unused]
- **Elevation:** See decision below  [NOT DONE — no elevation field persisted on hexes]
- **Details:** None (no names/descriptions)  [DONE — most hexes have empty `name` and `description`]

---

## Design Decisions

### Decision 1: Elevation Data  [PARTIAL]
**DECIDED:** Derive procedurally from terrain type + latitude
- Mountain/hill hexes: elevation 7-10
- Forest/jungle: elevation 3-5
- Grassland/plains: elevation 2-4
- Tundra/arctic: elevation 1-3
- Swamp/marsh: elevation 1-2
- Desert: elevation 3-5
- Water: elevation 0

**Status:** Functions `getTerrainFromLatitude()` and `generateElevation()` are implemented in `src/lib/hexmap-utils.ts` (and exercised by `src/lib/__tests__/hexmap-utils.test.ts`). The build-time `biome(lat, lon)` in `scripts/build-earth-from-naturalearth.js` performs the equivalent classification when rasterising. **However, the produced `earth-996-*.json` files do not store an `elevation` field on hexes** — the runtime rendering has no elevation to work with, so height-based gameplay/shading is impossible until this is wired through.

**TODO (Phase 4):** Consider adding actual DEM (Digital Elevation Model) sampling if detailed elevation becomes important for simulation.  [NOT DONE]

### Decision 2: Coastline Storage Format  [SUPERSEDED]
**DECIDED:** Store coastline GeoJSON inline in HexMap JSON
```typescript
interface HexMap {
  hexes: Hex[];
  coastlines: CoastlineMap; // GeoJSON FeatureCollection
  // ... other fields
}
```

**Rationale:** Simpler initial implementation, self-contained map data

**Status:** The `CoastlineMap` TypeScript type *is* defined in `src/lib/types.ts`, but the build script **does not write a `coastlines` field** into the produced `earth-996-*.json` files (verified: `Has coastlines field: False` on `earth-996-world.json`). The actual coastline source `src/lib/data/ne_50m_land.geojson` lives as a separate file and is loaded by `scripts/build-earth-from-naturalearth.js` only at build time. The runtime rendering therefore has no coastline polygon to query, which is why the procedural lookup is never invoked.

**OPTION (Phase 5):** Extract to separate `.coastlines.geojson` file if:
- HexMap JSON exceeds 10MB  [NOT TRIGGERED — all per-region files are 1.5–3.4 MB]
- Need to share coastlines between multiple maps  [SUPERSEDED — region-based approach keeps data per-file instead]
- Real-time coastline editing needed  [NOT DONE — no coastline editing UI]

---

## Data Structure

### HexMap Extensions
```typescript
interface CoastlineMap {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][]; // [lon, lat]
    };
    properties: {
      landMass: string; // "North America", "Africa", etc.
      continentId?: string;
    };
  }>;
}

interface Hex {
  q: number;
  r: number;
  terrain: string;
  elevation?: number;
  name: string; // Empty string for procedural hexes
  description: string; // Empty for procedural
}
```

**Status:** `CoastlineMap` matches in `src/lib/types.ts`. The `Hex` interface in `src/lib/types.ts` has the same fields plus optional `lat`, `lon`, `type`, `region`. The produced JSON stores **only** `q`, `r`, `terrain`, `name`, `description` per hex — **no `elevation` field** is persisted.

### Hex Classification
```
Explicit Hex
├── Boundary Hex
│   └── Terrain: coastline/beach/marsh (indicates land-water edge)
│       Elevation: 1-2
├── Landmark Hex
│   ├── Cities: settlement/village/castle
│   ├── Mountains: peak/volcano
│   └── Points of Interest
└── Detail Hex
    └── Named locations with lore

Procedural Hex (not in array, rendered on demand)
├── Inside coastline polygon → Generate terrain based on lat/elevation noise
└── Outside polygon → Ocean (water, elevation 0)
```

**Status:** [SUPERSEDED in production]. The runtime classification is **not** used. The build script (`build-earth-from-naturalearth.js`) iterates the full lat/lon grid and stamps each cell — water outside the Natural Earth polygon, biome-derived terrain inside, plus city/mountain overrides from `earth-996-features.json`. The result is a flat array where every cell in the bounding rectangle exists, with no boundary/landmark/detail tiering.

---

## Rendering Pipeline

### 1. Hex Lookup Priority  [NOT DONE in production — function exists with full tests]
```
hexRender(q, r) {
  // Priority 1: Check explicit hex array
  if (explicit = hexes.find(h => h.q === q && h.r === r)) {
    return render(explicit);
  }

  // Priority 2: Check if inside coastline
  if (isInsideCoastline(q, r, coastlines)) {
    terrain = generateTerrain(q, r);
    elevation = generateElevation(terrain, q, r);
    return render({ q, r, terrain, elevation, name: "", description: "" });
  }

  // Priority 3: Ocean
  return render({ q, r, terrain: "water", elevation: 0, name: "", description: "" });
}
```

**Status:** This exact 3-tier lookup **is implemented** as `getHexForRender()` in `src/lib/hexmap-utils.ts` (lines 236–266), with `isInsideCoastline()` and `generateProceduralHex()` backing it. `src/lib/__tests__/hexmap-utils.test.ts` covers the empty-coastline, square-polygon, multi-island, and L-shaped notch cases. **However, a repo-wide search shows `getHexForRender`, `isInsideCoastline`, and `generateProceduralHex` are imported only by the test file** — `static/hexmap/game.js` (the actual renderer) iterates `state.hexMap.hexes.values()` directly and never calls any of them. So at runtime, there is no Priority 1/2/3 cascade — every visible hex is a pre-baked `Explicit` entry. The same dense pre-baked array is consumed regardless of viewport.

### 2. Coordinate Conversion  [DONE]
```typescript
// Web Mercator projection with axial hex conversion
function latLonToAxial(lat: number, lon: number, scale: number = 1.3) {
  const q = Math.round(lon * scale);
  const r = Math.round(-lat * scale + q / 2);
  return { q, r };
}

function axialToLatLon(q: number, r: number, scale: number = 1.3) {
  const lon = q / scale;
  const lat = (r - q / 2) / (-scale);
  return [lon, lat];
}
```

**Status:** Both `latLonToAxial()` and `axialToLatLon()` exist in `src/lib/hexmap-utils.ts` (scale defaults to 1.3) and are covered by `hexmap-utils.test.ts`. The build script uses an offset-axial variant (`q = col + q0 - QC, r = row - RC`) optimised for rectangular projection; `hexmap-render-patch.js` provides a viewport-centre → lat/lon inverse (using `dLat`/`dLon`/`qc`/`rc` from the region manifest) for zoom-to-load region switching.

### 3. Point-in-Polygon Test  [DONE in source — used at build time, not runtime]
Standard ray-casting algorithm to test if hex centre is inside any coastline polygon.

**Status:** `pointInPolygon()` and `isInsideCoastline()` are implemented in `src/lib/hexmap-utils.ts` with bounding-box pre-check and a 10k-entry `COASTLINE_CACHE` (LRU-style eviction in `performance-optimizations.md`). At build time, `build-earth-from-naturalearth.js` runs the same ray-casting algorithm against the in-memory `rings` derived from `ne_50m_land.geojson` to determine each grid cell's land/water. **At runtime the cached lookup is never queried**, because `game.js` has no coastline reference — the dense hex array is the source of truth.

---

## Implementation Phases

### Phase 1: Data Preparation
- [DONE] Download Natural Earth `ne_10m_land.geojson`  → **Used `ne_50m_land.geojson` instead** (lower resolution, ships as `src/lib/data/ne_50m_land.geojson`)
- [DONE] Convert to axial hex coordinates  → build script computes offset-axial `q, r` for each grid cell
- [DONE] Extract coastline boundaries  → coastline rings are flattened from the GeoJSON in `buildRegion()`
- [PARTIAL] Identify major cities (~500-1k)  → 322 features in `earth-996-features.json` (cities + mountains)
- [PARTIAL] Identify landmarks (~200-500)  → folded into the same 322-feature file as `type` strings (`mountain_*`)

### Phase 2: Hex Generation
- [NOT DONE] Create boundary hex layer (~5-8k hexes)  → no separate layer; full grid rasterised
- [DONE] Create city/landmark hex layer  → cityByCell map stamps `terrain: 'mountain'` and name onto the dense grid
- [DONE] Generate terrain classifier  → latitude-based `biome(lat, lon)` in `build-earth-from-naturalearth.js`; matches the spec's biome table (tundra/forest/plains/desert/jungle)
- [NOT DONE] Create sparse hexes array  → dense per-region grid stored instead (see Storage Optimization Strategy above)

### Phase 3: Rendering Integration
- [DONE IN CODE / NOT WIRED] Implement `isInsideCoastline()` lookup  → implemented in `src/lib/hexmap-utils.ts` with bbox pre-check and `COASTLINE_CACHE`; covered by tests; **not called from `game.js` or any Svelte component**
- [DONE IN CODE / NOT WIRED] Implement terrain/elevation generation  → `getTerrainFromLatitude()` + `generateElevation()` exist; elevation not persisted to JSON
- [PARTIAL] Patch game.js render pipeline  → the design meant wiring the procedural pipeline into game.js. Instead, `static/hexmap/hexmap-render-patch.js` was added as a *region-switcher* (lazy-loads `earth-996-{region}.json` via `loadMapDataIntoState`) which is a different concern than the 3-tier procedural render
- [PARTIAL] Test rendering performance  → `src/lib/performance-optimizations.md` documents cache + bbox pre-check optimisations; pan-snapshot bitmap cache and per-grid-level SimpleHexCache in game.js; the actual procedural lookup performance is unmeasured because it isn't invoked

### Phase 4: Elevation Enhancement (TODO)  [NOT DONE]
- [NOT DONE] Consider DEM integration for realistic elevation
- [NOT DONE] Add elevation-based visual shading
- [NOT DONE] Implement height-based pathfinding

### Phase 5: Storage Optimization (OPTION)  [PARTIAL]
- [DONE] Monitor HexMap file size  → all per-region files are 1.5–3.4 MB, well under 10 MB
- [NOT TRIGGERED] If >10MB, extract coastlines to separate file  → largest file is `oldworld.json` at 3.4 MB; no extraction needed
- [NOT DONE] Implement lazy-load for coastline data  → coastlines are *never loaded at runtime*; the dense hex array is the runtime source of truth
- [DONE IN CODE / NOT WIRED] Cache point-in-polygon results  → `COASTLINE_CACHE` (10k-entry, clear-on-overflow) implemented in `src/lib/hexmap-utils.ts` and benchmarked; never used by the runtime renderer

---

## File Size Projections

| Component | Size | Notes |
|-----------|------|-------|
| Coastlines GeoJSON | 1-2MB | Natural Earth `ne_10m_land`  → [PARTIAL]  `src/lib/data/ne_50m_land.geojson` is ~1.0 MB (50m resolution, not 10m) |
| Boundary hexes | 0.3-0.5MB | ~7k hexes @ 50 bytes each  → [NOT DONE]  no boundary-only layer; dense grids 1.5–3.4 MB per region |
| City/landmark hexes | 0.05-0.1MB | ~1.5k hexes  → [PARTIAL]  322 features stamped into the dense grid, not a separate array |
| Metadata | 0.01MB | Small overhead  → [DONE]  `metadata`, `exportMetadata`, viewport, continent/detail grid flags |
| **Total** | **1.4-2.7MB** | **95-97% smaller than 250k hexes**  → [NOT MET per-file]  per-region files are 1.5–3.4 MB; total across 6 regions is ~12.7 MB. The reduction goal is met only on a per-region basis, not globally. |

---

## Known Constraints & Future Work

- **Elevation accuracy:** Procedural only (Phase 4 TODO)  → [PARTIAL]  function exists in `hexmap-utils.ts`; not persisted; Phase 4 still TODO
- **Coastline storage:** Inline JSON (Phase 5 OPTION to extract)  → [SUPERSEDED]  coastlines are *not* inline in HexMap JSON; they live in a separate `ne_50m_land.geojson` consumed at build time
- **Performance:** Ray-casting is O(n vertices) per hex lookup; cacheable  → [DONE IN CODE]  bbox pre-check + 10k-entry `COASTLINE_CACHE`; **never invoked at runtime** because the dense hex array is the source of truth. The performance hot path the doc worried about does not exist in the current renderer.
- **Map editing:** Boundary changes require coastline re-export  → [DONE]  re-run `scripts/build-earth-from-naturalearth.js` to rebuild all 6 region JSONs
- **Offline grids:** Subhex detail grids may need their own coastlines (Phase 6)  → [NOT ADDRESSED]  `detailHexes` arrays in the produced JSON are empty; no per-region detail coastlines exist

---

## Summary of Divergence

| Design intent | Shipped behaviour | Status |
|---|---|---|
| Sparse 10–20k explicit hexes (boundary + city + landmark) | Dense 20–50k pre-baked hexes per region (~203k total) | SUPERSEDED |
| Coastline GeoJSON inline in HexMap JSON | Coastline in separate `ne_50m_land.geojson`, consumed at build time | SUPERSEDED |
| 3-tier `getHexForRender()` at runtime (explicit → procedural → ocean) | `game.js` reads dense `state.hexMap.hexes` array directly | NOT DONE (in production) |
| `ne_10m_land.geojson` (10m resolution) | `ne_50m_land.geojson` (50m resolution) | DEGRADED |
| 500–1k cities, 200–500 landmarks | 322 features (cities + mountains combined) | PARTIAL |
| Single global Earth map | 6 region maps (world, oldworld, europe, americas, eastasia, africa) with zoom-to-load switcher | SUPERSEDED — but functionally richer (zoom-to-load via `hexmap-render-patch.js`) |
| Elevation persisted on hexes | Elevation *function* exists, not persisted | PARTIAL |
| Phase 4 DEM integration | Not done | NOT DONE |
| Phase 5 lazy-load / polygon cache at runtime | Polygon cache implemented in `hexmap-utils.ts` only | NOT WIRED |

The **runtime procedural rendering pipeline in `src/lib/hexmap-utils.ts` is fully implemented and tested but completely disconnected from the shipped renderer.** A future effort could either (a) wire the existing pipeline into `game.js` to realise the original design, or (b) document the dense-grid approach as the canonical strategy and treat `hexmap-utils.ts`'s procedural API as an experimental / future-use module.
