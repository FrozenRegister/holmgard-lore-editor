import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

function simulateBrowser() {
  delete (globalThis as any).__TAURI__;
}

afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.resetModules();
  simulateBrowser();
});

describe('defaults integration', () => {
  it('should export DEFAULT_SETTINGS with correct values', async () => {
    const { DEFAULT_SETTINGS } = await import('$lib/defaults');
    expect(DEFAULT_SETTINGS.workerHost).toBe('https://holmgard-lore-mcp.frozenregister.workers.dev');
    expect(DEFAULT_SETTINGS.autoSyncIntervalSecs).toBe(30);
    expect(DEFAULT_SETTINGS.autoSync).toBe(true);
    expect(DEFAULT_SETTINGS.syncHistory).toBe(true);
  });

  it('should have all required AppSettings fields', async () => {
    const { DEFAULT_SETTINGS } = await import('$lib/defaults');
    const requiredKeys = ['workerHost', 'autoSyncIntervalSecs', 'autoSync', 'syncHistory'] as const;
    for (const key of requiredKeys) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key);
    }
  });

  it('should be used as fallback by storage.ts when no settings saved', async () => {
    const { DEFAULT_SETTINGS } = await import('$lib/defaults');
    const { loadSettings } = await import('$lib/storage');

    const settings = await loadSettings();
    expect(settings.workerHost).toBe(DEFAULT_SETTINGS.workerHost);
    expect(settings.autoSync).toBe(true);
    expect(settings.syncHistory).toBe(true);
  });

  it('should be used as initial value by stores.ts', async () => {
    const { DEFAULT_SETTINGS } = await import('$lib/defaults');
    const { settings } = await import('$lib/stores');
    const { get } = await import('svelte/store');

    const s = get(settings);
    expect(s.workerHost).toBe(DEFAULT_SETTINGS.workerHost);
    expect(s.autoSync).toBe(true);
  });

  it('should allow partial overrides via storage.saveSettings', async () => {
    const { DEFAULT_SETTINGS } = await import('$lib/defaults');
    const { saveSettings, loadSettings } = await import('$lib/storage');

    await saveSettings({ ...DEFAULT_SETTINGS, autoSync: false });
    const settings = await loadSettings();
    expect(settings.autoSync).toBe(false);
    expect(settings.workerHost).toBe(DEFAULT_SETTINGS.workerHost);
  });
});