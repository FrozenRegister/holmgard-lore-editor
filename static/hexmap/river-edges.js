// ============================================================================
// RIVER EDGES
// Edge-based river painting on the hex map. Rivers are stored as a set of
// flagged hex edges (borders between adjacent hexes) rather than paths through
// hex centers. Works at both parent and detail grid levels.
//
// State stored on state.hexMap:
//   riverEdges: { [edgeKey]: { riverId } }   — plain object, serializes with map JSON
//   rivers:     { [id]:      { id, name, color, width } }
//
// Edge key format: "q,r,dir,gridLevel"
//   dir is canonical (0=NE, 1=E, 2=SE); dirs 3/4/5 normalize to neighbor's opposite.
// ============================================================================

;(function () {
  'use strict'

  const TAG = '[RiverEdges]'
  const DEFAULT_COLOR = '#2b6998'
  const DEFAULT_WIDTH = 3
  const RIVER_COLORS = ['#2b6998', '#1a7a4a', '#5b2d8e', '#8b3a00', '#006080']

  // ── Direction constants ─────────────────────────────────────────────────────
  // Neighbor vectors for dirs 0-5: NE, E, SE, SW, W, NW
  const DIR_VECTORS = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]
  // Each edge dir → [cornerA, cornerB] indices (same for pointy and flat top)
  const EDGE_CORNERS = [[5, 0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]

  // ── State helpers ───────────────────────────────────────────────────────────

  function hm() { return window.state && window.state.hexMap }

  function ensureState() {
    const m = hm()
    if (!m) return false
    if (!m.riverEdges) m.riverEdges = {}
    if (!m.rivers) m.rivers = {}
    return true
  }

  // ── Edge key canonicalization ───────────────────────────────────────────────
  // Dirs 3/4/5 (SW/W/NW) normalize to the neighbor hex with the opposite dir.

  function canonicalize(q, r, dir, gridLevel) {
    if (dir <= 2) return { q, r, dir, gridLevel }
    const [dq, dr] = DIR_VECTORS[dir]
    return { q: q + dq, r: r + dr, dir: dir - 3, gridLevel }
  }

  function edgeKey(q, r, dir, gridLevel) {
    const c = canonicalize(q, r, dir, gridLevel)
    return `${c.q},${c.r},${c.dir},${c.gridLevel}`
  }

  function parseEdgeKey(key) {
    const parts = key.split(',')
    return { q: +parts[0], r: +parts[1], dir: +parts[2], gridLevel: parts[3] }
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  function angleOffset() {
    const m = hm()
    return (m && m.orientation || 'pointy') === 'pointy' ? -Math.PI / 6 : 0
  }

  function hexCorner(cx, cy, radius, i) {
    const a = Math.PI / 3 * i + angleOffset()
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }
  }

  // Screen-space circumradius for the given grid level.
  // hexSize * vp.scale = CSS-pixel circumradius (confirmed by hexmap-render-patch formula).
  function getEdgeFactor() {
    const m = hm()
    const density = (m && m.detailGridDensity) || 19
    return { 7: 2, 19: 3, 37: 4 }[density] || 3
  }

  function screenRadius(gridLevel) {
    const m = hm()
    if (!m || !m.viewport) return 50
    const parentR = m.hexSize * m.viewport.scale
    if (gridLevel === 'parent') return parentR
    return parentR / getEdgeFactor()
  }

  // Auto-detect the right grid level based on current zoom.
  // Detail hexes are usable once their screen radius exceeds ~18 px.
  function autoGridLevel() {
    try { return screenRadius('detail') >= 18 ? 'detail' : 'parent' }
    catch (e) { return 'parent' }
  }

  // Canvas-center helper (CSS pixels).
  function canvasCenter() {
    const canvas = document.getElementById('hexCanvas')
    return {
      cw: canvas ? canvas.clientWidth / 2 : 400,
      ch: canvas ? canvas.clientHeight / 2 : 300,
    }
  }

  // Screen-space center of hex (q, r) at the given grid level.
  // Formula: screen_x = √3·R·(q+r/2) + canvas_center_x + vp.offsetX (pointy-top)
  // Works for both parent and detail since R scales accordingly.
  function hexCenter(q, r, gridLevel) {
    const m = hm()
    if (!m) return { x: 0, y: 0 }
    const vp = m.viewport
    const R = screenRadius(gridLevel)
    const { cw, ch } = canvasCenter()
    const orientation = m.orientation || 'pointy'
    if (orientation === 'pointy') {
      return {
        x: Math.sqrt(3) * R * (q + r / 2) + cw + vp.offsetX,
        y: 1.5 * R * r + ch + vp.offsetY,
      }
    } else {
      return {
        x: 1.5 * R * q + cw + vp.offsetX,
        y: Math.sqrt(3) * R * (r + q / 2) + ch + vp.offsetY,
      }
    }
  }

  // [pt0, pt1] screen-space endpoints of the given edge.
  function edgeEndpoints(q, r, dir, gridLevel) {
    const c = canonicalize(q, r, dir, gridLevel)
    const center = hexCenter(c.q, c.r, c.gridLevel)
    const R = screenRadius(c.gridLevel)
    const [ci, cj] = EDGE_CORNERS[c.dir]
    return [hexCorner(center.x, center.y, R, ci), hexCorner(center.x, center.y, R, cj)]
  }

  // Nearest canonical edge to a screen-space (sx, sy) position.
  function nearestEdge(sx, sy, gridLevel) {
    const m = hm()
    if (!m) return null
    const isPointy = (m.orientation || 'pointy') === 'pointy'
    const vp = m.viewport
    const R = screenRadius(gridLevel)
    const { cw, ch } = canvasCenter()

    // Convert screen position to fractional hex coords using same formula as hexCenter inverse.
    const adjX = sx - cw - vp.offsetX
    const adjY = sy - ch - vp.offsetY
    let fq, fr
    if (isPointy) {
      fq = (Math.sqrt(3) / 3 * adjX - 1 / 3 * adjY) / R
      fr = (2 / 3 * adjY) / R
    } else {
      fq = (2 / 3 * adjX) / R
      fr = (-1 / 3 * adjX + Math.sqrt(3) / 3 * adjY) / R
    }
    const rounded = hexRound(fq, fr)
    let q = rounded.q, r = rounded.r

    const center = hexCenter(q, r, gridLevel)
    const dx = sx - center.x
    const dy = sy - center.y
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI
    // Pointy: edge midpoints at -60,0,60,120,180,240° → offset +90 then /60
    // Flat:   edge midpoints at -30,30,90,150,210,270° → offset +60 then /60
    const offset = isPointy ? 90 : 60
    const dir = (Math.floor((angleDeg + offset) / 60) % 6 + 6) % 6
    return canonicalize(q, r, dir, gridLevel)
  }

  function hexRound(fq, fr) {
    const fs = -fq - fr
    let q = Math.round(fq), r = Math.round(fr), s = Math.round(fs)
    const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs)
    if (dq > dr && dq > ds) q = -r - s
    else if (dr > ds) r = -q - s
    return { q, r }
  }

  // ── Water detection ─────────────────────────────────────────────────────────

  const WATER_TERRAINS = new Set([
    'ocean', 'deep_ocean', 'sea', 'lake', 'water', 'deep_water', 'shallow_water',
    'coast', 'marsh', 'wetland', 'swamp',
  ])

  function getHexTerrain(q, r) {
    const m = hm()
    if (!m || !m.hexes) return null
    const key = q + ',' + r
    if (m.hexes instanceof Map) return (m.hexes.get(key) || {}).terrain || null
    if (Array.isArray(m.hexes)) {
      for (const hex of m.hexes) { if (hex.q === q && hex.r === r) return hex.terrain }
    }
    return null
  }

  function isWater(q, r) {
    const t = getHexTerrain(q, r)
    return !!t && WATER_TERRAINS.has(t)
  }

  // Both parent hexes on either side of a canonical edge.
  function edgeNeighbors(q, r, dir) {
    const c = canonicalize(q, r, dir, 'parent')
    const [dq, dr] = DIR_VECTORS[c.dir]
    return [{ q: c.q, r: c.r }, { q: c.q + dq, r: c.r + dr }]
  }

  // ── Meander ─────────────────────────────────────────────────────────────────

  // ── Detail → Parent projection ───────────────────────────────────────────────
  // Returns the canonical parent-level edge that a detail edge lies on,
  // or null if the detail edge is interior to one parent hex.
  // Formula: pq = floor(dq / ef), pr = floor(dr / ef) (confirmed by terrain-aggregation.ts)
  function detailEdgeToParent(dq, dr, dir) {
    const ef = getEdgeFactor()
    const pq = Math.floor(dq / ef)
    const pr = Math.floor(dr / ef)
    const [ddq, ddr] = DIR_VECTORS[dir]
    const npq = Math.floor((dq + ddq) / ef)
    const npr = Math.floor((dr + ddr) / ef)
    if (pq === npq && pr === npr) return null
    const dpq = npq - pq, dpr = npr - pr
    for (let d = 0; d < 6; d++) {
      if (DIR_VECTORS[d][0] === dpq && DIR_VECTORS[d][1] === dpr) {
        return canonicalize(pq, pr, d, 'parent')
      }
    }
    return null
  }

  function drawStraightEdge(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y)
    ctx.lineTo(pts[1].x, pts[1].y)
  }

  // ── Tool state ──────────────────────────────────────────────────────────────

  let toolActive = false
  let toolGridLevel = 'parent'    // manual lock (used when toolGridLevelAuto = false)
  let toolGridLevelAuto = true    // when true, derive level from zoom
  let activeRiverId = null
  let paintMode = 'paint'         // 'paint' | 'erase'
  let dragging = false
  let dragGridLevel = 'parent'    // grid level locked at drag-start
  let lastKey = null              // prevents re-painting the same edge mid-drag
  let hoverEdge = null

  function activeGridLevel() {
    return toolGridLevelAuto ? autoGridLevel() : toolGridLevel
  }

  // ── River CRUD ──────────────────────────────────────────────────────────────

  function nextId() {
    const rivers = (hm() && hm().rivers) || {}
    const nums = Object.keys(rivers).map(k => parseInt(k.replace('r', ''), 10)).filter(n => !isNaN(n))
    return 'r' + ((nums.length ? Math.max(...nums) : 0) + 1)
  }

  function createRiver(name) {
    if (!ensureState()) return null
    const id = nextId()
    const m = hm()
    const colorIdx = Object.keys(m.rivers).length % RIVER_COLORS.length
    m.rivers[id] = {
      id,
      name: name || 'River ' + id.replace('r', ''),
      color: RIVER_COLORS[colorIdx],
      width: DEFAULT_WIDTH,
    }
    activeRiverId = id
    refreshUI()
    return id
  }

  function deleteRiver(id) {
    const m = hm()
    if (!m) return
    for (const key of Object.keys(m.riverEdges || {})) {
      if (m.riverEdges[key].riverId === id) delete m.riverEdges[key]
    }
    delete (m.rivers || {})[id]
    if (activeRiverId === id) {
      const remaining = Object.keys(m.rivers || {})
      activeRiverId = remaining.length ? remaining[0] : null
    }
    refreshUI()
    window.renderHex && window.renderHex()
  }

  function updateRiver(id, changes) {
    const m = hm()
    if (!m || !m.rivers || !m.rivers[id]) return
    Object.assign(m.rivers[id], changes)
    refreshUI()
    window.renderHex && window.renderHex()
  }

  // ── Paint / erase ───────────────────────────────────────────────────────────

  function paintEdge(edge) {
    if (!ensureState() || !activeRiverId) return
    const key = edgeKey(edge.q, edge.r, edge.dir, edge.gridLevel)
    if (key === lastKey) return
    lastKey = key
    hm().riverEdges[key] = { riverId: activeRiverId }
    window.renderHex && window.renderHex()
  }

  function eraseEdge(edge) {
    if (!ensureState()) return
    const key = edgeKey(edge.q, edge.r, edge.dir, edge.gridLevel)
    if (key === lastKey) return
    lastKey = key
    delete hm().riverEdges[key]
    window.renderHex && window.renderHex()
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  function renderRivers(ctx, scale) {
    const m = hm()
    if (!m || !m.riverEdges) return

    const edges = m.riverEdges
    const rivers = m.rivers || {}
    const currentLevel = autoGridLevel()

    // Pass 1: collect edges at the current zoom level (explicit storage).
    const effectiveEdges = {}
    for (const [key, data] of Object.entries(edges)) {
      if (parseEdgeKey(key).gridLevel === currentLevel) effectiveEdges[key] = data
    }

    // Pass 2 (parent view only): project detail edges onto their parent borders so
    // rivers painted while zoomed in remain visible when zoomed out.
    if (currentLevel === 'parent') {
      for (const [key, data] of Object.entries(edges)) {
        const { q, r, dir, gridLevel } = parseEdgeKey(key)
        if (gridLevel !== 'detail') continue
        const pe = detailEdgeToParent(q, r, dir)
        if (!pe) continue
        const pKey = `${pe.q},${pe.r},${pe.dir},parent`
        if (!effectiveEdges[pKey]) effectiveEdges[pKey] = data
      }
    }

    const groups = {}
    for (const [key, data] of Object.entries(effectiveEdges)) {
      const rid = data.riverId
      if (!groups[rid]) groups[rid] = []
      groups[rid].push(key)
    }

    for (const [rid, keys] of Object.entries(groups)) {
      const river = rivers[rid] || { color: DEFAULT_COLOR, width: DEFAULT_WIDTH }
      const color = river.color || DEFAULT_COLOR
      ctx.save()
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = Math.max(1.5, (river.width || DEFAULT_WIDTH) * scale)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.setLineDash([])
      for (const key of keys) {
        const { q, r, dir } = parseEdgeKey(key)
        // All keys in effectiveEdges are already at currentLevel, so use that for geometry.
        const pts = edgeEndpoints(q, r, dir, currentLevel)
        ctx.beginPath()
        drawStraightEdge(ctx, pts)
        ctx.stroke()
      }
      ctx.restore()
    }

    // Hover preview (dashed, semi-transparent)
    if (toolActive && hoverEdge) {
      const m2 = hm()
      const river = m2 && activeRiverId && m2.rivers && m2.rivers[activeRiverId]
      const pts = edgeEndpoints(hoverEdge.q, hoverEdge.r, hoverEdge.dir, hoverEdge.gridLevel)
      ctx.save()
      ctx.strokeStyle = paintMode === 'erase' ? '#ff4444' : (river ? river.color : DEFAULT_COLOR)
      ctx.lineWidth = Math.max(2, ((river && river.width) || DEFAULT_WIDTH) * scale)
      ctx.lineCap = 'round'
      ctx.setLineDash([5, 5])
      ctx.globalAlpha = 0.75
      ctx.beginPath()
      drawStraightEdge(ctx, pts)
      ctx.stroke()
      ctx.restore()
    }
  }

  // ── Canvas event overlay ────────────────────────────────────────────────────
  // An invisible div covers the canvas when the river tool is active,
  // capturing mouse events before game.js sees them.

  let overlay = null

  function createOverlay() {
    const canvas = document.getElementById('hexCanvas')
    if (!canvas || overlay) return

    overlay = document.createElement('div')
    overlay.id = 'riverToolOverlay'
    overlay.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:99',
      'display:none', 'cursor:crosshair', 'user-select:none',
    ].join(';')

    // Ensure the canvas's parent is a positioning context
    const parent = canvas.parentElement
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative'
    }
    if (parent) parent.appendChild(overlay)

    function canvasPos(e) {
      const canvas2 = document.getElementById('hexCanvas')
      if (!canvas2) return null
      const rect = canvas2.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    overlay.addEventListener('mousedown', function (e) {
      dragGridLevel = activeGridLevel()  // lock grid level for entire drag
      dragging = true
      lastKey = null
      paintMode = e.button === 2 ? 'erase' : 'paint'
      const pos = canvasPos(e)
      if (!pos) return
      const edge = nearestEdge(pos.x, pos.y, dragGridLevel)
      if (edge) paintMode === 'erase' ? eraseEdge(edge) : paintEdge(edge)
    })

    overlay.addEventListener('mousemove', function (e) {
      const pos = canvasPos(e)
      if (!pos) return
      const gl = dragging ? dragGridLevel : activeGridLevel()
      const edge = nearestEdge(pos.x, pos.y, gl)
      hoverEdge = edge
      if (dragging && edge) {
        paintMode === 'erase' ? eraseEdge(edge) : paintEdge(edge)
      } else {
        window.renderHex && window.renderHex()
      }
    })

    overlay.addEventListener('mouseup', function () {
      dragging = false
      lastKey = null
    })

    overlay.addEventListener('mouseleave', function () {
      hoverEdge = null
      dragging = false
      window.renderHex && window.renderHex()
    })

    overlay.addEventListener('contextmenu', function (e) {
      e.preventDefault()
    })

    // Forward wheel events to the canvas so zoom still works in river mode
    overlay.addEventListener('wheel', function (e) {
      e.preventDefault()
      const canvas2 = document.getElementById('hexCanvas')
      if (!canvas2) return
      canvas2.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true,
        deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: e.clientX, clientY: e.clientY,
        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
        altKey: e.altKey, metaKey: e.metaKey,
      }))
    }, { passive: false })
  }

  // ── Tool activation / deactivation ─────────────────────────────────────────

  let _origSetHexMode = null

  function hookSetHexMode() {
    if (!window.setHexMode || window.__riverEdgesHexModeHooked) return
    window.__riverEdgesHexModeHooked = true
    _origSetHexMode = window.setHexMode
    window.setHexMode = function (mode) {
      if (toolActive) deactivateTool()
      return _origSetHexMode.apply(this, arguments)
    }
  }

  function activateTool() {
    // Put game.js into a neutral mode first (using original to avoid our hook)
    if (_origSetHexMode) _origSetHexMode.call(window, 'select')

    toolActive = true
    if (overlay) overlay.style.display = ''

    // Hide game.js tool sections that might be visible
    ;['brushSettingsSection', 'terrainPaletteSection', 'pathCreatorSection',
      'tokenCreatorSection', 'landmarkCreatorSection', 'textCreatorSection',
      'imageCreatorSection', 'fogCreatorSection', 'mapTypeNoticeSection',
    ].forEach(function (id) {
      const el = document.getElementById(id)
      if (el) el.style.display = 'none'
    })

    const panel = document.getElementById('riverCreatorSection')
    if (panel) panel.style.display = ''

    document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.remove('active') })
    const btn = document.getElementById('riverModeBtn')
    if (btn) btn.classList.add('active')

    // Ensure at least one river exists
    if (!hm() || Object.keys(hm().rivers || {}).length === 0) createRiver('River 1')
    if (!activeRiverId) {
      const ids = Object.keys((hm() && hm().rivers) || {})
      if (ids.length) activeRiverId = ids[0]
    }

    refreshUI()
  }

  function deactivateTool() {
    toolActive = false
    hoverEdge = null
    if (overlay) overlay.style.display = 'none'
    const panel = document.getElementById('riverCreatorSection')
    if (panel) panel.style.display = 'none'
    const btn = document.getElementById('riverModeBtn')
    if (btn) btn.classList.remove('active')
    window.renderHex && window.renderHex()
  }

  // ── UI injection ────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('riverEdgesStyle')) return
    const style = document.createElement('style')
    style.id = 'riverEdgesStyle'
    style.textContent = `
      .river-list-item {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; border-radius: 4px; cursor: pointer;
        background: var(--bg-secondary, #2a2a2a);
        border: 1px solid transparent; margin-bottom: 3px;
      }
      .river-list-item.river-active { border-color: var(--accent, #4682B4); }
      .river-list-item:hover { background: var(--bg-hover, #333); }
      .river-swatch {
        width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;
        border: 1px solid rgba(255,255,255,.2);
      }
      .river-item-name { flex: 1; font-size: 13px; }
      .river-delete-btn {
        background: none; border: none;
        color: var(--text-muted, #888); cursor: pointer;
        font-size: 12px; padding: 0 2px; line-height: 1;
      }
      .river-delete-btn:hover { color: #ff4444; }
      #riverModeBtn.river-tool-active {
        background: var(--accent, #4682B4) !important;
        color: #fff !important;
      }
      .river-grid-btn { flex: 1; }
      .river-grid-btn.river-grid-active {
        background: var(--accent, #4682B4) !important;
        color: #fff !important;
      }
    `
    document.head.appendChild(style)
  }

  function injectPanel() {
    if (document.getElementById('riverCreatorSection')) return

    const panel = document.createElement('div')
    panel.id = 'riverCreatorSection'
    panel.className = 'tool-section'
    panel.style.display = 'none'
    panel.innerHTML = `
      <h3>Rivers</h3>
      <div class="tool-config-stack">

        <div class="tool-config-card">
          <div class="tool-config-card-title">Grid Level</div>
          <div style="display:flex;gap:6px;margin-top:4px;">
            <button class="btn btn-sm river-grid-btn" id="riverGridAuto"
              onclick="window.riverEdges.setGridLevel('auto')">Auto</button>
            <button class="btn btn-sm river-grid-btn" id="riverGridParent"
              onclick="window.riverEdges.setGridLevel('parent')">Parent</button>
            <button class="btn btn-sm river-grid-btn" id="riverGridDetail"
              onclick="window.riverEdges.setGridLevel('detail')">Detail</button>
          </div>
        </div>

        <div class="tool-config-card">
          <div class="tool-config-card-title">Named Rivers</div>
          <div id="riverList" style="margin-bottom:8px;"></div>
          <button class="btn btn-primary btn-sm" style="width:100%;"
            onclick="window.riverEdges.newRiver()">+ New River</button>
        </div>

        <div class="tool-config-card" id="riverEditSection" style="display:none;">
          <div class="tool-config-card-title">Selected River</div>
          <div class="form-group" style="margin-top:8px;">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="riverNameInput"
              placeholder="River name…"
              oninput="window.riverEdges.onNameInput(this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">Color</label>
            <input type="color" id="riverColorInput" style="width:100%;height:32px;border-radius:4px;border:none;cursor:pointer;background:none;"
              oninput="window.riverEdges.onColorInput(this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">Width</label>
            <input type="range" class="form-input" id="riverWidthInput"
              min="1" max="10" step="0.5"
              oninput="window.riverEdges.onWidthInput(this.value)">
          </div>
        </div>

        <div class="tool-config-card">
          <div class="tool-config-card-note" style="font-size:11px;color:var(--text-muted,#888);line-height:1.5;">
            <strong>Left-drag</strong> — paint edges<br>
            <strong>Right-drag</strong> — erase edges
          </div>
        </div>

      </div>
    `

    const pathSection = document.getElementById('pathCreatorSection')
    if (pathSection && pathSection.parentNode) {
      pathSection.parentNode.insertBefore(panel, pathSection.nextSibling)
    } else {
      const left = document.querySelector('#toolsSection')?.parentNode
      if (left) left.appendChild(panel)
    }
  }

  function injectToolButton() {
    if (document.getElementById('riverModeBtn')) return
    const modeSelector = document.querySelector('.mode-selector')
    if (!modeSelector) return

    const btn = document.createElement('button')
    btn.id = 'riverModeBtn'
    btn.className = 'mode-btn'
    btn.setAttribute('data-mode', 'river')
    btn.innerHTML = `
      <div class="mode-icon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 20c2-2 4-3 6-3 3 0 5 2 8 2 1.5 0 3-.5 4-1.5V5c-1 1-2.5 1.5-4 1.5-3 0-5-2-8-2-2 0-4 1-6 3v12z"/>
        </svg>
      </div>
      Rivers
    `
    btn.addEventListener('click', function () {
      if (toolActive) {
        deactivateTool()
        if (_origSetHexMode) _origSetHexMode.call(window, 'paint')
      } else {
        activateTool()
      }
    })

    // Insert after the path button
    const pathBtn = modeSelector.querySelector('[data-mode="path"]')
    if (pathBtn && pathBtn.nextSibling) {
      modeSelector.insertBefore(btn, pathBtn.nextSibling)
    } else {
      modeSelector.appendChild(btn)
    }
  }

  function refreshUI() {
    const m = hm()
    const rivers = (m && m.rivers) || {}

    // River list
    const list = document.getElementById('riverList')
    if (list) {
      list.innerHTML = ''
      for (const [id, river] of Object.entries(rivers)) {
        const item = document.createElement('div')
        item.className = 'river-list-item' + (id === activeRiverId ? ' river-active' : '')
        item.innerHTML = `
          <span class="river-swatch" style="background:${river.color}"></span>
          <span class="river-item-name">${river.name}</span>
          <button class="river-delete-btn" data-rid="${id}" title="Delete river">✕</button>
        `
        item.addEventListener('click', function (e) {
          const deleteBtn = e.target.closest('.river-delete-btn')
          if (deleteBtn) {
            const rid = deleteBtn.dataset.rid
            const name = (m.rivers && m.rivers[rid] && m.rivers[rid].name) || rid
            if (confirm(`Delete "${name}"? All its edges will be removed.`)) deleteRiver(rid)
            return
          }
          activeRiverId = id
          refreshUI()
        })
        list.appendChild(item)
      }
    }

    // Edit fields
    const river = activeRiverId && rivers[activeRiverId]
    const editSection = document.getElementById('riverEditSection')
    if (editSection) editSection.style.display = river ? '' : 'none'
    if (river) {
      const nameInput = document.getElementById('riverNameInput')
      const colorInput = document.getElementById('riverColorInput')
      const widthInput = document.getElementById('riverWidthInput')
      if (nameInput && document.activeElement !== nameInput) nameInput.value = river.name
      if (colorInput) colorInput.value = river.color
      if (widthInput) widthInput.value = river.width
    }

    // Grid level buttons — Auto is active when toolGridLevelAuto, otherwise show locked level
    const currentLevel = activeGridLevel()
    const autoBtn = document.getElementById('riverGridAuto')
    const parentBtn = document.getElementById('riverGridParent')
    const detailBtn = document.getElementById('riverGridDetail')
    if (autoBtn) autoBtn.classList.toggle('river-grid-active', toolGridLevelAuto)
    if (parentBtn) parentBtn.classList.toggle('river-grid-active', !toolGridLevelAuto && toolGridLevel === 'parent')
    if (detailBtn) detailBtn.classList.toggle('river-grid-active', !toolGridLevelAuto && toolGridLevel === 'detail')
    // Show which level is currently active in auto mode via muted text on button
    if (autoBtn && toolGridLevelAuto) autoBtn.textContent = 'Auto (' + currentLevel + ')'
    if (autoBtn && !toolGridLevelAuto) autoBtn.textContent = 'Auto'

    // Tool button active state
    const modeBtn = document.getElementById('riverModeBtn')
    if (modeBtn) modeBtn.classList.toggle('river-tool-active', toolActive)
  }

  // ── Public API (called from inline onclick handlers) ─────────────────────────

  window.riverEdges = {
    newRiver: function () {
      const name = prompt('River name:', 'New River')
      if (name === null) return
      createRiver(name || 'New River')
    },
    setGridLevel: function (level) {
      if (level === 'auto') {
        toolGridLevelAuto = true
      } else {
        toolGridLevelAuto = false
        toolGridLevel = level
      }
      refreshUI()
    },
    onNameInput: function (val) { if (activeRiverId) updateRiver(activeRiverId, { name: val }) },
    onColorInput: function (val) { if (activeRiverId) updateRiver(activeRiverId, { color: val }) },
    onWidthInput: function (val) { if (activeRiverId) updateRiver(activeRiverId, { width: +val }) },
  }

  // ── Save / Load ─────────────────────────────────────────────────────────────
  // riverEdges and rivers are plain objects on state.hexMap, so they serialize
  // automatically with the map JSON. We only hook loadMapDataIntoState to
  // re-initialize the fields for old maps that pre-date this feature.

  function hookLoadMap() {
    if (!window.loadMapDataIntoState || window.__riverEdgesLoadHooked) return
    window.__riverEdgesLoadHooked = true
    const orig = window.loadMapDataIntoState
    window.loadMapDataIntoState = function () {
      const res = orig.apply(this, arguments)
      setTimeout(function () {
        ensureState()
        refreshUI()
      }, 150)
      return res
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    ensureState()
    window.postRenderHooks = window.postRenderHooks || []
    window.postRenderHooks.push(renderRivers)
    injectStyles()
    injectPanel()
    injectToolButton()
    createOverlay()
    hookSetHexMode()
    hookLoadMap()
    console.log(TAG + ' Initialized')
  }

  // Poll until game.js is ready
  let _tries = 0
  const _timer = setInterval(function () {
    if (window.state && window.state.hexMap && typeof window.hexToPixel === 'function') {
      clearInterval(_timer)
      init()
    } else if (++_tries > 200) {
      clearInterval(_timer)
      console.warn(TAG + ' Timed out waiting for game.js')
    }
  }, 50)

})()
