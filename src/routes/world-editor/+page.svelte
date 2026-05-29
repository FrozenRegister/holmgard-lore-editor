<script lang="ts">
  /**
   * World Map editor — hierarchical hex worldbuilding.
   *
   * Each map is persisted as its own topic, keyed `map:<mapId>` (e.g.
   * `map:world:continents`, `map:world:continents:europe`). Topic text is a
   * Markdown doc wrapping a fenced ```json block so it round-trips through the
   * existing sync/preview pipeline. Parent/child links live inside each map
   * object, so the whole tree rebuilds from the `map:`-prefixed topics.
   */
  import { onMount, onDestroy } from 'svelte';
  import { topics, settings, syncState, showToast } from '$lib/stores';
  import { saveTopic, loadTopic } from '$lib/storage';
  import { pushHistory } from '$lib/history';
  import { adminSave, enqueue } from '$lib/sync';
  import { getAdminSecret } from '$lib/auth';
  import type { Topic } from '$lib/types';

  // ── Types ───────────────────────────────────────────────────────────────────
  interface Overlay { type: string; data?: Record<string, unknown>; }
  interface Tile {
    terrain: string;
    elevation: number;
    overlays: Overlay[];
    label: string | null;
    lore_key: string | null;
    features: string[];
  }
  interface WorldMap {
    id: string;
    level: string;
    name: string;
    parent: string | null;
    bounds: { qmin: number; qmax: number; rmin: number; rmax: number };
    tiles: Record<string, Tile>;
    children: string[];
    seed: number;
    wraps?: { east_west?: boolean };
  }

  // ── Constants ─────────────────────────────────────────────────────────────────
  const MAP_PREFIX = 'map:';
  const ROOT_ID = 'world:continents';
  const HEX_SIZE = 26;

  const TERRAIN_COLORS: Record<string, string> = {
    grassland: '#7cb342', forest: '#4a7023', mountain: '#8b7355',
    water: '#1976d2', desert: '#daa520', tundra: '#b0c4de',
  };
  const TERRAIN_OPTIONS = Object.keys(TERRAIN_COLORS);

  const OVERLAY_TYPES = ['animal_territory', 'threat_level', 'dynasty_influence', 'claim'];
  const OVERLAY_COLORS: Record<string, string> = {
    animal_territory: 'rgba(255,107,107,0.35)',
    threat_level: 'rgba(244,67,54,0.35)',
    dynasty_influence: 'rgba(103,58,183,0.35)',
    claim: 'rgba(76,175,80,0.35)',
  };

  // ── Reactive state ──────────────────────────────────────────────────────────
  let maps: Record<string, WorldMap> = {};
  let activeMapId = ROOT_ID;
  let selected: { q: number; r: number } | null = null;
  let activeOverlay: string | null = null;
  let overlayToPaint = OVERLAY_TYPES[0];
  let loading = true;
  let dirty = new Set<string>();
  let svgEl: SVGSVGElement;

  $: activeMap = maps[activeMapId];
  $: selectedTile = selected && activeMap ? activeMap.tiles[`${selected.q},${selected.r}`] : null;
  $: breadcrumb = buildBreadcrumb(activeMapId);

  // ── Perlin noise (deterministic) ──────────────────────────────────────────────
  class PerlinNoise {
    p: number[];
    constructor(seed = 0) {
      const perm = Array.from({ length: 256 }, (_, i) => i);
      let s = seed;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      this.p = [...perm, ...perm];
    }
    private fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
    private lerp(t: number, a: number, b: number) { return a + t * (b - a); }
    private grad(h: number, x: number, y: number) {
      const hh = h & 15; const u = hh < 8 ? x : y; const v = hh < 8 ? y : x;
      return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
    }
    noise(x: number, y: number) {
      const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = this.fade(xf), v = this.fade(yf);
      const aa = this.p[this.p[xi] + yi], ab = this.p[this.p[xi] + yi + 1];
      const ba = this.p[this.p[xi + 1] + yi], bb = this.p[this.p[xi + 1] + yi + 1];
      const x1 = this.lerp(u, this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf));
      const x2 = this.lerp(u, this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1));
      return this.lerp(v, x1, x2);
    }
  }

  function hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }

  // ── Generation ────────────────────────────────────────────────────────────────
  function generateTiles(map: WorldMap, scale: number, waterT: number, mtnT: number, forestT: number) {
    const noise = new PerlinNoise(map.seed);
    const { qmin, qmax, rmin, rmax } = map.bounds;
    for (let q = qmin; q <= qmax; q++) {
      for (let r = rmin; r <= rmax; r++) {
        const val = noise.noise(q / scale, r / scale);
        let terrain = 'grassland';
        if (val < waterT) terrain = 'water';
        else if (val > mtnT) terrain = 'mountain';
        else if (val > forestT) terrain = 'forest';
        map.tiles[`${q},${r}`] = {
          terrain,
          elevation: Math.max(0, Math.floor((val + 1) * 5)),
          overlays: [], label: null, lore_key: null, features: [],
        };
      }
    }
  }

  function initializeWorld() {
    const root: WorldMap = {
      id: ROOT_ID, level: 'continents', name: 'World Continents', parent: null,
      bounds: { qmin: 0, qmax: 100, rmin: 0, rmax: 80 },
      tiles: {}, children: [], seed: (Math.random() * 1e6) | 0,
      wraps: { east_west: true },
    };
    generateTiles(root, 20, -0.3, 0.4, 0.1);
    maps = { [ROOT_ID]: root };
    dirty.add(ROOT_ID);
  }

  function createChildRegion(name: string, level: string, width: number, height: number) {
    const parentId = activeMapId;
    const id = `${parentId}:${name.toLowerCase().replace(/\s+/g, '-')}`;
    if (maps[id]) { showToast(`Region "${name}" already exists`, 'error'); return; }

    const child: WorldMap = {
      id, level, name, parent: parentId,
      bounds: { qmin: 0, qmax: width - 1, rmin: 0, rmax: height - 1 },
      tiles: {}, children: [], seed: hashString(name),
    };
    generateTiles(child, 15, -0.2, 0.3, 0.05);

    maps[parentId]?.children.push(id);
    maps = { ...maps, [id]: child };
    dirty.add(id); dirty.add(parentId);
    showToast(`Created "${name}"`, 'success');
  }

  function regenerateActive() {
    const map = maps[activeMapId];
    if (!map || !map.parent) { showToast('Only child regions regenerate', 'warning'); return; }
    map.seed = (Math.random() * 1e6) | 0;
    map.tiles = {};
    generateTiles(map, 15, -0.2, 0.3, 0.05);
    maps = { ...maps };
    dirty.add(map.id);
    renderMap();
    showToast('Regenerated', 'info');
  }

  // ── Hex math + rendering ────────────────────────────────────────────────────
  function hexToPixel(q: number, r: number, map: WorldMap) {
    let aq = q;
    if (map.wraps?.east_west) {
      const w = map.bounds.qmax - map.bounds.qmin + 1;
      aq = (((q - map.bounds.qmin) % w) + w) % w + map.bounds.qmin;
    }
    return {
      x: HEX_SIZE * (1.5 * aq) + HEX_SIZE * 2,
      y: HEX_SIZE * (Math.sqrt(3) * (r + aq / 2)) + HEX_SIZE * 2,
    };
  }

  function hexPoints(cx: number, cy: number) {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      pts.push(`${cx + HEX_SIZE * Math.cos(a)},${cy + HEX_SIZE * Math.sin(a)}`);
    }
    return pts.join(' ');
  }

  function renderMap() {
    const map = maps[activeMapId];
    if (!map || !svgEl) return;
    const NS = 'http://www.w3.org/2000/svg';
    svgEl.innerHTML = '';

    let maxX = 0, maxY = 0;
    for (const key of Object.keys(map.tiles)) {
      const [q, r] = key.split(',').map(Number);
      const tile = map.tiles[key];
      const { x, y } = hexToPixel(q, r, map);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);

      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', hexPoints(x, y));
      poly.setAttribute('fill', TERRAIN_COLORS[tile.terrain] ?? '#666');
      poly.setAttribute('stroke', tile.elevation > 7 ? '#6a5a4a' : tile.elevation > 5 ? '#5a4a3a' : '#1a1f3a');
      poly.setAttribute('stroke-width', tile.elevation > 7 ? '2' : tile.elevation > 5 ? '1.5' : '0.5');
      if (selected && selected.q === q && selected.r === r) {
        poly.setAttribute('stroke', 'var(--accent)');
        poly.setAttribute('stroke-width', '2.5');
      }
      poly.style.cursor = 'pointer';
      poly.addEventListener('click', () => selectHex(q, r));
      svgEl.appendChild(poly);

      // Overlays
      if (activeOverlay && tile.overlays.some((o) => o.type === activeOverlay)) {
        const ov = document.createElementNS(NS, 'polygon');
        ov.setAttribute('points', hexPoints(x, y));
        ov.setAttribute('fill', OVERLAY_COLORS[activeOverlay] ?? 'rgba(255,255,255,0.25)');
        ov.setAttribute('pointer-events', 'none');
        svgEl.appendChild(ov);
      } else if (!activeOverlay && tile.overlays.length) {
        tile.overlays.slice(0, 3).forEach((o, i) => {
          const dot = document.createElementNS(NS, 'circle');
          dot.setAttribute('cx', String(x + (i - 1) * 7));
          dot.setAttribute('cy', String(y + HEX_SIZE * 0.4));
          dot.setAttribute('r', '3');
          dot.setAttribute('fill', OVERLAY_COLORS[o.type] ?? '#999');
          dot.setAttribute('pointer-events', 'none');
          svgEl.appendChild(dot);
        });
      }

      if (tile.label) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', String(x)); t.setAttribute('y', String(y - 2));
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', '#fff');
        t.setAttribute('font-size', '10'); t.setAttribute('pointer-events', 'none');
        t.textContent = tile.label;
        svgEl.appendChild(t);
      }
    }
    svgEl.setAttribute('viewBox', `0 0 ${maxX + HEX_SIZE * 2} ${maxY + HEX_SIZE * 2}`);
  }

  // ── Interaction ───────────────────────────────────────────────────────────────
  function selectHex(q: number, r: number) {
    selected = { q, r };
    renderMap();
  }

  function commitTileEdit() {
    if (!activeMap) return;
    dirty.add(activeMap.id);
    maps = { ...maps };
    renderMap();
  }

  function addOverlay() {
    if (!selectedTile) return;
    if (!selectedTile.overlays.some((o) => o.type === overlayToPaint)) {
      selectedTile.overlays.push({ type: overlayToPaint });
      commitTileEdit();
    }
  }
  function removeOverlay() {
    if (!selectedTile) return;
    selectedTile.overlays = selectedTile.overlays.filter((o) => o.type !== overlayToPaint);
    commitTileEdit();
  }

  function switchLayer(id: string) { activeMapId = id; selected = null; renderMap(); }
  function toggleOverlay(t: string) { activeOverlay = activeOverlay === t ? null : t; renderMap(); }

  function buildBreadcrumb(id: string): WorldMap[] {
    const chain: WorldMap[] = [];
    let cur: string | null = id;
    while (cur && maps[cur]) { chain.unshift(maps[cur]); cur = maps[cur].parent; }
    return chain;
  }

  // ── Persistence ───────────────────────────────────────────────────────────────
  function mapTopicKey(id: string) { return MAP_PREFIX + id; }

  function wrapMarkdown(map: WorldMap): string {
    return `# Map: ${map.name}\n\n_${map.level} · ${Object.keys(map.tiles).length} tiles_\n\n\`\`\`json\n${JSON.stringify(map, null, 2)}\n\`\`\`\n`;
  }
  function unwrapMarkdown(text: string): WorldMap | null {
    const fence = text.match(/```json\s*([\s\S]*?)```/);
    const raw = fence ? fence[1] : text;
    try { return JSON.parse(raw) as WorldMap; } catch { return null; }
  }

  async function saveMapTopic(map: WorldMap, remote: boolean, secret: string | null) {
    const key = mapTopicKey(map.id);
    const existing = await loadTopic(key);
    const version = (existing?.meta.version ?? 0) + 1;
    const text = wrapMarkdown(map);
    const topic: Topic = { key, text, meta: { updatedAt: new Date().toISOString(), version } };
    await saveTopic(topic);
    await pushHistory(key, text, version, 'local');
    topics.update((ts) => {
      const i = ts.findIndex((t) => t.key === key);
      if (i >= 0) { ts[i] = topic; return [...ts]; }
      return [...ts, topic];
    });
    if (remote && secret) {
      try {
        await adminSave($settings.workerHost, key, text, secret);
      } catch (err: any) {
        await enqueue(key, text);
        throw err;
      }
    }
  }

  async function saveWorld() {
    const ids = [...dirty];
    if (ids.length === 0) { showToast('Nothing to save', 'info'); return; }
    const secret = await getAdminSecret();
    const remote = !!secret;
    if (!secret) showToast('No admin secret — saving locally only', 'warning');
    syncState.set({ status: 'syncing' });
    try {
      for (const id of ids) { if (maps[id]) await saveMapTopic(maps[id], remote, secret); }
      dirty = new Set();
      syncState.set({ status: 'success', lastSync: new Date().toISOString() });
      showToast(remote ? `Saved ${ids.length} map(s) + synced` : `Saved ${ids.length} map(s) locally`, 'success');
    } catch (err: any) {
      syncState.set({ status: 'error', error: err.message });
      showToast('Some maps queued for offline sync', 'warning');
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  onMount(() => {
    const mapTopics = $topics.filter((t) => t.key.startsWith(MAP_PREFIX));
    if (mapTopics.length) {
      const loaded: Record<string, WorldMap> = {};
      for (const t of mapTopics) {
        const m = unwrapMarkdown(t.text);
        if (m) loaded[m.id] = m;
      }
      if (Object.keys(loaded).length) {
        maps = loaded;
        activeMapId = maps[ROOT_ID] ? ROOT_ID : Object.keys(loaded)[0];
      } else { initializeWorld(); }
    } else {
      initializeWorld();
    }
    loading = false;
    requestAnimationFrame(renderMap);
  });

  onDestroy(() => { if (dirty.size) saveWorld(); });
</script>

<div class="world-editor">
  <header class="we-header">
    <nav class="we-breadcrumb" aria-label="Map hierarchy">
      {#each breadcrumb as m, i}
        {#if i > 0}<span class="we-sep">›</span>{/if}
        <button
          class="we-crumb"
          class:active={m.id === activeMapId}
          on:click={() => switchLayer(m.id)}
        >{m.name}</button>
      {/each}
    </nav>
    <button class="btn btn-primary btn-sm" on:click={saveWorld}>
      Save World{#if dirty.size} ({dirty.size}){/if}
    </button>
  </header>

  {#if loading}
    <p class="we-loading">Loading world…</p>
  {:else}
    <div class="we-body">
      <!-- Map canvas -->
      <div class="we-canvas-wrap">
        <div class="we-toolbar">
          <span class="we-label">Overlays</span>
          {#each OVERLAY_TYPES as t}
            <button
              class="we-chip"
              class:active={activeOverlay === t}
              on:click={() => toggleOverlay(t)}
            >{t.split('_')[0]}</button>
          {/each}
          {#if activeMap?.parent}
            <button class="we-chip we-regen" on:click={regenerateActive}>↻ Regenerate</button>
          {/if}
        </div>
        <div class="we-canvas">
          <svg bind:this={svgEl} preserveAspectRatio="xMidYMid meet"></svg>
        </div>
      </div>

      <!-- Inspector -->
      <aside class="we-inspector">
        <section class="we-sec">
          <h3>Selected Hex</h3>
          {#if selected && selectedTile}
            <p class="we-coord">{activeMap.level} · {selected.q}, {selected.r}</p>

            <label class="we-field">
              <span>Terrain</span>
              <select bind:value={selectedTile.terrain} on:change={commitTileEdit}>
                {#each TERRAIN_OPTIONS as t}<option value={t}>{t}</option>{/each}
              </select>
            </label>

            <label class="we-field">
              <span>Elevation (0–10)</span>
              <input type="number" min="0" max="10" bind:value={selectedTile.elevation} on:change={commitTileEdit} />
            </label>

            <label class="we-field">
              <span>Label</span>
              <input type="text" bind:value={selectedTile.label} on:change={commitTileEdit} placeholder="e.g. Ironhold" />
            </label>

            <label class="we-field">
              <span>Lore key</span>
              <input type="text" bind:value={selectedTile.lore_key} on:change={commitTileEdit} placeholder="location:ironhold" />
            </label>

            <div class="we-field">
              <span>Paint overlay</span>
              <div class="we-paint-row">
                <select bind:value={overlayToPaint}>
                  {#each OVERLAY_TYPES as t}<option value={t}>{t}</option>{/each}
                </select>
                <button class="btn btn-sm" on:click={addOverlay}>+</button>
                <button class="btn btn-sm" on:click={removeOverlay}>−</button>
              </div>
              {#if selectedTile.overlays.length}
                <div class="we-overlay-tags">
                  {#each selectedTile.overlays as o}<span class="we-tag">{o.type}</span>{/each}
                </div>
              {/if}
            </div>
          {:else}
            <p class="we-empty">Click a hex to edit its terrain, lore, and overlays.</p>
          {/if}
        </section>

        <section class="we-sec">
          <h3>Child Regions</h3>
          {#if activeMap?.children?.length}
            <div class="we-region-list">
              {#each activeMap.children as cid}
                <button class="we-region" on:click={() => switchLayer(cid)}>
                  → {maps[cid]?.name ?? cid} <small>{maps[cid]?.level}</small>
                </button>
              {/each}
            </div>
          {:else}
            <p class="we-empty">No child regions yet.</p>
          {/if}
        </section>

        <section class="we-sec">
          <h3>New Region</h3>
          <form
            class="we-form"
            on:submit|preventDefault={(e) => {
              const f = e.currentTarget as HTMLFormElement;
              const name = (f.elements.namedItem('rname') as HTMLInputElement).value.trim();
              const level = (f.elements.namedItem('rlevel') as HTMLSelectElement).value;
              const w = parseInt((f.elements.namedItem('rw') as HTMLInputElement).value);
              const h = parseInt((f.elements.namedItem('rh') as HTMLInputElement).value);
              if (name) { createChildRegion(name, level, w, h); f.reset(); }
            }}
          >
            <input name="rname" type="text" placeholder="Region name" required />
            <select name="rlevel">
              <option value="country">Country</option>
              <option value="region">Region</option>
              <option value="area">Area</option>
              <option value="district">District</option>
            </select>
            <div class="we-dims">
              <input name="rw" type="number" value="50" min="5" max="200" aria-label="Width" />
              <span>×</span>
              <input name="rh" type="number" value="50" min="5" max="200" aria-label="Height" />
            </div>
            <button class="btn btn-primary btn-sm" type="submit">Create Region</button>
          </form>
        </section>
      </aside>
    </div>
  {/if}
</div>

<style>
  .world-editor { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .we-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; padding: 0.6rem 1rem;
    background: var(--surface); border-bottom: 1px solid var(--border);
    flex-shrink: 0; flex-wrap: wrap;
  }
  .we-breadcrumb { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
  .we-crumb {
    background: none; border: 1px solid transparent; color: var(--fg-muted);
    font-size: 0.85rem; padding: 0.2rem 0.5rem; border-radius: 6px; cursor: pointer;
  }
  .we-crumb:hover { color: var(--fg); }
  .we-crumb.active { color: var(--accent); border-color: rgba(201,168,76,0.4); background: rgba(201,168,76,0.12); }
  .we-sep { color: var(--fg-muted); opacity: 0.6; }

  .we-loading, .we-empty { color: var(--fg-muted); font-size: 0.85rem; padding: 0.5rem 0; }

  .we-body { flex: 1; display: grid; grid-template-columns: 1fr 320px; overflow: hidden; }

  .we-canvas-wrap { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); }
  .we-toolbar {
    display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); background: var(--surface);
  }
  .we-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-muted); margin-right: 0.25rem; }
  .we-chip {
    font-size: 0.72rem; padding: 0.25rem 0.55rem; border-radius: 999px;
    border: 1px solid var(--border); background: var(--surface2); color: var(--fg-muted); cursor: pointer;
  }
  .we-chip:hover { color: var(--fg); }
  .we-chip.active { background: rgba(201,168,76,0.18); color: var(--accent); border-color: rgba(201,168,76,0.4); }
  .we-regen { margin-left: auto; }

  .we-canvas { flex: 1; overflow: auto; background: var(--bg); }
  .we-canvas svg { width: 100%; height: 100%; display: block; }

  .we-inspector { overflow-y: auto; background: var(--surface); display: flex; flex-direction: column; }
  .we-sec { padding: 1rem; border-bottom: 1px solid var(--border); }
  .we-sec h3 {
    margin: 0 0 0.6rem; font-size: 0.72rem; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--fg-muted); font-weight: 600;
  }
  .we-coord { font-size: 0.78rem; color: var(--accent); margin: 0 0 0.6rem; }

  .we-field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.65rem; }
  .we-field > span { font-size: 0.7rem; color: var(--fg-muted); }
  .we-field input, .we-field select {
    padding: 0.4rem 0.5rem; background: var(--surface2); border: 1px solid var(--border);
    color: var(--fg); border-radius: 4px; font-size: 0.82rem; font-family: inherit;
  }
  .we-paint-row { display: flex; gap: 0.35rem; }
  .we-paint-row select { flex: 1; }
  .we-overlay-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.4rem; }
  .we-tag {
    font-size: 0.68rem; padding: 0.15rem 0.45rem; border-radius: 999px;
    background: var(--surface2); border: 1px solid var(--border); color: var(--fg-muted);
  }

  .we-region-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .we-region {
    text-align: left; padding: 0.45rem 0.55rem; background: var(--surface2);
    border: 1px solid var(--border); border-radius: 5px; color: var(--fg);
    font-size: 0.82rem; cursor: pointer;
  }
  .we-region:hover { background: rgba(201,168,76,0.12); color: var(--accent); }
  .we-region small { color: var(--fg-muted); margin-left: 0.3rem; }

  .we-form { display: flex; flex-direction: column; gap: 0.5rem; }
  .we-form input, .we-form select {
    padding: 0.4rem 0.5rem; background: var(--surface2); border: 1px solid var(--border);
    color: var(--fg); border-radius: 4px; font-size: 0.82rem; font-family: inherit;
  }
  .we-dims { display: flex; align-items: center; gap: 0.4rem; }
  .we-dims input { flex: 1; }
  .we-dims span { color: var(--fg-muted); }

  .btn {
    padding: 0.4rem 0.75rem; border: 1px solid var(--border); border-radius: 5px;
    background: var(--surface2); color: var(--fg); cursor: pointer; font-size: 0.82rem; font-family: inherit;
  }
  .btn:hover { background: var(--bg); }
  .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.78rem; }
  .btn-primary { background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 600; }
  .btn-primary:hover { opacity: 0.9; background: var(--accent); }

  @media (max-width: 768px) {
    .we-body { grid-template-columns: 1fr; }
    .we-inspector { border-top: 1px solid var(--border); }
  }
</style>
