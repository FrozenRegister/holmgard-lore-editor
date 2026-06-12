# Testing and Linting Guide

This guide documents the testing and linting process for holmgard-lore-editor, including setup, running tests, and known issues.

## Quick Start

```bash
pnpm test                   # Run all vitest unit tests
pnpm check                  # Run SvelteKit sync + svelte-check (type checking)
pnpm test:e2e               # Run Playwright E2E tests
pnpm test:e2e:ui            # Run E2E tests with UI
```

## Test Suite Status

### ✅ Unit Tests (vitest)

- **Status**: Tests configured with SvelteKit and jsdom
- **Tool**: Vitest + jsdom + @testing-library/svelte
- **Coverage**: Tests use path aliases ($lib, $app) remapped in vitest.config.ts
- **Command**: `pnpm test`
- **Watch mode**: `pnpm test:watch`
- **Coverage**: `pnpm test:coverage`

**Setup Notes:**

- SvelteKit path aliases are remapped in `vitest.config.ts`
- `$app` points to `src/app-mock/` which stubs SvelteKit navigation/stores
- Run `svelte-kit sync` before tests if you hit import errors on generated types

### ✅ Type Checking (svelte-check)

- **Status**: SvelteKit type checking
- **Tool**: SvelteKit with TypeScript
- **Command**: `pnpm check`
- **Watch mode**: `pnpm check:watch`

**Important**: Run `svelte-kit sync` first if tests fail with generated type errors.

### ✅ E2E Tests (Playwright)

- **Status**: Browser-based end-to-end tests
- **Tool**: Playwright with Chromium
- **Command**: `pnpm test:e2e`
- **UI Mode**: `pnpm test:e2e:ui` (interactive test runner)
- **Debug**: `pnpm test:e2e:debug` (step through with inspector)

**Note**: Playwright auto-starts the Vite dev server (`pnpm dev`) before running tests — no separate build step required.

**Spec files (52 tests total):**

| File | Tests | Covers |
|------|-------|--------|
| `e2e/home.spec.ts` | 13 | Topic list, search, filter chips, sort, count badge, action buttons |
| `e2e/navigation.spec.ts` | 7 | Sidebar links, `aria-current`, cross-route navigation |
| `e2e/settings.spec.ts` | 11 | All 5 form sections, show/hide toggle, save button |
| `e2e/import-export.spec.ts` | 9 | Cards, export filenames, file input attributes, import-updates-count |
| `e2e/editor.spec.ts` | 10 | Card → editor navigation, preview toggle, history panel, direct URL |

Tests use the app's built-in demo data seeding — each fresh Playwright context starts empty, causing `loadDemoData()` to run automatically in `+layout.svelte`, so no manual seeding is needed.

## Coverage Quality Gate

All source files in `src/lib/` must have at least **80% line coverage** in the unit test suite. Run `pnpm coverage:gaps` to check for files below threshold. The gap analysis report is written to `coverage-gap-report/gap-report.md`.

## Linting

There is currently **no ESLint** setup in the editor repository. The code follows the style guide documented in `docs/style-guide.md`.

For type safety, use:

- `pnpm check` (svelte-check with TypeScript)
- `pnpm test` (vitest catches type issues at runtime)

## CI/CD Pipeline

### Workflows Involved

1. **CI** (`.github/workflows/ci.yml`)
   - `lint-and-typecheck`: Runs `pnpm check` (svelte-check)
   - `unit-tests`: Runs `pnpm test` with coverage
   - `integration-tests`: Runs vitest integration suite
   - `e2e-tests`: Runs Playwright E2E tests
   - `coverage-gate`: Validates coverage and runs gap analysis

2. **Validate Workflows** (`.github/workflows/validate-workflows.yml`)
   - Validates YAML syntax of workflow files
   - Checks for required workflow fields

3. **PR Quality** (`.github/workflows/pr-quality.yml`)
   - Requires CHANGELOG.md update
   - Requires documentation changes (or docs section in PR body)

### CI Status on Main

- **Test requirements**: Must pass on PR
- **Type-check**: Must pass (`pnpm check`)
- **E2E**: Must pass

## Development Workflow

### When Adding New Code

1. **Create component/logic**

   ```bash
   # Create the feature
   # Write accompanying tests
   ```

2. **Run tests locally**

   ```bash
   pnpm test               # Unit tests
   pnpm check              # Type checking
   pnpm test:e2e           # E2E tests (if UI-related)
   ```

3. **Check type safety**

   ```bash
   # svelte-check runs as part of pnpm check
   # It checks:
   # - Svelte component reactivity
   # - TypeScript types
   # - Template type safety
   ```

4. **Before committing**

   ```bash
   pnpm test && pnpm check && pnpm test:e2e
   ```

### When Adding Tests

Tests should cover:

- **Unit tests** for utilities, stores, sync logic (vitest + jsdom)
- **Component tests** using @testing-library/svelte
- **E2E tests** for critical user flows (Playwright)

Example test locations:

- `src/lib/__tests__/` — utility and store tests
- `src/lib/components/__tests__/` — component tests
- `e2e/` — end-to-end tests

## Test Environment Setup

### Path Aliases

Tests use SvelteKit path aliases. Ensure your IDE recognizes:

- `$lib` → `src/lib`
- `$app` → `src/app-mock` (for tests, not browser)

These are configured in:

- `vitest.config.ts` — test resolution
- `svelte.config.js` — build resolution
- `tsconfig.json` — TypeScript resolution

### Important: svelte-kit sync

Before running tests or type checking, SvelteKit may need to generate types:

```bash
pnpm exec svelte-kit sync
pnpm check
pnpm test
```

If you see "Cannot find module $app" or similar, run `svelte-kit sync` first.

## Related Documentation

- [AI Automation Pipeline](./ai-automation-pipeline.md) — GitHub Actions workflows
- [CLAUDE.md](../CLAUDE.md) — Development guidance
- [Style Guide](./style-guide.md) — Code style conventions
