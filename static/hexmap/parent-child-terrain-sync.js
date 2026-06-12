// ============================================================================
// PARENT-CHILD TERRAIN SYNC
// Watches detailHexes for changes, aggregates majority terrain back to parent
// hexes so the stored terrain stays consistent with what's been painted.
//
// game.js stores hexes and detailHexes as Map<string, Hex> internally.
// The TerrainAggregation module (terrain-aggregation.ts) works with plain
// arrays, so we convert before calling it.
// ============================================================================

;(function () {
  'use strict'

  const TAG = '[TerrainSync]'
  const DEBOUNCE_MS = 300

  let debounceTimer = null
  let lastDetailSnapshot = null

  function whenAggregationReady(fn) {
    let tries = 0
    const timer = setInterval(() => {
      if (typeof window.TerrainAggregation === 'object') {
        clearInterval(timer)
        fn()
      } else if (++tries > 300) {
        clearInterval(timer)
        console.warn(TAG + ' Timed out waiting for TerrainAggregation module')
      }
    }, 50)
  }

  function isWorkingMap() {
    const hm = window.state && window.state.hexMap
    if (!hm) return false
    const id = String(hm.mapInstanceId || '')
    return id.indexOf('earth-996') !== 0 && id.indexOf('earth-') !== 0
  }

  // Snapshot detailHexes (a Map in game state) to detect changes.
  function snapshotDetailHexes() {
    const hm = window.state && window.state.hexMap
    if (!hm) return null

    const snap = {}
    if (hm.detailHexes instanceof Map) {
      hm.detailHexes.forEach(function (hex, key) {
        snap[key] = hex.terrain
      })
    } else if (Array.isArray(hm.detailHexes)) {
      for (const hex of hm.detailHexes) {
        snap[hex.q + ',' + hex.r] = hex.terrain
      }
    }
    return snap
  }

  function hasDetailChanged(newSnapshot) {
    if (!lastDetailSnapshot || !newSnapshot) return false
    const keys1 = Object.keys(lastDetailSnapshot)
    const keys2 = Object.keys(newSnapshot)
    if (keys1.length !== keys2.length) return true
    for (const key of keys2) {
      if (newSnapshot[key] !== lastDetailSnapshot[key]) return true
    }
    return false
  }

  // Update a parent hex terrain in game.js state (which uses Map<string, Hex>).
  function updateParentHex(parentQ, parentR, newTerrain) {
    const hm = window.state && window.state.hexMap
    if (!hm || !hm.hexes) return

    const hexKey = parentQ + ',' + parentR

    if (hm.hexes instanceof Map) {
      const hex = hm.hexes.get(hexKey)
      if (hex) hex.terrain = newTerrain
    } else if (Array.isArray(hm.hexes)) {
      for (const hex of hm.hexes) {
        if (hex.q === parentQ && hex.r === parentR) {
          hex.terrain = newTerrain
          break
        }
      }
    } else if (hm.hexes && typeof hm.hexes === 'object' && hexKey in hm.hexes) {
      hm.hexes[hexKey].terrain = newTerrain
    }
  }

  // Convert game.js Map-based state to the array format expected by TerrainAggregation.
  function buildHexMapData() {
    const hm = window.state && window.state.hexMap
    if (!hm) return null

    const hexesArray = []
    if (hm.hexes instanceof Map) {
      hm.hexes.forEach(function (hex) { hexesArray.push(hex) })
    } else if (Array.isArray(hm.hexes)) {
      hexesArray.push.apply(hexesArray, hm.hexes)
    } else if (hm.hexes && typeof hm.hexes === 'object') {
      for (const hex of Object.values(hm.hexes)) hexesArray.push(hex)
    }

    const detailHexesArray = []
    if (hm.detailHexes instanceof Map) {
      hm.detailHexes.forEach(function (hex) { detailHexesArray.push(hex) })
    } else if (Array.isArray(hm.detailHexes)) {
      detailHexesArray.push.apply(detailHexesArray, hm.detailHexes)
    }

    if (!detailHexesArray.length) return null

    return {
      hexes: hexesArray,
      detailHexes: detailHexesArray,
      detailGridDensity: hm.detailGridDensity,
    }
  }

  function performAggregation() {
    if (!window.TerrainAggregation) return

    const hm = window.state && window.state.hexMap
    if (!hm || !isWorkingMap()) return

    const hexMapData = buildHexMapData()
    if (!hexMapData) return

    const updates = window.TerrainAggregation.aggregateAllDetailToParent(hexMapData)

    for (const key in updates) {
      const hex = updates[key]
      updateParentHex(hex.q, hex.r, hex.terrain)
    }

    const count = Object.keys(updates).length
    if (count > 0) {
      if (typeof window.renderHex === 'function') {
        window.renderHex()
      }
      console.log(TAG + ' Updated ' + count + ' parent hex(es) from detail majority')
    }
  }

  function scheduleAggregation() {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(function () {
      debounceTimer = null
      performAggregation()
    }, DEBOUNCE_MS)
  }

  function startChangeMonitor() {
    lastDetailSnapshot = snapshotDetailHexes()

    setInterval(function () {
      if (!isWorkingMap()) return

      const newSnapshot = snapshotDetailHexes()
      if (hasDetailChanged(newSnapshot)) {
        lastDetailSnapshot = newSnapshot
        scheduleAggregation()
      }
    }, 500)
  }

  function init() {
    let tries = 0
    const timer = setInterval(function () {
      if (
        typeof window.state === 'object' &&
        window.state.hexMap &&
        typeof window.renderHex === 'function'
      ) {
        clearInterval(timer)
        whenAggregationReady(function () {
          startChangeMonitor()
          console.log(TAG + ' Initialized — watching detailHexes for terrain changes')
        })
      } else if (++tries > 300) {
        clearInterval(timer)
        console.warn(TAG + ' Timed out waiting for game.js')
      }
    }, 50)
  }

  init()
})()
