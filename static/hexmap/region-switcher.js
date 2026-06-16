// ============================================================================
// REGION SWITCHER MODULE
//
// Provides dynamic region/map switching capability for the hex editor.
// Originally auto-loaded for Earth 996 AD regions, now available for:
// - User-defined regions (future: save/load regional subdivisions)
// - Example map sets (e.g., Earth 996 AD regions loaded via File > Examples)
//
// Usage:
//   const switcher = new RegionSwitcher('/src/lib/data/earth-996-regions.json');
//   switcher.loadRegion('europe').then(ok => console.log('Loaded'));
//   switcher.showUI();  // Display region buttons
//
// ============================================================================

class RegionSwitcher {
  constructor(manifestUrl) {
    this.TAG = '[RegionSwitcher]';
    this.manifestUrl = manifestUrl;
    this.manifest = [];
    this.activeId = null;
    this.cache = new Map();
    this.uiElement = null;
  }

  async fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
  }

  async loadManifest() {
    try {
      const data = await this.fetchJson(this.manifestUrl);
      this.manifest = data.regions || [];
      console.log(`${this.TAG} Loaded ${this.manifest.length} regions`);
      return this.manifest;
    } catch (err) {
      console.error(`${this.TAG} Failed to load manifest:`, err);
      return [];
    }
  }

  async loadRegion(id) {
    const region = this.manifest.find((r) => r.id === id);
    if (!region) {
      console.warn(`${this.TAG} Unknown region '${id}'`);
      return false;
    }

    try {
      let state;
      if (this.cache.has(id)) {
        state = this.cache.get(id);
      } else {
        const baseUrl = this.manifestUrl.substring(0, this.manifestUrl.lastIndexOf('/') + 1);
        state = await this.fetchJson(baseUrl + region.file);
        this.cache.set(id, state);
      }

      if (!window.loadMapDataIntoState) {
        console.error(`${this.TAG} game.js not ready`);
        return false;
      }

      const ok = window.loadMapDataIntoState(state, {
        mapInstanceId: state.mapInstanceId || `region-${id}`,
        fitViewport: { fillRatio: 0.85, maxScale: 6, minScale: 0.02 },
      });

      if (ok !== false) {
        this.activeId = id;
        this.highlightActive();
        console.log(`${this.TAG} Loaded region '${id}' (${region.hexes} hexes)`);
      }
      return !!ok;
    } catch (err) {
      console.error(`${this.TAG} Failed to load region '${id}':`, err);
      return false;
    }
  }

  buildUI() {
    if (document.getElementById('regionSwitcherBar')) return;

    const bar = document.createElement('div');
    bar.id = 'regionSwitcherBar';
    bar.style.cssText = [
      'position:fixed', 'bottom:14px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:9999', 'display:flex', 'gap:4px', 'align-items:center',
      'background:rgba(20,26,35,0.92)', 'border:1px solid #2d3748',
      'padding:5px 8px', 'border-radius:10px', 'box-shadow:0 4px 14px rgba(0,0,0,0.4)',
      'font-family:system-ui,sans-serif', 'font-size:12px',
    ].join(';');

    const label = document.createElement('span');
    label.textContent = 'Region:';
    label.style.cssText = 'color:#a0aec0;margin-right:2px;';
    bar.appendChild(label);

    for (const region of this.manifest) {
      const btn = document.createElement('button');
      btn.textContent = region.name;
      btn.dataset.regionId = region.id;
      btn.style.cssText = [
        'cursor:pointer', 'border:1px solid #2d3748', 'border-radius:6px',
        'padding:4px 9px', 'color:#f0f4f8', 'background:#141a23',
        'font-size:12px', 'white-space:nowrap',
      ].join(';');
      btn.addEventListener('click', () => this.loadRegion(region.id));
      bar.appendChild(btn);
    }

    document.body.appendChild(bar);
    this.uiElement = bar;
  }

  highlightActive() {
    if (!this.uiElement) return;
    this.uiElement.querySelectorAll('button[data-region-id]').forEach((b) => {
      const on = b.dataset.regionId === this.activeId;
      b.style.background = on ? '#2b6cb0' : '#141a23';
      b.style.borderColor = on ? '#4299e1' : '#2d3748';
    });
  }

  showUI() {
    if (!this.uiElement) this.buildUI();
    if (this.uiElement) this.uiElement.style.display = 'flex';
  }

  hideUI() {
    if (this.uiElement) this.uiElement.style.display = 'none';
  }

  getRegions() {
    return this.manifest;
  }

  getActiveId() {
    return this.activeId;
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.RegionSwitcher = RegionSwitcher;
}
