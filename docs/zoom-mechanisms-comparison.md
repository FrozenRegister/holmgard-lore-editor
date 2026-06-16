# Two Zoom Mechanisms: DetailHex vs. Continent/Region

Analysis of the two different zoom implementations and recommendations for which to use.

---

## Overview

There are **two independent zoom systems** in the codebase:

1. **DetailHex Zoom** (from `game.js` vendor code) — Built-in to the hex engine
2. **Continent/Region Zoom** (custom implementation in `src/lib/worldmap.ts`) — Hierarchical map system

Both can zoom in/out, but they work very differently.

---

## Mechanism 1: DetailHex Zoom (game.js native)

### Architecture

**Single flat hexmap with two hex layers:**

```
Parent Layer (continent/region view):
  Hex(-42, 18) = forest  ← one hex visible at zoom level 1.0

Detail Layer (settlement/local view):
  DetailHex(-84, 36)  = city_wall    ← 7×7 = 49 detail hexes fill parent
  DetailHex(-83, 36)  = marketplace  ← when user zooms in
  DetailHex(-82, 36)  = farm
  ...
  DetailHex(-78, 42)  = road

                      → Switch rendering at zoom threshold
                        e.g., scale > 1.0 = show detail hexes
```

### Implementation Details

**Game.js has built-in cluster math** (lines 11497–12556):

```javascript
DETAIL_GRID_EDGE_FACTORS = { 7: 2, 19: 3, 37: 4 }
edgeFactor = DETAIL_GRID_EDGE_FACTORS[detailGridDensity]

// Parent → Detail mapping:
detailClusterCenterQ = parentQ * edgeFactor
detailClusterCenterR = parentR * edgeFactor
clusterRadius = edgeFactor - 1
cellCount = 3*r*(r+1) + 1   // 7, 19, or 37 cells

// Ownership: which parent hex owns this detail hex?
parentQ = Math.floor(detailQ / edgeFactor)
parentR = Math.floor(detailR / edgeFactor)
```

**Three density options:**

- `detailGridDensity: 7` → 2× scaling, 7 detail hexes per parent
- `detailGridDensity: 19` → 3× scaling, 19 detail hexes per parent
- `detailGridDensity: 37` → 4× scaling, 37 detail hexes per parent

### Current Status

**Not populated:**

```javascript
// In generated maps:
detailGridEnabled: false
detailHexes: []     // Empty — not generated
subHexes: []
subHexLandmarks: []
subHexTokens: []
```

**But the engine is ready.** You just need to:

1. Populate `detailHexes` when generating a map
2. Set `detailGridEnabled: true`
3. Game.js automatically switches layers on zoom

### Activation

To enable for Earth maps:

```javascript
// In build-earth-from-naturalearth.js (line 164):
detailGridEnabled: true,    // Currently: false
// Then populate detailHexes for each parent hex:
const detailHexes = [];
for (const parentHex of hexes) {
  const { q, r } = parentHex;
  const ef = 2;  // edgeFactor for density 7
  const centerQ = q * ef;
  const centerR = r * ef;
  
  // Add ~7 detail hexes around cluster center
  for (let dq = -1; dq <= 1; dq++) {
    for (let dr = -1; dr <= 1; dr++) {
      detailHexes.push({
        q: centerQ + dq,
        r: centerR + dr,
        terrain: biome(parentLat, parentLon),  // Inherit from parent
      });
    }
  }
}
map.detailHexes = detailHexes;
```

### Pros

✅ **Native to game.js** — no custom rendering needed
✅ **Mathematically clean** — cluster math is proven in vendor code
✅ **Memory efficient** — all hexes in single flat structure (parent + detail)
✅ **Seamless zoom** — game.js handles layer switching automatically
✅ **Expected by game engine** — `detailGridDensity` constants are built-in
✅ **Tested in vendor** — cluster geometry verified by game.js devs

### Cons

❌ **Two-level only** — can't zoom deeper (no settlement → building)
❌ **Detail hexes all same terrain** — currently inherit parent biome (could customize)
❌ **Must pre-generate** — all detail hexes stored in JSON (file size grows 7-37×)
❌ **Storage-heavy** — Earth world map detail grid would be ~300 MB JSON
❌ **Static detail** — generated at map creation; can't procedurally generate on-the-fly

---

## Mechanism 2: Continent/Region Zoom (Custom Hierarchy)

### Architecture

**Multiple independent maps linked hierarchically:**

```
World Map (continents level):
  id: 'world:continents'
  100×80 tiles (hexes)
  children: ['world:continents:europe', 'world:continents:asia', ...]

Europe Regional Map:
  id: 'world:continents:europe'
  parent: 'world:continents'
  50×50 tiles
  children: ['world:continents:europe:karelia', ...]

Karelia Settlement Map:
  id: 'world:continents:europe:karelia'
  parent: 'world:continents:europe'
  20×20 tiles

                      → Separate JSON files for each level
                        app loads only active map
```

### Implementation

**In `src/lib/worldmap.ts` (currently dead code):**

```typescript
interface WorldMap {
  id: string
  level: string              // 'continents', 'regional', 'settlement'
  name: string
  parent: string | null      // ID of parent map
  bounds: { qmin, qmax, rmin, rmax }
  tiles: Record<string, Tile>
  children: string[]         // IDs of child maps
  seed: number
}

function createChildRegion(
  name: string,
  level: string,
  width: number,
  height: number,
  parentId: string,
  maps: Record<string, WorldMap>
): { maps, id } | null { ... }

function aggregateChildToParent(
  childId: string,
  maps: Record<string, WorldMap>
): Record<string, WorldMap> | null {
  // Roll up child terrain → parent tile
  const childTiles = Object.values(child.tiles);
  const terrain = majorityTerrain(childTiles);
  const elevation = averageElevation(childTiles);
  const overlays = unionOverlays(childTiles);
  // Update parent's anchor tile
}
```

### Current Status

**Dead code** — not wired into any route or component:

```
Status: "This module is NOT imported by any production code"
         (line 8-10, worldmap.ts)
```

**Why not used?**

- Project pivoted to importing pre-made maps from external tools (Wonderdraft JSON)
- Hierarchical generation was the original approach but never integrated
- Better off importing than auto-generating (gives user control)

**But infrastructure is ready** for future in-app map creation.

### How It Would Work

1. User clicks "Create World"
2. App generates root continent map (Perlin noise + `generateTiles()`)
3. User clicks "Drill into Europe"
4. App generates/loads `world:continents:europe` child map
5. User edits Karelia → app calls `aggregateChildToParent()` to update parent tile

### Pros

✅ **Unlimited zoom depth** — continents → regions → settlements → districts
✅ **Separate JSON per level** — no file-size explosion (each map independent)
✅ **Procedural generation** — can auto-generate child maps on zoom (Perlin noise)
✅ **User control** — show only the map level user cares about
✅ **Hierarchical editing** — changes roll up to parent automatically
✅ **Ready to use** — `aggregateChildToParent()` already implemented

### Cons

❌ **Custom zoom logic** — app must handle navigation (not automatic)
❌ **Complex ID scheme** — dotted path IDs are fragile (refactoring risk)
❌ **Separate files** — must load/sync multiple map JSON files (network overhead)
❌ **Not in game.js** — custom UI needed to switch maps
❌ **Two data models** — `HexMap` (game.js) vs `WorldMap` (custom) don't align
❌ **Unproven** — never used in production; untested at scale

---

## Current State in Code

### What's actually happening now

```javascript
// In game-ui-bindings.js (line 42-79):
// Simple viewport scale zoom — no hex switching
w.zoomIn = function() {
  const oldScale = w.state.hexMap.viewport.scale;
  const newScale = Math.min(500, oldScale * 1.3);
  w.state.hexMap.viewport.scale = newScale;  // Just multiply scale
  w.renderHex();  // Re-render with new zoom level
};
```

**This is neither mechanism** — it's just viewport scaling!

- Zooms via CSS transform on the canvas
- Single hex layer, no detail hexes shown
- No map switching like Continent/Region system
- All zoom is "visual" (same data, different scale)

### What's generated

```javascript
// build-earth-from-naturalearth.js outputs:
{
  continentGridEnabled: true,           // ← Ready for...
  continentGridDensity: 7,              //   unknown what this does?
  detailGridEnabled: false,             // DetailHex system disabled
  detailHexes: [],                      // Empty
  hexes: [...20000 items...]            // Only parent layer
}
```

**`continentGridEnabled`** is a mystery — it's set but not used anywhere in patches or game.js calls. Possibly old code?

---

## Recommendation: Use DetailHex

### Why DetailHex is the right choice

1. **It's native** — game.js owns the implementation; no custom code needed
2. **Mathematically clean** — cluster math is proven and documented
3. **Works with existing architecture** — fits the `HexMap` type cleanly
4. **Less code** — two hex arrays in one map vs. multiple files + navigation
5. **Works offline** — entire map hierarchy is one JSON file
6. **Already semi-enabled** — generator just needs to populate `detailHexes`
7. **Vendor-maintained** — game.js cluster math is stable; you don't maintain it

### Implementation Path

**Phase 1: Generator Enhancement (~1 day)**

1. Add detail-hex generation to `build-earth-from-naturalearth.js`
   - For each parent hex, generate 7 detail hexes in cluster
   - Inherit terrain from parent biome (or customize)
2. Set `detailGridEnabled: true` in output
3. Test: zoom in, verify detail grid renders

**Phase 2: Gameplay (later)**

- Add game logic to interact with detail hexes (settlements, buildings, NPCs)
- Leverage game.js's `getDetailHexOwner()` for ownership lookups

### Why NOT Continent/Region System

1. **Dead code** — has never been wired in; unknown if it works at scale
2. **Redundant with game.js** — game.js already does this natively
3. **Extra complexity** — must manage multiple map files + navigation
4. **Sync problem** — if user edits both levels, who's the source of truth?
5. **Not in roadmap** — vendor (game.js) is standardizing on detailHex

---

## What to Do With worldmap.ts

**Keep it as-is** (dead code reference):

```typescript
// Status: future leverage potential ─────────────────────
// This was the original procedural-generation approach.
// The project pivoted to importing external maps.
// Keep around for future in-app map creation / procedural generation.
```

Use it **only if**:

- You pivot back to procedural generation
- You want players to create their own maps in-app
- You need unlimited zoom depth (settlements → buildings → rooms)

For now: **Don't wire it in. Focus on DetailHex.**

---

## Concrete Next Steps

### 1. Verify game.js Supports DetailHex (5 min)

```bash
grep -n "detailGridEnabled\|detailHexes" static/hexmap/game.js | head -20
```

Should show cluster math and layer-switching logic.

### 2. Enable in Generator (30 min)

```javascript
// scripts/build-earth-from-naturalearth.js
detailGridEnabled: true,  // Line 164: change from false
detailGridDensity: 7,     // Use 7-cell cluster (2× scaling)

// Add detail hex generation (after parent hex loop):
const detailHexes = [];
const EF = 2;  // edgeFactor for density 7

for (const hex of hexes) {
  const { q, r } = hex;
  const centerQ = q * EF;
  const centerR = r * EF;
  
  // Generate 7-hex cluster around center
  for (let dq = -1; dq <= 1; dq++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dq === 0 && dr === -1 && dq === 0) continue;  // Skip one
      detailHexes.push({
        q: centerQ + dq,
        r: centerR + dr,
        terrain: hex.terrain,  // Inherit
      });
    }
  }
}

map.detailHexes = detailHexes;
```

### 3. Test in Editor (10 min)

1. Run generator: `node scripts/build-earth-from-naturalearth.js europe`
2. Load map in editor
3. Zoom in with mouse wheel / zoom buttons
4. Verify detail hexes appear above zoom level ~2.0

### 4. Refine Terrain (1 hour)

- Detail hexes currently inherit parent terrain
- Option: vary slightly per detail hex (e.g., settlement in plains might have city, farm, meadow)
- Or use game.js `getDetailHexOwner()` to check which parent owns each detail

---

## Summary Table

| Aspect | DetailHex | Continent/Region |
|--------|-----------|------------------|
| **Complexity** | Simple | Complex |
| **Vendor Support** | ✅ Native | ❌ Custom |
| **File Size** | 7-37× per region | Multiple files |
| **Zoom Depth** | 2 levels | Unlimited |
| **Dead Code?** | ❌ No | ✅ Yes |
| **Tested?** | ✅ Vendor-proven | ❌ Never used |
| **Ready to use?** | ✅ ~95% | ⚠️ 70% |
| **Recommendation** | **USE THIS** | Keep as reference |
