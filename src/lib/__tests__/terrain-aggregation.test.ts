import { describe, it, expect } from 'vitest'
import {
  aggregateDetailToParent,
  aggregateAllDetailToParent,
} from '$lib/terrain-aggregation'

describe('terrain-aggregation', () => {
  describe('aggregateDetailToParent', () => {
    it('returns null if no detail hexes in anchor region', () => {
      const hexes = [{ q: 0, r: 0, terrain: 'water' }]
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 10,
        detailAnchorDR: 10,
      }

      const result = aggregateDetailToParent(parent, hexes)

      expect(result).toBeNull()
    })

    it('computes majority terrain from detail hexes', () => {
      const hexes = [
        { q: 11, r: 9, terrain: 'plains' },
        { q: 11, r: 10, terrain: 'plains' },
        { q: 12, r: 10, terrain: 'plains' },
        { q: 11, r: 11, terrain: 'mountain' },
        { q: 12, r: 11, terrain: 'mountain' },
      ]
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 11,
        detailAnchorDR: 10,
      }

      const result = aggregateDetailToParent(parent, hexes)

      expect(result).not.toBeNull()
      expect(result?.terrain).toBe('plains') // 3 plains vs 2 mountains
      expect(result?.q).toBe(0)
      expect(result?.r).toBe(0)
    })

    it('handles all hexes being the same terrain', () => {
      const hexes = [
        { q: 11, r: 9, terrain: 'water' },
        { q: 11, r: 10, terrain: 'water' },
        { q: 12, r: 10, terrain: 'water' },
      ]
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 11,
        detailAnchorDR: 10,
      }

      const result = aggregateDetailToParent(parent, hexes)

      expect(result?.terrain).toBe('water')
    })

    it('handles single detail hex', () => {
      const hexes = [{ q: 11, r: 10, terrain: 'forest' }]
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 11,
        detailAnchorDR: 10,
      }

      const result = aggregateDetailToParent(parent, hexes)

      expect(result?.terrain).toBe('forest')
    })

    it('uses default anchor values when detailAnchorDQ/DR not set', () => {
      const hexes = [{ q: 0, r: 0, terrain: 'mountain' }]
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
      }

      const result = aggregateDetailToParent(parent, hexes)

      expect(result?.terrain).toBe('mountain')
    })

    it('filters hexes outside anchor region radius', () => {
      const hexes = [
        { q: 11, r: 10, terrain: 'plains' }, // in region
        { q: 12, r: 10, terrain: 'plains' }, // in region
        { q: 100, r: 100, terrain: 'water' }, // outside region
      ]
      const parent = {
        gridLevel: 'parent' as const,
        q: 0,
        r: 0,
        detailAnchorDQ: 11,
        detailAnchorDR: 10,
      }

      const result = aggregateDetailToParent(parent, hexes)

      // Should only count the 2 in-region plains hexes, ignore the water hex
      expect(result?.terrain).toBe('plains')
    })
  })

  describe('aggregateAllDetailToParent', () => {
    it('returns empty object if no hexes', () => {
      const hexMap = {
        hexes: [],
        landmarks: [],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(result).toEqual({})
    })

    it('returns empty object if no landmarks', () => {
      const hexMap = {
        hexes: [{ q: 0, r: 0, terrain: 'water' }],
        landmarks: [],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(result).toEqual({})
    })

    it('returns empty object if no parent landmarks', () => {
      const hexMap = {
        hexes: [{ q: 0, r: 0, terrain: 'water' }],
        landmarks: [
          {
            gridLevel: 'detail' as const,
            q: 0,
            r: 0,
          },
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(result).toEqual({})
    })

    it('aggregates multiple parents independently', () => {
      const hexMap = {
        hexes: [
          // Parent 1's detail region (anchor 11, 10, center at 0+11, 0+10)
          { q: 11, r: 9, terrain: 'plains' },
          { q: 11, r: 10, terrain: 'plains' },
          { q: 12, r: 10, terrain: 'plains' },
          // Parent 2's detail region (anchor 100, 100, center at 100+100, 100+100)
          { q: 200, r: 198, terrain: 'mountain' },
          { q: 200, r: 199, terrain: 'mountain' },
          { q: 201, r: 199, terrain: 'forest' }, // minority
        ],
        landmarks: [
          {
            gridLevel: 'parent' as const,
            q: 0,
            r: 0,
            detailAnchorDQ: 11,
            detailAnchorDR: 10,
          },
          {
            gridLevel: 'parent' as const,
            q: 100,
            r: 100,
            detailAnchorDQ: 100,
            detailAnchorDR: 99,
          },
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(result['0,0']?.terrain).toBe('plains')
      expect(result['100,100']?.terrain).toBe('mountain')
      expect(Object.keys(result).length).toBe(2)
    })

    it('skips parents with no detail hexes in region', () => {
      const hexMap = {
        hexes: [
          // Only detail hexes for parent 1, none for parent 2
          { q: 11, r: 10, terrain: 'plains' },
        ],
        landmarks: [
          {
            gridLevel: 'parent' as const,
            q: 0,
            r: 0,
            detailAnchorDQ: 11,
            detailAnchorDR: 10,
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

      expect(result['0,0']?.terrain).toBe('plains')
      expect(result['100,100']).toBeUndefined()
      expect(Object.keys(result).length).toBe(1)
    })

    it('handles large hexmap with mixed terrain types', () => {
      const hexMap = {
        hexes: Array.from({ length: 20 }, (_, i) => ({
          q: 11 + Math.floor(i / 5),
          r: 10 + (i % 5),
          terrain: i < 12 ? 'grassland' : 'water',
        })),
        landmarks: [
          {
            gridLevel: 'parent' as const,
            q: 0,
            r: 0,
            detailAnchorDQ: 11,
            detailAnchorDR: 10,
          },
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(result['0,0']).toBeDefined()
      expect(result['0,0']?.terrain).toBe('grassland') // 12 grassland vs 8 water
    })

    it('filters out non-parent landmarks', () => {
      const hexMap = {
        hexes: [{ q: 11, r: 10, terrain: 'mountain' }],
        landmarks: [
          {
            gridLevel: 'detail' as const,
            q: 11,
            r: 10,
          },
          {
            gridLevel: 'parent' as const,
            q: 0,
            r: 0,
            detailAnchorDQ: 11,
            detailAnchorDR: 10,
          },
          {
            gridLevel: 'detail' as const,
            q: 50,
            r: 50,
          },
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      // Should only process the parent landmark, ignore detail landmarks
      expect(Object.keys(result).length).toBe(1)
      expect(result['0,0']?.terrain).toBe('mountain')
    })

    it('matches coordinate key format "q,r"', () => {
      const hexMap = {
        hexes: [{ q: -382, r: 219, terrain: 'plains' }],
        landmarks: [
          {
            gridLevel: 'parent' as const,
            q: -382,
            r: 219,
            detailAnchorDQ: 1,
            detailAnchorDR: -1,
          },
        ],
      }

      const result = aggregateAllDetailToParent(hexMap)

      expect(result['-382,219']).toBeDefined()
      expect(result['-382,219']?.q).toBe(-382)
      expect(result['-382,219']?.r).toBe(219)
    })
  })
})
