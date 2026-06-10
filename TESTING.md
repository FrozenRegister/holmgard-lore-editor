# Test Suites for Hex Map Editor

This document describes the unit, integration, and E2E test suites for the hex map editor's function exposure and menu interactions.

## Unit Tests (Vitest)

### Game UI Bindings

**File:** `src/lib/__tests__/game-ui-bindings.test.ts`

Tests the `game-ui-bindings.js` script in isolation without a running browser. Covers:

### Zoom Functions

- ✅ `zoomIn()` is created if not present
- ✅ `zoomOut()` is created if not present
- ✅ Zoom respects scale limits (min: 0.02, max: 500)
- ✅ Zoom operations are debounced to prevent rapid consecutive calls
- ✅ Zoom triggers `renderHex()` re-render

### Stub Functions

- ✅ `newMap()` shows confirmation dialog
- ✅ `quickCloudSave()` shows "Saving..." notification
- ✅ `shareMap()` shows "coming soon" message
- ✅ `returnToParentMap()` shows warning notification

### Auth Functions

- ✅ `showAuthModal()` opens the account modal
- ✅ Shows error notification if modal not found

### Undo/Redo System

- ✅ `undoRedoSystem` object is created with `undo()` and `redo()` methods

### Function Audit

- ✅ Detects missing expected functions
- ✅ Confirms when functions are properly exposed

**Run unit tests:**

```bash
pnpm test                    # Run all tests once
pnpm test:watch             # Run tests in watch mode
pnpm vitest run src/lib/__tests__/game-ui-bindings.test.ts  # Run only this file
```

## E2E Tests (Playwright)

**File:** `e2e/hex-map-menu.spec.ts`

Tests the hex map editor in a real browser, verifying user interactions and menu behavior.

### Browser Coverage

- ✅ Chromium (desktop)
- Easily extensible to Firefox, WebKit via playwright.config.ts

### Test Cases

#### Function Availability

- ✅ All expected functions exposed to `window` object
- ✅ No console errors on page load
- ✅ Game UI Bindings initialization logs present

#### File Menu

- ✅ New Map triggers confirmation dialog
- ✅ Save shows "Saving..." notification

#### Zoom Controls

- ✅ Zoom buttons exist and are callable
- ✅ Zoom In increases viewport scale
- ✅ Zoom Out decreases viewport scale
- ✅ Zoom operations don't cause performance violations

#### Settings & Modals

- ✅ Settings modal opens and closes
- ✅ Auth modal is callable and functional

#### Export Functions

- ✅ Export functions available: `exportAsPNG()`, `exportAsJSON()`, `showFoundryExportDialog()`, `importMapFromFile()`

#### Share & Auth

- ✅ Share Map shows "coming soon" notification
- ✅ Auth modal can be opened

#### Undo/Redo

- ✅ Undo/Redo system is accessible with `.undo()` and `.redo()` methods

**Run E2E tests:**

```bash
# Install Playwright browsers first (one time)
pnpm exec playwright install

# Run E2E tests
pnpm test:e2e               # Run all tests

# Interactive UI mode (easiest to watch/debug)
pnpm test:e2e:ui           

# Debug mode (open inspector)
pnpm test:e2e:debug        

# Watch single file
pnpm test:e2e e2e/hex-map-menu.spec.ts
```

## Test Setup

### Prerequisites

1. Install dependencies: `pnpm install`
2. For Playwright: `pnpm exec playwright install`

### Configuration

- **Playwright config:** `playwright.config.ts`
  - Base URL: `http://localhost:5173`
  - Auto-starts `pnpm dev` server
  - Reports: HTML test report in `playwright-report/`
  - Retries: 2 retries in CI, 0 in local

- **Vitest unit config:** `vitest.config.ts`
  - Environment: jsdom
  - Globals: true (no need for imports)
  - Include: `src/lib/**/*.{test,spec}.{ts,js}`
  - Exclude: `*.integration.test.*` files (those belong to integration suite)

- **Vitest integration config:** `vitest.integration.config.ts`
  - Include: `src/lib/**/*.integration.test.ts`
  - Coverage output: `coverage/integration/`
  - Uses `fake-indexeddb/auto` for IndexedDB-backed tests

## Common Workflows

### Develop a feature + test locally

```bash
# Terminal 1: Start dev server
pnpm dev

# Terminal 2: Run tests in watch mode
pnpm test:watch
pnpm test:e2e:ui  # For E2E, opens interactive UI
```

### Check test coverage

```bash
pnpm test -- --coverage
```

### Debug a failing E2E test

```bash
pnpm test:e2e:debug
# Opens Playwright Inspector; step through test, see live page updates
```

### Run before commit

```bash
pnpm test          # All unit tests
pnpm test:e2e      # All E2E tests
```

## Test Reports

### Vitest

- Console output after `pnpm test`
- Detailed coverage: `pnpm test -- --coverage`

### Playwright

- HTML report: `pnpm test:e2e` creates `playwright-report/index.html`
- Open with: `pnpm exec playwright show-report`
- Includes screenshots, videos (if configured), traces

## Troubleshooting

**E2E tests fail to start dev server:**

- Check that `pnpm dev` can start on port 5173
- Ensure no other process is using that port
- Set `reuseExistingServer: true` in playwright.config.ts to use running server

**E2E tests timeout waiting for elements:**

- Hex map canvas may load slowly; timeouts are generous (10s)
- Check browser console for errors: `page.on('console', ...)`
- Use `pnpm test:e2e:debug` to step through

**Unit tests fail with "undefined is not a function":**

- Vitest uses jsdom which is lighter than a real browser
- Some game.js functions may not be available in test environment
- Tests mock expected functions; add mocks for missing ones

## Additional Test Files

### Hex Map Utilities

**File:** `src/lib/__tests__/hexmap-utils.test.ts`

Tests for hex coordinate conversion, coastline point-in-polygon, terrain classification, and procedural hex generation:

- `axialToLatLon()` / `latLonToAxial()` - Coordinate conversion and roundtrip
- `isInsideCoastline()` - Point-in-polygon for Polygon and MultiPolygon features
- `getTerrainFromLatitude()` - Latitude band terrain classification
- `generateElevation()` - Elevation range per terrain type
- `generateProceduralHex()` - Procedural hex generation
- `getHexForRender()` - Render priority lookup (explicit → procedural → ocean)

### Svelte Stores

**File:** `src/lib/__tests__/stores.test.ts`

Tests for all Svelte stores and their behavior:

- `topics` store - CRUD operations
- `topicMap` derived store - Map derivation from topics array
- `settings` store - Default values and updates
- `syncState` store - State transitions
- `conflictQueue` / `activeConflict` - Queue management
- UI state stores (`activeTopicKey`, `isMobile`, `editorMode`, `collapseSidebar`)
- Filter stores with localStorage persistence (`listActiveType`, `listActiveStatus`, `listSortBy`, `selectedForDeletion`)
- Toast system (`toasts`, `showToast`) - Creation, auto-removal, unique IDs

### Auth Module

**File:** `src/lib/__tests__/auth.test.ts`

Tests for authentication and API key management:

- Browser mode (localStorage fallback)
- Tauri mode (keyring integration)
- `getAdminSecret()`, `getClaudeApiKey()`, `setClaudeApiKey()`, `clearClaudeApiKey()`
- `getMcpApiKey()`, `setMcpApiKey()`, `clearMcpApiKey()`
- Edge cases (empty strings, special characters, long keys)

### Sync Module (Extended)

**File:** `src/lib/__tests__/sync.test.ts`

Extended tests for sync operations:

- `detectConflict()` - Conflict detection scenarios
- `enqueuePendingDelete()` / `dequeuePendingDeletes()` - Pending delete queue
- `enqueue()` - Offline queue management
- `flushQueue()` - Queue flushing with exponential backoff
- `listTopicsRemote()`, `getTopicRemote()`, `batchGetTopicsRemote()`
- `adminSave()`, `adminDelete()` - Admin API operations
- `getTopicHistories()`, `getChanges()` - History and changelog sync
- Edge cases (max attempts, format parsing)

## Integration Tests (Vitest — separate config)

Integration tests exercise real cross-module interactions without mocking sibling `$lib` modules. They are configured separately from unit tests:

**Run integration tests:**

```bash
pnpm test:integration           # Run all integration tests with coverage
```

**Integration test files:**

| File | Tests | Covers |
|------|-------|--------|
| `sync.integration.test.ts` | 26 | JSON-RPC, admin save/delete, conflict detection, pending deletes, changelog, batch ops |
| `auth.integration.test.ts` | 12 | Browser + Tauri dual-path API key management, concurrent calls, edge cases |
| `history.integration.test.ts` | 8 | Undo/redo stack with localStorage backing, MAX_ENTRIES trimming |
| `defaults.integration.test.ts` | 5 | Settings defaults, storage/store integration |
| `stores.integration.test.ts` | 13 | Svelte writable/derived store reactivity, toast system |
| `storage.integration.test.ts` | 9 | IndexedDB CRUD via fake-indexeddb, localStorage settings |
| `diff.integration.test.ts` | 8 | LCS line diff with real-world Markdown text |
| `mcp.integration.test.ts` | 9 | JSON-RPC tools/call, checkAuth, listTools |

### Key patterns

- Mock `@tauri-apps/api/tauri` with `vi.mock()` and `vi.stubGlobal('__TAURI__', {})` for Tauri mode
- Use `delete globalThis.__TAURI__` (not `stubGlobal(undefined)`) to simulate browser mode (the `'in'` operator detects stubGlobal even with undefined value)
- Use `fake-indexeddb/auto` for Dexie/IndexedDB-backed tests
- Mock `globalThis.fetch` for network-layer tests
- Integration tests do NOT mock any `$lib/*` modules

## Future Enhancements

- [ ] Add test coverage thresholds (e.g., 80% minimum)
- [ ] Add visual regression tests (Playwright's visual comparison)
- [ ] Add performance benchmarks for zoom operations
- [ ] Extend E2E tests to cover touch/mobile interactions
- [ ] Add load testing for large hex maps (performance stress tests)
