/**
 * Parent-child hex terrain synchronization for workingMap.json
 *
 * This module aggregates detail hex terrain back to parent hexes when child
 * hexes are painted. It works with game.js's flat hex array + landmarks system.
 */

interface Hex {
  q: number
  r: number
  terrain: string
}

interface Landmark {
  gridLevel: 'parent' | 'detail'
  q: number
  r: number
  detailAnchorDQ?: number
  detailAnchorDR?: number
  [key: string]: unknown
}

interface HexMap {
  hexes: Hex[]
  landmarks?: Landmark[]
}

/**
 * Count terrain type occurrences in a list of hexes, return the most common.
 * Ties go to the first (by count order) terrain type.
 */
function getMajorityTerrain(hexes: Hex[]): string {
  if (hexes.length === 0) return 'water'

  const counts: Record<string, number> = {}
  for (const hex of hexes) {
    counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? 'water'
}

/**
 * Find all detail hexes in a parent landmark's anchor region.
 * The anchor region is a square grid of hexes centered at (parent.q + dQ, parent.r + dR).
 * For now, assume a fixed radius of ~4 hexes in each direction (adjustable).
 */
function findDetailHexesInRegion(
  hexes: Hex[],
  parentLandmark: Landmark,
  regionRadius = 4,
): Hex[] {
  const dQ = parentLandmark.detailAnchorDQ ?? 0
  const dR = parentLandmark.detailAnchorDR ?? 0
  const centerQ = parentLandmark.q + dQ
  const centerR = parentLandmark.r + dR

  const minQ = centerQ - regionRadius
  const maxQ = centerQ + regionRadius
  const minR = centerR - regionRadius
  const maxR = centerR + regionRadius

  return hexes.filter((h) => h.q >= minQ && h.q <= maxQ && h.r >= minR && h.r <= maxR)
}

/**
 * Find the parent landmark that owns a given detail hex (by anchor region).
 */
function findParentForDetailHex(
  detailHex: Hex,
  landmarks: Landmark[],
  regionRadius = 4,
): Landmark | null {
  for (const landmark of landmarks) {
    if (landmark.gridLevel !== 'parent') continue

    const dQ = landmark.detailAnchorDQ ?? 0
    const dR = landmark.detailAnchorDR ?? 0
    const centerQ = landmark.q + dQ
    const centerR = landmark.r + dR

    const minQ = centerQ - regionRadius
    const maxQ = centerQ + regionRadius
    const minR = centerR - regionRadius
    const maxR = centerR + regionRadius

    if (
      detailHex.q >= minQ && detailHex.q <= maxQ &&
      detailHex.r >= minR && detailHex.r <= maxR
    ) {
      return landmark
    }
  }

  return null
}

/**
 * Aggregate detail hex terrain to a parent hex.
 * Finds all detail hexes in the parent's anchor region, computes majority terrain,
 * and returns a new hex object with the aggregated terrain.
 *
 * Returns null if the parent landmark can't be found or has no detail hexes.
 */
export function aggregateDetailToParent(
  parentLandmark: Landmark,
  hexes: Hex[],
): Hex | null {
  const detailHexes = findDetailHexesInRegion(hexes, parentLandmark)

  if (detailHexes.length === 0) {
    return null
  }

  const majorityTerrain = getMajorityTerrain(detailHexes)

  return {
    q: parentLandmark.q,
    r: parentLandmark.r,
    terrain: majorityTerrain,
  }
}

/**
 * Aggregate all detail-region changes up to their parent hexes.
 * Returns a map of parent hex coordinate keys to updated hex objects.
 *
 * Call this after detail hexes are painted to sync the parent layer.
 */
export function aggregateAllDetailToParent(hexMap: HexMap): Record<string, Hex> {
  if (!hexMap.hexes || !Array.isArray(hexMap.hexes)) return {}
  if (!hexMap.landmarks || !Array.isArray(hexMap.landmarks)) return {}

  const parentLandmarks = hexMap.landmarks.filter((l) => l.gridLevel === 'parent')
  const updates: Record<string, Hex> = {}

  for (const parentLandmark of parentLandmarks) {
    const aggregated = aggregateDetailToParent(parentLandmark, hexMap.hexes)
    if (aggregated) {
      const key = `${aggregated.q},${aggregated.r}`
      updates[key] = aggregated
    }
  }

  return updates
}

/**
 * Expose aggregation API to window for the JS patch to call.
 */
export function exposeAggregationAPI(): void {
  if (typeof window !== 'undefined') {
    (window as any).TerrainAggregation = {
      getMajorityTerrain,
      findParentForDetailHex,
      aggregateDetailToParent,
      aggregateAllDetailToParent,
    }
  }
}
