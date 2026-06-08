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
  indexedDbVersion: 4,
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
    // Clear IndexedDB before loading to ensure fresh state
    const context = page.context();
    await context.clearCookies();

    // Inject seeding script before the page loads
    await page.addInitScript((cfg: TestMapConfig) => {
      // This runs before the page script loads, so we can set up test data early
      (window as any).__e2eSeedConfig = cfg;
    }, DEFAULT_TEST_MAP_CONFIG);

    // Bootstrap: Navigate to the app
    await page.goto(`${baseURL}/world-editor`, { waitUntil: 'domcontentloaded' });

    // Wait for the seeding to complete via a helper that checks if it's done
    const seedResult: SeedResult = await page.evaluate(async () => {
      return new Promise<SeedResult>((resolve) => {
        const cfg = (window as any).__e2eSeedConfig;
        if (!cfg) {
          resolve({ success: false, error: new Error('Seed config not available') });
          return;
        }

        const request = indexedDB.open(cfg.dbName, cfg.indexedDbVersion);

        request.onerror = () => {
          resolve({ success: false, error: new Error('Failed to open IndexedDB') });
        };

        request.onupgradeneeded = (event: any) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('maps')) {
            db.createObjectStore('maps', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('hexes')) {
            const hexStore = db.createObjectStore('hexes', {
              keyPath: ['mapId', 'q', 'r']
            });
            hexStore.createIndex('by-map', 'mapId');
          }
          if (!db.objectStoreNames.contains('landmarks')) {
            const landmarkStore = db.createObjectStore('landmarks', {
              keyPath: ['mapId', 'id']
            });
            landmarkStore.createIndex('by-map', 'mapId');
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          const requiredStores = ['maps', 'hexes', 'landmarks'];
          const missingStores = requiredStores.filter((store) => !db.objectStoreNames.contains(store));

          if (missingStores.length > 0) {
            db.close();
            resolve({
              success: false,
              error: new Error(`Missing required object stores: ${missingStores.join(', ')}`)
            });
            return;
          }

          const tx = db.transaction(requiredStores, 'readwrite');
          const mapsStore = tx.objectStore('maps');
          const hexesStore = tx.objectStore('hexes');
          const landmarksStore = tx.objectStore('landmarks');

          const deleteRequest = mapsStore.delete(cfg.mapId);
          deleteRequest.onsuccess = () => {
            mapsStore.put({
              id: cfg.mapId,
              name: cfg.name,
              width: cfg.width,
              height: cfg.height,
              pushedAt: null,
            });

            for (const hex of cfg.terrainHexes) {
              hexesStore.put({ mapId: cfg.mapId, ...hex });
            }

            for (const landmark of cfg.landmarks) {
              landmarksStore.put({ mapId: cfg.mapId, ...landmark });
            }
          };

          deleteRequest.onerror = () => {
            resolve({ success: false, error: new Error('Failed to delete existing test map') });
          };

          tx.oncomplete = () => {
            db.close();
            resolve({ success: true });
          };
          tx.onerror = () => resolve({ success: false, error: tx.error ?? new Error('Transaction failed') });
          tx.onabort = () => resolve({ success: false, error: new Error('Transaction aborted') });
        };
      });
    });
    const result = seedResult;

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

export default globalSetup;