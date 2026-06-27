import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1', { timeout: 10000 });
  });

  test('sidebar shows brand name', async ({ page }) => {
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();
    await expect(page.locator('.brand-title')).toHaveText('Holmgard');
  });

  test('all nav links are visible', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav.locator('a', { hasText: 'Topics' })).toBeVisible();
    await expect(nav.locator('a', { hasText: 'World Map' })).toBeVisible();
    await expect(nav.locator('a', { hasText: 'Maps' })).toBeVisible();
    await expect(nav.locator('a', { hasText: 'Import/Export' })).toBeVisible();
    await expect(nav.locator('a', { hasText: 'Settings' })).toBeVisible();
  });

  test('Topics link has aria-current=page on home', async ({ page }) => {
    const topicsLink = page.locator('nav[aria-label="Main navigation"] a', { hasText: 'Topics' });
    await expect(topicsLink).toHaveAttribute('aria-current', 'page');
  });

  test('clicking Settings navigates to /settings', async ({ page }) => {
    await page.locator('nav[aria-label="Main navigation"] a', { hasText: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('h1')).toHaveText('Settings');
  });

  test('Settings link has aria-current=page on settings route', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('h1');
    const settingsLink = page.locator('nav[aria-label="Main navigation"] a', { hasText: 'Settings' });
    await expect(settingsLink).toHaveAttribute('aria-current', 'page');
  });

  test('clicking Import/Export navigates to /import-export', async ({ page }) => {
    await page.locator('nav[aria-label="Main navigation"] a', { hasText: 'Import/Export' }).click();
    await expect(page).toHaveURL(/\/import-export$/);
    await expect(page.locator('h1')).toHaveText('Import / Export');
  });

  test('clicking Topics returns to home from settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('h1');
    await page.locator('nav[aria-label="Main navigation"] a', { hasText: 'Topics' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('All Topics');
  });
});
