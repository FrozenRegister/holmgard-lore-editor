import { test, expect } from '@playwright/test';

test.describe('Import / Export Page', () => {
  test.beforeEach(async ({ page }) => {
    // Visit home first so demo data loads into storage, then navigate
    await page.goto('/');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.goto('/import-export');
    await page.waitForSelector('h1');
  });

  test('shows Import / Export heading', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Import / Export');
  });

  test('shows subtitle', async ({ page }) => {
    await expect(page.locator('.subtitle')).toContainText('Back up your lore');
  });

  test('all four cards are visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Export JSON Bundle' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Export ZIP of Markdown' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Import JSON Bundle' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Import ZIP of Markdown' })).toBeVisible();
  });

  test('topic count is shown', async ({ page }) => {
    const statsRow = page.locator('.stats-row');
    await expect(statsRow).toBeVisible();
    await expect(statsRow).toContainText('topics');
  });

  test('demo topics are counted (> 0)', async ({ page }) => {
    const statsRow = page.locator('.stats-row');
    const text = await statsRow.textContent();
    const match = text?.match(/(\d+)\s+topics/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  test('Export JSON triggers a download with correct filename', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button', { hasText: 'Export JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('holmgard-lore-export.json');
  });

  test('Export ZIP triggers a download with correct filename', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button', { hasText: 'Export ZIP' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('holmgard-lore-export.zip');
  });

  test('Import JSON file input accepts .json files', async ({ page }) => {
    const fileInput = page.locator('input[type="file"][accept*=".json"]');
    await expect(fileInput).toBeAttached();
    await expect(fileInput).toHaveAttribute('accept', '.json,application/json');
  });

  test('Import ZIP file input accepts .zip files', async ({ page }) => {
    const fileInput = page.locator('input[type="file"][accept*=".zip"]');
    await expect(fileInput).toBeAttached();
    await expect(fileInput).toHaveAttribute('accept', '.zip,application/zip');
  });

  test('importing a valid JSON bundle updates topic count', async ({ page }) => {
    const initialText = await page.locator('.stats-row').textContent();
    const initialMatch = initialText?.match(/(\d+)\s+topics/);
    const initialCount = Number(initialMatch![1]);

    // Build a minimal valid bundle with a brand-new topic key
    const bundle = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      topics: [
        {
          key: 'e2e-import-test',
          text: '# E2E Import Test\n\nImported via Playwright.',
          meta: { updatedAt: new Date().toISOString(), version: 999 },
        },
      ],
    });

    const fileInput = page.locator('input[type="file"][accept*=".json"]');
    await fileInput.setInputFiles({
      name: 'test-bundle.json',
      mimeType: 'application/json',
      buffer: Buffer.from(bundle),
    });

    // Wait for import toast
    await expect(page.locator('.toast')).toContainText(/Imported/);

    // Count should have increased
    const afterText = await page.locator('.stats-row').textContent();
    const afterMatch = afterText?.match(/(\d+)\s+topics/);
    expect(Number(afterMatch![1])).toBeGreaterThan(initialCount);
  });
});
