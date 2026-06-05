# Earth Map Generation Design

## Overview
Generate a realistic Earth hex map (~250k hex grid space) with optimized storage using boundary-based rendering.

## Storage Optimization Strategy

### Explicit Hex Storage (Sparse)
Only store hexes for:
1. **Boundary hexes** — coastline/ocean-land boundaries (~5-8k hexes)
2. **Major cities** — significant settlements (~500-1k hexes)
3. **Landmarks** — mountains, landmarks, points of interest (~200-500 hexes)

**Total explicit hexes: ~10-20k** (vs. 250k without optimization = **92-96% reduction**)

### Procedural Infill
All other land hexes (unmarked terrain) render as:
- **Terrain:** Derived procedurally from latitude/elevation/noise
- **Elevation:** See decision below
- **Details:** None (no names/descriptions)

---

## Design Decisions

### Decision 1: Elevation Data
**DECIDED:** Derive procedurally from terrain type + latitude
- Mountain/hill hexes: elevation 7-10
- Forest/jungle: elevation 3-5
- Grassland/plains: elevation 2-4
- Tundra/arctic: elevation 1-3
- Swamp/marsh: elevation 1-2
- Desert: elevation 3-5
- Water: elevation 0

**TODO (Phase 4):** Consider adding actual DEM (Digital Elevation Model) sampling if detailed elevation becomes important for simulation.

### Decision 2: Coastline Storage Format
**DECIDED:** Store coastline GeoJSON inline in HexMap JSON
```typescript
interface HexMap {
  hexes: Hex[];
  coastlines: CoastlineMap; // GeoJSON FeatureCollection
  // ... other fields
}
```

**Rationale:** Simpler initial implementation, self-contained map data

**OPTION (Phase 5):** Extract to separate `.coastlines.geojson` file if:
- HexMap JSON exceeds 10MB
- Need to share coastlines between multiple maps
- Real-time coastline editing needed

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

---

## Rendering Pipeline

### 1. Hex Lookup Priority
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

### 2. Coordinate Conversion
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

### 3. Point-in-Polygon Test
Standard ray-casting algorithm to test if hex center is inside any coastline polygon.

---

## Implementation Phases

### Phase 1: Data Preparation
- [ ] Download Natural Earth `ne_10m_land.geojson` 
- [ ] Convert to axial hex coordinates
- [ ] Extract coastline boundaries
- [ ] Identify major cities (~500-1k)
- [ ] Identify landmarks (~200-500)

### Phase 2: Hex Generation
- [ ] Create boundary hex layer (~5-8k hexes)
- [ ] Create city/landmark hex layer
- [ ] Generate terrain classifier
- [ ] Create sparse hexes array

### Phase 3: Rendering Integration
- [ ] Implement isInsideCoastline() lookup
- [ ] Implement terrain/elevation generation
- [ ] Patch game.js render pipeline
- [ ] Test rendering performance

### Phase 4: Elevation Enhancement (TODO)
- [ ] Consider DEM integration for realistic elevation
- [ ] Add elevation-based visual shading
- [ ] Implement height-based pathfinding

### Phase 5: Storage Optimization (OPTION)
- [ ] Monitor HexMap file size
- [ ] If >10MB, extract coastlines to separate file
- [ ] Implement lazy-load for coastline data
- [ ] Cache point-in-polygon results

---

## File Size Projections

| Component | Size | Notes |
|-----------|------|-------|
| Coastlines GeoJSON | 1-2MB | Natural Earth `ne_10m_land` |
| Boundary hexes | 0.3-0.5MB | ~7k hexes @ 50 bytes each |
| City/landmark hexes | 0.05-0.1MB | ~1.5k hexes |
| Metadata | 0.01MB | Small overhead |
| **Total** | **1.4-2.7MB** | **95-97% smaller than 250k hexes** |

---

## Known Constraints & Future Work

- **Elevation accuracy:** Procedural only (Phase 4 TODO)
- **Coastline storage:** Inline JSON (Phase 5 OPTION to extract)
- **Performance:** Ray-casting is O(n vertices) per hex lookup; cacheable
- **Map editing:** Boundary changes require coastline re-export
- **Offline grids:** Subhex detail grids may need their own coastlines (Phase 6)
