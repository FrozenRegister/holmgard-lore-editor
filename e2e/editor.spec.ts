import { test, expect } from '@playwright/test';

test.describe('Topic Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });

  test('clicking a topic card navigates to /editor/[key]', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);
  });

  test('editor toolbar shows the topic key', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);
    await expect(page.locator('.topic-key')).toBeVisible();
  });

  test('back button returns to topics list', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);
    await page.locator('button', { hasText: '← Topics' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('All Topics');
  });

  test('Hide Preview toggles to Show Preview', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);

    const hideBtn = page.locator('button', { hasText: 'Hide Preview' });
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();
    await expect(page.locator('button', { hasText: 'Show Preview' })).toBeVisible();
  });

  test('Show Preview toggles back to Hide Preview', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);

    await page.locator('button', { hasText: 'Hide Preview' }).click();
    await page.locator('button', { hasText: 'Show Preview' }).click();
    await expect(page.locator('button', { hasText: 'Hide Preview' })).toBeVisible();
  });

  test('editor footer shows version metadata', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);

    const footer = page.locator('.editor-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('v');
    await expect(footer).toContainText('Updated');
  });

  test('action buttons are visible: Save, Sync, History', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);

    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remote History', exact: true })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Sync ↑' })).toBeVisible();
    // Save is disabled when not dirty
    await expect(page.locator('button', { hasText: 'Save' })).toBeVisible();
  });

  test('navigate directly to holmgard demo topic by URL', async ({ page }) => {
    await page.goto('/editor/holmgard');
    await page.waitForSelector('.topic-key', { timeout: 10000 });
    await expect(page.locator('.topic-key')).toHaveText('holmgard');
  });

  test('History button opens the version history panel', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);

    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('[aria-label="Version History"]')).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Version History' })).toBeVisible();
  });

  test('version history panel closes with X button', async ({ page }) => {
    await page.locator('.topic-card').first().click();
    await expect(page).toHaveURL(/\/editor\//);

    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('[aria-label="Version History"]')).toBeVisible();

    await page.locator('[aria-label="Version History"] button[aria-label="Close"]').click();
    await expect(page.locator('[aria-label="Version History"]')).not.toBeVisible();
  });
});
