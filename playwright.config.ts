import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // E2E Lifecycle Orchestration
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  // Reporting and Artifacts
  reporter: [['html', { outputFolder: './playwright-report' }], ['json', { outputFile: './playwright-report/results.json' }]],
  outputDir: 'playwright-report/test-results',
  
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Capture visual state on failure for easier debugging of "actual functionality"
    screenshot: 'only-on-failure',
  },

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

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
