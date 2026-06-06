import type { Hex } from '$lib/types'

// Maps detailGridDensity → edge factor (detail grid scale multiplier relative to parent grid)
const DETAIL_GRID_EDGE_FACTORS: Record<number, number> = {
  7: 2,
  19: 3,
  37: 4,
}

const DEFAULT_DENSITY = 7

export type MinimalHex = Pick<Hex, 'q' | 'r' | 'terrain'>

export interface HexMapData {
  hexes: MinimalHex[]
  detailHexes?: MinimalHex[]
  detailGridDensity?: number
}

function getEdgeFactor(density: number | undefined): number {
  return DETAIL_GRID_EDGE_FACTORS[density ?? DEFAULT_DENSITY] ?? 2
}

// Returns all hexes within `radius` axial steps of (cq, cr), including center.
// Matches game.js getHexesInRadius (non-dungeon mode).
export function getHexesInRadius(
  cq: number,
  cr: number,
  radius: number,
): Array<{ q: number; r: number }> {
  const hexes: Array<{ q: number; r: number }> = [{ q: cq, r: cr }]
  for (let dq = -radius; dq <= radius; dq++) {
    const drMin = Math.max(-radius, -dq - radius)
    const drMax = Math.min(radius, -dq + radius)
    for (let dr = drMin; dr <= drMax; dr++) {
      if (dq === 0 && dr === 0) continue
      hexes.push({ q: cq + dq, r: cr + dr })
    }
  }
  return hexes
}

// Compute the display terrain for a single parent hex.
// Mirrors game.js getParentHexDisplayTerrainSummary exactly:
// - cluster center = (parentQ * ef, parentR * ef)
// - each cluster cell uses detail terrain if defined, else falls back to baseTerrain
// - majority wins; on tie prefer baseTerrain, then alphabetical
export function computeParentDisplayTerrain(
  parentQ: number,
  parentR: number,
  baseTerrain: string,
  detailHexMap: Map<string, string>,
  edgeFactor: number,
): string {
  const clusterCenterQ = parentQ * edgeFactor
  const clusterCenterR = parentR * edgeFactor
  const clusterRadius = edgeFactor - 1
  const clusterCells = getHexesInRadius(clusterCenterQ, clusterCenterR, clusterRadius)

  const terrainCounts = new Map<string, number>()
  for (const cell of clusterCells) {
    const terrain = detailHexMap.get(`${cell.q},${cell.r}`) ?? baseTerrain
    terrainCounts.set(terrain, (terrainCounts.get(terrain) ?? 0) + 1)
  }

  let maxCount = 0
  let tiedTerrains: string[] = []
  terrainCounts.forEach((count, terrain) => {
    if (count > maxCount) {
      maxCount = count
      tiedTerrains = [terrain]
    } else if (count === maxCount) {
      tiedTerrains.push(terrain)
    }
  })

  if (tiedTerrains.length === 0) return baseTerrain
  if (tiedTerrains.length === 1) return tiedTerrains[0]
  if (tiedTerrains.includes(baseTerrain)) return baseTerrain
  tiedTerrains.sort()
  return tiedTerrains[0]
}

// Aggregate one parent hex given a map. Returns null if terrain would not change.
export function aggregateDetailToParent(parentHex: MinimalHex, hexMap: HexMapData): Pick<Hex, 'q' | 'r' | 'terrain'> | null {
  if (!hexMap.detailHexes?.length) return null

  const edgeFactor = getEdgeFactor(hexMap.detailGridDensity)
  const detailHexMap = new Map<string, string>(
    hexMap.detailHexes.map((h) => [`${h.q},${h.r}`, h.terrain]),
  )

  const displayTerrain = computeParentDisplayTerrain(
    parentHex.q,
    parentHex.r,
    parentHex.terrain,
    detailHexMap,
    edgeFactor,
  )
  if (displayTerrain === parentHex.terrain) return null
  return { q: parentHex.q, r: parentHex.r, terrain: displayTerrain }
}

// Aggregate all parent hexes. Returns "q,r" → updated Hex for only changed parents.
export function aggregateAllDetailToParent(hexMap: HexMapData): Record<string, Pick<Hex, 'q' | 'r' | 'terrain'>> {
  if (!hexMap.hexes?.length || !hexMap.detailHexes?.length) return {}

  const edgeFactor = getEdgeFactor(hexMap.detailGridDensity)
  const detailHexMap = new Map<string, string>(
    hexMap.detailHexes.map((h) => [`${h.q},${h.r}`, h.terrain]),
  )

  const updates: Record<string, Pick<Hex, 'q' | 'r' | 'terrain'>> = {}
  for (const hex of hexMap.hexes) {
    if (!hex.terrain) continue
    const displayTerrain = computeParentDisplayTerrain(
      hex.q,
      hex.r,
      hex.terrain,
      detailHexMap,
      edgeFactor,
    )
    if (displayTerrain !== hex.terrain) {
      updates[`${hex.q},${hex.r}`] = { q: hex.q, r: hex.r, terrain: displayTerrain }
    }
  }
  return updates
}

// Expose API to window for the JS patch to call.
export function exposeAggregationAPI(): void {
  if (typeof window !== 'undefined') {
    ;(window as any).TerrainAggregation = {
      computeParentDisplayTerrain,
      aggregateDetailToParent,
      aggregateAllDetailToParent,
    }
  }
}
