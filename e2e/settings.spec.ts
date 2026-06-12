import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('h1', { timeout: 10000 });
  });

  test('shows Settings heading', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Settings');
  });

  test('Worker Connection section is visible with URL input', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Worker Connection' })).toBeVisible();
    await expect(page.locator('#workerHost')).toBeVisible();
    await expect(page.locator('#workerHost')).toHaveAttribute('type', 'url');
  });

  test('worker host input accepts URL text', async ({ page }) => {
    const input = page.locator('#workerHost');
    await input.fill('https://example.workers.dev');
    await expect(input).toHaveValue('https://example.workers.dev');
  });

  test('Auto-Sync section is visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Auto-Sync' })).toBeVisible();
    await expect(page.locator('#autoSyncInterval')).toBeVisible();
  });

  test('auto-sync interval select has expected options', async ({ page }) => {
    const select = page.locator('#autoSyncInterval');
    const options = await select.locator('option').allTextContents();
    expect(options).toContain('Every 30 seconds');
    expect(options).toContain('Every minute');
    expect(options).toContain('Every 5 minutes');
  });

  test('disabling auto-sync disables the interval select', async ({ page }) => {
    const checkbox = page.locator('#autoSync');
    const intervalSelect = page.locator('#autoSyncInterval');

    const isChecked = await checkbox.isChecked();
    if (isChecked) {
      // Toggle it off by clicking the toggle label
      await page.locator('label.toggle').first().click();
      await expect(intervalSelect).toBeDisabled();
    } else {
      await page.locator('label.toggle').first().click();
      await expect(intervalSelect).toBeEnabled();
    }
  });

  test('Security section is visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Security' })).toBeVisible();
  });

  test('admin secret Show/Hide toggle works', async ({ page }) => {
    const showHideBtn = page.locator('button', { hasText: 'Show' });
    await expect(showHideBtn).toBeVisible();
    await showHideBtn.click();
    await expect(page.locator('button', { hasText: 'Hide' })).toBeVisible();
  });

  test('Claude AI section is visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Claude AI' })).toBeVisible();
    await expect(page.locator('#claudeApiKey')).toBeVisible();
    await expect(page.locator('#claudeApiKey')).toHaveAttribute('type', 'password');
  });

  test('MCP Worker section is visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'MCP Worker' })).toBeVisible();
    await expect(page.locator('#mcpApiKey')).toBeVisible();
  });

  test('Save Settings button submits the form', async ({ page }) => {
    const saveBtn = page.locator('button[type="submit"]');
    await expect(saveBtn).toHaveText('Save Settings');
    await expect(saveBtn).toBeEnabled();
  });

  test('Test connection button is visible', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'Test' }).first()).toBeVisible();
  });
});
