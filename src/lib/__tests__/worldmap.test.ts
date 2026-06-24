import { describe, it, expect } from 'vitest'
import {
  PerlinNoise,
  hashString,
  generateTiles,
  initializeWorld,
  createChildRegion,
  hexToPixel,
  hexPoints,
  wrapMarkdown,
  unwrapMarkdown,
  majorityTerrain,
  averageElevation,
  unionOverlays,
  aggregateChildToParent,
  boundsOverlap,
  expandRegion,
  mergeRegions,
  TERRAIN_OPTIONS,
  HEX_SIZE,
  ROOT_ID,
} from '../worldmap'
import type { WorldMap, Tile, Overlay } from '../worldmap'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeMap(overrides: Partial<WorldMap> = {}): WorldMap {
  return {
    id: 'test',
    level: 'test',
    name: 'Test',
    parent: null,
    bounds: { qmin: 0, qmax: 10, rmin: 0, rmax: 10 },
    tiles: {},
    children: [],
    seed: 42,
    ...overrides,
  }
}

function makeTile(terrain = 'grassland', elevation = 5, overlays: Overlay[] = []): Tile {
  return { terrain, elevation, overlays, label: null, lore_key: null, features: [] }
}

// ── initializeWorld (line 161) ────────────────────────────────────────────────

describe('initializeWorld', () => {
  it('returns a record containing the root map', () => {
    const world = initializeWorld()
    expect(world[ROOT_ID]).toBeDefined()
  })

  it('root map has east_west wrapping', () => {
    const world = initializeWorld()
    expect(world[ROOT_ID].wraps?.east_west).toBe(true)
  })

  it('root map has tiles generated (non-empty)', () => {
    const world = initializeWorld()
    expect(Object.keys(world[ROOT_ID].tiles).length).toBeGreaterThan(0)
  })

  it('root map has no parent', () => {
    const world = initializeWorld()
    expect(world[ROOT_ID].parent).toBeNull()
  })
})

// ── PerlinNoise ────────────────────────────────────────────────────────────────

describe('PerlinNoise', () => {
  it('same seed produces identical noise value', () => {
    const n1 = new PerlinNoise(42)
    const n2 = new PerlinNoise(42)
    expect(n1.noise(1.5, 2.3)).toBe(n2.noise(1.5, 2.3))
  })

  it('same seed produces identical sequence of values', () => {
    const n1 = new PerlinNoise(99)
    const n2 = new PerlinNoise(99)
    const points: [number, number][] = [[0.1, 0.2], [1.7, 3.4], [5.0, 5.0], [10.1, 0.5]]
    for (const [x, y] of points) {
      expect(n1.noise(x, y)).toBe(n2.noise(x, y))
    }
  })

  it('different seeds produce different noise values', () => {
    const n1 = new PerlinNoise(42)
    const n2 = new PerlinNoise(99)
    expect(n1.noise(1.5, 2.3)).not.toBe(n2.noise(1.5, 2.3))
  })

  it('noise returns values in [-1, 1]', () => {
    const noise = new PerlinNoise(123)
    for (let i = 0; i < 20; i++) {
      const v = noise.noise(i * 0.7, i * 0.3)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('seed 0 is stable', () => {
    const n1 = new PerlinNoise(0)
    const n2 = new PerlinNoise(0)
    expect(n1.noise(3.14, 2.71)).toBe(n2.noise(3.14, 2.71))
  })
})

// ── hashString ────────────────────────────────────────────────────────────────

describe('hashString', () => {
  it('returns same value for same input', () => {
    expect(hashString('Europe')).toBe(hashString('Europe'))
  })

  it('returns different values for different inputs', () => {
    expect(hashString('Europe')).not.toBe(hashString('Asia'))
  })

  it('returns a non-negative integer', () => {
    const h = hashString('test')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(h)).toBe(true)
  })

  it('handles empty string', () => {
    expect(hashString('')).toBe(0)
  })

  it('is stable across repeated calls', () => {
    const val = hashString('stable-string')
    for (let i = 0; i < 5; i++) expect(hashString('stable-string')).toBe(val)
  })
})

// ── generateTiles ─────────────────────────────────────────────────────────────

describe('generateTiles', () => {
  it('fills every tile in bounds', () => {
    const map = makeMap({ bounds: { qmin: 0, qmax: 5, rmin: 0, rmax: 5 } })
    generateTiles(map, 10, -0.3, 0.4, 0.1)
    for (let q = 0; q <= 5; q++) {
      for (let r = 0; r <= 5; r++) {
        expect(map.tiles[`${q},${r}`]).toBeDefined()
      }
    }
    expect(Object.keys(map.tiles)).toHaveLength(36)
  })

  it('assigns valid terrain to every tile', () => {
    const map = makeMap({ bounds: { qmin: 0, qmax: 8, rmin: 0, rmax: 8 } })
    generateTiles(map, 10, -0.3, 0.4, 0.1)
    for (const tile of Object.values(map.tiles)) {
      expect(TERRAIN_OPTIONS).toContain(tile.terrain)
    }
  })

  it('assigns elevation in 0–10 range', () => {
    const map = makeMap({ bounds: { qmin: 0, qmax: 8, rmin: 0, rmax: 8 } })
    generateTiles(map, 10, -0.3, 0.4, 0.1)
    for (const tile of Object.values(map.tiles)) {
      expect(tile.elevation).toBeGreaterThanOrEqual(0)
      expect(tile.elevation).toBeLessThanOrEqual(10)
    }
  })

  it('initialises overlays/label/lore_key/features to empty defaults', () => {
    const map = makeMap({ bounds: { qmin: 0, qmax: 2, rmin: 0, rmax: 2 } })
    generateTiles(map, 10, -0.3, 0.4, 0.1)
    for (const tile of Object.values(map.tiles)) {
      expect(tile.overlays).toEqual([])
      expect(tile.label).toBeNull()
      expect(tile.lore_key).toBeNull()
      expect(tile.features).toEqual([])
    }
  })

  it('is deterministic for the same seed', () => {
    const m1 = makeMap({ seed: 777 })
    const m2 = makeMap({ seed: 777 })
    generateTiles(m1, 10, -0.3, 0.4, 0.1)
    generateTiles(m2, 10, -0.3, 0.4, 0.1)
    expect(m1.tiles).toEqual(m2.tiles)
  })

  it('produces different results for different seeds', () => {
    const m1 = makeMap({ seed: 1 })
    const m2 = makeMap({ seed: 2 })
    generateTiles(m1, 10, -0.3, 0.4, 0.1)
    generateTiles(m2, 10, -0.3, 0.4, 0.1)
    expect(m1.tiles).not.toEqual(m2.tiles)
  })
})

// ── createChildRegion ─────────────────────────────────────────────────────────

describe('createChildRegion', () => {
  const parent = makeMap({ id: 'world:continents', children: [] })
  const baseMaps = { 'world:continents': parent }

  it('generates id with parent prefix and slugified name', () => {
    const result = createChildRegion('Northern Europe', 'country', 10, 10, 'world:continents', baseMaps)
    expect(result?.id).toBe('world:continents:northern-europe')
  })

  it('adds child id to parent children list', () => {
    const result = createChildRegion('Europe', 'country', 10, 10, 'world:continents', baseMaps)
    expect(result?.maps['world:continents'].children).toContain('world:continents:europe')
  })

  it('uses hashString(name) as seed — terrain is deterministic from name', () => {
    const r1 = createChildRegion('Europe', 'country', 10, 10, 'world:continents', baseMaps)!
    const r2 = createChildRegion('Europe', 'country', 10, 10, 'world:continents', baseMaps)!
    const c1 = r1.maps[r1.id]
    const c2 = r2.maps[r2.id]
    expect(c1.seed).toBe(c2.seed)
    expect(c1.tiles).toEqual(c2.tiles)
  })

  it('different names produce different tiles', () => {
    const r1 = createChildRegion('Europe', 'country', 10, 10, 'world:continents', baseMaps)!
    const r2 = createChildRegion('Asia', 'country', 10, 10, 'world:continents', baseMaps)!
    expect(r1.maps[r1.id].tiles).not.toEqual(r2.maps[r2.id].tiles)
  })

  it('returns null if region with same id already exists', () => {
    const maps = {
      ...baseMaps,
      'world:continents:europe': makeMap({ id: 'world:continents:europe' }),
    }
    expect(createChildRegion('Europe', 'country', 10, 10, 'world:continents', maps)).toBeNull()
  })

  // Line 195: the `: undefined` branch — parentId not found in maps
  it('still creates the child when parentId is not present in maps (orphan create)', () => {
    // Passing an empty maps object means maps[parentId] is undefined,
    // so updatedParent = undefined, and the spread omits the parent entry.
    const result = createChildRegion('Orphan Region', 'country', 5, 5, 'nonexistent-parent', {})
    expect(result).not.toBeNull()
    expect(result?.id).toBe('nonexistent-parent:orphan-region')
    // Parent is not in result.maps since it wasn't in the input
    expect(result?.maps['nonexistent-parent']).toBeUndefined()
  })

  it('fills child with all expected tiles', () => {
    const result = createChildRegion('Europe', 'country', 5, 5, 'world:continents', baseMaps)!
    const child = result.maps[result.id]
    expect(Object.keys(child.tiles)).toHaveLength(25)
    for (let q = 0; q < 5; q++) {
      for (let r = 0; r < 5; r++) {
        expect(child.tiles[`${q},${r}`]).toBeDefined()
      }
    }
  })
})

// ── hexPoints (lines 226-232) ─────────────────────────────────────────────────

describe('hexPoints', () => {
  it('returns a space-separated string of 6 coordinate pairs', () => {
    const pts = hexPoints(100, 100)
    const pairs = pts.split(' ')
    expect(pairs).toHaveLength(6)
    for (const pair of pairs) {
      expect(pair).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    }
  })

  it('coordinates are centred around (cx, cy) within HEX_SIZE radius', () => {
    const cx = 50, cy = 80
    const pts = hexPoints(cx, cy)
    for (const pair of pts.split(' ')) {
      const [x, y] = pair.split(',').map(Number)
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      expect(dist).toBeCloseTo(HEX_SIZE, 5)
    }
  })

  it('is deterministic for the same center', () => {
    expect(hexPoints(10, 20)).toBe(hexPoints(10, 20))
  })
})

// ── hexToPixel ────────────────────────────────────────────────────────────────

describe('hexToPixel', () => {
  const wrapMap = makeMap({
    bounds: { qmin: 0, qmax: 99, rmin: 0, rmax: 0 },
    wraps: { east_west: true },
  })
  const noWrapMap = makeMap({
    bounds: { qmin: 0, qmax: 99, rmin: 0, rmax: 0 },
  })

  it('wraps q=100 to q=0 on a width-100 east-west wrapping map', () => {
    expect(hexToPixel(100, 0, wrapMap)).toEqual(hexToPixel(0, 0, wrapMap))
  })

  it('wraps q=101 to q=1 on a width-100 east-west wrapping map', () => {
    expect(hexToPixel(101, 0, wrapMap)).toEqual(hexToPixel(1, 0, wrapMap))
  })

  it('does not wrap q on a non-wrapping map', () => {
    const { x: x0 } = hexToPixel(0, 0, noWrapMap)
    const { x: x100 } = hexToPixel(100, 0, noWrapMap)
    expect(x0).not.toBe(x100)
  })

  it('x increases with q on non-wrapping map', () => {
    const p1 = hexToPixel(0, 0, noWrapMap)
    const p2 = hexToPixel(5, 0, noWrapMap)
    expect(p2.x).toBeGreaterThan(p1.x)
  })

  it('returns numbers scaled by HEX_SIZE', () => {
    const { x, y } = hexToPixel(0, 0, noWrapMap)
    // q=0 r=0: x = HEX_SIZE*(1.5*0)+HEX_SIZE*2 = HEX_SIZE*2
    expect(x).toBe(HEX_SIZE * 2)
  })
})

// ── wrapMarkdown / unwrapMarkdown ─────────────────────────────────────────────

describe('wrapMarkdown / unwrapMarkdown round-trip', () => {
  it('round-trips a WorldMap with tiles through markdown wrapping', () => {
    const map = makeMap({ name: 'TestMap', id: 'testid' })
    generateTiles(map, 10, -0.3, 0.4, 0.1)
    const md = wrapMarkdown(map)
    const restored = unwrapMarkdown(md)
    expect(restored).toEqual(map)
  })

  it('unwrapMarkdown tolerates raw JSON without a fenced block', () => {
    const map = makeMap({ name: 'Raw', id: 'rawid' })
    const raw = JSON.stringify(map)
    expect(unwrapMarkdown(raw)).toEqual(map)
  })

  it('unwrapMarkdown returns null for completely invalid input', () => {
    expect(unwrapMarkdown('not json at all')).toBeNull()
  })

  it('unwrapMarkdown returns null for invalid JSON inside a fence', () => {
    expect(unwrapMarkdown('```json\n{invalid}\n```')).toBeNull()
  })

  it('markdown header includes map name and level', () => {
    const map = makeMap({ name: 'Westeros', level: 'continents' })
    generateTiles(map, 10, -0.3, 0.4, 0.1)
    const md = wrapMarkdown(map)
    expect(md).toContain('# Map: Westeros')
    expect(md).toContain('continents')
    expect(md).toContain('tiles')
  })

  it('tile count in header matches actual tile count', () => {
    const map = makeMap({ bounds: { qmin: 0, qmax: 3, rmin: 0, rmax: 3 } })
    generateTiles(map, 10, -0.3, 0.4, 0.1)
    const md = wrapMarkdown(map)
    expect(md).toContain('16 tiles')
  })
})

// ── majorityTerrain ───────────────────────────────────────────────────────────

describe('majorityTerrain', () => {
  it('returns the most frequent terrain', () => {
    const tiles = [
      makeTile('water'), makeTile('water'), makeTile('water'),
      makeTile('grassland'), makeTile('forest'),
    ]
    expect(majorityTerrain(tiles)).toBe('water')
  })

  it('returns grassland for empty tile list', () => {
    expect(majorityTerrain([])).toBe('grassland')
  })

  it('returns the sole terrain when all tiles match', () => {
    const tiles = [makeTile('mountain'), makeTile('mountain')]
    expect(majorityTerrain(tiles)).toBe('mountain')
  })
})

// ── averageElevation ──────────────────────────────────────────────────────────

describe('averageElevation', () => {
  it('returns rounded average', () => {
    const tiles = [makeTile('grassland', 4), makeTile('grassland', 6), makeTile('grassland', 5)]
    expect(averageElevation(tiles)).toBe(5)
  })

  it('rounds to nearest integer', () => {
    // (2+3)/2 = 2.5 → rounds to 3
    expect(averageElevation([makeTile('water', 2), makeTile('water', 3)])).toBe(3)
  })

  it('returns 0 for empty tile list', () => {
    expect(averageElevation([])).toBe(0)
  })
})

// ── unionOverlays ─────────────────────────────────────────────────────────────

describe('unionOverlays', () => {
  it('deduplicates overlay types across tiles', () => {
    const t1 = makeTile('grassland', 5, [{ type: 'claim' }, { type: 'threat_level' }])
    const t2 = makeTile('grassland', 5, [{ type: 'claim' }])
    const result = unionOverlays([t1, t2])
    expect(result.map((o) => o.type)).toEqual(['claim', 'threat_level'])
  })

  it('returns empty array when no tiles have overlays', () => {
    expect(unionOverlays([makeTile(), makeTile()])).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(unionOverlays([])).toEqual([])
  })
})

// ── aggregateChildToParent ────────────────────────────────────────────────────

describe('aggregateChildToParent', () => {
  function makeParentChildMaps(anchorLoreKey?: string): Record<string, WorldMap> {
    const parent = makeMap({
      id: 'world:continents',
      level: 'continents',
      name: 'World',
      parent: null,
      bounds: { qmin: 0, qmax: 10, rmin: 0, rmax: 10 },
      children: ['world:continents:europe'],
    })
    generateTiles(parent, 10, -0.3, 0.4, 0.1)
    if (anchorLoreKey) {
      parent.tiles['5,5'] = { ...parent.tiles['5,5'], lore_key: anchorLoreKey }
    }

    const child = makeMap({
      id: 'world:continents:europe',
      level: 'country',
      name: 'Europe',
      parent: 'world:continents',
      bounds: { qmin: 0, qmax: 4, rmin: 0, rmax: 4 },
      children: [],
      seed: 123,
    })
    // 3 water + 2 forest → majority = water
    child.tiles['0,0'] = makeTile('water', 2)
    child.tiles['0,1'] = makeTile('water', 3)
    child.tiles['1,0'] = makeTile('water', 4)
    child.tiles['1,1'] = makeTile('forest', 6)
    child.tiles['2,0'] = makeTile('forest', 7)

    return { 'world:continents': parent, 'world:continents:europe': child }
  }

  it('updates anchor tile (lore_key match) with majority terrain', () => {
    const maps = makeParentChildMaps('map:world:continents:europe')
    const result = aggregateChildToParent('world:continents:europe', maps)!
    expect(result['world:continents'].tiles['5,5'].terrain).toBe('water')
  })

  it('averages child elevation onto anchor tile', () => {
    const maps = makeParentChildMaps('map:world:continents:europe')
    const result = aggregateChildToParent('world:continents:europe', maps)!
    // (2+3+4+6+7)/5 = 4.4 → rounds to 4
    expect(result['world:continents'].tiles['5,5'].elevation).toBe(4)
  })

  it('unions overlays from child tiles onto anchor tile', () => {
    const maps = makeParentChildMaps('map:world:continents:europe')
    maps['world:continents:europe'].tiles['0,0'].overlays = [{ type: 'claim' }]
    maps['world:continents:europe'].tiles['1,1'].overlays = [{ type: 'threat_level' }]
    const result = aggregateChildToParent('world:continents:europe', maps)!
    const types = result['world:continents'].tiles['5,5'].overlays.map((o) => o.type)
    expect(types).toContain('claim')
    expect(types).toContain('threat_level')
  })

  it('falls back to center tile when no anchor lore_key is set', () => {
    // center of 0–10 bounds is (5,5)
    const maps = makeParentChildMaps()
    const result = aggregateChildToParent('world:continents:europe', maps)!
    expect(result['world:continents'].tiles['5,5'].terrain).toBe('water')
  })

  it('returns null when child has no parent', () => {
    const orphan = makeMap({ id: 'orphan', parent: null })
    expect(aggregateChildToParent('orphan', { orphan })).toBeNull()
  })

  it('returns null when child tiles are empty', () => {
    const maps = makeParentChildMaps()
    maps['world:continents:europe'].tiles = {}
    expect(aggregateChildToParent('world:continents:europe', maps)).toBeNull()
  })

  it('does not mutate the input maps object', () => {
    const maps = makeParentChildMaps('map:world:continents:europe')
    const originalTerrain = maps['world:continents'].tiles['5,5'].terrain
    aggregateChildToParent('world:continents:europe', maps)
    expect(maps['world:continents'].tiles['5,5'].terrain).toBe(originalTerrain)
  })
})

// ── boundsOverlap ─────────────────────────────────────────────────────────────

describe('boundsOverlap', () => {
  it('returns true for overlapping bounds', () => {
    expect(boundsOverlap(
      { qmin: 0, qmax: 10, rmin: 0, rmax: 10 },
      { qmin: 5, qmax: 15, rmin: 5, rmax: 15 },
    )).toBe(true)
  })

  it('returns false for bounds separated along q', () => {
    expect(boundsOverlap(
      { qmin: 0, qmax: 10, rmin: 0, rmax: 10 },
      { qmin: 11, qmax: 20, rmin: 0, rmax: 10 },
    )).toBe(false)
  })

  it('returns false for bounds separated along r', () => {
    expect(boundsOverlap(
      { qmin: 0, qmax: 10, rmin: 0, rmax: 10 },
      { qmin: 0, qmax: 10, rmin: 11, rmax: 20 },
    )).toBe(false)
  })

  it('returns true for touching bounds (edge contact counts as overlap)', () => {
    expect(boundsOverlap(
      { qmin: 0, qmax: 10, rmin: 0, rmax: 10 },
      { qmin: 10, qmax: 20, rmin: 0, rmax: 10 },
    )).toBe(true)
  })

  it('returns true when one bounds fully contains the other', () => {
    expect(boundsOverlap(
      { qmin: 0, qmax: 100, rmin: 0, rmax: 100 },
      { qmin: 10, qmax: 20, rmin: 10, rmax: 20 },
    )).toBe(true)
  })
})

// ── expandRegion ──────────────────────────────────────────────────────────────

describe('expandRegion', () => {
  function makeSiblingMaps(): Record<string, WorldMap> {
    const parent = makeMap({
      id: 'world:continents',
      parent: null,
      children: ['world:continents:europe', 'world:continents:asia'],
      bounds: { qmin: 0, qmax: 200, rmin: 0, rmax: 200 },
    })
    const europe = makeMap({
      id: 'world:continents:europe',
      parent: 'world:continents',
      bounds: { qmin: 0, qmax: 30, rmin: 0, rmax: 30 },
      seed: 1,
    })
    generateTiles(europe, 15, -0.2, 0.3, 0.05)
    const asia = makeMap({
      id: 'world:continents:asia',
      parent: 'world:continents',
      bounds: { qmin: 50, qmax: 80, rmin: 0, rmax: 30 },
      seed: 2,
    })
    generateTiles(asia, 15, -0.2, 0.3, 0.05)
    return {
      'world:continents': parent,
      'world:continents:europe': europe,
      'world:continents:asia': asia,
    }
  }

  it('expands bounds south', () => {
    const result = expandRegion('world:continents:europe', 'S', makeSiblingMaps(), 5)!
    expect(result.map.bounds.rmax).toBe(35)
    expect(result.map.bounds.rmin).toBe(0)
    expect(result.map.bounds.qmax).toBe(30)
  })

  it('expands bounds north', () => {
    const result = expandRegion('world:continents:europe', 'N', makeSiblingMaps(), 3)!
    expect(result.map.bounds.rmin).toBe(-3)
  })

  it('expands bounds east', () => {
    const result = expandRegion('world:continents:europe', 'E', makeSiblingMaps(), 5)!
    expect(result.map.bounds.qmax).toBe(35)
  })

  it('expands bounds west', () => {
    const result = expandRegion('world:continents:europe', 'W', makeSiblingMaps(), 5)!
    expect(result.map.bounds.qmin).toBe(-5)
  })

  it('generates new tiles in the expanded strip', () => {
    const result = expandRegion('world:continents:europe', 'S', makeSiblingMaps(), 5)!
    // strip r=31..35 must exist
    expect(result.map.tiles['0,31']).toBeDefined()
    expect(result.map.tiles['0,35']).toBeDefined()
    for (const tile of Object.values(result.map.tiles)) {
      expect(TERRAIN_OPTIONS).toContain(tile.terrain)
    }
  })

  it('preserves existing tiles unchanged', () => {
    const maps = makeSiblingMaps()
    const originalTile = { ...maps['world:continents:europe'].tiles['0,0'] }
    const result = expandRegion('world:continents:europe', 'S', maps, 5)!
    expect(result.map.tiles['0,0']).toEqual(originalTile)
  })

  it('returns conflict when expansion overlaps a sibling', () => {
    // europe qmax=30, asia qmin=50 — expand east 25 → qmax=55, overlaps asia
    const result = expandRegion('world:continents:europe', 'E', makeSiblingMaps(), 25)!
    expect(result.conflict).toBeDefined()
    expect(result.conflict!.overlaps).toContain('world:continents:asia')
  })

  it('returns no conflict when expansion does not overlap any sibling', () => {
    // expand east 5 → qmax=35, still < asia qmin=50
    const result = expandRegion('world:continents:europe', 'E', makeSiblingMaps(), 5)!
    expect(result.conflict).toBeUndefined()
  })

  it('still returns expanded map even when conflict present', () => {
    const result = expandRegion('world:continents:europe', 'E', makeSiblingMaps(), 25)!
    expect(result.map.bounds.qmax).toBe(55)
  })

  it('returns null for unknown mapId', () => {
    expect(expandRegion('nonexistent', 'N', {})).toBeNull()
  })
})

// ── mergeRegions ──────────────────────────────────────────────────────────────

describe('mergeRegions', () => {
  function makeSiblingPair(): Record<string, WorldMap> {
    const parent = makeMap({
      id: 'world:continents',
      parent: null,
      children: ['world:continents:west', 'world:continents:east'],
    })
    const west = makeMap({
      id: 'world:continents:west',
      parent: 'world:continents',
      bounds: { qmin: 0, qmax: 20, rmin: 0, rmax: 20 },
    })
    west.tiles['0,0'] = makeTile('water', 2)
    west.tiles['1,1'] = makeTile('forest', 5)

    const east = makeMap({
      id: 'world:continents:east',
      parent: 'world:continents',
      bounds: { qmin: 21, qmax: 40, rmin: 0, rmax: 20 },
    })
    east.tiles['21,0'] = makeTile('mountain', 8)
    east.tiles['25,5'] = makeTile('desert', 3)

    return {
      'world:continents': parent,
      'world:continents:west': west,
      'world:continents:east': east,
    }
  }

  it('unions bounds of both sibling regions', () => {
    const result = mergeRegions('world:continents:west', 'world:continents:east', makeSiblingPair())!
    expect(result['world:continents:west'].bounds).toEqual({ qmin: 0, qmax: 40, rmin: 0, rmax: 20 })
  })

  it('merged region contains tiles from both original regions', () => {
    const result = mergeRegions('world:continents:west', 'world:continents:east', makeSiblingPair())!
    const merged = result['world:continents:west']
    expect(merged.tiles['0,0'].terrain).toBe('water')
    expect(merged.tiles['21,0'].terrain).toBe('mountain')
  })

  it('removes the absorbed sibling from maps', () => {
    const result = mergeRegions('world:continents:west', 'world:continents:east', makeSiblingPair())!
    expect(result['world:continents:east']).toBeUndefined()
  })

  it('removes the absorbed sibling from parent children list', () => {
    const result = mergeRegions('world:continents:west', 'world:continents:east', makeSiblingPair())!
    expect(result['world:continents'].children).not.toContain('world:continents:east')
    expect(result['world:continents'].children).toContain('world:continents:west')
  })

  it('mapId tiles take precedence over siblingId tiles at the same key', () => {
    const maps = makeSiblingPair()
    maps['world:continents:west'].tiles['10,10'] = makeTile('water', 1)
    maps['world:continents:east'].tiles['10,10'] = makeTile('mountain', 9)
    const result = mergeRegions('world:continents:west', 'world:continents:east', maps)!
    // west (mapId = a) wins
    expect(result['world:continents:west'].tiles['10,10'].terrain).toBe('water')
  })

  it('returns null for non-sibling maps (different parents)', () => {
    const maps = makeSiblingPair()
    maps['world:continents:west'] = { ...maps['world:continents:west'], parent: 'other' }
    expect(mergeRegions('world:continents:west', 'world:continents:east', maps)).toBeNull()
  })

  it('returns null for unknown mapId', () => {
    expect(mergeRegions('no-such-map', 'world:continents:east', makeSiblingPair())).toBeNull()
  })

  it('does not mutate the input maps', () => {
    const maps = makeSiblingPair()
    const origChildren = [...maps['world:continents'].children]
    mergeRegions('world:continents:west', 'world:continents:east', maps)
    expect(maps['world:continents'].children).toEqual(origChildren)
  })
})
