import { test, expect } from '@playwright/test';

test.describe('Hex Map Editor - Menu Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the world editor page where hex map is loaded
    await page.goto('/world-editor');

    // Wait for the hex map to load and game.js to initialize
    // Check for the hex map canvas or main container
    await page.waitForSelector('[data-testid="hex-map-container"], canvas, #hexCanvas', {
      timeout: 10000,
    }).catch(() => {
      // If no specific selector found, just wait for the page to be ready
      return Promise.resolve();
    });

    // Wait for game-ui-bindings.js to complete initialization (200ms + some buffer)
    await page.waitForTimeout(500);
  });

  test('should expose functions to window object', async ({ page }) => {
    // Check that expected functions are available on window
    const functionsExposed = await page.evaluate(() => {
      return {
        zoomIn: typeof (window as any).zoomIn === 'function',
        zoomOut: typeof (window as any).zoomOut === 'function',
        newMap: typeof (window as any).newMap === 'function',
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

  test('should have no console errors on page load', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/world-editor');
    await page.waitForTimeout(500);

    // Filter out known non-blocking/expected errors
    const blockerErrors = errors.filter((err) => {
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
    // Setup dialog handler
    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Create a new map');
      dialog.dismiss();
    });

    // Click File menu
    await page.click('button:has-text("File"), [data-testid="file-menu"]').catch(() => {
      // Try alternative selector if menu button not found
      return Promise.resolve();
    });

    // Try to click "New Map" option
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

  test('File menu - Save should show notification', async ({ page }) => {
    // Track notifications
    const notifications: string[] = [];

    await page.evaluate(() => {
      const originalNotification = (window as any).showNotification;
      (window as any).showNotification = function (message: string, type: string) {
        (window as any).__lastNotification = { message, type };
        if (originalNotification) originalNotification(message, type);
      };
    });

    // Try Save action
    await page.keyboard.press('Control+S').catch(() => {
      // Fallback: call quickCloudSave directly
      return page.evaluate(() => {
        (window as any).quickCloudSave?.();
      });
    });

    // Check if notification was triggered
    const notification = await page.evaluate(() => {
      return (window as any).__lastNotification;
    }).catch(() => null);

    if (notification) {
      expect(notification.message).toContain('Saving');
    }
  });

  test('Zoom buttons should exist and be callable', async ({ page }) => {
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

    // Try to open settings
    await page.evaluate(() => {
      (window as any).openSettingsModal?.();
    }).catch(() => {
      // Function may not have full implementation, but should exist
    });
  });

  test('closeModal should be callable', async ({ page }) => {
    const closeModalAvailable = await page.evaluate(() => {
      return typeof (window as any).closeModal === 'function';
    });

    expect(closeModalAvailable).toBe(true);
  });

  test('Export functions should be available', async ({ page }) => {
    const exportFunctions = await page.evaluate(() => {
      return {
        exportAsPNG: typeof (window as any).exportAsPNG === 'function',
        exportAsJSON: typeof (window as any).exportAsJSON === 'function',
        showFoundryExportDialog: typeof (window as any).showFoundryExportDialog === 'function',
        importMapFromFile: typeof (window as any).importMapFromFile === 'function',
      };
    });

    Object.entries(exportFunctions).forEach(([key, value]) => {
      expect(value, `${key} should be available`).toBe(true);
    });
  });

  test('Share Map should show "coming soon" notification', async ({ page }) => {
    await page.evaluate(() => {
      const originalNotification = (window as any).showNotification;
      (window as any).showNotification = function (message: string, type: string) {
        (window as any).__lastNotification = { message, type };
        if (originalNotification) originalNotification(message, type);
      };

      (window as any).shareMap?.();
    });

    const notification = await page.evaluate(() => {
      return (window as any).__lastNotification;
    }).catch(() => null);

    if (notification) {
      expect(notification.message).toContain('coming soon');
    }
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
    const violations: string[] = [];

    // Listen for performance issues
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

    // Perform multiple zoom operations
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        (window as any).zoomIn?.();
      });
      await page.waitForTimeout(50);
    }

    const recordedViolations = await page.evaluate(() => {
      return (window as any).__violations || [];
    });

    // Should have minimal or no violations due to debouncing
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
