// importMap — Import JSON map file logic.
//
// Extracted from game.js (which is vendor-managed via R2 and untouchable)
// so that the "Import Map (JSON)" menu item works reliably on every deploy.
//
// game.js exposes `window.loadMapDataIntoState`, and auth.js exposes
// `window.requestNotificationConfirm` — we call those at runtime.
//
// The helper functions `normalizeLoadedMapCollections` and
// `hasLoadableMapContent` are duplicated here because they are NOT
// exported from game.js.

interface LoadableMapData {
  hexes?: Array<unknown> | Record<string, unknown>;
  tokens?: Array<unknown> | Record<string, unknown>;
  landmarks?: Array<unknown> | Record<string, unknown>;
  textLabels?: Array<unknown> | Record<string, unknown>;
  imageOverlays?: Array<unknown> | Record<string, unknown>;
  paths?: Array<unknown> | Record<string, unknown>;
  fogOfWar?: Array<unknown> | Record<string, unknown>;
  subHexes?: Array<unknown> | Record<string, unknown>;
  subHexLandmarks?: Array<unknown> | Record<string, unknown>;
  subHexTokens?: Array<unknown> | Record<string, unknown>;
  detailHexes?: Array<unknown> | Record<string, unknown>;
  layers?: Array<unknown> | Record<string, unknown>;
  dungeonLayout?: unknown;
  settlementLayout?: unknown;
  mapType?: string;
  mapName?: string;
  mapInstanceId?: string;
  [key: string]: unknown;
}

const MAP_COLLECTION_KEYS = [
  'hexes',
  'tokens',
  'landmarks',
  'textLabels',
  'imageOverlays',
  'paths',
  'fogOfWar',
  'subHexes',
  'subHexLandmarks',
  'subHexTokens',
  'detailHexes',
  'layers',
] as const;

export function normalizeLoadedMapCollections(data: LoadableMapData): LoadableMapData {
  for (const key of MAP_COLLECTION_KEYS) {
    const val = data[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      (data as Record<string, unknown>)[key] = Object.values(val);
    }
  }

  return data;
}

export function hasLoadableMapContent(data: LoadableMapData): boolean {
  const normalizedType = (typeof data.mapType === 'string' ? data.mapType : '').trim();

  if (normalizedType === 'dungeon' || normalizedType === 'settlement') {
    return true;
  }

  const hasBlankWorldMapScaffold =
    Array.isArray(data.hexes) &&
    Array.isArray(data.tokens) &&
    Array.isArray(data.landmarks) &&
    Array.isArray(data.textLabels) &&
    Array.isArray(data.imageOverlays) &&
    Array.isArray(data.paths) &&
    Array.isArray(data.fogOfWar) &&
    Array.isArray(data.detailHexes) &&
    (typeof data.mapName === 'string' ||
      typeof data.mapInstanceId === 'string' ||
      Object.prototype.hasOwnProperty.call(data, 'canvasBackground') ||
      Object.prototype.hasOwnProperty.call(data, 'fogSettings'));

  return (
    MAP_COLLECTION_KEYS.some(
      (key) => Array.isArray(data[key]) && (data[key] as Array<unknown>).length > 0,
    ) ||
    !!data.viewport ||
    !!data.customTerrains ||
    hasBlankWorldMapScaffold
  );
}

/**
 * Open the hidden `<input type="file" id="importFileInput">` so game.js's
 * change handler (`handleFileImport`) processes the selected JSON file.
 *
 * game.js already wires `addEventListener('change', handleFileImport)` on
 * `#importFileInput`, so we only need to trigger the click.
 */
export function importMapFromFile(): void {
  const fileInput = document.getElementById(
    'importFileInput',
  ) as HTMLInputElement | null;
  if (fileInput) {
    fileInput.click();
    return;
  }

  // ── Fallback: the DOM element isn't ready yet.  Build our own picker
  //    and do the full import inline (works even before the hex editor
  //    scripts have finished booting). ──
  const fallbackPicker = document.createElement('input');
  fallbackPicker.type = 'file';
  fallbackPicker.accept = '.json';
  fallbackPicker.style.display = 'none';
  document.body.appendChild(fallbackPicker);

  // Using a one-time listener to handle the file processing
  // and ensure we clean up the DOM afterward.
  fallbackPicker.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const mapData = JSON.parse(text);
      normalizeLoadedMapCollections(mapData);

      if (!hasLoadableMapContent(mapData)) {
        alert('Invalid map file format');
        return;
      }

      const requestConfirm = (window as any).requestNotificationConfirm as
        | ((key: string, msg: string, opts: Record<string, unknown>) => Promise<boolean>)
        | undefined;

      if (
        requestConfirm &&
        !(await requestConfirm(
          'import-map-file',
          "Import this map? This will replace your current map. Make sure you've saved!",
          {
            title: 'Import Map',
            confirmLabel: 'Import Map',
            note: 'Importing replaces the current map state with the file you selected.',
          },
        ))
      ) {
        return;
      }

      const loadIntoState = (window as any).loadMapDataIntoState as
        | ((data: LoadableMapData, opts: Record<string, unknown>) => boolean)
        | undefined;

      if (typeof loadIntoState !== 'function') {
        alert('Map loader not available yet.  Please wait for the editor to finish loading and try again.');
        return;
      }

      const loaded = loadIntoState(mapData, {
        resetLayersToDefault: true,
        refreshCompendium: true,
        saveToCache: true,
      });

      if (!loaded) {
        alert(
          'Error importing map file. Please make sure it\'s a valid HexAtlas JSON file.',
        );
        return;
      }

      alert('Map imported successfully!');
    } catch (error) {
      console.error('Error importing map:', error);
      alert('Error importing map file. Please make sure it\'s a valid HexAtlas JSON file.');
    } finally {
      fallbackPicker.remove();
    }
  }, { once: true });

  fallbackPicker.click();
}

// Install on window immediately so the Svelte onclick handler
// `window.importMapFromFile?.()` always finds a function.
if (typeof window !== 'undefined') {
  (window as any).importMapFromFile = importMapFromFile;
}