import type { FullConfig } from '@playwright/test';

// globalTeardown runs before Playwright writes results.json, so any attempt
// to read that file here would see the previous run's stale data. Playwright's
// native terminal summary ("N passed / N failed") is accurate — no need to
// duplicate it here.
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  // nothing to do
}
