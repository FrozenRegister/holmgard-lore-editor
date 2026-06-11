import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeLoadedMapCollections, hasLoadableMapContent, importMapFromFile } from '../importMap';

describe('importMap.ts normalization', () => {
  it('converts object-based collections to arrays', () => {
    const input = {
      hexes: {
        '0,0': { q: 0, r: 0, terrain: 'grass' },
        '0,1': { q: 0, r: 1, terrain: 'water' }
      },
      mapName: 'Test Map'
    } as any;

    const result = normalizeLoadedMapCollections({ ...input });
    expect(Array.isArray(result.hexes)).toBe(true);
    expect(result.hexes).toHaveLength(2);
    expect(result.hexes).toContainEqual({ q: 0, r: 0, terrain: 'grass' });
  });

  it('leaves existing arrays untouched', () => {
    const input = {
      tokens: [{ id: '1' }],
      landmarks: []
    } as any;
    const result = normalizeLoadedMapCollections({ ...input });
    expect(result).toEqual(input);
  });

  it('handles all collection types', () => {
    const input = {
      hexes: { '0,0': { q: 0, r: 0 } },
      tokens: { '1': { id: '1' } },
      landmarks: { 'land1': { name: 'Landmark 1' } },
      textLabels: { 'label1': { text: 'Label 1' } },
      imageOverlays: { 'img1': { src: 'image.png' } },
      paths: { 'path1': { points: [] } },
      fogOfWar: { 'fog1': { visible: false } },
      subHexes: { 'sub1': { parent: '0,0' } },
      subHexLandmarks: { 'subLand1': { name: 'Sub Landmark' } },
      subHexTokens: { 'subToken1': { id: 'sub1' } },
      detailHexes: { 'detail1': { terrain: 'grass' } },
      layers: { 'layer1': { name: 'Layer 1' } }
    } as any;

    const result = normalizeLoadedMapCollections({ ...input });

    expect(Array.isArray(result.hexes)).toBe(true);
    expect(Array.isArray(result.tokens)).toBe(true);
    expect(Array.isArray(result.landmarks)).toBe(true);
    expect(Array.isArray(result.textLabels)).toBe(true);
    expect(Array.isArray(result.imageOverlays)).toBe(true);
    expect(Array.isArray(result.paths)).toBe(true);
    expect(Array.isArray(result.fogOfWar)).toBe(true);
    expect(Array.isArray(result.subHexes)).toBe(true);
    expect(Array.isArray(result.subHexLandmarks)).toBe(true);
    expect(Array.isArray(result.subHexTokens)).toBe(true);
    expect(Array.isArray(result.detailHexes)).toBe(true);
    expect(Array.isArray(result.layers)).toBe(true);
  });

  it('ignores non-object values', () => {
    const input = {
      hexes: null,
      tokens: undefined,
      mapName: 'Test'
    } as any;
    const result = normalizeLoadedMapCollections({ ...input });
    expect(result.hexes).toBe(null);
    expect(result.tokens).toBe(undefined);
    expect(result.mapName).toBe('Test');
  });
});

describe('hasLoadableMapContent', () => {
  it('returns true for dungeon map type', () => {
    const result = hasLoadableMapContent({ mapType: 'dungeon' } as any);
    expect(result).toBe(true);
  });

  it('returns true for settlement map type', () => {
    const result = hasLoadableMapContent({ mapType: 'settlement' } as any);
    expect(result).toBe(true);
  });

  it('returns true when trimmed mapType matches', () => {
    const result = hasLoadableMapContent({ mapType: '  dungeon  ' } as any);
    expect(result).toBe(true);
  });

  it('returns true for blank world map scaffold', () => {
    const result = hasLoadableMapContent({
      hexes: [],
      tokens: [],
      landmarks: [],
      textLabels: [],
      imageOverlays: [],
      paths: [],
      fogOfWar: [],
      detailHexes: [],
      mapName: 'Test Map'
    } as any);
    expect(result).toBe(true);
  });

  it('returns true when mapName is missing but mapInstanceId is present', () => {
    const result = hasLoadableMapContent({
      hexes: [],
      tokens: [],
      landmarks: [],
      textLabels: [],
      imageOverlays: [],
      paths: [],
      fogOfWar: [],
      detailHexes: [],
      mapInstanceId: 'test-id'
    } as any);
    expect(result).toBe(true);
  });

  it('returns true when canvasBackground property exists', () => {
    const result = hasLoadableMapContent({
      hexes: [],
      tokens: [],
      landmarks: [],
      textLabels: [],
      imageOverlays: [],
      paths: [],
      fogOfWar: [],
      detailHexes: [],
      canvasBackground: 'blue'
    } as any);
    expect(result).toBe(true);
  });

  it('returns true when fogSettings property exists', () => {
    const result = hasLoadableMapContent({
      hexes: [],
      tokens: [],
      landmarks: [],
      textLabels: [],
      imageOverlays: [],
      paths: [],
      fogOfWar: [],
      detailHexes: [],
      fogSettings: { density: 0.5 }
    } as any);
    expect(result).toBe(true);
  });

  it('returns true when any collection has content', () => {
    const result = hasLoadableMapContent({
      hexes: [{ q: 0, r: 0, terrain: 'grass' }]
    } as any);
    expect(result).toBe(true);
  });

  it('returns true when viewport exists', () => {
    const result = hasLoadableMapContent({
      viewport: { q: 0, r: 0, scale: 1 }
    } as any);
    expect(result).toBe(true);
  });

  it('returns true when customTerrains exists', () => {
    const result = hasLoadableMapContent({
      customTerrains: { 'custom1': { color: '#ff0000' } }
    } as any);
    expect(result).toBe(true);
  });

  it('returns false for empty data', () => {
    const result = hasLoadableMapContent({} as any);
    expect(result).toBe(false);
  });

  it('returns false for non-matching map types', () => {
    const result = hasLoadableMapContent({ mapType: 'world' } as any);
    expect(result).toBe(false);
  });

  it('returns false when world map scaffold is incomplete', () => {
    const result = hasLoadableMapContent({
      hexes: [],
      tokens: [],
      // Missing other required arrays
    } as any);
    expect(result).toBe(false);
  });
});

describe('importMapFromFile', () => {
  // Create a mock File object that has a .text() method (jsdom's File doesn't)
  function createMockFile(content: string, name = 'test-map.json'): File {
    const blob = new Blob([content], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    // jsdom's File doesn't have .text() — polyfill it
    if (!('text' in file)) {
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(content),
        writable: false,
        configurable: true,
      });
    }
    return file;
  }

  // Helper: trigger a click() on an <input type="file"> and fake-select a file
  async function triggerFilePick(input: HTMLInputElement, file: File) {
    const changeEvent = new Event('change', { bubbles: true });
    Object.defineProperty(input, 'files', { value: [file], writable: false });
    input.dispatchEvent(changeEvent);
    // Let the async change handler run
    await new Promise((r) => setTimeout(r, 10));
  }

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as any).requestNotificationConfirm;
    delete (window as any).loadMapDataIntoState;
  });

  it('clicks existing #importFileInput if present', () => {
    const input = document.createElement('input');
    input.id = 'importFileInput';
    document.body.appendChild(input);
    const clickSpy = vi.spyOn(input, 'click');

    importMapFromFile();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('creates a fallback picker when #importFileInput is missing', () => {
    const createElSpy = vi.spyOn(document, 'createElement');
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    importMapFromFile();

    expect(createElSpy).toHaveBeenCalledWith('input');
    expect(appendSpy).toHaveBeenCalled();

    createElSpy.mockRestore();
    appendSpy.mockRestore();
  });

  it('fallback picker shows alert for invalid map JSON', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    importMapFromFile();
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    expect(picker).toBeTruthy();

    await triggerFilePick(picker, createMockFile('{invalid json'));

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Error importing map file'));
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
    alertSpy.mockRestore();
  });

  it('fallback picker alerts for empty map data (no loadable content)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    importMapFromFile();
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement;

    await triggerFilePick(picker, createMockFile('{}'));

    expect(alertSpy).toHaveBeenCalledWith('Invalid map file format');
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
    alertSpy.mockRestore();
  });

  it('fallback picker asks for confirmation when requestNotificationConfirm is available', async () => {
    const confirmSpy = vi.fn(() => Promise.resolve(false));
    (window as any).requestNotificationConfirm = confirmSpy;

    importMapFromFile();
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement;

    await triggerFilePick(picker, createMockFile(JSON.stringify({ mapType: 'dungeon' })));

    expect(confirmSpy).toHaveBeenCalledWith(
      'import-map-file',
      expect.stringContaining('Import this map?'),
      expect.objectContaining({ title: 'Import Map' }),
    );
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
  });

  it('fallback picker aborts when user denies confirmation', async () => {
    const confirmSpy = vi.fn(() => Promise.resolve(false));
    const loadSpy = vi.fn(() => true);
    (window as any).requestNotificationConfirm = confirmSpy;
    (window as any).loadMapDataIntoState = loadSpy;

    importMapFromFile();
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement;

    await triggerFilePick(picker, createMockFile(JSON.stringify({ mapType: 'dungeon' })));

    // loadMapDataIntoState should NOT be called because the user said no
    expect(loadSpy).not.toHaveBeenCalled();
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
  });

  it('fallback picker alerts when loadMapDataIntoState is missing', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const confirmSpy = vi.fn(() => Promise.resolve(true));
    (window as any).requestNotificationConfirm = confirmSpy;
    // loadMapDataIntoState intentionally not set

    importMapFromFile();
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement;

    await triggerFilePick(picker, createMockFile(JSON.stringify({ mapType: 'dungeon' })));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Map loader not available yet'),
    );
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
    alertSpy.mockRestore();
  });

  it('fallback picker loads map successfully when all preconditions are met', async () => {
    const confirmSpy = vi.fn(() => Promise.resolve(true));
    const loadSpy = vi.fn(() => true);
    (window as any).requestNotificationConfirm = confirmSpy;
    (window as any).loadMapDataIntoState = loadSpy;

    importMapFromFile();
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement;

    await triggerFilePick(picker, createMockFile(JSON.stringify({ mapType: 'dungeon', mapName: 'Test' })));

    expect(loadSpy).toHaveBeenCalledWith(
      expect.objectContaining({ mapType: 'dungeon' }),
      expect.objectContaining({ resetLayersToDefault: true }),
    );
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
  });

  it('fallback picker alerts when loadMapDataIntoState returns false', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const confirmSpy = vi.fn(() => Promise.resolve(true));
    const loadSpy = vi.fn(() => false);
    (window as any).requestNotificationConfirm = confirmSpy;
    (window as any).loadMapDataIntoState = loadSpy;

    importMapFromFile();
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement;

    await triggerFilePick(picker, createMockFile(JSON.stringify({ mapType: 'dungeon' })));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error importing map file'),
    );
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
    alertSpy.mockRestore();
  });

  it('window.importMapFromFile is set as a function', () => {
    // The auto-install runs at module import time in jsdom (typeof window !== 'undefined' is true)
    // Verify it was installed during module initialization
    expect(typeof (window as any).importMapFromFile).toBe('function');
  });
});