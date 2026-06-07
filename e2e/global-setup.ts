import { chromium, type FullConfig, type Page } from '@playwright/test';

/** Configuration for the seeded test map */
interface TestMapConfig {
  mapId: string;
  name: string;
  width: number;
  height: number;
  terrainHexes: Array<{ q: number; r: number; terrain: string; name: string }>;
  landmarks: Array<{
    id: string;
    q: number;
    r: number;
    name: string;
    type: string;
    linkedLoreKey: string;
  }>;
  indexedDbVersion: number;
  dbName: string;
}

/** Default test map configuration */
const DEFAULT_TEST_MAP_CONFIG: TestMapConfig = {
  mapId: 'e2e-test-map',
  name: 'Playwright Seeded Map',
  width: 20,
  height: 20,
  indexedDbVersion: 2,
  dbName: 'holmgard-maps',
  terrainHexes: [
    { q: 0, r: 0, terrain: 'grassland', name: 'Seeded Plains' },
    { q: 1, r: -1, terrain: 'mountain', name: 'Seed Peak' },
  ],
  landmarks: [
    {
      id: 'seed-landmark-1',
      q: 0,
      r: 0,
      name: 'The Seeded Tower',
      type: 'tower',
      linkedLoreKey: 'topic:seeded-lore',
    },
  ],
};

/**
 * Result of the seeding operation
 */
interface SeedResult {
  success: boolean;
  error?: Error;
}

/**
 * Global setup for E2E tests to seed IndexedDB with a known test map.
 *
 * This creates a "Golden State" by establishing a standardized map environment
 * (e2e-test-map) that tests can rely on for consistent validation.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  // Extraction of baseURL from the primary project configuration
  const { baseURL } = config.projects[0].use;

  if (!baseURL) {
    console.warn('[E2E Setup] No baseURL found in config. IndexedDB seeding skipped.');
    return;
  }

  console.log('[E2E Setup] Starting IndexedDB seeding for E2E tests...');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Bootstrap: Navigate to the app to ensure the database schema is initialized
    await page.goto(`${baseURL}/world-editor`, { waitUntil: 'domcontentloaded' });

    // Wait for the app to fully initialize (IndexedDB schema creation)
    await page.waitForFunction(
      () => typeof indexedDB !== 'undefined',
      { timeout: 10_000 }
    );

    // Seed the database with test data
    const result = await seedIndexedDB(page, DEFAULT_TEST_MAP_CONFIG);

    if (result.success) {
      console.log(`[E2E Setup] Successfully seeded IndexedDB with "${DEFAULT_TEST_MAP_CONFIG.mapId}".`);
    } else {
      throw result.error ?? new Error('Unknown seeding error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[E2E Setup] Error during IndexedDB seeding:', errorMessage);
    throw error; // Re-throw to fail the test run
  } finally {
    await browser.close();
  }
}

/**
 * Seeds IndexedDB with the provided test map configuration.
 * Runs entirely in the browser context via page.evaluate.
 */
async function seedIndexedDB(page: Page, config: TestMapConfig): Promise<SeedResult> {
  return page.evaluate(async (cfg: TestMapConfig): Promise<SeedResult> => {
    return new Promise((resolve) => {
      const request = indexedDB.open(cfg.dbName, cfg.indexedDbVersion);

      request.onerror = () => {
        resolve({ success: false, error: new Error('Failed to open IndexedDB for seeding') });
      };

      request.onsuccess = () => {
        const db = request.result;

        // Verify required object stores exist
        const requiredStores = ['maps', 'hexes', 'landmarks'];
        const missingStores = requiredStores.filter((store) => !db.objectStoreNames.contains(store));

        if (missingStores.length > 0) {
          resolve({
            success: false,
            error: new Error(`Missing required object stores: ${missingStores.join(', ')}`),
          });
          return;
        }

        const tx = db.transaction(requiredStores, 'readwrite');

        const mapsStore = tx.objectStore('maps');
        const hexesStore = tx.objectStore('hexes');
        const landmarksStore = tx.objectStore('landmarks');

        // Idempotency: Clean up any existing test map data
        const deleteRequest = mapsStore.delete(cfg.mapId);
        deleteRequest.onsuccess = () => {
          // Insert map metadata
          mapsStore.put({
            id: cfg.mapId,
            name: cfg.name,
            width: cfg.width,
            height: cfg.height,
            pushedAt: null,
          });

          // Insert terrain hexes
          for (const hex of cfg.terrainHexes) {
            hexesStore.put({ mapId: cfg.mapId, ...hex });
          }

          // Insert landmarks
          for (const landmark of cfg.landmarks) {
            landmarksStore.put({ mapId: cfg.mapId, ...landmark });
          }
        };

        deleteRequest.onerror = () => {
          resolve({ success: false, error: new Error('Failed to delete existing test map') });
        };

        tx.oncomplete = () => resolve({ success: true });
        tx.onerror = () => resolve({ success: false, error: tx.error ?? new Error('Transaction failed') });
        tx.onabort = () => resolve({ success: false, error: new Error('Transaction aborted') });
      };

      request.onupgradeneeded = () => {
        // This shouldn't happen in normal operation since the app creates the schema
        // But we log it for debugging
        console.warn('[E2E Setup] onupgradeneeded fired - schema may not have been initialized by app');
      };
    });
  }, config);
}

export default globalSetup;