# Map ↔ Claude / MCP Integration — Future Implementation Brief

> **Purpose:** This document captures the full implementation specs for the
> five "future" phases of the map↔lore integration. Each phase is written as
> a self-contained brief that can be pasted into a fresh coding session to
> resume work, or handed to another AI agent.
>
> **Status:** Phases 1a and 1b are DONE. This doc covers 1c, 1d, 2, 3, 4.
> The current owner is "probably not" building these — they're tracked in
> the GitHub Project "holmgard-lore-editor development" and on the back
> burner.
>
> **Last updated:** 2026-06-06 (when this doc was written)

---

## What's already in place (do not re-implement)

Read these first to avoid duplicating work:

- **`src/lib/mapDb.ts`** — IndexedDB store for `maps`, `hexes`, `landmarks`
  (v2 schema with `linkedLoreKey: string | null` on `LandmarkRecord`).
  Key exports: `getAllMaps`, `getAllHexes(mapId)`, `getAllLandmarks(mapId)`,
  `getMapContext(mapId, q, r, radius)`, `getLandmarksForLoreKey(loreKey)`,
  `setLandmarkLinkedLore(mapId, landmarkId, loreKey | null)`.
- **`src/lib/mapIngest.ts`** — imports `.json` map files into the IDB stores.
- **`src/lib/mapSync.ts`** — syncs maps up/down between the editor and the
  Worker MCP.
- **`src/lib/mapTools.ts`** — the high-level helpers. Exports:
  - `axialDistance(a, b)`, `hexNeighbors(q, r)`, `HEX_DIRECTIONS`
  - `DEFAULT_TERRAIN_COSTS`, `FindPathOptions`, `PathResult`
  - `findPath(mapId, from, to, opts)` (A*)
  - `computeDistanceOnMap`, `computePathOnMap`
  - `linkLandmarkToLore(mapId, landmarkId, loreKey, opts?)` — supports
    `opts.writeLoreBack: true` to inject `**Map-Position:**` into the lore
  - `unlinkLandmarkFromLore(mapId, landmarkId, opts?)`
  - `getLandmarksForLore(loreKey)`, `getLandmarkForLore(loreKey)`,
    `getMapContextForLore(loreKey, radius)`
  - `distanceFromLoreToHex(loreKey, mapId, q, r)`,
    `pathFromLoreToHex(loreKey, mapId, q, r, opts?)`
- **`src/lib/claude.ts`** — Anthropic API streaming + agentic loop. The
  tool system uses an array of `{name, description, input_schema}` and an
  `executeTool(name, input)` function returning a `Promise<string>`. System
  prompt is built fresh per call in `buildSystemPrompt()`.
- **`src/lib/__tests__/mapTools.test.ts`** — ~25 tests, all green.
- **`src/lib/__tests__/mapDb.test.ts`** and `mapSync.test.ts` — also green.

Tests run with `pnpm test` (Vitest). Use `pnpm test:run` for one-shot.

---

## Phase 1c — Wire map tools into the Claude agentic loop

**Goal:** Expose the `mapTools` helpers to the Anthropic agent so it can
answer questions like *"how far is Lyondell from the Iron Market?"* or
*"what lore is near the cursed forest?"*.

**Files to touch:**
- `src/lib/claude.ts` — add 6 tool defs + 6 executor branches + system
  prompt update.

**Implementation prompt (paste this into a fresh session):**

> You are extending the Claude agentic loop in
> `c:\Users\kyleb\holmgard-lore-editor\src\lib\claude.ts` so the model can
> query the local IndexedDB map data.
>
> Six new tools, all read-only:
>
> 1. **`map_list_maps`** — returns a JSON array of `{id, name, width, height,
>    landmarkCount}`. Implement with `getAllMaps()` + a count via
>    `getAllLandmarks(mapId).length` for each. (Add a small `getMapSummaries`
>    helper to `mapTools.ts` if it cuts repetition.)
> 2. **`map_get_distance`** — inputs `{mapId, fromQ, fromR, toQ, toR}`.
>    Returns an axial distance number. Use `computeDistanceOnMap`.
> 3. **`map_get_path`** — inputs `{mapId, fromQ, fromR, toQ, toR,
>    maxSteps?}`. Returns `{path: [{q,r}…], totalCost, steps}` JSON or
>    `"No path found."` Use `computePathOnMap`.
> 4. **`map_get_nearby_landmarks`** — inputs `{mapId, q, r, radius}`.
>    Returns landmarks within `radius` hexes of (q,r) as
>    `[{id, name, q, r, type, linkedLoreKey, dist}]`. Use `getMapContext`
>    and re-derive `dist` from `axialDistance`.
> 5. **`map_get_nearby_lore`** — inputs `{mapId, q, r, radius}`. Returns
>    the unique set of `linkedLoreKey` values for landmarks within radius,
>    along with the landmark that linked them, so the model can choose to
>    call `get_topic` next. Use `getMapContext` + filter
>    `lm.linkedLoreKey != null`.
> 6. **`map_get_landmark`** — inputs `{mapId, landmarkId}`. Returns the
>    full landmark record. Use `getAllLandmarks(mapId).find(l => l.id === …)`.
>
> For tool definitions, follow the exact schema pattern of the existing
> four tools (lines 12-53 of `claude.ts`). Use the Anthropic JSON schema
> shape: `type: "object"`, `properties`, `required`.
>
> For the executor, extend the `executeTool` function (lines 57-105). Add
> a top-of-function `import` block for the map helpers you need from
> `mapTools` and `mapDb`. JSON-stringify results. On error, return
> `"Error: <message>"` (the existing tools do this for the "not found"
> case — match that style).
>
> Update `buildSystemPrompt()` (lines 109-123) to:
> - Mention the map tools are available.
> - If any maps exist, list them with their landmark counts.
> - Add a one-line hint: *"When the user references a place, check if it
>    is a landmark on a known map; use `map_get_landmark` to resolve
>    ambiguous references."*
>
> Add a Vitest file `src/lib/__tests__/claude.mapTools.test.ts` that
> mocks `mapTools` and asserts:
> - All 6 tool names appear in the exported `TOOLS` constant (you'll
>   need to export it).
> - Each executor branch returns the right shape on a happy path.
> - Each branch returns a `"Error: …"` string when the underlying
>    helper throws.

**Acceptance criteria:**
- All 6 tools appear in the Anthropic request body.
- Manual test: ask Claude *"How far is the Iron Market from the Thorn
  Gate?"* (using two landmarks that exist in a test map) → it calls
  `map_get_distance` and reports the number.
- All tests green.

---

## Phase 1d — `/maps` UI: "Link to lore" button + search modal

**Goal:** A small UI on the map editor (route `/maps`) that lets the user
click a landmark and link it to a lore key, with a search modal that
filters the topic list as they type.

**Files to touch:**
- `src/routes/maps/+page.svelte` (or wherever the map editor lives —
  check existing route)
- New: `src/lib/components/LinkLandmarkModal.svelte`
- New: `src/lib/components/LinkLandmarkButton.svelte` (or just inline it)

**Implementation prompt:**

> Add a "Link to lore" affordance to the map editor's landmark detail
> panel. When the user clicks it, open a modal that:
>
> 1. Has a search input at the top.
> 2. Lists all lore topics whose key contains the search string
>    (case-insensitive substring match).
> 3. Shows each result as a clickable row: `<key> — <first line of body>`.
> 4. Clicking a row calls
>    `linkLandmarkToLore(mapId, landmarkId, key, {writeLoreBack: true})`
>    from `mapTools.ts`.
> 5. On success, closes the modal and refreshes the landmark panel.
> 6. Also show the current `linkedLoreKey` (if any) at the top of the
>    panel as a clickable link to the lore editor route, with an
>    "Unlink" button next to it that calls
>    `unlinkLandmarkFromLore(mapId, landmarkId, {writeLoreBack: true})`.
>
> Use Svelte's built-in `<dialog>` element (or a minimal modal primitive
> if the project already has one). Style with the existing
> `src/app.css` design tokens — don't add new colours.
>
> The search should debounce ~150ms so it stays snappy on a 500-topic
> lore library.
>
> Acceptance: load a map, click any landmark, see the "Link to lore"
> button → click it → modal opens → type "iron" → only matching keys
> appear → click one → modal closes, the panel now shows the linked
> key as a clickable link. Click "Unlink" → link is removed, the
> landmark's `Map-Position` field is stripped from the lore entry.

**Tests:** Component test using `@testing-library/svelte` if the project
already uses it. If not, a focused unit test on the search-filter
function is fine.

---

## Phase 2 — Worker endpoints + map tools (holmgard-lore-mcp)

**Goal:** Mirror the local map tools as Cloudflare Worker endpoints so
the MCP can answer map questions about lore on any device (not just the
one with the local IDB).

**Files to touch (sibling repo, `c:\Users\kyleb\holmgard-lore-mcp`):**
- New: `src/map-tools.ts` — exports matching the local `mapTools.ts`
  surface, but reading from KV (or Durable Objects) instead of IDB.
- New: `src/routes/map/*` — REST/MCP endpoints, one per local tool.
- `src/index.ts` — register the new endpoints.

**Implementation prompt:**

> The local map tools in the editor (`mapTools.ts`) are bound to the
> device's IndexedDB. To make maps queryable from the MCP, you need a
> server-side mirror. Map data is already synced to the Worker via
> `mapSync.ts` on the editor side; verify that the sync target is a
> per-user KV namespace (check `src/lib/sync.ts` and the Worker
> bindings in `wrangler.toml`).
>
> Add a `map-tools.ts` module to the Worker that mirrors the local
> `mapTools.ts` exports, but reads from KV:
>
> - `getAllMaps()` — list keys matching the maps prefix.
> - `getHexesForMap(mapId)` — fetch all hex records for a map.
> - `getLandmarksForMap(mapId)` — fetch all landmark records.
> - Re-implement `findPath`, `axialDistance`, `getMapContext` etc. as
>   pure functions over the loaded data (the algorithms port 1:1).
> - `linkLandmarkToLore` writes back to both the landmark KV entry and
>   the lore KV entry (mirroring `**Map-Position:**` if requested).
>
> Then add REST endpoints (or MCP tools, depending on the existing
> transport — check how `cET72e0mcp0get_lore` is exposed and follow
> the same pattern). The endpoints should be:
>
> - `GET /maps`
> - `GET /maps/:mapId/hexes`
> - `GET /maps/:mapId/landmarks`
> - `POST /maps/:mapId/landmarks/:id/link` — body `{loreKey, writeLoreBack?}`
> - `POST /maps/:mapId/landmarks/:id/unlink` — body `{writeLoreBack?}`
> - `POST /maps/:mapId/distance` — body `{from:{q,r}, to:{q,r}}`
> - `POST /maps/:mapId/path` — body `{from, to, maxSteps?}`
> - `POST /maps/:mapId/nearby` — body `{q, r, radius}`
>
> Add the matching MCP tool definitions in whatever file the project
> uses for tool registration (look for `get_lore` / `set_lore` to find
> the pattern).
>
> Write Vitest tests in `test/map-tools.test.ts` using a
> `cloudflare:test` style in-memory KV. Cover: distance math, A*
> path on a 5×5 grid, link/unlink with write-back.

**Acceptance:** From the MCP, ask *"list maps"* → returns the synced
maps. *"get path from (0,0) to (3,-3) on <mapId>"* → returns a path.
*"link landmark L1 to character:anya"* → returns the updated landmark.

---

## Phase 3 — `game.js` shims (static/hexmap)

**Goal:** The `static/hexmap/` directory holds the legacy JavaScript
hex-map viewer. Expose a minimal `window.HolmgardMap` API so other
scripts (e.g. the lore editor's "view on map" button) can trigger
camera moves, highlight landmarks, and react to clicks.

**Files to touch:**
- `static/hexmap/game.js` — add a public surface.
- Possibly: a new `static/hexmap/holmgard-map-api.js` (loaded after
  `game.js` in the relevant `+page.svelte`).

**Implementation prompt:**

> The hex-map viewer in `static/hexmap/game.js` currently has no public
> API. Other parts of the app need to:
>
> 1. **Pan to a landmark** — e.g. when the user clicks a "View on map"
>    link in a lore entry, the map should centre on that landmark.
> 2. **Highlight a landmark briefly** — flash a glow ring around it.
> 3. **Listen for click events** — fire a custom event
>    `holmgard:landmark-clicked` with the landmark id when a landmark
>    is clicked.
> 4. **Report the current viewport centre as a hex coord** — useful
>    for the link-modal in Phase 1d.
>
> Audit `game.js` for its current state object (probably `state.hexMap`
> or similar) and its render loop. Then add to a `window.HolmgardMap`
> object:
>
> ```js
> window.HolmgardMap = {
>   panTo(landmarkId, {highlight = true} = {}) { ... },
>   highlight(landmarkId, durationMs = 2000) { ... },
>   on(eventName, handler) { ... },  // supports 'landmark-clicked'
>   getViewportHex() { return {q, r}; }
> };
> ```
>
> Don't refactor `game.js` itself. Wrap, don't rewrite.
>
> For the highlight, add a CSS class `.lmk-highlight` to the landmark's
> rendered SVG/Canvas element with a 2-second `setTimeout` to remove it.
> For panning, mutate the existing `viewport` object (look for
> `vp.offsetX` / `vp.offsetY` in `game.js`).
>
> For click events, find where `game.js` already detects landmark
> clicks (probably in a mouse handler) and dispatch
> `new CustomEvent('holmgard:landmark-clicked', {detail: {id, q, r}})`
> on `document` or the map canvas. Use `addEventListener` in the
> `on()` shim.
>
> For `getViewportHex`, convert the current pan/zoom to a hex coord
> by inverting the `hexCenter` math. The existing `static/hexmap/hexmap-utils.js`
> likely has the forward direction — write the inverse.
>
> Don't add new dependencies. Keep the shim under 200 lines.

**Acceptance:** Open the map editor, run in the dev console:

```js
HolmgardMap.on('landmark-clicked', e => console.log(e.detail));
HolmgardMap.panTo('some-landmark-id');
HolmgardMap.getViewportHex();
```

Click a landmark → see the log. Pan-to a known id → map centres on
it. `getViewportHex` returns a sensible `(q, r)`.

---

## Phase 4 — Lore editor map UI polish

**Goal:** Use the new `HolmgardMap` API (Phase 3) from the lore editor
so users can click a "View on map" link in any lore entry that has a
`**Map-Position:**` field, and have the map open centred on that
landmark. Conversely, from the map editor, the link-modal (Phase 1d)
should be triggered by the `holmgard:landmark-clicked` event.

**Files to touch:**
- Lore editor route (find via `src/routes/` — likely the home route or
  a dedicated editor route)
- Map editor route (Phase 1d's modal is the listener)
- Possibly a small store or query string for cross-route handoff

**Implementation prompt:**

> The lore editor and the map editor currently live in different routes.
> Add a "View on map" affordance to lore entries that have a
> `**Map-Position:** <mapId>, <q>, <r>` field, derived from the line
> injected by `linkLandmarkToLore(... {writeLoreBack: true})`.
>
> Behaviour:
>
> 1. In the lore editor, detect the `**Map-Position:**` line (regex
>    like `/^\*\*Map-Position:\*\*\s*(.+?),\s*(-?\d+),\s*(-?\d+)/m`).
> 2. If present, render a small "📍 View on map" button next to the
>    lore title.
> 3. Clicking it does *not* require page reload. Options:
>    a. If the map editor is open in a sibling tab/window, post a
>       message via `BroadcastChannel` named `holmgard-map`.
>    b. Otherwise, navigate to `/maps?focus=<mapId>&hex=<q>,<r>` and
>       have the map editor read the query string on mount and call
>       `HolmgardMap.panTo` after the map finishes loading.
> 4. Conversely, in the map editor, subscribe to the
>    `holmgard:landmark-clicked` event and open the link-modal
>    (Phase 1d) pre-populated with that landmark.
>
> For (3a), the message body is `{type: 'panTo', mapId, landmarkId, q,
> r, highlight}`. The map editor listens, ignores messages for other
> map ids, and calls `HolmgardMap.panTo` accordingly.
>
> For (3b), add a `+page.svelte` `onMount` that parses
> `page.url.searchParams` and, once `window.HolmgardMap` is defined
> (poll every 100ms up to 3s), calls `panTo`.
>
> Use the existing `app.css` design tokens. Don't introduce a new
> state-management library — the existing `stores.ts` is enough.

**Acceptance:** Open a lore entry with a `**Map-Position:**` field
(any linked landmark from Phase 1d's manual test). Click "View on
map" → if the map editor is already open in another tab, the map
pans. Otherwise, navigating to the map editor centres on the right
hex. Click a landmark on the map → the link modal opens.

---

## Open questions / deferred decisions

These came up while writing the briefs but were not decided. Future
implementer, please resolve or escalate:

1. **Phase 1c — should the tools be opt-in?** Right now adding 6 tools
   balloons the system prompt. Consider a `?mapTools=1` URL flag or a
   settings toggle so the user controls when they're exposed.
2. **Phase 2 — auth.** The Worker endpoints need to verify the
   caller's identity before exposing the user's maps. Check how
   `get_lore` handles this and follow suit. If it doesn't, that's a
   separate workstream.
3. **Phase 3 — test surface.** `game.js` is currently untested. If
   the project ever moves to a bundler (currently it's a static IIFE),
   this would be the natural time to add Playwright visual tests.
4. **Phase 4 — `BroadcastChannel` is browser-only.** If the app ever
   ships as a Tauri desktop app, the cross-tab messaging will need a
   Tauri event bus equivalent. Punt until then.

---

## How to use this doc

- **Coming back in a month?** Open this file, find the phase you want
  to do, paste its "Implementation prompt" into a fresh AI session.
  The "What's already in place" section at the top should save you
  from re-discovering the codebase.
- **Rescoping?** Edit the relevant phase in place; the GitHub Project
  items just need their title/body updated to match.
- **Found something out of date?** The "Last updated" line at the
  top should be bumped. If a phase is DONE, move it to a new
  `## Phase X — DONE (date)` heading and link to the relevant commit.


