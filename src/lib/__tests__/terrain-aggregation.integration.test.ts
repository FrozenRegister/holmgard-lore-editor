import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  aggregateDetailToParent,
  aggregateAllDetailToParent,
} from '$lib/terrain-aggregation'

/**
 * Integration tests for parent-child hex terrain sync.
 * Simulates the complete e2e flow: user paints detail hexes, parent updates.
 */
describe('terrain-aggregation integration', () => {
  describe('real-world scenarios', () => {
    it('syncs parent hex when all detail hexes are painted to plains', () => {
      // Scenario: User has a parent hex. They zoom in and paint all detail hexes to plains.
      // Expected: Parent hex should auto-update to plains.

      const parent = {
        gridLevel: 'parent' as const,
        q: 10,
        r: 20,
        detailAnchorDQ: 5,
        detailAnchorDR: 3,
      }

      // Initially empty detail region
      let hexes: Array<{ q: number; r: number; terrain: string }> = [
        { q: 10, r: 20, terrain: 'mountain' }, // parent hex
      ]

      // User paints 9 detail hexes all to plains
      const detailRegion = [
        { q: 15, r: 22, terrain: 'plains' },
        { q: 15, r: 23, terrain: 'plains' },
        { q: 15, r: 24, terrain: 'plains' },
        { q: 16, r: 22, terrain: 'plains' },
        { q: 16, r: 23, terrain: 'plains' },
        { q: 16, r: 24, terrain: 'plains' },
        { q: 17, r: 22, terrain: 'plains' },
        { q: 17, r: 23, terrain: 'plains' },
        { q: 17, r: 24, terrain: 'plains' },
      ]

      hexes = [...hexes, ...detailRegion]

      const result = aggregateDetailToParent(parent, hexes)

      expect(result?.terrain).toBe('plains')
      expect(result?.q).toBe(10)
      expect(result?.r).toBe(20)
    })

    it('syncs parent hex when user mixes terrains (majority wins)', () => {
      // Scenario: User paints a mix of terrain types in the detail region.
      // Parent should reflect the majority.

      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 10,
        detailAnchorDR: 10,
      }

      const hexes = [
        { q: 0, r: 0, terrain: 'forest' }, // parent
        // Detail region: mostly grassland with some mountains
        { q: 10, r: 9, terrain: 'grassland' },
        { q: 10, r: 10, terrain: 'grassland' },
        { q: 10, r: 11, terrain: 'grassland' },
        { q: 11, r: 9, terrain: 'grassland' },
        { q: 11, r: 10, terrain: 'grassland' },
        { q: 11, r: 11, terrain: 'mountain' },
        { q: 12, r: 9, terrain: 'mountain' },
      ]

      const result = aggregateDetailToParent(parent, hexes)

      expect(result?.terrain).toBe('grassland') // 5 grassland vs 2 mountains
    })

    it('handles multiple parent hexes in same world map', () => {
      // Scenario: World map has 3 parent hexes. User edits 2 of them.
      // Only those 2 should update, the 3rd should remain unchanged.

      const hexMap = {
        hexes: [
          // Parent 1 with detail region painted to water
          { q: 0, r: 0, terrain: 'forest' }, // parent 1
          { q: 5, r: 4, terrain: 'water' },
          { q: 5, r: 5, terrain: 'water' },
          { q: 6, r: 4, terrain: 'water' },
          // Parent 2 with detail region painted to mountain
          { q: 50, r: 50, terrain: 'grassland' }, // parent 2
          { q: 110, r: 109, terrain: 'mountain' },
          { q: 110, r: 110, terrain: 'mountain' },
          { q: 111, r: 109, terrain: 'mountain' },
          // Parent 3: no edits
          { q: 100, r: 100, terrain: 'desert' }, // parent 3
        ],
        landmarks: [
          {
            gridLevel: 'parent' as const,
            q: 0,
            r: 0,
            detailAnchorDQ: 5,
            detailAnchorDR: 4,
          },
          {
            gridLevel: 'parent' as const,
            q: 50,
            r: 50,
            detailAnchorDQ: 60,
            detailAnchorDR: 59,
          },
          {
            gridLevel: 'parent' as const,
            q: 100,
            r: 100,
            detailAnchorDQ: 100,
            detailAnchorDR: 100,
          },
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(result['0,0']?.terrain).toBe('water')
      expect(result['50,50']?.terrain).toBe('mountain')
      expect(result['100,100']).toBeUndefined() // Not in result, unchanged
    })

    it('gracefully handles negative coordinates (Marinth world)', () => {
      // Scenario: workingMap.json uses negative coordinates (Marinth world).
      // Aggregation should work correctly with negative q/r values.

      const parent = {
        gridLevel: 'parent' as const,
        q: -382,
        r: 219,
        detailAnchorDQ: 1,
        detailAnchorDR: -1,
      }

      const hexes = [
        { q: -382, r: 219, terrain: 'forest' }, // parent
        { q: -381, r: 218, terrain: 'plains' },
        { q: -381, r: 219, terrain: 'plains' },
        { q: -381, r: 220, terrain: 'plains' },
      ]

      const result = aggregateDetailToParent(parent, hexes)

      expect(result?.terrain).toBe('plains')
      expect(result?.q).toBe(-382)
      expect(result?.r).toBe(219)
    })

    it('handles terrain change over time (user paints progressively)', () => {
      // Scenario: User gradually paints detail hexes.
      // After each phase of painting, parent updates to reflect current majority.

      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 10,
        detailAnchorDR: 10,
      }

      // Phase 1: User paints 3 hexes to plains
      let hexes = [
        { q: 0, r: 0, terrain: 'water' }, // parent initially water
        { q: 10, r: 9, terrain: 'plains' },
        { q: 10, r: 10, terrain: 'plains' },
        { q: 11, r: 10, terrain: 'plains' },
      ]

      let result = aggregateDetailToParent(parent, hexes)
      expect(result?.terrain).toBe('plains') // 3 plains

      // Phase 2: User paints 3 more to water (now 3-3 tie)
      hexes = [
        ...hexes,
        { q: 11, r: 11, terrain: 'water' },
        { q: 12, r: 10, terrain: 'water' },
        { q: 12, r: 11, terrain: 'water' },
      ]

      result = aggregateDetailToParent(parent, hexes)
      // Tie: 3 plains, 3 water - majority returns first in sorted order (plains wins alphabetically? or first in array?)
      // Looking at implementation: sort by count desc, then by array order
      expect(['plains', 'water']).toContain(result?.terrain)

      // Phase 3: User continues and adds 2 more water hexes (now 3 plains, 5 water)
      hexes = [
        ...hexes,
        { q: 12, r: 9, terrain: 'water' },
        { q: 13, r: 10, terrain: 'water' },
      ]

      result = aggregateDetailToParent(parent, hexes)
      expect(result?.terrain).toBe('water') // 3 plains vs 5 water
    })

    it('batch aggregates multiple parents efficiently', () => {
      // Scenario: User edits a large region with many parent hexes.
      // System should efficiently re-compute all parents in one pass.

      const hexMap = {
        hexes: Array.from({ length: 100 }, (_, i) => ({
          q: Math.floor(i / 10) * 10,
          r: (i % 10) * 11,
          terrain: Math.random() > 0.5 ? 'forest' : 'grassland',
        })),
        landmarks: Array.from({ length: 5 }, (_, p) => ({
          gridLevel: 'parent' as const,
          q: p * 50,
          r: p * 50,
          detailAnchorDQ: p * 10,
          detailAnchorDR: p * 11,
        })),
      }

      const start = performance.now()
      const result = aggregateAllDetailToParent(hexMap)
      const elapsed = performance.now() - start

      // Should complete quickly (< 50ms for this data size)
      expect(elapsed).toBeLessThan(50)

      // Should have results for parents that have hexes in their regions
      expect(Object.keys(result).length).toBeGreaterThan(0)
      expect(Object.keys(result).length).toBeLessThanOrEqual(5)
    })

    it('verifies parent hex ownership via anchor region', () => {
      // Scenario: Verify that a detail hex belongs to the correct parent
      // (not to a nearby parent with a different anchor).

      const hexMap = {
        hexes: [
          { q: 0, r: 0, terrain: 'plains' },
          { q: 100, r: 100, terrain: 'forest' },
          // Detail hexes around (5, 5) should belong to parent 1, not parent 2
          { q: 5, r: 5, terrain: 'water' },
          { q: 5, r: 6, terrain: 'water' },
        ],
        landmarks: [
          {
            gridLevel: 'parent' as const,
            q: 0,
            r: 0,
            detailAnchorDQ: 5,
            detailAnchorDR: 5,
          },
          {
            gridLevel: 'parent' as const,
            q: 100,
            r: 100,
            detailAnchorDQ: 200,
            detailAnchorDR: 200,
          },
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      // Only parent 1 should have detail hexes in its region
      expect(result['0,0']?.terrain).toBe('water')
      expect(result['100,100']).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles single-hex detail region (minimum size)', () => {
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 100,
        detailAnchorDR: 100,
      }

      const hexes = [
        { q: 0, r: 0, terrain: 'forest' },
        { q: 100, r: 100, terrain: 'mountain' }, // only detail hex in anchor region
      ]

      const result = aggregateDetailToParent(parent, hexes)

      expect(result?.terrain).toBe('mountain')
    })

    it('handles large detail region (max practical size)', () => {
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 50,
        detailAnchorDR: 50,
      }

      // Create a large region (500+ hexes in a grid)
      const hexes = []
      for (let q = 46; q <= 54; q++) {
        for (let r = 46; r <= 54; r++) {
          hexes.push({ q, r, terrain: q + r > 100 ? 'water' : 'forest' })
        }
      }

      const result = aggregateDetailToParent(parent, hexes)

      expect(result).not.toBeNull()
      expect(['water', 'forest']).toContain(result?.terrain)
    })

    it('ignores non-parent landmarks', () => {
      const hexMap = {
        hexes: [{ q: 5, r: 5, terrain: 'plains' }],
        landmarks: [
          { gridLevel: 'detail' as const, q: 5, r: 5 },
          { gridLevel: 'detail' as const, q: 6, r: 5 },
          // No parent landmarks
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(Object.keys(result).length).toBe(0)
    })
  })
})
