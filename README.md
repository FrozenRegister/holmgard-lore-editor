# Holmgard Lore Editor

[![CI](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/ci.yml)
[![E2E](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/e2e-ci.yml/badge.svg)](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/e2e-ci.yml)
[![codecov](https://codecov.io/gh/FrozenRegister/holmgard-lore-editor/branch/main/graph/badge.svg)](https://codecov.io/gh/FrozenRegister/holmgard-lore-editor)

A SvelteKit + Tauri v1 desktop application for editing world-building lore with AI-assisted writing, remote sync, and integrated hex map support.

## Overview

Holmgard Lore Editor is an offline-first desktop app for managing a world-building wiki. Lore topics (characters, places, factions, etc.) are stored locally and synced to a Cloudflare Worker backend. The built-in Claude AI chat can read, create, and update topics via an agentic tool-call loop. A hex map editor (powered by an external `game.js` library) lets you paint and annotate geographic regions.

**Key capabilities:**

- Create and edit Markdown lore topics with a Monaco-based editor and live preview
- Sync topics to/from the Cloudflare Worker MCP backend with conflict detection and resolution
- Chat with Claude (streaming, tool-use) to browse and draft lore hands-free
- Offline queue with exponential backoff — edits persist locally until a connection is available
- Hex map editor for geographic world-building (requires vendor files from R2, see below)

## Quick Start

### Prerequisites

- Node.js 18+
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

- **`src/lib/types.ts`** — Canonical TypeScript types (`Topic`, `AppSettings`, etc.)
- **`src/lib/storage.ts`** — CRUD for topics (IndexedDB/Tauri), settings, and offline queue
- **`src/lib/sync.ts`** — JSON-RPC calls to the Cloudflare Worker MCP backend, conflict detection, exponential backoff queue (max 8 attempts, capped at 5 min)
- **`src/lib/stores.ts`** — Svelte writable stores (single source of truth for topics, syncState, conflictQueue, chat)
- **`src/lib/claude.ts`** — Anthropic API streaming chat with agentic tool-call loop (`list_topics`, `get_topic`, `update_topic`, `create_topic`)
- **`src/lib/auth.ts`** — Secrets (admin secret, Claude API key) in OS keyring (Tauri) or `localStorage` (browser)
- **`src-tauri/src/main.rs`** — Rust backend: `keyring_get/set/delete`, `fs_read/write/list/delete`

### Remote Backend

The MCP Worker lives at `https://holmgard-lore-mcp.frozenregister.workers.dev` (sibling project `holmgard-lore-mcp/`). Admin writes go to `/admin/set-lore` and `/admin/delete-lore`; reads use JSON-RPC at `/mcp`.

### Sync & Conflict Model

Topics carry `{ version, updatedAt, syncedAt }` in their `meta`. Conflict detection compares local text vs. remote text vs. the stored `base` (the last known remote value). Conflicts are queued in `conflictQueue` and resolved via `ConflictResolver.svelte`.

### Hex Map Editor

The hex map editor uses the external `game.js` library (`static/hexmap/game.js`) for rendering. This file is in `.gitignore` and is fetched from Cloudflare R2 during the vendor build step — the hex map will not function in a fresh clone until vendor files are fetched via `pnpm vendor:build`. The `game-ui-bindings.js` patch (tracked in git) exposes the functions the SvelteKit UI needs.

## Testing

See [docs/testing-and-linting-guide.md](docs/testing-and-linting-guide.md) for the full testing reference.

### Unit & Integration Tests (Vitest)

```bash
pnpm test                   # Unit tests (jsdom)
pnpm test:integration       # Integration tests (fake-indexeddb + real fetch mocks)
pnpm test:coverage          # Unit tests with coverage report
```

21 unit test suites and 9 integration test suites covering storage, sync, auth, history, stores, diff, MCP, and more.

### E2E Tests (Playwright)

```bash
pnpm exec playwright install   # One-time browser install
pnpm test:e2e                  # Run all 52 tests headlessly
pnpm test:e2e:ui               # Interactive UI mode (recommended for development)
pnpm test:e2e:debug            # Step-through debugger
```

Five spec files cover the home topic list, navigation, settings, import/export, and the topic editor. Playwright auto-starts the Vite dev server — no separate build step required.

## File Structure

```text
.
├── src/
│   ├── lib/
│   │   ├── components/          # Svelte components
│   │   ├── __tests__/           # Unit + integration tests (Vitest)
│   │   ├── types.ts             # TypeScript types
│   │   ├── storage.ts           # Storage layer (IndexedDB/Tauri)
│   │   ├── sync.ts              # Network sync & conflict detection
│   │   ├── stores.ts            # Svelte stores
│   │   ├── claude.ts            # Anthropic API integration
│   │   └── auth.ts              # Authentication & secrets
│   ├── routes/
│   │   ├── +layout.svelte       # App shell, demo data seeding
│   │   ├── editor/[key]/        # Topic editor page
│   │   ├── world-editor/        # Hex map editor page
│   │   ├── import-export/       # Import/export page
│   │   └── settings/            # Settings page
│   └── app.html
├── src-tauri/                   # Rust backend
├── e2e/                         # Playwright E2E tests
├── docs/                        # Extended documentation
├── static/
│   └── hexmap/
│       ├── game.js              # Vendor — gitignored, fetched from R2
│       ├── game-ui-bindings.js  # Custom patch: function exposure for game.js
│       └── worker-patch.js      # Custom patch: worker path resolution
├── scripts/                     # Build & CI utilities
├── CLAUDE.md                    # AI agent development guidance
├── playwright.config.ts
├── vitest.config.ts
└── package.json
```

## Configuration

### Environment Variables

**Local development (`.env` file — see `.env.example`):**

- `VENDOR_MANIFEST` — JSON array of vendor files to fetch from Cloudflare R2
- `VENDOR_TOKEN` — Optional Bearer token for authenticated R2 downloads

**Cloudflare Pages build:**

Set `VENDOR_MANIFEST` in the Cloudflare Pages dashboard under **Settings → Environment variables** so the build pipeline can fetch vendor files.

### Build Configuration

- **Vite:** `vite.config.ts`
- **Type checking:** `pnpm check` (runs `svelte-kit sync` + `svelte-check`)
- **Vendor pipeline:** `scripts/fetch-deps.mjs` + `scripts/bundle-vendor.mjs`

## Scripts

| Script | Purpose |
| ------ | ------- |
| `pnpm dev` | Start Vite dev server (browser) |
| `pnpm tauri:dev` | Start Tauri desktop app with hot reload |
| `pnpm build` | Production web build (runs vendor:build first) |
| `pnpm tauri:build` | Production desktop build |
| `pnpm deploy` | Deploy to Cloudflare Pages |
| `pnpm vendor:fetch` | Fetch vendor files from Cloudflare R2 |
| `pnpm vendor:bundle` | Minify vendor files via esbuild |
| `pnpm vendor:build` | Fetch + bundle vendor files |
| `pnpm check` | Type check and sync SvelteKit |
| `pnpm check:watch` | Type check in watch mode |
| `pnpm test` | Run unit tests once |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm test:e2e:ui` | Run E2E tests with interactive UI |
| `pnpm test:e2e:debug` | Run E2E tests with step debugger |
| `pnpm prepush` | Local mirror of CI PR quality checks |

## Known Issues & Limitations

- **Hex map requires vendor files** — `game.js` and related files are fetched from a private R2 bucket and are not included in the repository. The hex map editor shows a blank canvas without them. Run `pnpm vendor:build` with a valid `VENDOR_MANIFEST` to fetch them.
- **Browser mode limitations** — IndexedDB storage in the browser has no OS keyring; Claude API key and admin secret are stored in `localStorage` (plaintext). Use Tauri mode for production workflows with sensitive keys.
- **No ESLint** — The project uses `svelte-check` for type safety and `markdownlint-cli2` for docs, but has no JavaScript/TypeScript linter configured.

## Contributing

1. Fork the repo and create a feature branch
2. Follow [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)
3. Update `CHANGELOG.md` under `## [Unreleased]` and include a `## Documentation` section in your PR body (required by CI)
4. Run `pnpm prepush` before pushing to catch CI failures locally

## License

All rights reserved. This project is not licensed for redistribution.

## Related Projects

- **holmgard-lore-mcp** — Cloudflare Worker MCP backend
- **external-hex-map-library** — External hex map library source (`game.js`)

## Support

Open an issue at [github.com/FrozenRegister/holmgard-lore-editor/issues](https://github.com/FrozenRegister/holmgard-lore-editor/issues).

---

**For Claude Code users:** See [CLAUDE.md](CLAUDE.md) for development commands and architecture details.
