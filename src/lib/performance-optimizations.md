# Performance Optimizations (June 2026)

**Status: IMPLEMENTED**

This document details the optimizations applied to the Holmgard Lore Editor to ensure scalability as map sizes and lore libraries grow. 

## 1. Algorithmic Optimization: A* Pathfinding
**Problem:** The original A* implementation sorted the entire `open` set on every iteration ($O(N \log N)$), causing significant lag on large maps.
**Solution:** 
- Replaced the global sort with a linear scan to find the best node ($O(N)$). 
- For typical hex map sizes, this provides a major reduction in CPU overhead without the complexity of a full Binary Heap.
- Location: `src/lib/mapTools.ts` -> `findPath()`.

## 2. AI Agent Concurrency: Parallel Tool Execution
**Problem:** The Claude agent executed tool calls sequentially. If the model requested three different topics or map lookups, they would queue and block the UI response.
**Solution:**
- Replaced the sequential `for...of` loop in the agentic loop with `Promise.all`.
- Multiple tool requests are now dispatched simultaneously, significantly reducing "thought time" in chat interactions.
- Location: `src/lib/claude.ts` -> `streamChat()`.

## 3. Database Layer: Spatial Indexing & Batch Operations
**Problem:** Spatial queries were performing "ribbon scans" (fetching all rows for a `q` range and filtering `r` in JS). Deletion and ingestion were performing row-by-row operations.
**Solution:**
- **Compound Indexing:** Implemented `['mapId', 'q', 'r']` compound index to allow the IndexedDB engine to perform 2D spatial culling natively.
- **Global Indexing:** Added a global `linkedLoreKey` index on landmarks to avoid full-table scans when finding landmarks associated with a lore entry.
- **Native Counting:** Switched from `getAllKeys().length` to native `.count()` for statistics.
- **Range Deletes:** Replaced key-looping deletes with native IDB range deletes (`db.delete(store, range)`), offloading the cleanup work to the database engine.
- **DB Version:** Incremented to `4`.
- Location: `src/lib/mapDb.ts`, `src/lib/mapIngest.ts`.

## 4. Procedural Terrain: Spatial Culling & Memoization
**Problem:** `isInsideCoastline` performed expensive ray-casting math for every hex during map renders, causing frame drops during panning/zooming.
**Solution:**
- **Bounding Box (BBox) Pre-check:** Added rectangular bounds checks for all GeoJSON features. If a hex is outside the box, the ray-casting math is skipped ($O(1)$ rejection).
- **Result Memoization:** Implemented a module-level `COASTLINE_CACHE` (`Map<string, boolean>`) to store results for discrete (q, r, scale) tuples.
- **Memory Management:** 
    - Added a 10,000 entry eviction policy (cache clears when full) to prevent long-running memory leaks.
    - Integrated `clearCoastlineCache()` into `mapIngest.ts` to ensure fresh data after imports.
- Location: `src/lib/hexmap-utils.ts`, `src/lib/mapIngest.ts`.

## 5. Verification & Tests
The following test suites verify these optimizations:

### Hex Map Utilities (`src/lib/__tests__/hexmap-utils.test.ts`)
- **Cache behavior:** Verifies manual clearing.
- **Eviction policy:** Verifies that hitting `MAX_CACHE_SIZE` triggers a safety clear without crashing.

### Database layer (`src/lib/__tests__/mapDb.test.ts`)
- Verifies that spatial radius queries return accurate results using the new compound index.
- Verifies that global lore-key lookups correctly identify landmarks across different map IDs.

## AI Agent Implementation Prompt
*When resuming work or handing this off to a new agent, provide this summary:*

> The Holmgard Lore Editor is optimized for high-performance hex map rendering and AI interactions. 
> 1. Use the `by-map-q-r` compound index in `mapDb.ts` for any spatial coordinate queries.
> 2. Prefer native IndexedDB `count()` and range `delete()` methods over JS-side filtering.
> 3. When modifying terrain generation, maintain the `COASTLINE_CACHE` logic in `hexmap-utils.ts` and ensure `clearCoastlineCache` is called if the underlying geometry changes.
> 4. Tool calls in `claude.ts` should remain parallelized via `Promise.all` to maintain UI responsiveness.
> 5. A* pathfinding is currently O(N) selection-based; if maps exceed 10,000 nodes, consider upgrading the `open` set to a `BinaryHeap`.

---
*Last Updated: 2026-06-06*