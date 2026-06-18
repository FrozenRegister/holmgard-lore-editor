# D1 Readback Implementation Plan

**Status:** Planning phase  
**Scope:** Enable the client to read map data (hexes & landmarks) back from the Cloudflare D1 database  
**Branches:** Both repos use `claude/holmgard-d1-readback-0p3b5t`

---

## Overview

Currently, `mapSync.ts` only **pushes** map data to the worker; the client has no way to **pull** it back from D1. This blocks:
- Cold-start sync (loading map on fresh install or new device)
- Remote-first workflows
- Conflict resolution when local & remote states diverge

This plan outlines a phased approach to add map read methods to the worker's `/mcp` JSON-RPC surface and readback logic to the client.

---

## Current Architecture

### Client Types (mapDb.ts & types.ts)

**HexRecord** (local storage):
```typescript
{
  mapId: string
  q, r: number
  terrain: string
  name: string
  description: string
}
```

**LandmarkRecord** (local storage):
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

**Landmark** (rich UI type, types.ts):
```typescript
{
  id, name, type, q, r, style, icon, color, showLabel, labelPosition, size,
  hideTerrainIcon, attributes, notes, visible, gridLevel, created,
  detailAnchorDQ, detailAnchorDR, detailDisplayMode, linkedMapId,
  linkedMapName, linkedMapType, iconColor, isDungeonObject,
  linkedMapThumbnailUrl, iconScale, iconOffsetX, iconOffsetY,
  allowIconOverflow, typeId, variantId, appearanceMode, labelFontSize
}
```

**Hex** (types.ts):
```typescript
{
  q, r, terrain, elevation?, name, description, type?, region?, lat?, lon?
}
```

### D1 Schema

**hexes:**
```sql
CREATE TABLE hexes (
  q, r, map_id,
  terrain, label, data (JSON: {description}), updated_at,
  PRIMARY KEY (q, r, map_id)
)
```

**landmarks:**
```sql
CREATE TABLE landmarks (
  id,
  map_id, q, r, name, category,
  data (JSON: {notes, attributes, linkedMapId, visible, linkedLoreKey}),
  updated_at,
  PRIMARY KEY (id)
)
```

### Worker Surface (Current + Planned)

**Transport split (matches the existing lore sync):** reads go through `POST /mcp`
(JSON-RPC, same as `get_lore`/`list_topics`); privileged writes stay on REST
`/admin/*` gated by `ADMIN_SECRET`. See the worker repo's
`docs/d1-readback-api-design.md` → *Transport decision* for the full rationale.

| Operation | Surface | Status |
|-----------|---------|--------|
| Setup schema | `POST /admin/map/setup-db` (REST, secret) | ✅ |
| Push hexes | `POST /admin/map/push-hexes` (REST, secret) | ✅ |
| Push landmarks | `POST /admin/map/push-landmarks` (REST, secret) | ✅ |
| Read hexes | `POST /mcp` method `get_map_hexes` | ❌ |
| Read landmarks | `POST /mcp` method `get_map_landmarks` | ❌ |
| Read metadata | `POST /mcp` method `get_map_meta` | ❌ |

> **Earlier draft note:** an initial version of this plan proposed
> `GET /map/{mapId}/...` REST routes for reads. That was changed to MCP methods
> to match the codebase convention (reads → `/mcp`, privileged writes → `/admin/*`)
> and to reuse the client's existing `rpc()` transport with zero new plumbing.
> The read methods return **structured JSON in `result`** (bare-method style, like
> `get_lore`) so bulk sync doesn't parse content-block text.

---

## Open Questions

### 1. Field Classification: Persistent vs. UI-Only

**Status:** Unknown  
**Impact:** Determines D1 schema, conversion logic, and readback complexity  

The `Landmark` type (types.ts) has 40+ fields. Which belong in D1?

| Field | Current Guess | Needs Verification |
|-------|---|---|
| `id, name, type, q, r, notes, attributes, linkedMapId, visible, linkedLoreKey` | Persistent | ✅ In D1 |
| `style, icon, color, showLabel, labelPosition, size, hideTerrainIcon` | UI-rendering state? | ❓ Clarify |
| `gridLevel, created, detailAnchorDQ, detailAnchorDR, detailDisplayMode` | UI layout? | ❓ Clarify |
| `linkedMapName, linkedMapType, iconColor, isDungeonObject, linkedMapThumbnailUrl` | Derived from lookup? | ❓ Clarify |
| `iconScale, iconOffsetX, iconOffsetY, allowIconOverflow` | Rendering config? | ❓ Clarify |
| `typeId, variantId, appearanceMode, labelFontSize` | UI defaults? | ❓ Clarify |

**Action:** Before Phase 2, review the editor UI code to determine which fields are:
- **Persistent:** Must survive roundtrip to D1 and back
- **Derived:** Computed from persistent fields (e.g., `linkedMapName` from `linkedMapId` lookup)
- **Transient:** UI-only state, not synced (e.g., current selection, view mode)

### 2. Elevation Field

**Status:** Unknown  
**Impact:** May require D1 schema update; affects `Hex` type  

- `Hex.elevation` is optional in types.ts
- D1 hexes table does not store it
- **Question:** Is elevation actively used in the editor, or is it a legacy field?
- **Decision needed:** Add to D1 or drop from types?

### 3. Existing Conflict Resolution Mechanism

**Status:** Known  
**Implementation:** `ConflictResolver.svelte` in the lore editor  
**Behavior:** Identifies conflicts (local vs. remote), surfaces to user for manual resolution  

**For map readback:**
- If local uncommitted hexes/landmarks exist, and remote differs, trigger conflict UI
- Let user choose: local-wins, remote-wins, or merge
- Apply resolution, sync result back to worker if needed

---

## Cloudflare D1 Billing & Performance Considerations

### D1 Pricing Model
- **Reads & writes:** Counted per statement (not per row)
- **Batch operations:** Single statement with multiple rows = 1 charge (efficient)
- **Sequential queries:** N statements = N charges (expensive)

### Readback Strategies

#### Strategy A: Full Fetch (Simple, High Latency)
```
get_map_hexes     { mapId } → SELECT * FROM hexes WHERE map_id = ?
get_map_landmarks { mapId } → SELECT * FROM landmarks WHERE map_id = ?
```
- **Cost:** 2 D1 reads per full sync
- **Latency:** Single roundtrip per table
- **Use case:** Cold-start, occasional manual sync, small maps
- **Concern:** If maps have thousands of hexes/landmarks, payload size & transfer time grows

#### Strategy B: Pagination (Balanced, Medium Cost)
```
get_map_hexes { mapId, limit: 500, cursor: "abc" }
```
- **Cost:** 1+ D1 reads (N reads for large maps, where N = ceil(rowcount / limit))
- **Latency:** Multiple roundtrips
- **Use case:** Large maps, avoid massive single transfer
- **Benefit:** Client can show progress, resume interrupted syncs

#### Strategy C: Delta Sync (Efficient, Complex)
```
get_map_hexes { mapId, since: "2025-01-15T10:00:00Z" }
```
- **Cost:** 1 D1 read per sync (only changed rows)
- **Latency:** Fast after first full fetch
- **Use case:** Periodic background sync, bandwidth-sensitive
- **Complexity:** Must track `updated_at` on each row; handle deletes separately

#### Strategy D: Hybrid (Recommended)
- **First load:** Full fetch (Strategy A), cache locally
- **Periodic sync:** Delta check (Strategy C) to fetch only changes
- **Manual sync button:** User chooses full or delta
- **Billing impact:** Minimal; N small reads (delta) vs. 1 large read (full)

### Recommendation
- **Start with:** Strategy A (full fetch) — simplest, no D1 added complexity
- **Monitor:** If maps grow large or users report slowness, upgrade to Strategy D
- **Cost expectation:** ~2 D1 reads per full sync; negligible for typical usage (<10M monthly ops)

---

## Phased Implementation

### Phase 1: Worker MCP Read Methods

**Goal:** Add map read methods to the `/mcp` JSON-RPC surface
**Deliverables:**
1. `get_map_hexes` — fetch all hexes for a map
2. `get_map_landmarks` — fetch all landmarks
3. `get_map_meta` — counts + lastUpdated (cheap precheck)

**Key Details:**
- Register each as a `tools/call` tool (discoverable via `tools/list`) **and** a
  bare JSON-RPC method, mirroring `get_lore` / `list_topics`.
- Bare method returns the structured payload directly in `result`
  (`{ mapId, hexes/landmarks, count, lastUpdated }`); `tools/call` returns the
  standard content-block + `metadata` envelope for agent use.
- Use **Strategy A** (full fetch) initially.
- Convert D1 rows to client types (handle `label` → `name`, `category` → `type`, unpack JSON `data`).
- Errors via JSON-RPC, not HTTP status. Empty map → empty array, not an error.

**Files to modify (worker repo):**
- `src/tools/map.ts` (new) — `handle_get_map_hexes/landmarks/meta` + conversion helpers
- `src/index.ts` / `src/lib/rpc.ts` — register tool dispatch + bare-method aliases
- `toolDefinitions` — advertise the three tools with input schemas
- `src/__tests__/*` (workers) **and** `tests/live/*` — both suites (repo policy)
- `CHANGELOG.md` + `CLAUDE.md` tool count (15 → 18)

**Full spec:** `holmgard-lore-mcp/docs/d1-readback-api-design.md`

**Estimated effort:** ~2–3 hours (handlers + dispatch + tests)

### Phase 2: Type Alignment & Schema Refinement

**Goal:** Clarify persistent vs. UI-only fields; update schema if needed  
**Blockers:** Answers to open questions (above)  
**Deliverables:**
1. Document which `Landmark` fields are persistent (add to this plan)
2. Decide on `elevation` field
3. Create conversion helpers in `src/lib/map-conversion.ts` (both repos):
   - `hexFromD1(row)` — D1 → `HexRecord`
   - `landmarkFromD1(row)` — D1 → `LandmarkRecord`
   - `hexToD1(record)` — `HexRecord` → D1 params
   - `landmarkToD1(record)` → D1 params
4. Update D1 schema if needed (add migration)
5. Update client types if needed (remove transient fields)

**Estimated effort:** 2–4 hours (depends on scope of changes)

### Phase 3: Client Readback Logic

**Goal:** Client can pull map data from worker into IndexedDB  
**Deliverables:**
1. Add `pullMapFromWorker(mapId)` to `mapSync.ts`
2. Sync fetched data into IndexedDB via `mapDb` API
3. Update `MapMeta.syncedAt` timestamp
4. Integrate with existing conflict mechanism (if local changes exist, surface conflict UI)
5. Add manual sync button to UI (or auto-sync on startup)

**Files to modify:**
- `holmgard-lore-editor/src/lib/mapSync.ts` — add pull logic
- `holmgard-lore-editor/src/lib/mapDb.ts` — add bulk insert/upsert if needed
- `holmgard-lore-editor/src/routes/...` — UI integration (button, status, conflicts)
- `holmgard-lore-editor/src/lib/__tests__/mapSync.test.ts` — tests

**Estimated effort:** 3–4 hours (logic + UI + tests)

### Phase 4: Tests & Documentation

**Goal:** Ensure readback works end-to-end; update user docs  
**Deliverables:**
1. Worker test suite: `/mcp` read-method tests (with various map sizes)
2. Client test suite: readback → IndexedDB, conflict handling
3. Live smoke test (if applicable)
4. Update user guide with readback workflow

**Estimated effort:** 2–3 hours

---

## Conflict Strategy

**Mechanism:** Use existing `ConflictResolver.svelte` pattern  

**Scenario:** User clicks "Sync from Remote", but local IndexedDB has uncommitted changes on the same hex/landmark.

**Flow:**
1. Fetch remote hexes/landmarks via `/mcp` (`get_map_hexes`, `get_map_landmarks`)
2. Compare with local IndexedDB
3. If any conflicts detected:
   - Add to `conflictQueue` store (like lore conflicts)
   - Show conflict UI, let user choose local/remote/merge
4. Apply resolution, update IndexedDB
5. Update `MapMeta.syncedAt`; if local won, push back via REST `/admin/map/push-*`

**No new conflict mechanism needed** — reuse the existing one.

---

## Testing Strategy

### Worker Tests (vitest + miniflare)
- `/mcp` read methods return correct `result` shape
- D1 → client type conversion handles all field mappings
- Error cases (missing map, malformed data, auth failure)
- Large payload handling (1000+ hexes/landmarks)

### Client Tests (vitest + jsdom)
- `pullMapFromWorker()` parses response correctly
- Fetched data written to IndexedDB
- `MapMeta.syncedAt` updated
- Conflict detection works
- Graceful failure on network error

### Integration Tests
- Cold-start: new user pulls map → loads in editor
- Divergence: local edits + remote push → conflicts surface
- Round-trip: push hexes → pull back → data matches

---

## Future Enhancements (Out of Scope)

1. **Pagination/Delta Sync:** Implement Strategy B or D if maps become large
2. **Auto-sync:** Background polling for remote changes
3. **Offline-first:** Work offline, sync on reconnect (like lore sync queue)
4. **Multi-device:** Sync map state across devices (tablet + desktop)
5. **Collaborative editing:** Real-time hex/landmark edits (requires WebSocket or polling)

---

## Success Criteria

- ✅ Worker `/mcp` read methods return correct hexes/landmarks
- ✅ Client can pull map data and populate IndexedDB
- ✅ Conflict resolution integrates with existing UI
- ✅ Test coverage >80% for new code
- ✅ No performance regression on existing features
- ✅ Cloudflare D1 billing remains minimal (<$1/month for typical usage)

---

## References

- **Existing conflict mechanism:** `src/lib/sync.ts`, `ConflictResolver.svelte`
- **Current push logic:** `src/lib/mapSync.ts` (pushMapToWorker)
- **D1 schema:** `holmgard-lore-mcp/schema/rpg-schema.sql` (lines 849–866)
- **Admin routes:** `holmgard-lore-mcp/src/admin/routes.ts` (lines 535–658)
