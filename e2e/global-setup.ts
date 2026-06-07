import { chromium, type FullConfig } from '@playwright/test';

/**
 * Global setup for E2E tests to seed IndexedDB with a known test map.
 * 
 * This creates a "Golden State" by establishing a standardized map environment
 * (e2e-test-map) that tests can rely on for consistent validation.
 */
async function globalSetup(config: FullConfig) {
  // Extraction of baseURL from the primary project configuration
  const { baseURL } = config.projects[0].use;
  if (!baseURL) {
    console.warn('[E2E Setup] No baseURL found in config. IndexedDB seeding skipped.');
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Bootstrap: Navigate to the app to ensure the database schema is initialized
    await page.goto(baseURL + '/world-editor');
    await page.waitForTimeout(1000);

    // Injection: Direct manipulation of the browser's IndexedDB
    await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        // Schema Version 2: Must match the current application requirement
        const request = indexedDB.open('holmgard-maps', 2);

        request.onerror = () => reject(new Error('Failed to open IndexedDB for seeding'));
        
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['maps', 'hexes', 'landmarks'], 'readwrite');

          const mapsStore = tx.objectStore('maps');
          const hexesStore = tx.objectStore('hexes');
          const landmarksStore = tx.objectStore('landmarks');

          const testMapId = 'e2e-test-map';

          // Idempotency: Ensure a clean slate for the test map ID
          mapsStore.delete(testMapId);

          // Record 1: The Map Metadata
          mapsStore.put({
            id: testMapId,
            name: 'Playwright Seeded Map',
            width: 20,
            height: 20,
            pushedAt: null
          });

          // Record 2: Terrain Data (Axial coordinates)
          hexesStore.put({ mapId: testMapId, q: 0, r: 0, terrain: 'grassland', name: 'Seeded Plains' });
          hexesStore.put({ mapId: testMapId, q: 1, r: -1, terrain: 'mountain', name: 'Seed Peak' });

          // Record 3: Landmark-Lore Integration
          landmarksStore.put({
            id: 'seed-landmark-1',
            mapId: testMapId,
            q: 0,
            r: 0,
            name: 'The Seeded Tower',
            type: 'tower',
            linkedLoreKey: 'topic:seeded-lore'
          });

          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    console.log('[E2E Setup] Successfully seeded IndexedDB with "e2e-test-map".');
  } catch (e) {
    console.error('[E2E Setup] Error during IndexedDB seeding:', e);
  } finally {
    await browser.close();
  }
}

export default globalSetup;