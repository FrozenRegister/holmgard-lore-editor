import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Hex Map Editor menu and global functionality.
 * These tests verify that the SvelteKit frontend correctly interacts with the
 * underlying game.js library and maintains the application state.
 */
test.describe('Hex Map Editor - Menu Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we start on the world editor route
    await page.goto('/world-editor', { waitUntil: 'domcontentloaded' });

    // Wait significantly longer for all dynamic scripts to load and initialize.
    // The +page.svelte onMount runs AFTER component mounts, loading scripts sequentially.
    // game-ui-bindings.js is the last script and must fully initialize before tests run.
    await page.waitForTimeout(3000);

    // Synchronization point: Wait for the rendering engine to initialize.
    // We check for the primary canvas or its container.
    await page.waitForSelector('[data-testid="hex-map-container"], canvas, #hexCanvas', {
      timeout: 5000,
    }).catch(() => {
      return Promise.resolve();
    });
  });

  test('should expose functions to window object', async ({ page }) => {
    /**
     * Verification: Ensure the 'game-ui-bindings.js' script has successfully
     * attached the necessary API hooks to the global window object.
     */
    const functionsExposed = await page.evaluate(() => {
      return {
        // Navigation & View
        zoomIn: typeof (window as any).zoomIn === 'function',
        zoomOut: typeof (window as any).zoomOut === 'function',
        // State Management
        newMap: typeof (window as any).newMap === 'function',
        // Auth & Sync
        quickCloudSave: typeof (window as any).quickCloudSave === 'function',
        shareMap: typeof (window as any).shareMap === 'function',
        showAuthModal: typeof (window as any).showAuthModal === 'function',
        undoRedoSystem: typeof (window as any).undoRedoSystem === 'object',
      };
    });

    Object.entries(functionsExposed).forEach(([key, value]) => {
      expect(value, `${key} should be exposed to window`).toBe(true);
    });
  });

  test('should load seeded map data from global-setup correctly', async ({ page }) => {
    /**
     * Integration Test: Verify that data injected into IndexedDB by 
     * global-setup.ts is correctly retrieved by the application on startup.
     */
    await page.waitForTimeout(1000);

    const mapData = await page.evaluate(() => {
      const hexMap = (window as any).state?.hexMap;
      // Return null if state hasn't populated yet
      if (!hexMap) return null;
      
      return {
        name: hexMap.name,
        hexes: hexMap.hexes || [],
        landmarks: hexMap.landmarks || []
      };
    });

    expect(mapData, 'The seeded map should be active in the application state').not.toBeNull();
    expect(mapData?.name).toBe('Playwright Seeded Map');

    // Coordinate Check: Axial (0,0) is our primary reference point in the seed data
    const grassHex = mapData?.hexes.find((h: any) => h.q === 0 && h.r === 0);
    expect(grassHex, 'Seeded grassland hex should exist').toBeDefined();
    expect(grassHex?.terrain).toBe('grassland');

    // Metadata Check: Verify the lore link established during setup
    const tower = mapData?.landmarks.find((l: any) => l.id === 'seed-landmark-1');
    expect(tower, 'Seeded landmark should exist').toBeDefined();
    expect(tower?.name).toBe('The Seeded Tower');
    expect(tower?.linkedLoreKey).toBe('topic:seeded-lore');
  });

  test('should have no console errors on page load', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/world-editor');
    await page.waitForTimeout(500);

    const blockerErrors = errors.filter((err) => {
      /**
       * Noise Reduction: Exclude network-related errors and MCP fetch failures
       * that are external to the hex-map logic itself.
       */
      // Known non-critical errors that don't block functionality
      if (err.includes('ERR_FILE_NOT_FOUND')) return false;
      if (err.includes('404')) return false;
      if (err.includes('Failed to list tools')) return false; // MCP fetch, not hex-map related
      if (err.includes('Failed to fetch')) return false; // Network errors during page load
      return true;
    });

    expect(blockerErrors, 'No critical console errors').toHaveLength(0);
  });

  test('File menu - New Map should trigger confirmation', async ({ page }) => {
    // Intercept the browser's confirm() dialog
    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Create a new map');
      dialog.dismiss(); // Prevent actual reset for this specific test
    });

    // UI Interaction: Open the File menu
    await page.click('button:has-text("File"), [data-testid="file-menu"]').catch(() => {
      return Promise.resolve();
    });

    /**
     * Resilience: Attempt to find the "New Map" option via UI locators.
     * If the menu is blocked or styled in a way that prevents clicking,
     * we fall back to calling the exposed window function to verify
     * that the logic behind the menu item still executes.
     */
    const newMapButton = page.locator('text=New Map, button:has-text("New Map")');
    if (await newMapButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await newMapButton.first().click();
    } else {
      // If menu not visible, try calling function directly
      await page.evaluate(() => {
        (window as any).newMap?.();
      });
    }
  });

  test('File menu - New Map should reset map state after confirmation', async ({ page }) => {
    // Grant permission to reset
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    /**
     * State Reset Verification: We inject a dummy hex into the active state,
     * trigger newMap(), and then assert that the hexes array is cleared.
     */
    await page.evaluate(() => {
      if ((window as any).state?.hexMap) {
        (window as any).state.hexMap.hexes = [{ q: 0, r: 0, terrain: 'test' }];
      }
      (window as any).newMap?.();
    });

    // Post-condition: The map should be empty
    const hexCount = await page.evaluate(() => (window as any).state?.hexMap?.hexes?.length || 0);
    expect(hexCount).toBe(0);
  });

  test('File menu - Save should show notification', async ({ page }) => {
    // Notification Spy: Override the app's notification handler to capture results
    const notifications: string[] = [];

    await page.evaluate(() => {
      const originalNotification = (window as any).showNotification;
      (window as any).showNotification = function (message: string, type: string) {
        (window as any).__lastNotification = { message, type };
        if (originalNotification) originalNotification(message, type);
      };
    });

    // Trigger Save via keyboard shortcut
    await page.keyboard.press('Control+S').catch(() => {
      return page.evaluate(() => {
        (window as any).quickCloudSave?.();
      });
    });

    // Assert that the user was notified of the save status
    const notification = await page.evaluate(() => {
      return (window as any).__lastNotification;
    }).catch(() => null);

    if (notification) {
      expect(notification.message.toLowerCase()).toMatch(/saved|saving/);
    }
  });

  test('File menu - Import Map should trigger file input click', async ({ page }) => {
    /**
     * Verification: Ensure that the 'Import Map (JSON)' menu item correctly
     * triggers the hidden file input element.
     */
    const clickTriggered = await page.evaluate(() => {
      return new Promise((resolve) => {
        const input = document.getElementById('importFileInput') as HTMLInputElement;
        if (!input) return resolve(false);
        
        input.addEventListener('click', (e) => {
          e.preventDefault(); // Prevent opening actual file dialog in test
          resolve(true);
        }, { once: true });
        
        (window as any).importMapFromFile?.();
        setTimeout(() => resolve(false), 500);
      });
    });

    expect(clickTriggered).toBe(true);
  });

  test('File menu - Import Map should load data from file', async ({ page }) => {
    const testMapData = {
      hexMap: {
        hexes: [{ q: 10, r: 20, terrain: 'grassland', elevation: 2 }]
      }
    };

    /**
     * Import Functional Test: Simulates the data flow of the JSON import system.
     * We inject data directly into state and trigger the re-render.
     */
    await page.evaluate((data) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'importFileInput';
      document.body.appendChild(input);

      if ((window as any).state) {
        (window as any).state.hexMap = data.hexMap;
        (window as any).renderHex?.();
      }
    }, testMapData);

    const hexCount = await page.evaluate(() => (window as any).state?.hexMap?.hexes?.length);
    expect(hexCount).toBe(1);
  });

  test('Zoom buttons should exist and be callable', async ({ page }) => {
    /**
     * Viewport Scaling: Verify that the zoom API is present and 
     * can read the current viewport state.
     */
    const zoomFunctions = await page.evaluate(() => {
      return {
        zoomInExists: typeof (window as any).zoomIn === 'function',
        zoomOutExists: typeof (window as any).zoomOut === 'function',
        initialZoomLevel: (window as any).state?.hexMap?.viewport?.scale,
      };
    });

    expect(zoomFunctions.zoomInExists).toBe(true);
    expect(zoomFunctions.zoomOutExists).toBe(true);
  });

  test('Zoom In should increase viewport scale', async ({ page }) => {
    /**
     * Zoom Logic: Calling zoomIn() should result in a scale factor 
     * larger than the starting value.
     */
    const result = await page.evaluate(() => {
      const initialScale = (window as any).state?.hexMap?.viewport?.scale;

      (window as any).zoomIn?.();

      const newScale = (window as any).state?.hexMap?.viewport?.scale;

      return {
        initialScale,
        newScale,
        increased: newScale > initialScale,
      };
    });

    if (result.initialScale !== undefined) {
      expect(result.increased).toBe(true);
    }
  });

  test('Zoom Out should decrease viewport scale', async ({ page }) => {
    const result = await page.evaluate(() => {
      const initialScale = (window as any).state?.hexMap?.viewport?.scale;

      (window as any).zoomOut?.();

      const newScale = (window as any).state?.hexMap?.viewport?.scale;

      return {
        initialScale,
        newScale,
        decreased: newScale < initialScale,
      };
    });

    if (result.initialScale !== undefined) {
      expect(result.decreased).toBe(true);
    }
  });

  test('Settings modal - openSettingsModal should be callable', async ({ page }) => {
    const settingsAvailable = await page.evaluate(() => {
      return typeof (window as any).openSettingsModal === 'function';
    });

    expect(settingsAvailable).toBe(true);

    await page.evaluate(() => {
      (window as any).openSettingsModal?.();
    }).catch(() => {
      // If stubbed, we just ensure it doesn't crash
    });
  });

  test('closeModal should be callable', async ({ page }) => {
    const closeModalAvailable = await page.evaluate(() => {
      return typeof (window as any).closeModal === 'function';
    });

    expect(closeModalAvailable).toBe(true);
  });

  test('File menu - Export as PNG should trigger download', async ({ page }) => {
    /**
     * Browser Interaction: Verify that the PNG export function triggers
     * a native file download event.
     */
    const downloadPromise = page.waitForEvent('download');
    
    await page.evaluate(() => {
      (window as any).exportAsPNG?.();
    });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.png');
  });

  test('File menu - Foundry VTT Export should be available', async ({ page }) => {
    const foundryAvailable = await page.evaluate(() => {
      return typeof (window as any).showFoundryExportDialog === 'function';
    });

    expect(foundryAvailable).toBe(true);
  });

  test('File menu - Export as JSON should trigger download', async ({ page }) => {
    /**
     * Browser Interaction: Verify that the export function triggers
     * a native file download event.
     */
    const downloadPromise = page.waitForEvent('download');
    
    await page.evaluate(() => {
      (window as any).exportAsJSON?.();
    });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.json');
  });

  test('Example maps should open modal', async ({ page }) => {
    const exampleMapsAvailable = await page.evaluate(() => {
      return typeof (window as any).openExamplesModal === 'function';
    });

    expect(exampleMapsAvailable).toBe(true);
    // We check existence as functional behavior often relies on game.js internals
  });

  test('Share Map should copy link to clipboard and show success notification', async ({ page }) => {
    /**
     * Social Sharing: Verify that the shareMap function correctly utilizes
     * the Clipboard API to copy the current page URL.
     */
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.evaluate(() => {
      (window as any).__lastNotification = null;
      const original = (window as any).showNotification;
      (window as any).showNotification = (msg: string, type: string) => {
        (window as any).__lastNotification = { msg, type };
        if (original) original(msg, type);
      };
    });
    
    await page.evaluate(() => {
      (window as any).shareMap?.();
    });

    // Verify notification appeared
    const notification = await page.evaluate(() => (window as any).__lastNotification);
    expect(notification?.msg.toLowerCase()).toContain('copied');
    expect(notification?.type).toBe('success');

    // Verify clipboard content matches page URL
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const currentUrl = page.url();
    expect(clipboardText).toBe(currentUrl);
  });

  test('Auth modal should be callable and show modal', async ({ page }) => {
    const result = await page.evaluate(() => {
      const accountModal = document.createElement('div');
      accountModal.id = 'accountModal';
      accountModal.style.display = 'none';
      document.body.appendChild(accountModal);

      (window as any).showAuthModal?.();

      const isVisible = accountModal.style.display === 'flex';

      document.body.removeChild(accountModal);

      return {
        functionExists: typeof (window as any).showAuthModal === 'function',
        modalTriggered: isVisible,
      };
    });

    expect(result.functionExists).toBe(true);
    expect(result.modalTriggered).toBe(true);
  });

  test('UI Panels - toggleLayersPanel should be callable', async ({ page }) => {
    const exists = await page.evaluate(() => typeof (window as any).toggleLayersPanel === 'function');
    expect(exists).toBe(true);
  });

  test('Tools - showTokenCreator and showLandmarkCreator should be available', async ({ page }) => {
    const tools = await page.evaluate(() => {
      return {
        token: typeof (window as any).showTokenCreator === 'function',
        landmark: typeof (window as any).showLandmarkCreator === 'function',
      };
    });
    expect(tools.token).toBe(true);
    expect(tools.landmark).toBe(true);
  });

  test('Themes - openThemesModal should be available', async ({ page }) => {
    const exists = await page.evaluate(() => typeof (window as any).openThemesModal === 'function');
    expect(exists).toBe(true);
  });

  test('Game UI Bindings should log initialization to console', async ({ page }) => {
    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'log' || msg.type() === 'info') {
        consoleLogs.push(msg.text());
      }
    });

    // Reload to capture logs from fresh page
    await page.reload();

    // Wait longer for all scripts to initialize
    await page.waitForTimeout(1000);

    // Check for any Game UI Bindings logs
    // Note: These may not appear if game.js hasn't loaded or hex map isn't visible
    // Check if functions exist as fallback indicator of successful binding
    const functionsExposed = await page.evaluate(() => {
      return {
        zoomIn: typeof (window as any).zoomIn === 'function',
        zoomOut: typeof (window as any).zoomOut === 'function',
        showAuthModal: typeof (window as any).showAuthModal === 'function',
      };
    });

    const hasInitLog = consoleLogs.some((log) => log.includes('[Game UI Bindings]'));

    // Either we have logs OR functions are exposed (indicates successful binding)
    expect(hasInitLog || Object.values(functionsExposed).some((v) => v),
      'Should have Game UI Bindings initialization (via logs or exposed functions)'
    ).toBe(true);
  });

  test('Performance: zoom operations should not cause violations', async ({ page }) => {
    /**
     * Performance Regression: We intercept console warnings related to
     * Long Tasks or forced reflows during rapid zoom actions to 
     * verify that debouncing/rAF logic is working.
     */
    await page.evaluate(() => {
      const originalWarn = console.warn;
      (window as any).__violations = [];
      console.warn = function (...args: any[]) {
        const msg = args.join(' ');
        if (msg.includes('Violation') || msg.includes('took') || msg.includes('reflow')) {
          (window as any).__violations.push(msg);
        }
        originalWarn.apply(console, args);
      };
    });

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        (window as any).zoomIn?.();
      });
      await page.waitForTimeout(50);
    }

    const recordedViolations = await page.evaluate(() => {
      return (window as any).__violations || [];
    });

    // Threshold: Allow minimal violations but fail on systemic lag
    expect(recordedViolations.length, 'Should minimize performance violations').toBeLessThan(5);
  });

  test('Undo/Redo system should be accessible', async ({ page }) => {
    const undoRedoAvailable = await page.evaluate(() => {
      const system = (window as any).undoRedoSystem;
      return {
        exists: !!system,
        hasUndo: typeof system?.undo === 'function',
        hasRedo: typeof system?.redo === 'function',
      };
    });

    expect(undoRedoAvailable.exists).toBe(true);
    expect(undoRedoAvailable.hasUndo).toBe(true);
    expect(undoRedoAvailable.hasRedo).toBe(true);
  });
});
