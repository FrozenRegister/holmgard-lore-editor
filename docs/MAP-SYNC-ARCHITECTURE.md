# Map Sync Architecture: Push & Readback

**Status:** Planning (push implemented, readback in progress)  
**Branches:** `claude/holmgard-d1-readback-0p3b5t` (both repos)

---

## Quick Overview

The hex map editor syncs map data (hexes & landmarks) to a Cloudflare Worker backend using D1 database storage. **Currently:** client → worker (write-only). **Target:** bidirectional sync, enabling cold-start loads and conflict resolution.

---

## Current Architecture (Push-Only)

```
┌─────────────────────┐
│  Holmgard Lore Editor
│  (SvelteKit + Tauri) │
└──────────┬──────────┘
           │
           │ POST /admin/map/push-{hexes,landmarks}
           │ (mapSync.ts → pushMapToWorker)
           │
           ▼
┌──────────────────────────┐
│ Holmgard Lore Worker     │
│ (Cloudflare Workers)     │
│ ├─ src/admin/routes.ts   │
│ └─ RPG_DB (D1)           │
└──────────┬───────────────┘
           │
           ▼ Upsert
┌──────────────────────────┐
│ D1 Database              │
│ ├─ hexes (q, r, terrain, │
│ │  label, data)          │
│ └─ landmarks (id, name,  │
│    category, data)       │
└──────────────────────────┘
```

### Current Flow
1. User edits hex/landmark in editor
2. Changes saved to IndexedDB (mapDb)
3. User clicks "Push to Cloud" (or auto-sync)
4. `mapSync.ts` batches hexes/landmarks
5. POST to `/admin/map/push-hexes` & `/admin/map/push-landmarks`
6. Worker upserts into D1

**Limitation:** No way to pull data back; client is read-only from D1.

---

## Target Architecture (Bidirectional)

```
┌─────────────────────┐
│  Holmgard Lore Editor
│  ├─ mapSync.ts      │
│  │  ├─ push         │ ← Existing
│  │  └─ pull (NEW)   │ ← New
│  └─ mapDb (IndexedDB)
└──────────┬──────────┘
           │
      ┌────┴────────────────────────┐
      │                             │
      │ POST /admin/map/...         │ POST /mcp  (get_map_*)
      │ (write, ADMIN_SECRET)       │ (read, JSON-RPC)
      │                             │
      ▼                             ▼
┌──────────────────────────────────────────┐
│ Holmgard Lore Worker                     │
│ ├─ src/admin/routes.ts  (REST writes)    │
│ │  ├─ POST /admin/map/push-hexes         │ ← Existing
│ │  └─ POST /admin/map/push-landmarks     │ ← Existing
│ ├─ src/tools/map.ts     (MCP reads)      │
│ │  └─ get_map_hexes / _landmarks / _meta │ ← New (/mcp)
│ └─ RPG_DB (D1)                           │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────┐
│ D1 Database              │
│ (persistent state)       │
└──────────────────────────┘
```

### New Flow (Cold Start / Readback)
1. User launches editor
2. Editor checks IndexedDB for maps; if empty:
   - Calls `pullMapFromWorker(mapId)` (mapSync.ts)
3. Worker `/mcp` methods `get_map_hexes` + `get_map_landmarks`
4. Convert D1 rows → client types
5. Write to IndexedDB (mapDb)
6. Render in editor

### Conflict Resolution
When local changes & remote state differ:
1. Fetch remote hexes/landmarks
2. Compare with local IndexedDB
3. Detect differences (via ConflictResolver mechanism)
4. Show conflict UI, let user choose:
   - **Local wins:** keep local, discard remote
   - **Remote wins:** replace local with remote
   - **Merge:** combine (if supported)
5. Sync decision back to worker (if local was chosen)

---

## Implementation Roadmap

### Phase 1: Worker MCP Read Methods ⬅️ **Start here**
**Location:** `holmgard-lore-mcp/docs/d1-readback-api-design.md`

**Deliverables:**
1. `get_map_hexes` — fetch all hexes for a map
2. `get_map_landmarks` — fetch all landmarks
3. `get_map_meta` — counts + lastUpdated
4. Conversion helpers (D1 rows → client types)
5. Registered as `tools/call` tools **and** bare JSON-RPC methods
6. Tests (vitest + miniflare, both suites)

**Effort:** ~2–3 hours  
**Blockers:** None  
**Files:** `holmgard-lore-mcp/src/tools/map.ts` (new), `/mcp` dispatch wiring, tests

**Key Decisions:**
- Start with **full fetch** (Strategy A), not pagination/delta (Phases 2+)
- Handle field mapping: `label` → `name`, `category` → `type`, unpack JSON `data`

---

### Phase 2: Type Alignment & Schema Refinement
**Location:** `holmgard-lore-editor/docs/d1-readback-plan.md` (Section: "Open Questions")

**Blockers:**
1. Clarify which Landmark fields are persistent vs. UI-only
2. Decide on elevation field (add to D1 or drop?)
3. Update D1 schema if needed (new migration)

**Deliverables:**
1. Document field classification (persistent/transient)
2. Update D1 schema if needed
3. Create conversion helpers (both directions)
4. Update client types if needed

**Effort:** 2–4 hours (depends on scope of schema changes)  
**Files:** `src/lib/map-conversion.ts` (both repos), migrations, type updates

---

### Phase 3: Client Readback Logic
**Location:** `holmgard-lore-editor/docs/d1-readback-plan.md` (Section: "Phase 3")

**Deliverables:**
1. `pullMapFromWorker(mapId)` in mapSync.ts
2. IndexedDB write logic (using mapDb API)
3. Conflict detection & resolution integration
4. UI: sync button, progress indicator, conflict UI
5. Tests (vitest + jsdom)

**Effort:** 3–4 hours  
**Files:** `src/lib/mapSync.ts`, UI components, tests

---

### Phase 4: Tests & Documentation
**Deliverables:**
1. End-to-end test suite (worker → client → IndexedDB)
2. Live smoke tests
3. User guide update

**Effort:** 2–3 hours

---

## Data Model: Field Mapping

### Hexes

**D1 Table:**
```sql
hexes (q, r, map_id, terrain, label, data, updated_at)
where data = { "description": "..." }
```

**Client Type (HexRecord):**
```typescript
{
  mapId: string
  q, r: number
  terrain: string
  name: string
  description: string
}
```

**Mapping:**
| D1 | Client | Note |
|---|---|---|
| `q, r, map_id` | `q, r, mapId` | Direct mapping |
| `terrain` | `terrain` | Direct |
| `label` | `name` | **Rename** |
| `data.description` | `description` | **Extract from JSON** |

### Landmarks

**D1 Table:**
```sql
landmarks (id, map_id, q, r, name, category, data, updated_at)
where data = {
  "notes": "...",
  "attributes": {...},
  "linkedMapId": "...",
  "visible": true,
  "linkedLoreKey": "..."
}
```

**Client Type (LandmarkRecord):**
```typescript
{
  mapId: string
  id: string
  q, r: number
  name: string
  type: string
  notes: string
  attributes: string // JSON.stringify
  linkedMapId: string | null
  visible: boolean
  linkedLoreKey: string | null
}
```

**Mapping:**
| D1 | Client | Note |
|---|---|---|
| `id` | `id` | Direct |
| `map_id` | `mapId` | Direct |
| `q, r` | `q, r` | Direct |
| `name` | `name` | Direct |
| `category` | `type` | **Rename** |
| `data.notes` | `notes` | **Extract from JSON** |
| `data.attributes` | `attributes` | **Extract & stringify** |
| `data.linkedMapId` | `linkedMapId` | **Extract from JSON** |
| `data.visible` | `visible` | **Extract from JSON** |
| `data.linkedLoreKey` | `linkedLoreKey` | **Extract from JSON** |

**Note:** The richer `Landmark` type (types.ts) has 40+ fields. Most are UI-only (styling, positioning). TBD which belong in D1.

---

## Conflict Resolution

**Mechanism:** Reuse existing `ConflictResolver.svelte` pattern (used for lore topics).

**Scenario:** Local uncommitted changes on a hex/landmark; remote state differs.

**Flow:**
1. Fetch remote via `/mcp` `get_map_hexes` + `get_map_landmarks`
2. Compare with local IndexedDB
3. Identify conflicts (rows with different data)
4. Add to `conflictQueue` store
5. Show conflict UI (existing mechanism):
   - Display local vs. remote side-by-side
   - User chooses local/remote/merge
6. Apply resolution, update IndexedDB
7. Sync back to worker if local was chosen

**No new mechanism needed** — reuse conflict resolver.

---

## Cloudflare Billing & Performance

### D1 Read Costs
- Each read method = 1–2 D1 reads (fetch hexes, fetch landmarks)
- Typical map: negligible cost (<$0.0001 per sync)
- Scale: 1,000 users, daily sync = ~$0.02/day total

### Strategies (Future)
1. **Full Fetch** (Phase 1): Simple, no pagination
2. **Pagination** (Phase 2): Split large maps, reduce per-request payload
3. **Delta Sync** (Phase 3): Only fetch `updated_at` > timestamp, minimal cost

**Recommendation:** Start with full fetch; optimize if needed.

---

## Testing Strategy

### Worker Tests
- ✅ `/mcp` read methods return correct data
- ✅ D1 → client type conversion
- ✅ Error handling (missing map, D1 unavailable)
- ✅ Large payloads (1000+ hexes/landmarks)
- ✅ Existing push tests continue to pass

### Client Tests
- ✅ `pullMapFromWorker()` parses response
- ✅ Fetched data written to IndexedDB
- ✅ Conflict detection works
- ✅ Graceful failure on network error
- ✅ Existing push tests continue to pass

### Integration Tests
- ✅ Cold start: fetch → populate → render
- ✅ Divergence: local edits + remote push → conflicts surface
- ✅ Round-trip: push hexes → pull back → data matches

---

## Success Criteria

- ✅ Worker `/mcp` read methods implemented & tested
- ✅ Client can pull & populate IndexedDB
- ✅ Conflicts integrate with existing UI
- ✅ Test coverage >80% for new code
- ✅ No performance regression
- ✅ Minimal Cloudflare D1 billing (<$1/month)
- ✅ Documentation complete

---

## Open Questions (To Be Decided)

### 1. Landmark Field Classification
**Question:** Which Landmark fields are persistent vs. UI-only?  
**Status:** Unknown  
**Impact:** Determines D1 schema & conversion complexity  
**Action:** Review editor UI code; document findings in Phase 2

### 2. Elevation Field
**Question:** Is `Hex.elevation` used? Should it be in D1?  
**Status:** Unknown  
**Impact:** May require schema migration  
**Action:** Clarify during Phase 2

### 3. Sync Trigger Strategy
**Question:** When should readback happen?
- On startup (cold start)?
- Periodic background sync?
- Manual button only?
- After every push?

**Decision:** TBD in Phase 3

---

## Related Documentation

- **Editor-side plan:** `holmgard-lore-editor/docs/d1-readback-plan.md`
- **Worker-side spec:** `holmgard-lore-mcp/docs/d1-readback-api-design.md`
- **Current sync code:** `holmgard-lore-editor/src/lib/mapSync.ts`
- **Current push tests:** `holmgard-lore-mcp/src/__tests__/admin-map.test.ts`
- **D1 schema:** `holmgard-lore-mcp/schema/rpg-schema.sql` (lines 842–866)
- **Worker routes:** `holmgard-lore-mcp/src/admin/routes.ts` (lines 535–658)

---

## Summary

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|---|
| 1 | Worker `/mcp` read methods | 2–3 hrs | None |
| 2 | Type alignment, schema refinement | 2–4 hrs | Phase 1 complete; field classification decisions |
| 3 | Client readback logic, UI | 3–4 hrs | Phase 2 complete |
| 4 | Tests, docs | 2–3 hrs | Phase 3 complete |
| **Total** | | **9–14 hrs** | |

---

**Next Step:** Proceed with Phase 1 implementation per `holmgard-lore-mcp/docs/d1-readback-api-design.md`.
