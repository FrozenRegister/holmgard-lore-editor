# Holmgard Lore Editor

[![CI](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/FrozenRegister/holmgard-lore-editor/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/FrozenRegister/holmgard-lore-editor/branch/main/graph/badge.svg)](https://codecov.io/gh/FrozenRegister/holmgard-lore-editor)

A SvelteKit + Tauri v1 desktop application for editing world-building lore with integrated hex map support.

## Overview

**TODO:** Add project description, goals, and features here.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (or npm)

### Installation

```bash
pnpm install
```

### Development

**Browser mode (hot reload, no Tauri):**

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

**Desktop app mode (Tauri with hot reload):**

```bash
pnpm tauri:dev
```

**Production build:**

```bash
pnpm build         # Web build
pnpm tauri:build   # Desktop binary
```

### Deployment

**Deploy to Cloudflare Workers:**

```bash
pnpm deploy
```

This runs the complete deployment pipeline:

1. `npm run vendor:build` — Fetch vendor JS/CSS from Cloudflare R2, minify via esbuild
2. `vite build` — Build the SvelteKit app
3. `wrangler deploy` — Deploy to Cloudflare Workers

**Requirements:**

- Cloudflare Workers project with authentication token
- `VENDOR_MANIFEST` environment variable set in Cloudflare Build & Deploy settings

**Local testing (without deploying):**

```bash
pnpm build         # Runs vendor:build + vite build (no wrangler)
```

## Architecture

### Dual-Environment Pattern

Every storage/filesystem call checks `IS_TAURI` (`'__TAURI__' in window`). In Tauri it calls `invoke('fs_*')` or `invoke('keyring_*')`; in the browser (`pnpm dev`) it falls back to `localStorage` with an `hle:file:` prefix.

### Key Files

- **`src/lib/types.ts`** — Canonical TypeScript types (`Topic`, `AppSettings`, etc.)
- **`src/lib/storage.ts`** — CRUD for topics, settings, and the offline queue
- **`src/lib/sync.ts`** — JSON-RPC calls to the Cloudflare Worker MCP backend
- **`src/lib/stores.ts`** — Svelte writable stores (single source of truth)
- **`src/lib/claude.ts`** — Anthropic API streaming chat with agentic tool-call loop
- **`src/lib/auth.ts`** — Secrets stored in OS keyring (Tauri) or `localStorage` (browser)
- **`src-tauri/src/main.rs`** — Rust backend exposing filesystem and keyring commands

### Remote Backend

The MCP Worker lives at `https://holmgard-lore-mcp.frozenregister.workers.dev` (sibling project `holmgard-lore-mcp/`). Admin writes go to `/admin/set-lore` and `/admin/delete-lore` with a secret; reads use JSON-RPC at `/mcp`.

## Testing

### Unit Tests (Vitest)

Run all unit tests:

```bash
pnpm test
```

Run in watch mode:

```bash
pnpm test:watch
```

Run a specific file:

```bash
pnpm vitest run src/lib/__tests__/game-ui-bindings.test.ts
```

**Test coverage:** 211 tests across 11 test suites including:

- **game-ui-bindings.test.ts** (13 tests) — Hex map editor function exposure, zoom controls, stubs, auth
- Storage, sync, import/export, worldmap, MCP integration, and more

### E2E Tests (Playwright)

Install Playwright browsers (one time):

```bash
pnpm exec playwright install
```

Run E2E tests:

```bash
pnpm test:e2e              # Run all tests headlessly
pnpm test:e2e:ui           # Interactive UI mode (recommended for development)
pnpm test:e2e:debug        # Step-through debugger
```

**Test Scope:** Full-browser validation of the hex map editor, ensuring:

- **Interface Integrity:** Function exposure to window and console error detection.
- **Workflows:** Menu interactions (File, Settings, Export) and Modal operations.
- **User Experience:** Zoom performance, viewport scaling, and Undo/Redo system integrity.

**Details:** See [TESTING.md](TESTING.md) for full test documentation, workflows, and troubleshooting.

## File Structure

```bash
.
├── src/
│   ├── lib/
│   │   ├── components/          # Svelte components
│   │   ├── __tests__/           # Unit tests (Vitest)
│   │   ├── types.ts             # TypeScript types
│   │   ├── storage.ts           # Storage layer (localStorage/Tauri)
│   │   ├── sync.ts              # Network sync & conflict detection
│   │   ├── stores.ts            # Svelte stores
│   │   ├── claude.ts            # Anthropic API integration
│   │   └── auth.ts              # Authentication & secrets
│   ├── routes/
│   │   ├── world-editor/        # Hex map editor page
│   │   └── ...
│   └── app.html
├── src-tauri/                   # Rust backend
├── e2e/                         # Playwright E2E tests
├── static/
│   ├── hexmap/                  # Hex map editor
│   │   ├── game.js              # Vendor (gitignored, fetched from R2)
│   │   ├── auth.js              # Vendor (gitignored, fetched from R2)
│   │   ├── cloud-storage.js     # Vendor (gitignored, fetched from R2)
│   │   ├── game-ui-bindings.js  # Custom: Function exposure for game.js
│   │   ├── worker-patch.js      # Custom: Worker path resolution
│   │   └── ...
│   └── ...
├── scripts/
│   ├── fetch-deps.mjs           # Fetch vendor files from URLs
│   ├── bundle-vendor.mjs        # Minify vendor files via esbuild
│   ├── check-vendor.mjs         # Verify vendor files exist
│   ├── load-env.mjs             # Utility: Parse .env file
│   └── ...
├── CLAUDE.md                    # Development instructions
├── TESTING.md                   # Test documentation
├── .env.example                 # Vendor pipeline config template
├── vitest.config.ts             # Vitest configuration
├── playwright.config.ts         # Playwright configuration
└── package.json
```

## Configuration

### Environment Variables

**Local development (`.env` file):**

- `VENDOR_MANIFEST` — JSON array of vendor files to fetch from Cloudflare R2 (see `.env.example`)
- `VENDOR_TOKEN` — Optional Bearer token for authenticating vendor file downloads

**Cloudflare deployment:**

Set `VENDOR_MANIFEST` in Cloudflare Workers → **Settings** → **Build & Deploy** → **Environment variables**. This tells the build process where to fetch the vendor JS/CSS files.

### Build Configuration

- **Vite:** `vite.config.ts` (SvelteKit + Svelte plugin)
- **Type checking:** `svelte-check` via `pnpm check`
- **SvelteKit sync:** Required before type checking: `pnpm svelte-kit sync`
- **Vendor pipeline:** `scripts/fetch-deps.mjs` and `scripts/bundle-vendor.mjs` handle vendor file management

## Scripts

| Script | Purpose |
| ------ | ------- |
| `pnpm dev` | Start Vite dev server (browser) |
| `pnpm tauri:dev` | Start Tauri desktop app with hot reload |
| `pnpm build` | Production web build (runs vendor:build first) |
| `pnpm tauri:build` | Production desktop build |
| `pnpm deploy` | Deploy to Cloudflare Workers (runs vendor:build + build + wrangler deploy) |
| `pnpm vendor:fetch` | Fetch vendor files from Cloudflare R2 |
| `pnpm vendor:bundle` | Minify vendor files via esbuild |
| `pnpm vendor:build` | Fetch + bundle vendor files |
| `pnpm check` | Type check and sync SvelteKit |
| `pnpm check:watch` | Type check in watch mode |
| `pnpm test` | Run unit tests once |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm test:e2e:ui` | Run E2E tests with interactive UI |
| `pnpm test:e2e:debug` | Run E2E tests with step debugger |

## Sync & Conflict Model

The editor uses a **Local-First with Remote Sync** model. Every lore topic maintains metadata containing a `version`, `updatedAt` timestamp, and `syncedAt` status.

1. **Conflict Detection:** When syncing, the application compares the local version against the remote version. If both have changed since the last known common "base" version, a conflict is triggered.
2. **Resolution:** Conflicts are pushed to a `conflictQueue` Svelte store. Users are presented with a diff view (`ConflictResolver.svelte`) to pick the local version, the remote version, or a manual merge.
3. **Offline Queue:** Mutations made while offline are stored in a persistent queue with exponential backoff (up to 8 attempts) to ensure eventually consistent synchronization with the Cloudflare Worker backend.

## Known Issues & Limitations

**TODO:** List known issues, browser compatibility notes, performance limitations, etc.

## Contributing

**TODO:** Add contribution guidelines here.

## License

**TODO:** Add license information here.

## Related Projects

- **holmgard-lore-mcp** — Cloudflare Worker MCP backend
- **holmgard-lore-game** — External hex map library (game.js)

## Support

**TODO:** Add support/contact information here.

---

**For Claude Code users:** See [CLAUDE.md](CLAUDE.md) for development commands and architecture details.
