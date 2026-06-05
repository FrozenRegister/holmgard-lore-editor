import { describe, it, expect } from 'vitest'
import {
  getHexesInRadius,
  computeParentDisplayTerrain,
  aggregateDetailToParent,
  aggregateAllDetailToParent,
} from '$lib/terrain-aggregation'

// ── getHexesInRadius ──────────────────────────────────────────────────────────

describe('getHexesInRadius', () => {
  it('radius 0 returns only center', () => {
    const cells = getHexesInRadius(3, -2, 0)
    expect(cells).toHaveLength(1)
    expect(cells[0]).toEqual({ q: 3, r: -2 })
  })

  it('radius 1 returns 7 cells (density-7 cluster)', () => {
    const cells = getHexesInRadius(0, 0, 1)
    expect(cells).toHaveLength(7)
    expect(cells).toContainEqual({ q: 0, r: 0 })
    expect(cells).toContainEqual({ q: 1, r: 0 })
    expect(cells).toContainEqual({ q: -1, r: 0 })
    expect(cells).toContainEqual({ q: 0, r: 1 })
    expect(cells).toContainEqual({ q: 0, r: -1 })
    expect(cells).toContainEqual({ q: 1, r: -1 })
    expect(cells).toContainEqual({ q: -1, r: 1 })
  })

  it('radius 2 returns 19 cells (density-19 cluster)', () => {
    expect(getHexesInRadius(0, 0, 2)).toHaveLength(19)
  })

  it('radius 3 returns 37 cells (density-37 cluster)', () => {
    expect(getHexesInRadius(0, 0, 3)).toHaveLength(37)
  })

  it('works with negative center coordinates', () => {
    const cells = getHexesInRadius(-4, 6, 1)
    expect(cells).toHaveLength(7)
    expect(cells).toContainEqual({ q: -4, r: 6 })
  })
})

// ── computeParentDisplayTerrain ───────────────────────────────────────────────

describe('computeParentDisplayTerrain', () => {
  it('returns baseTerrain when no detail hexes exist', () => {
    const result = computeParentDisplayTerrain(0, 0, 'plains', new Map(), 2)
    expect(result).toBe('plains')
  })

  it('majority custom terrain wins (5 forest + 2 empty → forest)', () => {
    // Parent (0,0) ef=2 → cluster center (0,0) radius 1 → 7 cells
    // 5 painted forest, 2 empty → default to baseTerrain "plains"
    const cells = getHexesInRadius(0, 0, 1)
    const detailHexMap = new Map<string, string>()
    cells.slice(0, 5).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'forest'))

    expect(computeParentDisplayTerrain(0, 0, 'plains', detailHexMap, 2)).toBe('forest')
  })

  it('base terrain wins when painted cells are minority (3 forest + 4 empty → plains)', () => {
    const cells = getHexesInRadius(0, 0, 1)
    const detailHexMap = new Map<string, string>()
    cells.slice(0, 3).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'forest'))

    expect(computeParentDisplayTerrain(0, 0, 'plains', detailHexMap, 2)).toBe('plains')
  })

  it('tie: baseTerrain wins when included in tied group', () => {
    // mountain=3, water=1, plains=3 (empty cells default to base) → tie [mountain, plains]
    // base "plains" is in tie → plains wins
    const cells = getHexesInRadius(5, 5, 1)
    const detailHexMap = new Map<string, string>()
    cells.slice(0, 3).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'mountain'))
    detailHexMap.set(`${cells[6].q},${cells[6].r}`, 'water')
    // cells[3..5] empty → default to "plains"

    expect(computeParentDisplayTerrain(5, 5, 'plains', detailHexMap, 2)).toBe('plains')
  })

  it('tie: alphabetical order wins when baseTerrain not in tied group', () => {
    // 3 forest + 3 mountain + 1 empty(=plains base) → forest=3, mountain=3, plains=1
    // tie [forest, mountain], base "plains" not in tie → alphabetical → "forest"
    const cells = getHexesInRadius(0, 0, 1)
    const detailHexMap = new Map<string, string>()
    cells.slice(0, 3).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'forest'))
    cells.slice(3, 6).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'mountain'))
    // cells[6] empty → plains

    expect(computeParentDisplayTerrain(0, 0, 'plains', detailHexMap, 2)).toBe('forest')
  })

  it('density-19: edgeFactor 3, cluster center = 3× parent coords', () => {
    // Parent (4,-3) ef=3 → cluster center (12,-9), radius=2, 19 cells
    const cells = getHexesInRadius(12, -9, 2)
    const detailHexMap = new Map<string, string>()
    cells.slice(0, 15).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'water'))

    expect(computeParentDisplayTerrain(4, -3, 'desert', detailHexMap, 3)).toBe('water')
  })

  it('density-37: edgeFactor 4, cluster center = 4× parent coords', () => {
    // Parent (1,1) ef=4 → cluster center (4,4), radius=3, 37 cells
    const cells = getHexesInRadius(4, 4, 3)
    const detailHexMap = new Map<string, string>()
    cells.slice(0, 20).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'tundra'))

    expect(computeParentDisplayTerrain(1, 1, 'grassland', detailHexMap, 4)).toBe('tundra')
  })

  it('works with negative parent coordinates', () => {
    // Parent (-382,219) ef=2 → cluster center (-764,438), radius=1
    const cells = getHexesInRadius(-764, 438, 1)
    const detailHexMap = new Map<string, string>()
    cells.slice(0, 5).forEach((c) => detailHexMap.set(`${c.q},${c.r}`, 'plains'))

    expect(computeParentDisplayTerrain(-382, 219, 'forest', detailHexMap, 2)).toBe('plains')
  })
})

// ── aggregateDetailToParent ───────────────────────────────────────────────────

describe('aggregateDetailToParent', () => {
  it('returns null when detailHexes is empty', () => {
    expect(
      aggregateDetailToParent({ q: 0, r: 0, terrain: 'plains' }, { hexes: [], detailHexes: [] }),
    ).toBeNull()
  })

  it('returns null when terrain would not change', () => {
    // testMap-style: 4 different terrains + 3 empty(=plains) → plains majority → no change
    // Parent (3,-2) ef=2 → cluster center (6,-4), 7 cells
    // detailHexes at (5,-4), (6,-5), (5,-3), (6,-3) are 4 of the 7
    // counts: forest=1, mountain=1, water=1, tundra=1, plains=3 → plains wins
    expect(
      aggregateDetailToParent(
        { q: 3, r: -2, terrain: 'plains' },
        {
          hexes: [{ q: 3, r: -2, terrain: 'plains' }],
          detailHexes: [
            { q: 5, r: -4, terrain: 'forest' },
            { q: 6, r: -5, terrain: 'mountain' },
            { q: 5, r: -3, terrain: 'water' },
            { q: 6, r: -3, terrain: 'tundra' },
          ],
          detailGridDensity: 7,
        },
      ),
    ).toBeNull()
  })

  it('returns updated hex when majority terrain differs', () => {
    // 5 of 7 cluster cells painted forest → forest > plains (2 empty)
    const clusterCells = getHexesInRadius(0, 0, 1)
    const result = aggregateDetailToParent(
      { q: 0, r: 0, terrain: 'plains' },
      {
        hexes: [{ q: 0, r: 0, terrain: 'plains' }],
        detailHexes: clusterCells.slice(0, 5).map((c) => ({ ...c, terrain: 'forest' })),
        detailGridDensity: 7,
      },
    )
    expect(result?.terrain).toBe('forest')
    expect(result?.q).toBe(0)
    expect(result?.r).toBe(0)
  })

  it('defaults to density-7 when detailGridDensity is absent', () => {
    const clusterCells = getHexesInRadius(0, 0, 1)
    const result = aggregateDetailToParent(
      { q: 0, r: 0, terrain: 'plains' },
      {
        hexes: [{ q: 0, r: 0, terrain: 'plains' }],
        detailHexes: clusterCells.slice(0, 5).map((c) => ({ ...c, terrain: 'water' })),
      },
    )
    expect(result?.terrain).toBe('water')
  })
})

// ── aggregateAllDetailToParent ────────────────────────────────────────────────

describe('aggregateAllDetailToParent', () => {
  it('returns {} when detailHexes is empty', () => {
    expect(
      aggregateAllDetailToParent({
        hexes: [{ q: 0, r: 0, terrain: 'plains' }],
        detailHexes: [],
      }),
    ).toEqual({})
  })

  it('returns {} when hexes is empty', () => {
    expect(
      aggregateAllDetailToParent({
        hexes: [],
        detailHexes: [{ q: 0, r: 0, terrain: 'forest' }],
      }),
    ).toEqual({})
  })

  it('only returns parents whose terrain actually changes', () => {
    // Parent A (0,0) plains: 5/7 cells painted forest → updates
    // Parent B (10,10) desert: no detail hexes in its cluster (center 20,20) → no change
    const clusterA = getHexesInRadius(0, 0, 1)
    const result = aggregateAllDetailToParent({
      hexes: [
        { q: 0, r: 0, terrain: 'plains' },
        { q: 10, r: 10, terrain: 'desert' },
      ],
      detailHexes: clusterA.slice(0, 5).map((c) => ({ ...c, terrain: 'forest' })),
      detailGridDensity: 7,
    })

    expect(result['0,0']?.terrain).toBe('forest')
    expect(result['10,10']).toBeUndefined()
  })

  it('handles multiple parents in one pass', () => {
    // Parent A (0,0) plains → 5 forest → updates to forest
    // Parent B (5,0) grassland → 5 water → updates to water
    const clusterA = getHexesInRadius(0, 0, 1)
    const clusterB = getHexesInRadius(10, 0, 1) // ef=2 → center (10,0)
    const result = aggregateAllDetailToParent({
      hexes: [
        { q: 0, r: 0, terrain: 'plains' },
        { q: 5, r: 0, terrain: 'grassland' },
      ],
      detailHexes: [
        ...clusterA.slice(0, 5).map((c) => ({ ...c, terrain: 'forest' })),
        ...clusterB.slice(0, 5).map((c) => ({ ...c, terrain: 'water' })),
      ],
      detailGridDensity: 7,
    })

    expect(result['0,0']?.terrain).toBe('forest')
    expect(result['5,0']?.terrain).toBe('water')
  })
})
