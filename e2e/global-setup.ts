import { chromium, type FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:5173';

  // Pre-warm Vite so all modules are compiled before parallel workers start.
  // Without this, editor.spec.ts (alphabetically first) dispatches 4 concurrent
  // workers against a cold server, all competing for the same first-time
  // module compilation and timing out before h1 appears.
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Home page — waits for splash to clear and demo data to seed IDB
    await page.goto(baseURL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('h1', { timeout: 30000 });

    // Editor route — compiles MonacoEditor and other heavy editor modules
    await page.goto(`${baseURL}/editor/holmgard`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('.topic-key', { timeout: 15000 });

    console.log('[E2E Setup] Server pre-warmed — all modules compiled.');
  } catch (err) {
    // Best-effort: log but don't abort. Tests will be flaky on cold start if this fails.
    console.warn('[E2E Setup] Pre-warm failed (tests may be flaky):', err);
  } finally {
    await browser.close();
  }

  console.log('[E2E Setup] Global setup complete — using per-context fresh state.');
}
