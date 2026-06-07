/**
 * Hex Map Utilities
 * Point-in-polygon lookup, terrain generation, and coordinate conversion
 * for boundary-based Earth map rendering
 */

import type { CoastlineMap, Hex } from '$lib/types';

// Simple cache to avoid re-calculating ray-casting for static hexes
const COASTLINE_CACHE = new Map<string, boolean>();

/** 
 * Clear the coastline lookup cache. 
 * Useful when switching coastline maps or to free up memory.
 */
export function clearCoastlineCache(): void {
  COASTLINE_CACHE.clear();
}

function getBoundingBox(coords: [number, number][]) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

const MAX_CACHE_SIZE = 10000;

/**
 * Point-in-polygon test using ray casting algorithm
 * Tests if a hex center (converted to lat/lon) is inside any coastline polygon
 */
/**
 * Compute a stable identity hash for a coastline map so the cache
 * can distinguish between different coastline sets (e.g. a square
 * polygon vs. a multi-island set). Does NOT deep-compare every coordinate.
 */
function coastlineId(coastlines: CoastlineMap): string {
  const n = coastlines.features.length;
  const first = coastlines.features[0];
  const geom = first?.geometry;
  if (!geom || !Array.isArray(geom.coordinates)) return `f${n}`;

  // Dig into the first ring of the first polygon
  const ring: [number, number][] | undefined =
    geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates[0]?.[0])
      ? geom.coordinates[0][0] as [number, number][]
      : geom.coordinates[0] as [number, number][];

  if (!ring?.length) return `f${n}`;
  return `${n}:${geom.type}:${ring[0][0]?.toFixed(3)},${ring[0][1]?.toFixed(3)}-${ring[ring.length - 1][0]?.toFixed(3)},${ring[ring.length - 1][1]?.toFixed(3)}`;
}

export function isInsideCoastline(
  q: number,
  r: number,
  coastlines: CoastlineMap | null | undefined,
  scale: number = 1.3
): boolean {
  if (!coastlines?.features?.length) return false;
  
  // Check cache first — key now includes coastline identity
  const cacheKey = `${coastlineId(coastlines)}|${q},${r},${scale}`;
  if (COASTLINE_CACHE.has(cacheKey)) return COASTLINE_CACHE.get(cacheKey)!;

  const { lat, lon } = axialToLatLon(q, r, scale);

  let result = false;

  for (const feature of coastlines.features) {
    if (
      feature.geometry?.type === 'Polygon' &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      const bbox = getBoundingBox(ring);
      if (lon < bbox.minLon || lon > bbox.maxLon || lat < bbox.minLat || lat > bbox.maxLat) continue;

      if (pointInPolygon(lat, lon, ring)) {
        result = true;
        break;
      }
    } else if (
      feature.geometry?.type === 'MultiPolygon' &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      for (const polygon of feature.geometry.coordinates) {
        const ring = polygon[0] as [number, number][];
        const bbox = getBoundingBox(ring);
        if (lon < bbox.minLon || lon > bbox.maxLon || lat < bbox.minLat || lat > bbox.maxLat) continue;

        if (pointInPolygon(lat, lon, ring)) {
          result = true;
          break;
        }
      }
      if (result) break;
    }
  }

  // Prevent memory leaks by capping the cache size. 
  // If we hit the limit, we clear and start fresh.
  if (COASTLINE_CACHE.size >= MAX_CACHE_SIZE) {
    COASTLINE_CACHE.clear();
  }
  COASTLINE_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Ray casting point-in-polygon test
 * coords: array of [lon, lat] pairs forming a ring
 */
function pointInPolygon(
  lat: number,
  lon: number,
  coords: [number, number][]
): boolean {
  let inside = false;

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[j];

    const xi = lon1;
    const yi = lat1;
    const xj = lon2;
    const yj = lat2;

    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Convert axial hex coordinates to lat/lon
 */
export function axialToLatLon(
  q: number,
  r: number,
  scale: number = 1.3
): { lat: number; lon: number } {
  const lon = q / scale;
  const lat = (q / 2 - r) / scale;
  return { lat, lon };
}

/**
 * Convert lat/lon to axial hex coordinates
 */
export function latLonToAxial(
  lat: number,
  lon: number,
  scale: number = 1.3
): { q: number; r: number } {
  const q = Math.round(lon * scale);
  const r = Math.round(-lat * scale + q / 2);
  return { q, r };
}

/**
 * Terrain classification based on latitude
 */
export function getTerrainFromLatitude(lat: number): string {
  const absLat = Math.abs(lat);

  if (absLat > 66.5) return 'tundra';
  if (absLat > 55) return 'taiga';
  if (absLat > 23.5) return 'grassland';
  if (absLat > 0) return 'savanna';
  return 'tropical';
}

/**
 * Generate elevation from terrain type and latitude
 * Scale 0-10 for display purposes
 */
export function generateElevation(terrain: string, lat: number): number {
  const elevationMap: Record<string, [number, number]> = {
    tundra: [1, 3],
    taiga: [2, 4],
    grassland: [2, 4],
    savanna: [3, 5],
    tropical: [3, 5],
    grassland_s: [2, 4],
    taiga_s: [2, 4],
    tundra_s: [1, 3],
    mountain: [8, 10],
    peak: [9, 10],
    water: [0, 0],
  };

  const [min, max] = elevationMap[terrain] || [2, 4];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate procedural terrain for a hex based on latitude and noise
 * Used for hexes inside coastlines but not in explicit hex array
 */
export function generateProceduralHex(
  q: number,
  r: number,
  coastlines: CoastlineMap | null | undefined,
  scale: number = 1.3
): Hex {
  const { lat, lon } = axialToLatLon(q, r, scale);
  const terrain = getTerrainFromLatitude(lat);
  const elevation = generateElevation(terrain, lat);

  return {
    q,
    r,
    terrain,
    elevation,
    name: '',
    description: '',
    type: terrain,
    region: '',
    lat,
    lon,
  };
}

/**
 * Render priority lookup for a hex
 * 1. Check explicit hex array
 * 2. Check if inside coastline → procedural terrain
 * 3. Default to ocean
 */
export function getHexForRender(
  q: number,
  r: number,
  explicitHexes: Hex[],
  coastlines: CoastlineMap | null | undefined,
  scale: number = 1.3
): Hex {
  // Priority 1: explicit hex
  const explicit = explicitHexes.find((h) => h.q === q && h.r === r);
  if (explicit) return explicit;

  // Priority 2: inside coastline → procedural terrain
  if (isInsideCoastline(q, r, coastlines, scale)) {
    return generateProceduralHex(q, r, coastlines, scale);
  }

  // Priority 3: ocean
  const { lat, lon } = axialToLatLon(q, r, scale);
  return {
    q,
    r,
    terrain: 'water',
    elevation: 0,
    name: '',
    description: '',
    type: 'water',
    region: '',
    lat,
    lon,
  };
}
