# CLAUDE.md

This file provides guidance to Cline and CLAUDE (the VS Code AI coding agent) when working with code in this repository.

## Environment

**Use PowerShell commands only. Assume Windows 11.** Do not use bash, `cat`, `ls`, or other Linux commands. Use `Get-Content` instead of `cat`, `Get-ChildItem` instead of `ls`, `Remove-Item` instead of `rm`, etc.

## Commands

```bash
pnpm dev              # SvelteKit dev server (browser, no Tauri)
pnpm tauri:dev        # Full Tauri desktop app with hot reload
pnpm tauri:build      # Production desktop build
pnpm build            # Production web build (runs vendor:build + vite build)
pnpm deploy           # Build + deploy to Cloudflare Pages
pnpm test             # Run all Vitest unit tests once
pnpm test:watch       # Vitest in watch mode
pnpm test:integration # Run integration tests (fake-indexeddb + fetch mocks)
pnpm test:coverage    # Unit tests with Istanbul coverage report
pnpm test:e2e         # Run Playwright E2E tests
pnpm test:e2e:ui      # Playwright interactive UI mode
pnpm check            # svelte-kit sync + type check (svelte-check)
pnpm check:watch      # Type check in watch mode
pnpm prepush          # Local mirror of CI PR quality checks
pnpm vendor:build     # Fetch + bundle vendor files from R2
pnpm vendor:check     # Run vendor integrity check
pnpm coverage:gaps    # Run coverage gap analysis (≥80% gate)
pnpm analyze:map      # Analyze working map data
pnpm changelog        # Generate CHANGELOG.md from conventional commits
```

See [Testing and Linting Guide](docs/testing-and-linting-guide.md) for detailed testing documentation.

## Git workflow

When asked to review changes and push, always split changes into multiple logical commits grouped by concern instead of one large commit. Each group should be self-contained with a descriptive conventional-commit message (feat:, fix:, chore:, test:, etc.). Example groupings:

- **dependencies** — package.json + lockfile changes only
- **library/core module** — a new .ts file + its tests
- **UI page** — a route page + related component changes (e.g. sidebar nav link)
- **independent features** — separate commits for unrelated additions

**Before pushing, always check for merge conflicts** with the latest main branch:

```bash
git fetch origin main && git merge-base --is-ancestor origin/main HEAD || echo "⚠️ Conflict risk: rebase onto origin/main"
```

If the merge-base check fails, rebase onto main to resolve conflicts locally before pushing:

```bash
git rebase origin/main  # Resolve any conflicts interactively
```

After all commits are made, push once. This is the default behavior — no need for the user to ask explicitly.

After a PR merges to main, always clean up the local branch:

```bash
git switch main && git pull && git branch -D <branch-name>
```

If multiple stale branches have accumulated, delete all non-main local branches at once:

```bash
git branch | grep -v "^\* main" | xargs git branch -D
```

Run a single test file:

```bash
pnpm vitest run src/lib/__tests__/sync.test.ts
```

### Changelog Fragments

**Do not edit `CHANGELOG.md` directly.** Each PR that modifies `src/`, `src-tauri/`, `docs/`, or `CLAUDE.md` must add a `.md` file under `.changelog/fragments/`. Fragments are assembled into `CHANGELOG.md` at release time, eliminating merge conflicts when multiple PRs are open simultaneously.

```bash
# Create a fragment (any descriptive filename works):
echo "### My Feature\n- Added X" > .changelog/fragments/my-feature.md
```

The `check-changelog` PR quality check will fail if a source change has no corresponding fragment. Apply `skip-quality-checks` label for emergency hotfixes.

### Pull Requests and Issue Linking

**Every PR body must include a closing keyword** for GitHub's auto-close to work:

```markdown
Closes #123
```

Keywords in the PR **title** are ignored by GitHub — they must be in the body. GitHub cannot auto-close issues in a different repository; close cross-repo issues manually.

## Architecture

This is a **SvelteKit + Tauri v1** desktop app for editing world-building lore. The frontend is Svelte 4; the Rust backend (`src-tauri/`) exposes a small set of `invoke`-able commands (`keyring_get/set/delete`, `fs_read/write/list/delete`). Key dependencies: Dexie (IndexedDB), Monaco editor, marked (Markdown rendering with highlight.js), JSZip (import/export), idb (low-level IndexedDB for map tiles).

### Svelte version

This project uses **Svelte 4** (`^4.2.20`). Do not use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) — the stores pattern (`writable`, `derived`, `subscribe`) is the canonical approach.

### Dual-environment pattern

Every storage/filesystem call checks `IS_TAURI` (`'__TAURI__' in window`). In Tauri it calls `invoke('fs_*')` or `invoke('keyring_*')`; in the browser (`pnpm dev`) it falls back to IndexedDB (via Dexie) for topics/map tiles and `localStorage` for settings and secrets. This pattern is used in `src/lib/storage.ts`, `src/lib/storage-idb.ts`, `src/lib/history.ts`, and `src/lib/auth.ts`.

### Data flow

- **`src/lib/types.ts`** — Canonical TypeScript types: `Topic`, `TopicMeta`, `HistoryEntry`, `TopicSnapshot`, `AppSettings`, `SyncState`, `ConflictInfo`, `QueuedSave`, `ChatMessage`, etc.
- **`src/lib/storage.ts`** — CRUD for topics (IndexedDB/Tauri), settings persistence, offline queue with exponential backoff, image storage
- **`src/lib/storage-idb.ts`** — Low-level IndexedDB helpers via Dexie
- **`src/lib/sync.ts`** — JSON-RPC calls to the Cloudflare Worker MCP backend (`/mcp`), conflict detection (three-way diff), offline queue with exponential backoff (max 8 attempts, capped at 5 min)
- **`src/lib/syncAll.ts`** — Bulk sync all topics (smart sync with change detection)
- **`src/lib/stores.ts`** — Svelte writable stores; single source of truth for topics, topicMap, settings, syncState, conflictQueue, activeTopicKey, editorMode, chatMessages, and persistent topic-list filters (stored in localStorage)
- **`src/lib/claude.ts`** — Anthropic API streaming chat with agentic tool-call loop (`list_topics`, `get_topic`, `update_topic`, `create_topic`, `get_entities`, `get_insights`); system prompt built per-call via `buildSystemPrompt()`
- **`src/lib/auth.ts`** — Secrets (admin secret, Claude API key) stored in OS keyring via Tauri or `localStorage` in browser; helpers: `getMcpApiKey()`, `setMcpApiKey()`, `getAdminSecret()`, `setAdminSecret()`
- **`src/lib/d1-reads.ts`** — Fetch entities from D1-backed API: Characters, Locations, Nations, Regions, Quests, Items, plus NPC relationships, quest logs, inventory
- **`src/lib/d1-writes.ts`** — Mutate D1 entities from the UI
- **`src/lib/entity-context.ts`** — Aggregated entity context for AI chat prompts
- **`src/lib/character-sheet.ts`** — RPG character sheet data model and formatting
- **`src/lib/history.ts`** — 50-entry undo/redo stack for topic text edits
- **`src/lib/diff.ts`** — Three-way merge for conflict resolution
- **`src/lib/wiki-links.ts`** — `[[wiki-link]]` extraction, resolution, and backlinks indexing
- **`src/lib/mapSync.ts`** — Map synchronization engine (bidirectional sync with Worker MCP)
- **`src/lib/mapIngest.ts`** — GeoJSON ingestion pipeline (coastlines → hex grid)
- **`src/lib/mapTools.ts`** — Map CRUD tools for the agentic loop: axial distance, A* pathfinding, landmark↔lore linking/unlinking with write-back
- **`src/lib/mapDb.ts`** — IndexedDB-backed map tile storage (`maps`, `hexes`, `landmarks` tables with v2 schema)
- **`src/lib/mcp.ts`** — MCP protocol helpers: `callTool()`, `listTools()`, `checkAuth()`
- **`src/lib/entities.ts`** — Entity routing and aggregation
- **`src/lib/hexmap-utils.ts`** — Hex grid math utilities
- **`src/lib/importMap.ts`** — Map import logic (GeoJSON → hex grid)
- **`src/lib/terrain-aggregation.ts`** — Terrain statistics from hex map regions
- **`src/lib/marked-config.ts`** — Markdown rendering configuration with custom extensions
- **`src/lib/defaults.ts`** / **`src/lib/demo-data.ts`** — Default settings and demo seed data for first-run experience
- **`src/lib/crypto.ts`** — Cryptographic utilities

### Sync & conflict model

Topics have `{ version, updatedAt, syncedAt }` in their `meta`. Conflict detection compares local text vs. remote text vs. a stored `base` (the last known remote value before local edits began). Conflicts are queued in `conflictQueue` store and resolved via `ConflictResolver.svelte`.

### Remote backend

The MCP Worker lives at `https://holmgard-lore-mcp.frozenregister.workers.dev` (sibling project `holmgard-lore-mcp/`). Admin writes go to `/admin/set-lore` and `/admin/delete-lore` with a secret; reads use JSON-RPC at `/mcp`.

**API surface convention — prefer MCP for reads, REST for privileged writes.** This is a read/write split, not a blanket rule. New **reads/queries** should call `/mcp` (JSON-RPC) via the `rpc()` helper in `src/lib/sync.ts` — the same path `get_lore`/`list_topics` use; the worker returns structured JSON in `result`. New **privileged writes / bulk ops** go to `/admin/*` with the admin secret (like `adminSave`/`adminSaveBatch`). When adding a remote capability, prefer an MCP method over a new REST GET route. The **map readback** feature follows this: map reads use `/mcp` (`get_map_*`), while map pushes stay on `/admin/map/*`. See `docs/d1-readback-plan.md` and `docs/MAP-SYNC-ARCHITECTURE.md`.

### Tauri commands (Rust)

`src-tauri/src/main.rs` exposes: `keyring_get`, `keyring_set`, `keyring_delete`, `fs_read`, `fs_write`, `fs_list`, `fs_delete`. All filesystem paths are relative to the OS app-data directory.

### Entities & D1 Backend

Structured game data lives in Cloudflare D1 tables accessed via the Worker MCP at `/api/entities/*`. Six entity types: Characters (with NPC relationships, quest logs, inventory), Locations, Nations, Regions, Quests, Items. Read layer: `src/lib/d1-reads.ts`; write layer: `src/lib/d1-writes.ts`. Entity data is read-through — there is no offline cache yet.

### Hex Map Editor

The hex map editor renders a hex-grid world map using the external `game.js` library (`static/hexmap/game.js`). Key subsystems live in `src/lib/`:

- **mapDb.ts** — IndexedDB store for `maps`, `hexes`, `landmarks` (v2 schema with `linkedLoreKey: string | null`)
- **mapIngest.ts** — Imports `.json` map files into IndexedDB
- **mapSync.ts** — Syncs maps between editor and Worker MCP
- **mapTools.ts** — A* pathfinding, axial distance, landmark↔lore linking/unlinking (with optional `**Map-Position:**` write-back into lore topics)
- **importMap.ts** / **terrain-aggregation.ts** / **hexmap-utils.ts** — GeoJSON import, terrain stats, hex math

Supporting patch files (`game-ui-bindings.js`, `worker-patch.js`) provide UI integration and address library limitations.

**Removed dead code (#199):** `src/lib/worldmap.ts` — a hierarchical continent/region hex proc-gen
engine (Perlin-noise tile generation, region expand/merge, markdown serialization) from before the
project pivoted to importing external Wonderdraft maps — was deleted. It had zero production
imports (only its own test file referenced it) and its live presence in the tree was causing coding
agents doing codebase searches to read its exported functions as active, current-architecture code.
See `docs/zoom-mechanisms-comparison.md` for the original design analysis. Recover the full source
via `git log --all -- src/lib/worldmap.ts` if procedural in-app map generation is ever revisited —
don't reintroduce it as unused dead code again.

**⚠️ External JS Files:** Do not edit the `.js` files in `static/hexmap/` that are in `.gitignore` (e.g., `game.js`, `auth.js`, `cloud-storage.js`, `compendium.js`, `map-worker.js`, `mcp-auth.js`, `mcp-storage.js`, `region-switcher.js`, `river-edges.js`, `mobile-companion.js`, `parent-child-terrain-sync.js`). These are pulled from external URLs and are not controlled by this project. Checksums and last-verified dates are tracked in `static/hexmap/EXTERNAL_FILES.md`. Our custom patches (`game-ui-bindings.js`, `worker-patch.js`) are the only editor-maintained JS files in that directory.

### Testing

Tests use Vitest + jsdom. SvelteKit path aliases (`$lib`, `$app`) are remapped in `vitest.config.ts`; `$app` points to `src/app-mock/` which stubs SvelteKit navigation/stores. `svelte-kit sync` must run before type checking or tests that import generated types.

#### Coverage protocol

Coverage provider is **Istanbul** (`@vitest/coverage-istanbul`) — not v8, not codecov's patch analysis. The Istanbul-based `Coverage Gate & Gap Analysis` CI check is the enforced gate; codecov's `/patch` check is informational only.

**Pre-push checklist (run locally before every PR):**

```bash
pnpm test:coverage    # runs Istanbul, writes coverage/unit/coverage-summary.json
pnpm coverage:gaps    # reads summary, flags any src/lib file below 80% lines
```

If `coverage:gaps` prints red files, add tests before pushing. The CI `Coverage Gate & Gap Analysis` job runs the same script and will fail the PR if any unit-suite file is below **80% lines**.

**Rule for new code:** every new exported function that touches external data (fetch, D1, IDB, Tauri) must have at least these cases before the PR ships:

- happy path (expected shape returned)
- missing/null key in response → safe default returned
- non-2xx HTTP → error thrown
- network failure → error propagates

See `src/lib/__tests__/entities.test.ts` `describe('fetchLocationById')` for the canonical pattern.

#### Required: negative / malformed-input test cases

TypeScript types are compile-time contracts. Data from external sources — the MCP network, IndexedDB, Tauri filesystem — can violate them at runtime (missing fields, `null` where a string is expected, etc.).

**Rule:** Any test file covering a function or component that accepts external data must include at least one case where a normally-required field is absent (`undefined`) or the whole object is malformed.

Patterns to use:

```ts
// Component test — cast to force the bad state TypeScript won't allow normally
const badTopic = { ...mockTopic, text: undefined as unknown as string };
expect(() => render(MyComponent, { props: { topic: badTopic } })).not.toThrow();

// Network-boundary function — omit the field from the mock response entirely
fetchMock.mockResolvedValueOnce(okFetch({ key: 'x', meta: { version: 0, updatedAt: '...' } }));
// (no `text` field) — assert the function normalises it to ''
expect((await getTopicRemote('http://w', 'x'))!.text).toBe('');

// Storage layer — write a malformed record then read it back
await idbSaveTopic({ key: 'bad', text: undefined as unknown as string, meta: {...} });
const loaded = await idbLoadAllTopics();
expect(loaded[0].text).toBe('');
```

This applies to:

- All `$lib/components/*.svelte` tests — add a "malformed props" case alongside every happy-path fixture
- All `sync.ts` / `storage-idb.ts` function tests — add a missing-field mock response
- Any new fixture that only tests well-formed data is incomplete
