/**
 * Pure logic for the hierarchical hex world-map editor.
 * No DOM, no Svelte stores — safe to unit-test in Vitest.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Overlay {
  type: string
  data?: Record<string, unknown>
}

export interface Tile {
  terrain: string
  elevation: number
  overlays: Overlay[]
  label: string | null
  lore_key: string | null
  features: string[]
}

export interface WorldMap {
  id: string
  level: string
  name: string
  parent: string | null
  bounds: { qmin: number; qmax: number; rmin: number; rmax: number }
  tiles: Record<string, Tile>
  children: string[]
  seed: number
  wraps?: { east_west?: boolean }
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const HEX_SIZE = 26
export const ROOT_ID = 'world:continents'
export const TERRAIN_OPTIONS = ['grassland', 'forest', 'mountain', 'water', 'desert', 'tundra']

// ── Perlin noise (deterministic) ───────────────────────────────────────────────

export class PerlinNoise {
  p: number[]
  constructor(seed = 0) {
    const perm = Array.from({ length: 256 }, (_, i) => i)
    let s = seed
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]]
    }
    this.p = [...perm, ...perm]
  }
  private fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
  private lerp(t: number, a: number, b: number) { return a + t * (b - a) }
  private grad(h: number, x: number, y: number) {
    const hh = h & 15
    const u = hh < 8 ? x : y
    const v = hh < 8 ? y : x
    return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v)
  }
  noise(x: number, y: number) {
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = this.fade(xf)
    const v = this.fade(yf)
    const aa = this.p[this.p[xi] + yi]
    const ab = this.p[this.p[xi] + yi + 1]
    const ba = this.p[this.p[xi + 1] + yi]
    const bb = this.p[this.p[xi + 1] + yi + 1]
    const x1 = this.lerp(u, this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf))
    const x2 = this.lerp(u, this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1))
    return this.lerp(v, x1, x2)
  }
}

// ── Hash ───────────────────────────────────────────────────────────────────────

export function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

// ── Tile generation ────────────────────────────────────────────────────────────

export function generateTiles(
  map: WorldMap,
  scale: number,
  waterT: number,
  mtnT: number,
  forestT: number,
): void {
  const noise = new PerlinNoise(map.seed)
  const { qmin, qmax, rmin, rmax } = map.bounds
  for (let q = qmin; q <= qmax; q++) {
    for (let r = rmin; r <= rmax; r++) {
      const val = noise.noise(q / scale, r / scale)
      let terrain = 'grassland'
      if (val < waterT) terrain = 'water'
      else if (val > mtnT) terrain = 'mountain'
      else if (val > forestT) terrain = 'forest'
      map.tiles[`${q},${r}`] = {
        terrain,
        elevation: Math.max(0, Math.floor((val + 1) * 5)),
        overlays: [],
        label: null,
        lore_key: null,
        features: [],
      }
    }
  }
}

// ── World initialisation ───────────────────────────────────────────────────────

export function initializeWorld(): Record<string, WorldMap> {
  const root: WorldMap = {
    id: ROOT_ID,
    level: 'continents',
    name: 'World Continents',
    parent: null,
    bounds: { qmin: 0, qmax: 100, rmin: 0, rmax: 80 },
    tiles: {},
    children: [],
    seed: (Math.random() * 1e6) | 0,
    wraps: { east_west: true },
  }
  generateTiles(root, 20, -0.3, 0.4, 0.1)
  return { [ROOT_ID]: root }
}

// ── Child region creation ──────────────────────────────────────────────────────

/**
 * Pure child-region factory. Returns `{ maps, id }` with parent.children
 * updated, or null if the id is already taken.
 */
export function createChildRegion(
  name: string,
  level: string,
  width: number,
  height: number,
  parentId: string,
  maps: Record<string, WorldMap>,
): { maps: Record<string, WorldMap>; id: string } | null {
  const id = `${parentId}:${name.toLowerCase().replace(/\s+/g, '-')}`
  if (maps[id]) return null

  const child: WorldMap = {
    id,
    level,
    name,
    parent: parentId,
    bounds: { qmin: 0, qmax: width - 1, rmin: 0, rmax: height - 1 },
    tiles: {},
    children: [],
    seed: hashString(name),
  }
  generateTiles(child, 15, -0.2, 0.3, 0.05)

  const parent = maps[parentId]
  const updatedParent = parent
    ? { ...parent, children: [...parent.children, id] }
    : undefined

  return {
    maps: {
      ...maps,
      [id]: child,
      ...(updatedParent ? { [parentId]: updatedParent } : {}),
    },
    id,
  }
}

// ── Hex geometry ───────────────────────────────────────────────────────────────

export function hexToPixel(q: number, r: number, map: WorldMap): { x: number; y: number } {
  let aq = q
  if (map.wraps?.east_west) {
    const w = map.bounds.qmax - map.bounds.qmin + 1
    aq = (((q - map.bounds.qmin) % w) + w) % w + map.bounds.qmin
  }
  // Pointy-top hexes in offset rows → rectangular map (Civ V style).
  const colW = Math.sqrt(3) * HEX_SIZE   // column spacing (flat-to-flat width)
  const rowH = 1.5 * HEX_SIZE            // row spacing
  const oddRow = (((r - map.bounds.rmin) % 2) + 2) % 2   // 0 even, 1 odd
  return {
    x: colW * (aq - map.bounds.qmin) + oddRow * (colW / 2) + HEX_SIZE * 2,
    y: rowH * (r - map.bounds.rmin) + HEX_SIZE * 2,
  }
}

export function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6   // +30° → pointy-top orientation
    pts.push(`${cx + HEX_SIZE * Math.cos(a)},${cy + HEX_SIZE * Math.sin(a)}`)
  }
  return pts.join(' ')
}

// ── Markdown wrapping ──────────────────────────────────────────────────────────

export function wrapMarkdown(map: WorldMap): string {
  return `# Map: ${map.name}\n\n_${map.level} · ${Object.keys(map.tiles).length} tiles_\n\n\`\`\`json\n${JSON.stringify(map, null, 2)}\n\`\`\`\n`
}

export function unwrapMarkdown(text: string): WorldMap | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/)
  const raw = fence ? fence[1] : text
  try { return JSON.parse(raw) as WorldMap } catch { return null }
}

// ── Aggregation helpers ────────────────────────────────────────────────────────

export function majorityTerrain(tiles: Tile[]): string {
  if (tiles.length === 0) return 'grassland'
  const counts: Record<string, number> = {}
  for (const t of tiles) counts[t.terrain] = (counts[t.terrain] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

export function averageElevation(tiles: Tile[]): number {
  if (tiles.length === 0) return 0
  return Math.round(tiles.reduce((s, t) => s + t.elevation, 0) / tiles.length)
}

export function unionOverlays(tiles: Tile[]): Overlay[] {
  const seen = new Set<string>()
  const result: Overlay[] = []
  for (const t of tiles) {
    for (const o of t.overlays) {
      if (!seen.has(o.type)) {
        seen.add(o.type)
        result.push(o)
      }
    }
  }
  return result
}

/**
 * Recomputes the parent-map tile that represents `childId`.
 * Looks for an anchor tile with `lore_key === 'map:<childId>'`; falls back to
 * the center of the parent's bounds. Returns updated maps, or null if
 * child/parent can't be found or child has no tiles.
 */
export function aggregateChildToParent(
  childId: string,
  maps: Record<string, WorldMap>,
): Record<string, WorldMap> | null {
  const child = maps[childId]
  if (!child?.parent) return null
  const parent = maps[child.parent]
  if (!parent) return null

  const childTiles = Object.values(child.tiles)
  if (childTiles.length === 0) return null

  const terrain = majorityTerrain(childTiles)
  const elevation = averageElevation(childTiles)
  const overlays = unionOverlays(childTiles)

  const anchorKey =
    Object.keys(parent.tiles).find((k) => parent.tiles[k].lore_key === 'map:' + childId) ??
    (() => {
      const cq = Math.floor((parent.bounds.qmin + parent.bounds.qmax) / 2)
      const cr = Math.floor((parent.bounds.rmin + parent.bounds.rmax) / 2)
      return `${cq},${cr}`
    })()

  if (!parent.tiles[anchorKey]) return null

  return {
    ...maps,
    [child.parent]: {
      ...parent,
      tiles: {
        ...parent.tiles,
        [anchorKey]: { ...parent.tiles[anchorKey], terrain, elevation, overlays },
      },
    },
  }
}

// ── Bounds overlap ─────────────────────────────────────────────────────────────

export function boundsOverlap(
  a: WorldMap['bounds'],
  b: WorldMap['bounds'],
): boolean {
  return a.qmin <= b.qmax && a.qmax >= b.qmin && a.rmin <= b.rmax && a.rmax >= b.rmin
}

// ── Region expansion ───────────────────────────────────────────────────────────

export interface BoundsConflict {
  overlaps: string[]
}

export interface ExpandResult {
  map: WorldMap
  conflict?: BoundsConflict
}

/**
 * Grows `mapId`'s bounds by `n` hexes in direction `dir`, generating new tiles
 * for the added strip. Returns the expanded map (with conflict info if any
 * sibling bounds overlap). Returns null when `mapId` is unknown.
 */
export function expandRegion(
  mapId: string,
  dir: 'N' | 'S' | 'E' | 'W',
  maps: Record<string, WorldMap>,
  n = 5,
): ExpandResult | null {
  const map = maps[mapId]
  if (!map) return null

  const { qmin, qmax, rmin, rmax } = map.bounds
  let newBounds: WorldMap['bounds']
  switch (dir) {
    case 'N': newBounds = { qmin, qmax, rmin: rmin - n, rmax }; break
    case 'S': newBounds = { qmin, qmax, rmin, rmax: rmax + n }; break
    case 'W': newBounds = { qmin: qmin - n, qmax, rmin, rmax }; break
    case 'E': newBounds = { qmin, qmax: qmax + n, rmin, rmax }; break
    default: return null
  }

  const newTiles: Record<string, Tile> = { ...map.tiles }
  const noise = new PerlinNoise(map.seed)
  for (let q = newBounds.qmin; q <= newBounds.qmax; q++) {
    for (let r = newBounds.rmin; r <= newBounds.rmax; r++) {
      const key = `${q},${r}`
      if (!newTiles[key]) {
        const val = noise.noise(q / 15, r / 15)
        let terrain = 'grassland'
        if (val < -0.2) terrain = 'water'
        else if (val > 0.3) terrain = 'mountain'
        else if (val > 0.05) terrain = 'forest'
        newTiles[key] = {
          terrain,
          elevation: Math.max(0, Math.floor((val + 1) * 5)),
          overlays: [],
          label: null,
          lore_key: null,
          features: [],
        }
      }
    }
  }

  const expandedMap: WorldMap = { ...map, bounds: newBounds, tiles: newTiles }

  if (map.parent) {
    const parent = maps[map.parent]
    const conflicting = (parent?.children ?? [])
      .filter((c) => c !== mapId)
      .filter((c) => maps[c] && boundsOverlap(newBounds, maps[c].bounds))
    if (conflicting.length > 0) {
      return { map: expandedMap, conflict: { overlaps: conflicting } }
    }
  }

  return { map: expandedMap }
}

// ── Region merge ───────────────────────────────────────────────────────────────

/**
 * Unions two sibling regions' bounds and tiles (geography only; overlay
 * ownership is preserved as-is from each tile). `mapId` absorbs `siblingId`;
 * `siblingId` is removed from the world and from the parent's children list.
 * Returns null when the pair isn't valid siblings.
 */
export function mergeRegions(
  mapId: string,
  siblingId: string,
  maps: Record<string, WorldMap>,
): Record<string, WorldMap> | null {
  const a = maps[mapId]
  const b = maps[siblingId]
  if (!a || !b || a.parent !== b.parent) return null

  const merged: WorldMap = {
    ...a,
    bounds: {
      qmin: Math.min(a.bounds.qmin, b.bounds.qmin),
      qmax: Math.max(a.bounds.qmax, b.bounds.qmax),
      rmin: Math.min(a.bounds.rmin, b.bounds.rmin),
      rmax: Math.max(a.bounds.rmax, b.bounds.rmax),
    },
    // a's tiles take precedence when both cover the same key
    tiles: { ...b.tiles, ...a.tiles },
    children: [...new Set([...a.children, ...b.children])],
  }

  const result: Record<string, WorldMap> = { ...maps, [mapId]: merged }
  delete result[siblingId]

  if (a.parent && maps[a.parent]) {
    result[a.parent] = {
      ...maps[a.parent],
      children: maps[a.parent].children.filter((c) => c !== siblingId),
    }
  }

  return result
}
