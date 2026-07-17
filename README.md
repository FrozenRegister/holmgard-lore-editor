# Holmgard Lore Editor

[![CI](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/ci.yml)
[![E2E](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/e2e-ci.yml/badge.svg)](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/e2e-ci.yml)
[![codecov](https://codecov.io/gh/FrozenRegister/holmgard-lore-editor/branch/main/graph/badge.svg)](https://codecov.io/gh/FrozenRegister/holmgard-lore-editor)

A SvelteKit + Tauri v1 desktop application for editing world-building lore with AI-assisted writing, remote sync, a hex-based world map, and a D1-backed entity database.

## Overview

Holmgard Lore Editor is an offline-first desktop app for managing a world-building wiki. Lore topics (characters, places, factions, etc.) are stored locally and synced to a Cloudflare Worker backend. The built-in Claude AI chat can read, create, and update topics via an agentic tool-call loop. A hex map editor renders geographic regions, and entity pages aggregate structured data (character stats, quest logs, inventory, relationships) from Cloudflare D1.

**Key capabilities:**

- **Lore topics** — Create and edit Markdown-lore topics with `[[wiki-links]]`, a Monaco editor with live preview, inline diff/merge for conflict resolution, undo/redo history (50-entry stack), and backlinks indexing
- **World map** — Hex-based map editor with terrain painting, biome rendering, map import from GeoJSON, zoom/pan, and edit/explorer mode toggle
- **Entities (D1-backed)** — Browse Characters, Locations, Nations, Regions, Quests, and Items from the Cloudflare D1 database, each with structured detail views, relationship graphs, and inventory
- **Character sheets** — RPG-style stat blocks (HP, AC, alignment, class, race, level) with NPC relationships (familiarity, disposition), quest log entries, and inventory items
- **AI chat** — Streaming Claude chat with agentic tool-call loop that can list, get, create, and update topics; supports insight generation about topics and entities
- **Offline sync** — Queue edits locally with exponential backoff (max 8 retries, 5-minute cap); conflict detection compares local vs. remote vs. base; MCP panel for testing backend connectivity
- **Import/export** — Import topics from JSON, Markdown, or CSV; export topics with media assets
- **Templates** — Create new topics from predefined character or location templates

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 11+
- Rust toolchain (for Tauri desktop builds only)

### Installation

```bash
pnpm install
```

### Development

**Browser mode (hot reload, no Tauri):**

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Storage falls back to IndexedDB and `localStorage`; secrets are stored in `localStorage` instead of the OS keyring.

**Desktop app mode (Tauri with hot reload):**

```bash
pnpm tauri:dev
```

**Production build:**

```bash
pnpm build          # Web build (Cloudflare Pages)
pnpm tauri:build    # Desktop binary
```

### Deployment

**Cloudflare Pages** hosts the web version. Deploy via Wrangler:

```bash
pnpm deploy
```

This runs `vendor:build` (fetch + minify vendor JS/CSS from R2), then `vite build`, then `wrangler pages deploy`.

**Requirements:**

- Cloudflare Pages project with a valid `wrangler.jsonc`
- Vendor files accessible from the R2 bucket (configured via `VENDOR_MANIFEST` in `.env` or Cloudflare build settings)

## Architecture

### Dual-Environment Pattern

Every storage/filesystem call checks `IS_TAURI` (`'__TAURI__' in window`). In Tauri it calls `invoke('fs_*')` or `invoke('keyring_*')`; in the browser (`pnpm dev`) it falls back to IndexedDB (via Dexie) for topics and `localStorage` for settings and secrets.

### Key Files

- **`src/lib/types.ts`** — Canonical TypeScript types: `Topic`, `TopicMeta`, `HistoryEntry`, `TopicSnapshot`, `AppSettings`, `SyncState`, `ConflictInfo`, `QueuedSave`, `ChatMessage`, and more
- **`src/lib/storage.ts`** — CRUD for topics (IndexedDB/Tauri), settings persistence, offline queue with exponential backoff, image storage
- **`src/lib/sync.ts`** — JSON-RPC calls to the Cloudflare Worker MCP backend, conflict detection (local → base → remote three-way diff), sync all topics
- **`src/lib/d1-reads.ts`** — Fetch entities (Characters, Locations, Nations, Regions, Quests, Items) from the D1-backed API, including NPC relationships and quest logs
- **`src/lib/d1-writes.ts`** — Mutate D1 entities from the UI
- **`src/lib/entity-context.ts`** — Aggregated entity context for AI chat prompts
- **`src/lib/stores.ts`** — Svelte writable stores: topics, topicMap, settings, syncState, conflictQueue, activeTopicKey, editorMode, chatMessages, and persistent topic-list filters
- **`src/lib/claude.ts`** — Anthropic API streaming chat with agentic tool-call loop (`list_topics`, `get_topic`, `update_topic`, `create_topic`, `get_entities`, `get_insights`)
- **`src/lib/auth.ts`** — Secrets (admin secret, Claude API key) in OS keyring (Tauri) or `localStorage` (browser)
- **`src/lib/mapSync.ts`** / **`src/lib/mapIngest.ts`** — Map synchronization engine and GeoJSON ingestion pipeline
- **`src/lib/mapTools.ts`** / **`src/lib/mapDb.ts`** — Map CRUD tools for the agentic loop and IndexedDB-backed map tile storage
- **`src/lib/character-sheet.ts`** — RPG character sheet data model and formatting
- **`src/lib/history.ts`** — 50-entry undo/redo stack for topic text edits
- **`src/lib/diff.ts`** — Three-way merge for conflict resolution
- **`src/lib/wiki-links.ts`** — `[[wiki-link]]` extraction, resolution, and backlinks indexing
- **`src/lib/importMap.ts`** — Map import logic (GeoJSON → hex grid)
- **`src/lib/terrain-aggregation.ts`** — Terrain statistics from hex map regions
- **`src/lib/marked-config.ts`** — Markdown rendering configuration with custom extensions
- **`src/lib/defaults.ts`** / **`src/lib/demo-data.ts`** — Default settings and demo seed data for first-run experience
- **`src-tauri/src/main.rs`** — Rust backend: `keyring_get/set/delete`, `fs_read/write/list/delete`

### Data Flow

```
┌──────────┐    JSON-RPC    ┌──────────────────┐    D1 SQL    ┌──────────┐
│  Svelte  │ ◄────────────► │  Cloudflare      │ ◄──────────► │   D1     │
│  Client  │    /admin/*    │  Worker (MCP)    │              │ Database │
│ (Tauri   │                │  holmgard-lore-  │              └──────────┘
│  or Web) │                │  mcp.workers.dev │
└──────────┘                └──────────────────┘
     │
     │  Anthropic API
     ▼
┌──────────┐
│  Claude  │  (streaming + tool-use)
└──────────┘
```

### Storage Layers

| Data | Tauri (desktop) | Browser (dev/deploy) |
|------|----------------|---------------------|
| Topics (lore) | Native filesystem | IndexedDB (Dexie) |
| Settings | Native filesystem + OS keyring | localStorage |
| API keys | OS keyring | localStorage |
| Map tiles | IndexedDB | IndexedDB |
| Entity data | Fetched from D1 API | Fetched from D1 API |

### Sync & Conflict Model

Topics carry `{ version, updatedAt, syncedAt }` in their `meta`. Conflict detection compares local text vs. remote text vs. the stored `base` (the last known remote value). Conflicts are queued in `conflictQueue` and resolved via `ConflictResolver.svelte`. The offline queue uses exponential backoff: 8 max retries, capped at 5 minutes between attempts.

### World Map

The world map is a hex-grid rendering engine using the external `game.js` library (`static/hexmap/game.js`). Key subsystems:

- **Map rendering** — Terrain types, biomes, labels, and fog-of-war overlay
- **Map import** — GeoJSON ingestion pipeline (`mapIngest.ts`, `importMap.ts`) that converts real-world coastlines into hex grids
- **Map sync** — Bidirectional sync between local edits and the remote backend (`mapSync.ts`)
- **Map tools** — Agentic tool definitions for Claude to manipulate the map (`mapTools.ts`)
- **Map DB** — IndexedDB-backed persistent storage for map tile data (`mapDb.ts`)

The `game.js` file is in `.gitignore` and fetched from Cloudflare R2 during the vendor build step. Run `pnpm vendor:build` with a valid `VENDOR_MANIFEST` to populate it.

### Entities & D1 Backend

The app reads structured entity data from Cloudflare D1 tables via the Worker backend at `/api/entities/*`. Six entity types are supported:

| Entity | Fields |
|--------|--------|
| **Character** | name, type, class, race, level, HP, AC, alignment, faction, location |
| **Location** | name, biome, visits, description, local coordinates, network |
| **Nation** | name, leader, ideology, aggression, trust, paranoia, GDP |
| **Region** | name, type, owner nation |
| **Quest** | name, description, status (active/completed/failed), quest giver |
| **Item** | name, type, value, weight |

Character detail views include NPC relationships (familiarity, disposition, interaction count), quest log entries, and inventory items. Read layer is at `src/lib/d1-reads.ts`; write mutations at `src/lib/d1-writes.ts`.

## Testing

See [docs/testing-and-linting-guide.md](docs/testing-and-linting-guide.md) for the full testing reference.

### Unit & Integration Tests (Vitest)

```bash
pnpm test                   # Unit tests (jsdom)
pnpm test:integration       # Integration tests (fake-indexeddb + real fetch mocks)
pnpm test:coverage          # Unit tests with coverage report
```

21 unit test suites and 9 integration test suites covering storage, sync, auth, history, stores, diff, MCP, wiki-links, map tools, entity reads/writes, and more. The CI gate enforces ≥80% line coverage on all files.

### E2E Tests (Playwright)

```bash
pnpm exec playwright install   # One-time browser install
pnpm test:e2e                  # Run all tests headlessly
pnpm test:e2e:ui               # Interactive UI mode (recommended for development)
pnpm test:e2e:debug            # Step-through debugger
```

Six spec files cover the home topic list, navigation, settings, import/export, the topic editor, and entity pages. Playwright auto-starts the Vite dev server — no separate build step required.

## File Structure

```text
.
├── src/
│   ├── lib/
│   │   ├── components/          # Svelte components
│   │   │   ├── ChatPanel.svelte           # Claude AI chat interface
│   │   │   ├── ConflictResolver.svelte    # Conflict resolution UI
│   │   │   ├── MarkdownPreview.svelte     # Rendered markdown with wiki-links
│   │   │   ├── MCPPanel.svelte            # MCP backend connectivity tester
│   │   │   ├── MonacoEditor.svelte        # Code editor wrapper
│   │   │   ├── RelationsPanel.svelte      # Entity relationship visualization
│   │   │   ├── EventTimeline.svelte       # Timeline of history entries
│   │   │   ├── NewFromTemplate.svelte     # Template-based topic creation
│   │   │   ├── RemoteHistory.svelte       # Remote edit history viewer
│   │   │   ├── Sidebar.svelte             # Topic list sidebar
│   │   │   └── TopicCard.svelte           # Topic preview card
│   │   ├── __tests__/           # Unit + integration tests (Vitest)
│   │   ├── types.ts             # TypeScript types
│   │   ├── storage.ts           # Storage layer (IndexedDB/Tauri)
│   │   ├── storage-idb.ts       # IndexedDB helpers (Dexie)
│   │   ├── sync.ts              # Network sync & conflict detection
│   │   ├── syncAll.ts           # Bulk sync all topics
│   │   ├── stores.ts            # Svelte stores
│   │   ├── claude.ts            # Claude API integration (streaming + tool-use)
│   │   ├── auth.ts              # Authentication & secrets
│   │   ├── d1-reads.ts          # D1 entity read layer
│   │   ├── d1-writes.ts         # D1 entity write layer
│   │   ├── entity-context.ts    # Entity context for AI prompts
│   │   ├── character-sheet.ts   # RPG character sheet model
│   │   ├── history.ts           # Undo/redo history stack
│   │   ├── diff.ts              # Three-way text merge
│   │   ├── wiki-links.ts        # [[wiki-link]] parser & backlinks
│   │   ├── mapSync.ts           # Map sync engine
│   │   ├── mapIngest.ts         # GeoJSON → hex grid ingestion
│   │   ├── mapTools.ts          # Agentic map manipulation tools
│   │   ├── mapDb.ts             # IndexedDB map tile store
│   │   ├── importMap.ts         # Map import utilities
│   │   ├── terrain-aggregation.ts  # Terrain statistics
│   │   ├── hexmap-utils.ts      # Hex grid math utilities
│   │   ├── entities.ts          # Entity routing & aggregation
│   │   ├── marked-config.ts     # Markdown renderer config
│   │   ├── defaults.ts          # Default settings
│   │   ├── demo-data.ts         # First-run demo seed data
│   │   ├── crypto.ts            # Cryptographic utilities
│   │   └── mcp.ts               # MCP protocol helpers
│   ├── routes/
│   │   ├── +layout.svelte       # App shell, demo data seeding
│   │   ├── +page.svelte         # Home / topic list
│   │   ├── editor/[key]/        # Topic editor page
│   │   ├── world-editor/        # Hex map editor page
│   │   ├── entities/            # Entity browser pages
│   │   │   └── [type]/[id]/     # Entity detail pages (character sheets, etc.)
│   │   ├── import-export/       # Import/export page
│   │   └── settings/            # Settings page
│   ├── app.html
│   └── app.css
├── src-tauri/                   # Rust backend (Tauri v1)
├── e2e/                         # Playwright E2E tests
├── docs/                        # Extended documentation
│   └── future/                  # Future implementation briefs
├── static/
│   └── hexmap/
│       ├── game.js              # Vendor — gitignored, fetched from R2
│       ├── game-ui-bindings.js  # Custom patch: function exposure for game.js
│       └── worker-patch.js      # Custom patch: worker path resolution
├── templates/
│   ├── character-template.md    # Character creation template
│   └── location-template.md     # Location creation template
├── scripts/                     # Build & CI utilities
├── coverage-gap-report/         # Coverage gap tracking
├── CLAUDE.md                    # AI agent development guidance
├── worker-batch-endpoints-plan.md  # Batch endpoint design plan
├── playwright.config.ts
├── vitest.config.ts
├── vitest.integration.config.ts
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── wrangler.jsonc
└── package.json
```

## Configuration

### Environment Variables

**Local development (`.env` file):**

- `VENDOR_MANIFEST` — JSON array of vendor files to fetch from Cloudflare R2
- `VENDOR_TOKEN` — Optional Bearer token for authenticated R2 downloads

**Cloudflare Pages build:**

Set `VENDOR_MANIFEST` in the Cloudflare Pages dashboard under **Settings → Environment variables** so the build pipeline can fetch vendor files.

### Build Configuration

- **Vite:** `vite.config.ts`
- **Type checking:** `pnpm check` (runs `svelte-kit sync` + `svelte-check`)
- **Vendor pipeline:** `scripts/fetch-deps.mjs` + `scripts/bundle-vendor.mjs`
- **Coverage gate:** `scripts/coverage-gap-analysis.ts` — enforces ≥80% line coverage
- **PR quality:** `scripts/check-pr-quality.mjs` — validates CHANGELOG and docs

## Scripts

| Script | Purpose |
| ------ | ------- |
| `pnpm dev` | Start Vite dev server (browser mode) |
| `pnpm tauri:dev` | Start Tauri desktop app with hot reload |
| `pnpm build` | Production web build (runs vendor:build first) |
| `pnpm tauri:build` | Production desktop build |
| `pnpm deploy` | Deploy to Cloudflare Pages |
| `pnpm vendor:fetch` | Fetch vendor files from Cloudflare R2 |
| `pnpm vendor:bundle` | Minify vendor files via esbuild |
| `pnpm vendor:build` | Fetch + bundle vendor files |
| `pnpm check` | Type-check and sync SvelteKit (`svelte-check`) |
| `pnpm check:watch` | Type-check in watch mode |
| `pnpm test` | Run unit tests once |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:coverage` | Unit tests with coverage report |
| `pnpm test:e2e` | Run E2E tests headlessly |
| `pnpm test:e2e:ui` | Run E2E tests with interactive UI |
| `pnpm test:e2e:debug` | Run E2E tests with step debugger |
| `pnpm prepush` | Local mirror of CI checks: runs check-pr-quality + vendor check |
| `pnpm check-pr` | Validate PR readiness (changelog fragment + docs) |
| `pnpm vendor:check` | Run vendor integrity check |
| `pnpm vendor:sync` | Sync vendor files from R2 |
| `pnpm precheck` | Run vendor integrity check (alias for vendor:check) |
| `pnpm preview` | Preview the built site locally |
| `pnpm coverage:gaps` | Run coverage gap analysis (≥80% gate) |
| `pnpm analyze:map` | Analyze working map data |
| `pnpm changelog` | Generate CHANGELOG.md from conventional commits |

## Documentation

Extended documentation lives in the `docs/` directory:

| Document | Description |
|----------|-------------|
| [testing-and-linting-guide.md](docs/testing-and-linting-guide.md) | Testing strategy, linting setup, and coverage requirements |
| [style-guide.md](docs/style-guide.md) | Code style, naming conventions, and project conventions |
| [lifecycle.md](docs/lifecycle.md) | Topic lifecycle: draft → published → archived, status transitions |
| [world-generator-guide.md](docs/world-generator-guide.md) | World generation pipeline and configuration |
| [generator-technical-reference.md](docs/generator-technical-reference.md) | Technical reference for world generator internals |
| [generator-extensibility-analysis.md](docs/generator-extensibility-analysis.md) | Analysis of generator extensibility options |
| [karelia-generator-example.md](docs/karelia-generator-example.md) | Example: Karelia region generation |
| [MAP-SYNC-ARCHITECTURE.md](docs/MAP-SYNC-ARCHITECTURE.md) | Architecture of the map synchronization system |
| [d1-readback-plan.md](docs/d1-readback-plan.md) | Plan for D1 read-back pipeline |
| [earth-map-design.md](docs/earth-map-design.md) | Earth map rendering design |
| [zoom-mechanisms-comparison.md](docs/zoom-mechanisms-comparison.md) | Comparison of hex map zoom approaches |
| [ai-automation-pipeline.md](docs/ai-automation-pipeline.md) | GitHub Actions automation for issue/PR workflows |
| [mcp-automated-changelog-instructions.md](docs/mcp-automated-changelog-instructions.md) | Instructions for automated changelog generation |
| [agent-prompt.md](docs/agent-prompt.md) | Onboarding prompt for AI coding agents |
| [future/claude-map-tools.md](docs/future/claude-map-tools.md) | Future: map↔Claude MCP integration (phases 1c–4) |
| [future/issue-46-authentication-handoff.md](docs/future/issue-46-authentication-handoff.md) | Auth debugging handoff prompt (issue #46) |

## Known Issues & Limitations

- **Hex map requires vendor files** — `game.js` and related files are fetched from a private R2 bucket and are not included in the repository. The world map shows a blank canvas without them. Run `pnpm vendor:build` with a valid `VENDOR_MANIFEST` to fetch them.
- **Browser mode limitations** — IndexedDB storage in the browser has no OS keyring; Claude API key and admin secret are stored in `localStorage` (plaintext). Use Tauri mode for production workflows with sensitive keys.
- **No ESLint** — The project uses `svelte-check` for type safety and `markdownlint-cli2` for docs, but has no JavaScript/TypeScript linter configured.
- **Entity data is read-through** — Entity pages fetch live from the D1 backend; there is no offline cache for entity data yet.

## Contributing

1. Fork the repo and create a feature branch
2. Follow [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, etc.)
3. Add a changelog fragment under `.changelog/fragments/` (do not edit `CHANGELOG.md` directly; fragments are assembled at release time). Include a `## Documentation` section in your PR body (required by CI).
4. Run `pnpm prepush` before pushing to catch CI failures locally
5. Ensure all unit and integration tests pass (`pnpm test && pnpm test:integration`)

## License

All rights reserved. This project is not licensed for redistribution.

## Related Projects

- **holmgard-lore-mcp** — Cloudflare Worker MCP backend providing JSON-RPC API and D1 entity endpoints

## Support

Open an issue at [github.com/FrozenRegister/holmgard-lore-editor/issues](https://github.com/FrozenRegister/holmgard-lore-editor/issues).

---

**For AI coding agents:** See [CLAUDE.md](CLAUDE.md) and [docs/agent-prompt.md](docs/agent-prompt.md) for development commands and architecture details.