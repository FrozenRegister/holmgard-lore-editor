# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # SvelteKit dev server (browser, no Tauri)
pnpm tauri:dev        # Full Tauri desktop app with hot reload
pnpm tauri:build      # Production desktop build
pnpm test             # Run all Vitest tests once
pnpm test:watch       # Vitest in watch mode
pnpm check            # svelte-kit sync + type check (run svelte-kit sync first)
```

Run a single test file:
```bash
pnpm vitest run src/lib/__tests__/sync.test.ts
```

## Architecture

This is a **SvelteKit + Tauri v1** desktop app for editing world-building lore. The frontend is Svelte 4; the Rust backend (`src-tauri/`) exposes a small set of `invoke`-able commands.

### Dual-environment pattern

Every storage/filesystem call checks `IS_TAURI` (`'__TAURI__' in window`). In Tauri it calls `invoke('fs_*')` or `invoke('keyring_*')`; in the browser (`pnpm dev`) it falls back to `localStorage` with an `hle:file:` prefix. This pattern is used in `src/lib/storage.ts`, `src/lib/history.ts`, and `src/lib/auth.ts`.

### Data flow

- **`src/lib/types.ts`** — canonical TypeScript types (`Topic`, `AppSettings`, `ConflictInfo`, etc.)
- **`src/lib/storage.ts`** — CRUD for topics, settings, and the offline queue
- **`src/lib/sync.ts`** — JSON-RPC calls to the Cloudflare Worker MCP backend (`/mcp`), conflict detection, and offline queue with exponential backoff (max 8 attempts, capped at 5 min)
- **`src/lib/stores.ts`** — Svelte writable stores; single source of truth for topics, syncState, conflictQueue, and chat state
- **`src/lib/claude.ts`** — Anthropic API streaming chat with an agentic tool-call loop (`list_topics`, `get_topic`, `update_topic`, `create_topic`); uses `claude-sonnet-4-6`
- **`src/lib/auth.ts`** — Secrets (admin secret, Claude API key) stored in OS keyring via Tauri or `localStorage` in browser

### Sync & conflict model

Topics have `{ version, updatedAt, syncedAt }` in their `meta`. Conflict detection compares local text vs. remote text vs. a stored `base` (the last known remote value before local edits began). Conflicts are queued in `conflictQueue` store and resolved via `ConflictResolver.svelte`.

### Remote backend

The MCP Worker lives at `https://holmgard-lore-mcp.frozenregister.workers.dev` (sibling project `holmgard-lore-mcp/`). Admin writes go to `/admin/set-lore` and `/admin/delete-lore` with a secret; reads use JSON-RPC at `/mcp`.

### Tauri commands (Rust)

`src-tauri/src/main.rs` exposes: `keyring_get`, `keyring_set`, `keyring_delete`, `fs_read`, `fs_write`, `fs_list`, `fs_delete`. All filesystem paths are relative to the OS app-data directory.

### Hex Map Editor

The hex map editor uses the external `game.js` library (`static/hexmap/game.js`) for rendering and manipulation. Supporting patch/extension files (e.g., `game-ui-bindings.js`, `worker-patch.js`) provide UI integration and address library limitations.

**⚠️ External JS Files:** Do not edit the `.js` files in `static/hexmap/` that are in `.gitignore` (e.g., `game.js`, `auth.js`, `cloud-storage.js`). These are generated/maintained externally in the sibling `external-hex-map-library` project. Our custom patches (e.g., `game-ui-bindings.js`) are the only editor-maintained JS files in that directory.

### Testing

Tests use Vitest + jsdom. SvelteKit path aliases (`$lib`, `$app`) are remapped in `vitest.config.ts`; `$app` points to `src/app-mock/` which stubs SvelteKit navigation/stores. `svelte-kit sync` must run before type checking or tests that import generated types.
