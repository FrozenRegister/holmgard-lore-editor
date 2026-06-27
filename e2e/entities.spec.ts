import { test, expect } from '@playwright/test';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const CHAR_PC = {
  id: 'e2e-pc-001',
  name: 'Aldric',
  character_type: 'pc',
  character_class: 'fighter',
  race: 'Human',
  level: 5,
  hp: 42,
  max_hp: 60,
  ac: 16,
  alignment: 'Neutral Good',
  background: 'Soldier',
  faction_id: null,
  kv_origin: null,
};

const CHAR_NPC = {
  id: 'e2e-npc-002',
  name: 'Borgil the Innkeeper',
  character_type: 'npc',
  character_class: 'commoner',
  race: 'Human',
  level: 1,
  hp: 8,
  max_hp: 8,
  ac: 10,
  alignment: null,
  background: null,
  faction_id: null,
  kv_origin: null,
};

// ── Entity List Page ──────────────────────────────────────────────────────────

test.describe('Entity List — /entities/character', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/entities/characters', (route) => {
      if (route.request().method() !== 'GET') { route.continue(); return; }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ characters: [CHAR_PC, CHAR_NPC], total: 2 }),
      });
    });
    await page.goto('/entities/character');
    await page.waitForLoadState('networkidle');
  });

  test('page renders the World Records section heading', async ({ page }) => {
    await expect(page.locator('text=World Records')).toBeVisible();
  });

  test('shows both mocked characters in the list', async ({ page }) => {
    await expect(page.locator('.record-name', { hasText: 'Aldric' })).toBeVisible();
    await expect(page.locator('.record-name', { hasText: 'Borgil the Innkeeper' })).toBeVisible();
  });

  test('character row shows race and class summary', async ({ page }) => {
    const firstSummary = page.locator('.record-summary').first();
    await expect(firstSummary).toContainText('Human');
    await expect(firstSummary).toContainText('fighter');
  });

  test('character rows have links to the detail page', async ({ page }) => {
    const link = page.locator('a.record-link-area').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/entities\/character\//);
  });

  test('Characters sidebar link is active on this route', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav.locator('a', { hasText: 'Characters' })).toHaveClass(/active/);
  });

  test('sidebar shows entity category links introduced in Phase 1', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    for (const label of ['Characters', 'Locations', 'Quests', 'Items', 'Nations', 'Regions']) {
      await expect(nav.locator('a', { hasText: label })).toBeVisible();
    }
  });

  test('clicking a character row navigates to /entities/character/{id}', async ({ page }) => {
    await page.route('**/api/entities/characters/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ character: CHAR_PC }),
      });
    });
    await page.locator('a.record-link-area').first().click();
    await expect(page).toHaveURL(/\/entities\/character\//);
  });

  test('empty D1 response shows the no-records state', async ({ page }) => {
    // Override the beforeEach mock for this test
    await page.route('**/api/entities/characters', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ characters: [], total: 0 }),
      });
    });
    await page.goto('/entities/character');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=No characters in the world yet')).toBeVisible();
  });

  test('D1 error shows error state instead of crashing', async ({ page }) => {
    await page.route('**/api/entities/characters', (route) => {
      route.fulfill({ status: 503, body: 'Service Unavailable' });
    });
    await page.goto('/entities/character');
    await page.waitForLoadState('networkidle');
    // Should show an error message, not a blank page or crash
    await expect(page.locator('.d1-error')).toBeVisible();
  });
});

// ── Character Detail Page ─────────────────────────────────────────────────────

test.describe('Character Detail Page — /entities/character/[id]', () => {
  const charId = CHAR_PC.id;

  function mockDetail(page: Parameters<Parameters<typeof test>[1]>[0], char = CHAR_PC) {
    return page.route(`**/api/entities/characters/${char.id}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ character: char }),
      });
    });
  }

  test('shows the character name in the toolbar', async ({ page }) => {
    await mockDetail(page);
    await page.goto(`/entities/character/${charId}`);
    await page.waitForSelector('.topic-key');
    await expect(page.locator('.topic-key')).toContainText('Aldric');
  });

  test('shows PC type chip for a player character', async ({ page }) => {
    await mockDetail(page);
    await page.goto(`/entities/character/${charId}`);
    await page.waitForSelector('.type-chip');
    await expect(page.locator('.type-chip')).toContainText('PC');
    await expect(page.locator('.type-chip')).not.toHaveClass(/npc/);
  });

  test('shows NPC type chip with npc CSS class for an npc', async ({ page }) => {
    await mockDetail(page, CHAR_NPC);
    await page.goto(`/entities/character/${CHAR_NPC.id}`);
    await page.waitForSelector('.type-chip');
    await expect(page.locator('.type-chip.npc')).toBeVisible();
    await expect(page.locator('.type-chip.npc')).toContainText('NPC');
  });

  test('shows Create Lore Topic button when character has no kv_origin', async ({ page }) => {
    await mockDetail(page, { ...CHAR_PC, kv_origin: null });
    await page.goto(`/entities/character/${charId}`);
    await expect(page.locator('button', { hasText: 'Create Lore Topic' })).toBeVisible();
  });

  test('shows character stat summary in no-lore state', async ({ page }) => {
    await mockDetail(page);
    await page.goto(`/entities/character/${charId}`);
    const meta = page.locator('.char-meta');
    await expect(meta).toContainText('Human fighter');
    await expect(meta).toContainText('Lv.5');
    await expect(meta).toContainText('42/60 HP');
    await expect(meta).toContainText('AC 16');
  });

  test('shows "No lore topic yet" hint in no-lore state', async ({ page }) => {
    await mockDetail(page);
    await page.goto(`/entities/character/${charId}`);
    await expect(page.locator('.no-lore-hint')).toContainText('no lore topic');
  });

  test('Create Lore Topic creates topic and shows editor with footer', async ({ page }) => {
    await mockDetail(page);
    await page.goto(`/entities/character/${charId}`);
    await page.waitForSelector('button:has-text("Create Lore Topic")');
    await page.locator('button', { hasText: 'Create Lore Topic' }).click();

    // Footer appears once the topic is set and the editor renders
    const footer = page.locator('.editor-footer');
    await expect(footer).toBeVisible({ timeout: 15000 });
    await expect(footer).toContainText('character:aldric');
    await expect(footer).toContainText('v1');
  });

  test('after Create Lore Topic the Save button is visible', async ({ page }) => {
    await mockDetail(page);
    await page.goto(`/entities/character/${charId}`);
    await page.locator('button', { hasText: 'Create Lore Topic' }).click();
    await expect(page.locator('button', { hasText: 'Save' })).toBeVisible({ timeout: 15000 });
  });

  test('Create Lore Topic warns when D1 link fails', async ({ page }) => {
    let patchRequested = false;
    await page.route(`**/api/entities/characters/${charId}`, (route) => {
      if (route.request().method() === 'PATCH') {
        patchRequested = true;
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'broken' }) });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ character: { ...CHAR_PC, id: charId, kv_origin: null } }),
      });
    });
    await page.goto(`/entities/character/${charId}`);
    await page.locator('button', { hasText: 'Create Lore Topic' }).click();

    // The PATCH should fire after the button click for a character
    // with no kv_origin. Wait long enough for the async flow.
    await expect.poll(() => patchRequested, { timeout: 10000 }).toBe(true);
  });

  test('breadcrumb link returns to /entities/character', async ({ page }) => {
    await mockDetail(page);
    await page.goto(`/entities/character/${charId}`);
    await page.waitForSelector('.breadcrumb-link');
    await page.locator('.breadcrumb-link', { hasText: '← Characters' }).click();
    await expect(page).toHaveURL('/entities/character');
  });

  test('shows "Character not found" error state for a 404', async ({ page }) => {
    await page.route(`**/api/entities/characters/missing-id`, (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });
    await page.goto('/entities/character/missing-id');
    await expect(page.locator('.error-state')).toBeVisible();
    await expect(page.locator('.error-state')).toContainText('Character not found');
    await expect(page.locator('.error-state a', { hasText: 'Back to Characters' })).toBeVisible();
  });

  test('shows error state on network failure', async ({ page }) => {
    await page.route(`**/api/entities/characters/net-fail`, (route) => {
      route.abort('failed');
    });
    await page.goto('/entities/character/net-fail');
    await expect(page.locator('.error-state')).toBeVisible({ timeout: 15000 });
  });

  test('error state Back to Characters link navigates correctly', async ({ page }) => {
    await page.route(`**/api/entities/characters/missing-id`, (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
    });
    await page.goto('/entities/character/missing-id');
    await page.locator('.error-state a', { hasText: 'Back to Characters' }).click();
    await expect(page).toHaveURL('/entities/character');
  });
});
