/**
 * Hex Map Utilities
 * Point-in-polygon lookup, terrain generation, and coordinate conversion
 * for boundary-based Earth map rendering
 */

import type { CoastlineMap, Hex } from '$lib/types';

/**
 * Point-in-polygon test using ray casting algorithm
 * Tests if a hex center (converted to lat/lon) is inside any coastline polygon
 */
export function isInsideCoastline(
  q: number,
  r: number,
  coastlines: CoastlineMap | null | undefined,
  scale: number = 1.3
): boolean {
  if (!coastlines?.features?.length) return false;

  const { lat, lon } = axialToLatLon(q, r, scale);

  for (const feature of coastlines.features) {
    if (
      feature.geometry?.type === 'Polygon' &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      if (pointInPolygon(lat, lon, ring)) {
        return true;
      }
    } else if (
      feature.geometry?.type === 'MultiPolygon' &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      for (const polygon of feature.geometry.coordinates) {
        const ring = polygon[0] as [number, number][];
        if (pointInPolygon(lat, lon, ring)) {
          return true;
        }
      }
    }
  }

  return false;
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
  const lat = (r - q / 2) / (-scale);
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
  if (absLat <= 23.5) return 'tropical';

  return 'grassland';
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
