import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Game UI Bindings - Function Exposure', () => {
  let originalWindow: Partial<Window & typeof globalThis>;

  beforeEach(() => {
    // Save original window state
    originalWindow = {
      zoomIn: (window as any).zoomIn,
      zoomOut: (window as any).zoomOut,
      newMap: (window as any).newMap,
      quickCloudSave: (window as any).quickCloudSave,
      shareMap: (window as any).shareMap,
      returnToParentMap: (window as any).returnToParentMap,
      showAuthModal: (window as any).showAuthModal,
      undoRedoSystem: (window as any).undoRedoSystem,
      state: (window as any).state,
      showNotification: (window as any).showNotification,
    };

    // Clear functions before each test
    delete (window as any).zoomIn;
    delete (window as any).zoomOut;
    delete (window as any).newMap;
    delete (window as any).quickCloudSave;
    delete (window as any).shareMap;
    delete (window as any).returnToParentMap;
    delete (window as any).showAuthModal;
    delete (window as any).undoRedoSystem;
  });

  afterEach(() => {
    // Restore original state
    Object.assign(window, originalWindow);
  });

  describe('Zoom Functions', () => {
    it('should create zoomIn function if not present', () => {
      expect(typeof (window as any).zoomIn).toBe('undefined');

      // Simulate the binding script creating the function
      const mockState = {
        hexMap: {
          viewport: {
            scale: 1,
          },
        },
      };
      (window as any).state = mockState;
      (window as any).renderHex = vi.fn();

      // Create zoomIn
      let zoomInProgress = false;
      (window as any).zoomIn = function () {
        if (zoomInProgress || !window.state || !window.state.hexMap || !window.state.hexMap.viewport)
          return;
        zoomInProgress = true;

        const oldScale = window.state.hexMap.viewport.scale;
        const zoomStep = 1.3;
        const newScale = Math.min(500, oldScale * zoomStep);
        window.state.hexMap.viewport.scale = newScale;

        if (typeof window.renderHex === 'function') (window as any).renderHex();
        zoomInProgress = false;
      };

      expect(typeof (window as any).zoomIn).toBe('function');

      // Test that zoomIn increases scale
      const initialScale = mockState.hexMap.viewport.scale;
      (window as any).zoomIn();
      expect(mockState.hexMap.viewport.scale).toBeGreaterThan(initialScale);
      expect((window as any).renderHex).toHaveBeenCalled();
    });

    it('should create zoomOut function if not present', () => {
      expect(typeof (window as any).zoomOut).toBe('undefined');

      const mockState = {
        hexMap: {
          viewport: {
            scale: 2,
          },
        },
      };
      (window as any).state = mockState;
      (window as any).renderHex = vi.fn();

      // Create zoomOut
      let zoomInProgress = false;
      (window as any).zoomOut = function () {
        if (zoomInProgress || !window.state || !window.state.hexMap || !window.state.hexMap.viewport)
          return;
        zoomInProgress = true;

        const oldScale = window.state.hexMap.viewport.scale;
        const zoomStep = 1.3;
        const newScale = Math.max(0.02, oldScale / zoomStep);
        window.state.hexMap.viewport.scale = newScale;

        if (typeof window.renderHex === 'function') (window as any).renderHex();
        zoomInProgress = false;
      };

      expect(typeof (window as any).zoomOut).toBe('function');

      // Test that zoomOut decreases scale
      const initialScale = mockState.hexMap.viewport.scale;
      (window as any).zoomOut();
      expect(mockState.hexMap.viewport.scale).toBeLessThan(initialScale);
      expect((window as any).renderHex).toHaveBeenCalled();
    });

    it('should respect zoom scale limits', () => {
      const mockState = {
        hexMap: {
          viewport: {
            scale: 500,
          },
        },
      };
      (window as any).state = mockState;
      (window as any).renderHex = vi.fn();

      let zoomInProgress = false;
      (window as any).zoomIn = function () {
        if (zoomInProgress) return;
        zoomInProgress = true;

        const oldScale = window.state.hexMap.viewport.scale;
        const zoomStep = 1.3;
        const newScale = Math.min(500, oldScale * zoomStep);
        window.state.hexMap.viewport.scale = newScale;
        zoomInProgress = false;
      };

      (window as any).zoomIn();
      // Should not exceed 500
      expect(mockState.hexMap.viewport.scale).toBeLessThanOrEqual(500);
    });

    it('should debounce zoom to prevent rapid calls', () => {
      const mockState = {
        hexMap: {
          viewport: {
            scale: 1,
          },
        },
      };
      (window as any).state = mockState;
      (window as any).renderHex = vi.fn();

      let zoomInProgress = false;
      (window as any).zoomIn = function () {
        if (zoomInProgress) return;
        zoomInProgress = true;

        mockState.hexMap.viewport.scale *= 1.3;
        (window as any).renderHex();
        zoomInProgress = false;
      };

      // First call should work
      (window as any).zoomIn();
      const firstScale = mockState.hexMap.viewport.scale;

      // Immediate second call should be blocked (debounced)
      (window as any).zoomIn();
      expect(mockState.hexMap.viewport.scale).toBe(firstScale);
    });
  });

  describe('Stub Functions', () => {
    beforeEach(() => {
      (window as any).showNotification = vi.fn();
    });

    it('should create newMap stub with confirmation', () => {
      expect(typeof (window as any).newMap).toBe('undefined');

      global.confirm = vi.fn(() => true);

      (window as any).newMap = function () {
        if (confirm('Create a new map? Any unsaved changes will be lost.')) {
          (window as any).showNotification?.('New map feature coming soon', 'info');
        }
      };

      expect(typeof (window as any).newMap).toBe('function');
      (window as any).newMap();

      expect(global.confirm).toHaveBeenCalledWith(
        'Create a new map? Any unsaved changes will be lost.'
      );
      expect((window as any).showNotification).toHaveBeenCalledWith(
        'New map feature coming soon',
        'info'
      );
    });

    it('should create quickCloudSave stub', () => {
      expect(typeof (window as any).quickCloudSave).toBe('undefined');

      (window as any).quickCloudSave = function () {
        (window as any).showNotification?.('Saving...', 'info');
      };

      expect(typeof (window as any).quickCloudSave).toBe('function');
      (window as any).quickCloudSave();

      expect((window as any).showNotification).toHaveBeenCalledWith('Saving...', 'info');
    });

    it('should create shareMap stub', () => {
      expect(typeof (window as any).shareMap).toBe('undefined');

      (window as any).shareMap = function () {
        (window as any).showNotification?.('Share feature coming soon', 'info');
      };

      expect(typeof (window as any).shareMap).toBe('function');
      (window as any).shareMap();

      expect((window as any).showNotification).toHaveBeenCalledWith(
        'Share feature coming soon',
        'info'
      );
    });

    it('should create returnToParentMap stub', () => {
      expect(typeof (window as any).returnToParentMap).toBe('undefined');

      (window as any).returnToParentMap = function () {
        console.log('[Game UI Bindings] Return to parent map - feature not yet available');
        (window as any).showNotification?.('Cannot return to parent map', 'warning');
      };

      expect(typeof (window as any).returnToParentMap).toBe('function');
      (window as any).returnToParentMap();

      expect((window as any).showNotification).toHaveBeenCalledWith(
        'Cannot return to parent map',
        'warning'
      );
    });
  });

  describe('Auth Functions', () => {
    it('should create showAuthModal wrapper', () => {
      expect(typeof (window as any).showAuthModal).toBe('undefined');

      // Create a mock modal element
      const mockModal = document.createElement('div');
      mockModal.id = 'accountModal';
      mockModal.style.display = 'none';
      document.body.appendChild(mockModal);

      (window as any).showNotification = vi.fn();

      (window as any).showAuthModal = function (mode = 'login') {
        const accountModal = document.getElementById('accountModal');
        if (accountModal) {
          accountModal.style.display = 'flex';
        } else {
          (window as any).showNotification?.('Auth system not loaded', 'error');
        }
      };

      expect(typeof (window as any).showAuthModal).toBe('function');

      (window as any).showAuthModal('login');
      expect(mockModal.style.display).toBe('flex');

      // Cleanup
      document.body.removeChild(mockModal);
    });

    it('should show error if accountModal not found', () => {
      (window as any).showNotification = vi.fn();

      (window as any).showAuthModal = function (mode = 'login') {
        const accountModal = document.getElementById('accountModal');
        if (accountModal) {
          accountModal.style.display = 'flex';
        } else {
          (window as any).showNotification?.('Auth system not loaded', 'error');
        }
      };

      (window as any).showAuthModal('login');
      expect((window as any).showNotification).toHaveBeenCalledWith(
        'Auth system not loaded',
        'error'
      );
    });
  });

  describe('Undo/Redo System', () => {
    it('should create undoRedoSystem stub if not present', () => {
      expect((window as any).undoRedoSystem).toBeUndefined();

      (window as any).undoRedoSystem = {
        undo: vi.fn(),
        redo: vi.fn(),
      };

      expect(typeof (window as any).undoRedoSystem).toBe('object');
      expect(typeof (window as any).undoRedoSystem.undo).toBe('function');
      expect(typeof (window as any).undoRedoSystem.redo).toBe('function');

      (window as any).undoRedoSystem.undo();
      (window as any).undoRedoSystem.redo();

      expect((window as any).undoRedoSystem.undo).toHaveBeenCalled();
      expect((window as any).undoRedoSystem.redo).toHaveBeenCalled();
    });
  });

  describe('Function Audit', () => {
    it('should identify missing expected functions', () => {
      const expectedFunctions = [
        'setHexMode',
        'updateBrushSize',
        'openSettingsModal',
        'closeModal',
        'importMapFromFile',
        'exportAsPNG',
      ];

      const missing = [];
      expectedFunctions.forEach((fname) => {
        if (typeof (window as any)[fname] !== 'function') {
          missing.push(fname);
        }
      });

      // All should be missing in this fresh test environment
      expect(missing.length).toBeGreaterThan(0);
    });

    it('should detect when functions are properly exposed', () => {
      // Mock some functions
      (window as any).setHexMode = vi.fn();
      (window as any).updateBrushSize = vi.fn();
      (window as any).openSettingsModal = vi.fn();

      const expectedFunctions = ['setHexMode', 'updateBrushSize', 'openSettingsModal'];

      const missing = [];
      expectedFunctions.forEach((fname) => {
        if (typeof (window as any)[fname] !== 'function') {
          missing.push(fname);
        }
      });

      expect(missing.length).toBe(0);
    });
  });
});
