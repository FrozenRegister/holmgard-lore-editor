import { describe, it, expect } from 'vitest'
import {
  getHexesInRadius,
  aggregateDetailToParent,
  aggregateAllDetailToParent,
} from '$lib/terrain-aggregation'

describe('terrain-aggregation integration', () => {
  describe('real-world scenarios', () => {
    it('testMap scenario: 4 different terrains painted, parent stays unchanged', () => {
      // testMap.json: parent (3,-2) plains, ef=2, cluster center (6,-4)
      // 4 of 7 cells painted with different terrains; 3 empty → default to "plains"
      // counts: forest=1, mountain=1, water=1, tundra=1, plains=3 → plains majority → no change
      const result = aggregateDetailToParent(
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
      )
      expect(result).toBeNull()
    })

    it('triggers update when clear majority exceeds base terrain (5+ same terrain)', () => {
      // All 7 cluster cells painted as plains → plains wins (parent was "mountain")
      const clusterCells = getHexesInRadius(0, 0, 1)
      const result = aggregateDetailToParent(
        { q: 0, r: 0, terrain: 'mountain' },
        {
          hexes: [{ q: 0, r: 0, terrain: 'mountain' }],
          detailHexes: clusterCells.map((c) => ({ ...c, terrain: 'plains' })),
          detailGridDensity: 7,
        },
      )
      expect(result?.terrain).toBe('plains')
    })

    it('progressive painting: 4 forest not enough, 5 forest triggers update', () => {
      const clusterCells = getHexesInRadius(0, 0, 1)

      // Phase 1: 4 forest + 3 empty(=plains) → forest=4 > plains=3 → updates!
      const result1 = aggregateDetailToParent(
        { q: 0, r: 0, terrain: 'plains' },
        {
          hexes: [{ q: 0, r: 0, terrain: 'plains' }],
          detailHexes: clusterCells.slice(0, 4).map((c) => ({ ...c, terrain: 'forest' })),
          detailGridDensity: 7,
        },
      )
      expect(result1?.terrain).toBe('forest')

      // Phase 2: 3 forest + 4 empty(=plains) → forest=3 < plains=4 → no change
      const result2 = aggregateDetailToParent(
        { q: 0, r: 0, terrain: 'plains' },
        {
          hexes: [{ q: 0, r: 0, terrain: 'plains' }],
          detailHexes: clusterCells.slice(0, 3).map((c) => ({ ...c, terrain: 'forest' })),
          detailGridDensity: 7,
        },
      )
      expect(result2).toBeNull()
    })

    it('multiple parent hexes: only those with majority non-base terrain update', () => {
      // Parent A (0,0) plains: 5/7 forest → updates to forest
      // Parent B (10,5) desert: 3/7 water → desert keeps (water=3, desert=4) → no change
      // Parent C (20,0) grassland: no detail hexes in its cluster → no change
      const clusterA = getHexesInRadius(0, 0, 1)
      const clusterB = getHexesInRadius(20, 10, 1) // ef=2 → center (20,10)

      const result = aggregateAllDetailToParent({
        hexes: [
          { q: 0, r: 0, terrain: 'plains' },
          { q: 10, r: 5, terrain: 'desert' },
          { q: 20, r: 0, terrain: 'grassland' },
        ],
        detailHexes: [
          ...clusterA.slice(0, 5).map((c) => ({ ...c, terrain: 'forest' })),
          ...clusterB.slice(0, 3).map((c) => ({ ...c, terrain: 'water' })),
        ],
        detailGridDensity: 7,
      })

      expect(result['0,0']?.terrain).toBe('forest')
      expect(result['10,5']).toBeUndefined() // desert=4 > water=3
      expect(result['20,0']).toBeUndefined() // no detail hexes near (40,0) cluster
    })

    it('Brixthane world: negative coordinates work correctly', () => {
      // Parent (-382,219) forest, ef=2 → cluster center (-764,438), radius=1
      const clusterCells = getHexesInRadius(-764, 438, 1)
      const result = aggregateDetailToParent(
        { q: -382, r: 219, terrain: 'forest' },
        {
          hexes: [{ q: -382, r: 219, terrain: 'forest' }],
          detailHexes: clusterCells.slice(0, 5).map((c) => ({ ...c, terrain: 'plains' })),
          detailGridDensity: 7,
        },
      )
      expect(result?.terrain).toBe('plains')
      expect(result?.q).toBe(-382)
      expect(result?.r).toBe(219)
    })

    it('density-19 map: cluster has 19 cells, ef=3', () => {
      // Parent (2,1) plains, ef=3 → cluster center (6,3), radius=2, 19 cells
      const clusterCells = getHexesInRadius(6, 3, 2)
      expect(clusterCells).toHaveLength(19)

      // Paint 12 of 19 as water → water wins
      const result = aggregateDetailToParent(
        { q: 2, r: 1, terrain: 'plains' },
        {
          hexes: [{ q: 2, r: 1, terrain: 'plains' }],
          detailHexes: clusterCells.slice(0, 12).map((c) => ({ ...c, terrain: 'water' })),
          detailGridDensity: 19,
        },
      )
      expect(result?.terrain).toBe('water')
    })

    it('detail hexes outside cluster boundaries are ignored', () => {
      // Parent (0,0) ef=2, cluster center (0,0), radius=1
      // Detail hex at (10,10) is far outside → treated as base terrain (no override)
      const result = aggregateDetailToParent(
        { q: 0, r: 0, terrain: 'plains' },
        {
          hexes: [{ q: 0, r: 0, terrain: 'plains' }],
          detailHexes: [{ q: 10, r: 10, terrain: 'forest' }],
          detailGridDensity: 7,
        },
      )
      // All 7 cluster cells use base "plains", forest at (10,10) is outside → no change
      expect(result).toBeNull()
    })

    it('batch aggregation performance: 5 parents computed quickly', () => {
      const hexes = Array.from({ length: 5 }, (_, i) => ({
        q: i * 20,
        r: 0,
        terrain: 'plains',
      }))
      const detailHexes = hexes.flatMap((h) => {
        const center = { q: h.q * 2, r: 0 }
        return getHexesInRadius(center.q, center.r, 1)
          .slice(0, 5)
          .map((c) => ({ ...c, terrain: 'forest' }))
      })

      const start = performance.now()
      const result = aggregateAllDetailToParent({ hexes, detailHexes, detailGridDensity: 7 })
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(50)
      expect(Object.keys(result)).toHaveLength(5)
      Object.values(result).forEach((h) => expect(h.terrain).toBe('forest'))
    })
  })

  describe('edge cases', () => {
    it('all cluster cells painted same terrain → clear winner', () => {
      const clusterCells = getHexesInRadius(0, 0, 1)
      const result = aggregateDetailToParent(
        { q: 0, r: 0, terrain: 'desert' },
        {
          hexes: [{ q: 0, r: 0, terrain: 'desert' }],
          detailHexes: clusterCells.map((c) => ({ ...c, terrain: 'tundra' })),
          detailGridDensity: 7,
        },
      )
      expect(result?.terrain).toBe('tundra')
    })

    it('single cluster cell painted (density-7, 1 of 7) → base terrain still wins', () => {
      const clusterCells = getHexesInRadius(0, 0, 1)
      const result = aggregateDetailToParent(
        { q: 0, r: 0, terrain: 'forest' },
        {
          hexes: [{ q: 0, r: 0, terrain: 'forest' }],
          detailHexes: [{ ...clusterCells[0], terrain: 'mountain' }],
          detailGridDensity: 7,
        },
      )
      // mountain=1, forest=6 → forest wins → no change
      expect(result).toBeNull()
    })

    it('no hexes in parent array → returns empty object', () => {
      expect(
        aggregateAllDetailToParent({
          hexes: [],
          detailHexes: [{ q: 0, r: 0, terrain: 'water' }],
          detailGridDensity: 7,
        }),
      ).toEqual({})
    })

    it('detail hexes belonging to different parents do not cross-contaminate', () => {
      // Parent A (0,0) cluster at (0,0); Parent B (5,0) cluster at (10,0)
      // Detail hex painted for A's cluster should only affect A
      const clusterA = getHexesInRadius(0, 0, 1)
      const clusterB = getHexesInRadius(10, 0, 1)

      const result = aggregateAllDetailToParent({
        hexes: [
          { q: 0, r: 0, terrain: 'plains' },
          { q: 5, r: 0, terrain: 'plains' },
        ],
        detailHexes: [
          ...clusterA.slice(0, 5).map((c) => ({ ...c, terrain: 'water' })),
          ...clusterB.slice(0, 2).map((c) => ({ ...c, terrain: 'water' })),
        ],
        detailGridDensity: 7,
      })

      expect(result['0,0']?.terrain).toBe('water') // 5 water, 2 plains → water wins
      expect(result['5,0']).toBeUndefined() // 2 water, 5 plains → plains wins → no change
    })
  })
})
