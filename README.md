# Holmgard Lore Editor

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

**Test coverage:** 15 E2E tests for hex map editor covering:
- Function exposure to window object
- Console error detection
- Menu interactions (File, Settings, Export)
- Zoom controls and performance
- Modal operations
- Undo/Redo system

**Details:** See [TESTING.md](TESTING.md) for full test documentation, workflows, and troubleshooting.

## File Structure

```
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
│   ├── hexmap/                  # External hex map library
│   │   ├── game.js              # External (gitignore)
│   │   ├── game-ui-bindings.js  # Function exposure for game.js
│   │   └── worker-patch.js      # Worker path resolution
│   └── ...
├── CLAUDE.md                    # Development instructions
├── TESTING.md                   # Test documentation
├── vitest.config.ts             # Vitest configuration
├── playwright.config.ts         # Playwright configuration
└── package.json
```

## Configuration

### Environment Variables

**TODO:** Document required environment variables here (API keys, etc.)

### Build Configuration

- **Vite:** `vite.config.ts` (SvelteKit + Svelte plugin)
- **Type checking:** `svelte-check` via `pnpm check`
- **SvelteKit sync:** Required before type checking: `pnpm svelte-kit sync`

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start Vite dev server (browser) |
| `pnpm tauri:dev` | Start Tauri desktop app with hot reload |
| `pnpm build` | Production web build |
| `pnpm tauri:build` | Production desktop build |
| `pnpm check` | Type check and sync SvelteKit |
| `pnpm check:watch` | Type check in watch mode |
| `pnpm test` | Run unit tests once |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm test:e2e:ui` | Run E2E tests with interactive UI |
| `pnpm test:e2e:debug` | Run E2E tests with step debugger |

## Sync & Conflict Model

**TODO:** Document conflict detection and resolution model in detail.

Topics have `{ version, updatedAt, syncedAt }` in their `meta`. Conflict detection compares local vs. remote vs. stored base value. Conflicts are queued in `conflictQueue` store and resolved via `ConflictResolver.svelte`.

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
