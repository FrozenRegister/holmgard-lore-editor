# CLAUDE.md

This file provides guidance to Cline and CLAUDE (the VS Code AI coding agent) when working with code in this repository.

## Environment

**Use PowerShell commands only. Assume Windows 11.** Do not use bash, `cat`, `ls`, or other Linux commands. Use `Get-Content` instead of `cat`, `Get-ChildItem` instead of `ls`, `Remove-Item` instead of `rm`, etc.

## Commands

```bash
pnpm dev              # SvelteKit dev server (browser, no Tauri)
pnpm tauri:dev        # Full Tauri desktop app with hot reload
pnpm tauri:build      # Production desktop build
pnpm test             # Run all Vitest tests once
pnpm test:watch       # Vitest in watch mode
pnpm check            # svelte-kit sync + type check (run svelte-kit sync first)
pnpm test:e2e         # Run Playwright E2E tests
```

See [Testing and Linting Guide](docs/testing-and-linting-guide.md) for detailed testing documentation.

## Git workflow

When asked to review changes and push, always split changes into multiple logical commits grouped by concern instead of one large commit. Each group should be self-contained with a descriptive conventional-commit message (feat:, fix:, chore:, test:, etc.). Example groupings:

- **dependencies** — package.json + lockfile changes only
- **library/core module** — a new .ts file + its tests
- **UI page** — a route page + related component changes (e.g. sidebar nav link)
- **independent features** — separate commits for unrelated additions

After all commits are made, push once. This is the default behavior — no need for the user to ask explicitly.

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

**API surface convention — prefer MCP for reads, REST for privileged writes.** This is a read/write split, not a blanket rule. New **reads/queries** should call `/mcp` (JSON-RPC) via the `rpc()` helper in `src/lib/sync.ts` — the same path `get_lore`/`list_topics` use; the worker returns structured JSON in `result`. New **privileged writes / bulk ops** go to `/admin/*` with the admin secret (like `adminSave`/`adminSaveBatch`). When adding a remote capability, prefer an MCP method over a new REST GET route. The **map readback** feature follows this: map reads use `/mcp` (`get_map_*`), while map pushes stay on `/admin/map/*`. See `docs/d1-readback-plan.md` and `docs/MAP-SYNC-ARCHITECTURE.md`.

### Tauri commands (Rust)

`src-tauri/src/main.rs` exposes: `keyring_get`, `keyring_set`, `keyring_delete`, `fs_read`, `fs_write`, `fs_list`, `fs_delete`. All filesystem paths are relative to the OS app-data directory.

### Hex Map Editor

The hex map editor uses the external `game.js` library (`static/hexmap/game.js`) for rendering and manipulation. Supporting patch/extension files (e.g., `game-ui-bindings.js`, `worker-patch.js`) provide UI integration and address library limitations.

**⚠️ External JS Files:** Do not edit the `.js` files in `static/hexmap/` that are in `.gitignore` (e.g., `game.js`, `auth.js`, `cloud-storage.js`). These are pulled from external public URLs and are not controlled by this project. Checksums and last-verified dates are tracked in `static/hexmap/EXTERNAL_FILES.md`. Our custom patches (e.g., `game-ui-bindings.js`) are the only editor-maintained JS files in that directory.

### Testing

Tests use Vitest + jsdom. SvelteKit path aliases (`$lib`, `$app`) are remapped in `vitest.config.ts`; `$app` points to `src/app-mock/` which stubs SvelteKit navigation/stores. `svelte-kit sync` must run before type checking or tests that import generated types.

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
