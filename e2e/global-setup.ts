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
  dbName: 'HexAtlasDB',
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
          // Create stores matching the app's expected schema
          if (!db.objectStoreNames.contains('mapMeta')) {
            db.createObjectStore('mapMeta', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('regionTerrain')) {
            const terrainStore = db.createObjectStore('regionTerrain', {
              keyPath: 'id'
            });
            terrainStore.createIndex('by-map', 'mapId');
          }
          if (!db.objectStoreNames.contains('items')) {
            const itemsStore = db.createObjectStore('items', {
              keyPath: 'id'
            });
            itemsStore.createIndex('by-map', 'mapId');
          }
          if (!db.objectStoreNames.contains('detailTerrain')) {
            db.createObjectStore('detailTerrain', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('fog')) {
            db.createObjectStore('fog', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('layersSettings')) {
            db.createObjectStore('layersSettings', { keyPath: 'id' });
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          const requiredStores = ['mapMeta', 'regionTerrain', 'detailTerrain', 'items', 'fog', 'layersSettings'];
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
          const metaStore = tx.objectStore('mapMeta');
          const terrainStore = tx.objectStore('regionTerrain');
          const itemsStore = tx.objectStore('items');

          // Create a unique ID for this seeded map instance
          const mapInstanceId = `e2e-${Date.now()}`;

          metaStore.put({
            id: mapInstanceId,
            draftId: cfg.mapId,
            name: cfg.name,
            mapName: cfg.name,
            mapType: 'earth',
            mapInstanceId: mapInstanceId,
            version: 1,
            canvasBackground: '#1a1a1a',
            orientation: 'pointy',
            hexSize: 50,
            viewport: { x: 0, y: 0, scale: 1 },
            nextLandmarkId: 1,
            nextTextLabelId: 1,
            nextImageOverlayId: 1,
            nextTokenId: 1,
            nextPathId: 1,
            dungeonLayout: {},
            settlementLayout: {}
          });

          // Store terrain hexes
          const hexesArray: any[] = [];
          for (const hex of cfg.terrainHexes) {
            hexesArray.push({
              q: hex.q,
              r: hex.r,
              terrain: hex.terrain,
              name: hex.name
            });
          }

          terrainStore.put({
            id: mapInstanceId,
            mapId: cfg.mapId,
            hexes: hexesArray
          });

          // Store landmarks
          const landmarksArray: any[] = [];
          for (const landmark of cfg.landmarks) {
            landmarksArray.push({
              id: landmark.id,
              q: landmark.q,
              r: landmark.r,
              name: landmark.name,
              type: landmark.type,
              linkedLoreKey: landmark.linkedLoreKey
            });
          }

          itemsStore.put({
            id: mapInstanceId,
            mapId: cfg.mapId,
            landmarks: landmarksArray,
            textLabels: [],
            imageOverlays: [],
            tokens: [],
            paths: []
          });

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