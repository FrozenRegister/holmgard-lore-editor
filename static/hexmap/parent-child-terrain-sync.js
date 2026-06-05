// ============================================================================
// PARENT-CHILD TERRAIN SYNC FOR WORKINGMAP.JSON
// Automatically aggregates detail hex terrain changes back to parent hexes.
//
// When a detail hex (child of a parent via landmark anchor region) is painted,
// this patch detects the change, finds the parent landmark, aggregates the
// majority terrain of all detail hexes in that region, and updates the parent
// hex to match.
// ============================================================================

(function () {
  'use strict'

  const TAG = '[TerrainSync]'
  const DEBOUNCE_MS = 300

  let debounceTimer = null
  let lastHexesSnapshot = null

  // Wait for the terrain aggregation module to be available
  function whenAggregationReady(fn) {
    let tries = 0
    const timer = setInterval(() => {
      if (typeof window.TerrainAggregation === 'object') {
        clearInterval(timer)
        fn()
      } else if (++tries > 300) {
        clearInterval(timer)
        console.warn(`${TAG} Timed out waiting for TerrainAggregation module`)
      }
    }, 50)
  }

  /**
   * Check if this is the workingMap.json (not an Earth region).
   * Earth regions have mapInstanceId starting with "earth-996".
   */
  function isWorkingMap() {
    const hm = window.state && window.state.hexMap
    if (!hm) return false
    const id = String(hm.mapInstanceId || '')
    return id.indexOf('earth-996') !== 0 && id.indexOf('earth-') !== 0
  }

  /**
   * Snapshot the current hex terrain state for change detection.
   */
  function snapshotHexes() {
    const hm = window.state && window.state.hexMap
    if (!hm || !hm.hexes) return null

    const snap = {}
    const hexes = Array.isArray(hm.hexes) ? hm.hexes : Object.values(hm.hexes)
    for (const hex of hexes) {
      const key = `${hex.q},${hex.r}`
      snap[key] = hex.terrain
    }
    return snap
  }

  /**
   * Detect which hexes have changed terrain since last snapshot.
   */
  function detectChangedHexes(newSnapshot) {
    if (!lastHexesSnapshot || !newSnapshot) return []

    const changed = []
    for (const key in newSnapshot) {
      if (newSnapshot[key] !== lastHexesSnapshot[key]) {
        const [q, r] = key.split(',').map(Number)
        changed.push({ q, r, terrain: newSnapshot[key] })
      }
    }
    return changed
  }

  /**
   * Update parent hex terrain in the game.js state.
   * Both in the hexes array and in the hexes object (game.js uses both).
   */
  function updateParentHex(parentQ, parentR, newTerrain) {
    const hm = window.state && window.state.hexMap
    if (!hm || !hm.hexes) return

    const hexKey = `${parentQ},${parentR}`

    // Update in array (if hexes is an array)
    if (Array.isArray(hm.hexes)) {
      for (const hex of hm.hexes) {
        if (hex.q === parentQ && hex.r === parentR) {
          hex.terrain = newTerrain
          break
        }
      }
    }

    // Update in object (if hexes is a Record<string, Hex>)
    if (hm.hexes && typeof hm.hexes === 'object' && hexKey in hm.hexes) {
      hm.hexes[hexKey].terrain = newTerrain
    }
  }

  /**
   * Perform aggregation: compute majority terrain for each parent's detail region
   * and update parent hexes.
   */
  function performAggregation() {
    if (!window.TerrainAggregation) return

    const hm = window.state && window.state.hexMap
    if (!hm || !isWorkingMap()) return

    // aggregateAllDetailToParent returns { "q,r": Hex, ... } of updated parents
    const updates = window.TerrainAggregation.aggregateAllDetailToParent(hm)

    for (const key in updates) {
      const hex = updates[key]
      updateParentHex(hex.q, hex.r, hex.terrain)
    }

    // If any updates were made, re-render
    if (Object.keys(updates).length > 0) {
      if (typeof window.renderHex === 'function') {
        window.renderHex()
      }
      console.log(`${TAG} Aggregated ${Object.keys(updates).length} parent hex(es)`)
    }
  }

  /**
   * Debounced aggregation trigger. Call this whenever hexes might have changed.
   */
  function scheduleAggregation() {
    if (debounceTimer !== null) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      performAggregation()
      lastHexesSnapshot = snapshotHexes()
    }, DEBOUNCE_MS)
  }

  /**
   * Start monitoring for hex changes.
   * Periodically snapshot hex terrain and trigger aggregation if any changed.
   */
  function startChangeMonitor() {
    // Initialize the snapshot
    lastHexesSnapshot = snapshotHexes()

    setInterval(() => {
      if (!isWorkingMap()) return

      const newSnapshot = snapshotHexes()
      const changed = detectChangedHexes(newSnapshot)

      if (changed.length > 0) {
        scheduleAggregation()
      }
    }, 100)
  }

  /**
   * Wait for game.js + aggregation module, then start monitoring.
   */
  function init() {
    let tries = 0
    const timer = setInterval(() => {
      if (
        typeof window.state === 'object' &&
        window.state.hexMap &&
        typeof window.renderHex === 'function'
      ) {
        clearInterval(timer)

        whenAggregationReady(() => {
          startChangeMonitor()
          console.log(`${TAG} Initialized for workingMap.json terrain aggregation`)
        })
      } else if (++tries > 300) {
        clearInterval(timer)
        console.warn(`${TAG} Timed out waiting for game.js`)
      }
    }, 50)
  }

  init()
})()
