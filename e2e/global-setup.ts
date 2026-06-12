import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Each test runs in a fresh browser context, so demo data loads automatically
  // on first visit when IndexedDB/localStorage is empty.
  console.log('[E2E Setup] Global setup complete — using per-context fresh state.');
}
