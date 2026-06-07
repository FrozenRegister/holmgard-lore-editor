# Playwright Configuration Explanation

This file (`playwright.config.ts`) configures Playwright for end-to-end testing of the Holmgard Lore Editor application.

## Core Configuration

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
```

- **testDir**: Specifies the directory containing test files (`./e2e`)
- **globalSetup/Teardown**: Points to setup/teardown scripts that run once before/after all tests
- Uses `require.resolve()` to get absolute paths for reliability

## Parallel Execution & CI Settings

```typescript
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
```

- **fullyParallel**: Runs all tests in parallel across all worker processes
- **forbidOnly**: Fails if `test.only` is used (prevents accidental focused tests in CI)
- **retries**: Retries failed tests 2 times in CI, 0 times locally
- **workers**: Uses 1 worker in CI (for stability), unlimited locally

## Reporting

```typescript
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['json', { outputFile: './playwright-report/results.json' }]
  ],
```

- Generates both HTML report (for visual inspection) and JSON report (for CI integration)
- Reports saved to `./playwright-report/`

## Global Test Settings

```typescript
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
```

- **baseURL**: All tests use this as base URL (Vite dev server default)
- **trace**: Records trace only on first retry (helps debug flaky tests)

## Project Configurations (Browser Targets)

```typescript
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*.spec.ts',
    },
  ],
```

Two project configurations:
1. **chromium**: Standard Chromium desktop testing
2. **e2e**: Same browser but only runs `*.spec.ts` files (excludes other test types)

Both use Playwright's built-in `Desktop Chrome` device profile.

## Web Server Management

```typescript
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
```

- **command**: Starts the Vite dev server (`pnpm dev`)
- **url**: Waits for this URL to be ready before running tests
- **reuseExistingServer**: Reuses existing server locally, starts fresh in CI
- **timeout**: 120 seconds to start the server (generous for CI environments)

## Summary

This configuration:
- Runs E2E tests from `./e2e` directory
- Uses Chromium browser with desktop viewport
- Starts Vite dev server automatically
- Optimized for both local development and CI environments
- Provides detailed reporting (HTML + JSON)
- Includes global setup/teardown for test environment preparation