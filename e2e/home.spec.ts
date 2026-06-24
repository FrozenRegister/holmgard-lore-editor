import { test, expect } from '@playwright/test';

test.describe('Home — Topic List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the initialising screen to clear and demo data to load
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });

  test('shows All Topics heading', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('All Topics');
  });

  test('loads demo topics on first visit', async ({ page }) => {
    // The app seeds demo data when storage is empty; holmgard is the first topic
    await expect(page.locator('[aria-label="Open topic holmgard"]')).toBeVisible();
  });

  test('topic count badge shows a non-zero count', async ({ page }) => {
    const badge = page.locator('.badge').first();
    await expect(badge).toBeVisible();
    const count = await badge.textContent();
    expect(Number(count?.trim())).toBeGreaterThan(0);
  });

  test('search input is visible and has correct placeholder', async ({ page }) => {
    const search = page.locator('input[type="search"]');
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('placeholder', 'Search topics…');
  });

  test('search filters topics and shows empty state', async ({ page }) => {
    const search = page.locator('input[type="search"]');
    await search.fill('zzz-absolutely-no-match-xyz');
    await expect(page.locator('text=No topics match the current filters.')).toBeVisible();
  });

  test('clearing search restores topic list', async ({ page }) => {
    const search = page.locator('input[type="search"]');
    await search.fill('zzz-no-match');
    await search.clear();
    await expect(page.locator('[aria-label="Open topic holmgard"]')).toBeVisible();
  });

  test('sort select has expected options', async ({ page }) => {
    const select = page.locator('select[aria-label="Sort topics"]');
    await expect(select).toBeVisible();
    const options = await select.locator('option').allTextContents();
    expect(options).toContain('Name A→Z');
    expect(options).toContain('Name Z→A');
    expect(options).toContain('Last Updated (newest)');
    expect(options).toContain('Last Updated (oldest)');
  });

  test('All filter chip is active by default', async ({ page }) => {
    const allChip = page.locator('button.chip', { hasText: 'All' });
    await expect(allChip).toHaveClass(/chip-active/);
  });

  test('filter chips are visible', async ({ page }) => {
    await expect(page.locator('button.chip', { hasText: 'All' })).toBeVisible();
    await expect(page.locator('button.chip', { hasText: /Conflicts/ })).toBeVisible();
    await expect(page.locator('button.chip', { hasText: /Removed from Remote/ })).toBeVisible();
    await expect(page.locator('button.chip', { hasText: /Recent/ })).toBeVisible();
  });

  test('clicking a status filter chip activates it independently of All', async ({ page }) => {
    // "All" is the type filter; "Conflicts" is a status filter — they are independent
    const allChip = page.locator('button.chip', { hasText: 'All' });
    const conflictsChip = page.locator('button.chip', { hasText: /Conflicts/ });

    await conflictsChip.click();
    await expect(conflictsChip).toHaveClass(/chip-active/);
    // "All" (type) stays active — the two filters are on different axes
    await expect(allChip).toHaveClass(/chip-active/);

    // Clicking Conflicts again deactivates it (toggle behaviour)
    await conflictsChip.click();
    await expect(conflictsChip).not.toHaveClass(/chip-active/);
  });

  test('New Topic button is visible', async ({ page }) => {
    await expect(page.locator('button', { hasText: '＋ New Topic' })).toBeVisible();
  });

  test('From Template button is visible', async ({ page }) => {
    await expect(page.locator('button', { hasText: '＋ From Template' })).toBeVisible();
  });

  test('Sync button is visible', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'Sync' })).toBeVisible();
  });
});
