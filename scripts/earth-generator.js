#!/usr/bin/env node

/**
 * Earth 996 AD Hex Map Generator
 * Converts lat/lon city coordinates to axial hex coordinates
 * Generates sparse HexMap JSON with boundary + city/landmark layers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  // Coordinate conversion scale (1 degree lat/lon ≈ 1.3 hex units)
  HEX_SCALE: 1.3,

  // World bounds in axial coordinates
  WORLD_BOUNDS: {
    q: [-180, 180],
    r: [-90, 90],
  },

  // Terrain classification based on latitude
  TERRAIN_BY_LAT: {
    tundra: { latRange: [66.5, 90], elevation: [1, 3] },
    taiga: { latRange: [55, 66.5], elevation: [2, 4] },
    grassland: { latRange: [23.5, 55], elevation: [2, 4] },
    savanna: { latRange: [0, 23.5], elevation: [3, 5] },
    tropical: { latRange: [-23.5, 0], elevation: [3, 5] },
    grassland_s: { latRange: [-55, -23.5], elevation: [2, 4] },
    taiga_s: { latRange: [-66.5, -55], elevation: [2, 4] },
    tundra_s: { latRange: [-90, -66.5], elevation: [1, 3] },
  },

  // City elevation adjustments
  ELEVATION_BY_CITY_TYPE: {
    mountain: [8, 10],
    peak: [8, 10],
    mountain_range: [6, 9],
    plateau: [5, 7],
    river: [0, 2],
    city: [1, 5],
    kingdom_capital: [1, 5],
    empire_capital: [1, 5],
  },
};

// ─── Coordinate Conversion ───────────────────────────────────────────────────

/**
 * Convert lat/lon to axial hex coordinates
 * Web Mercator style projection
 */
function latLonToAxial(lat, lon, scale = CONFIG.HEX_SCALE) {
  const q = Math.round(lon * scale);
  const r = Math.round(-lat * scale + q / 2);
  return { q, r };
}

/**
 * Convert axial to lat/lon (inverse)
 */
function axialToLatLon(q, r, scale = CONFIG.HEX_SCALE) {
  const lon = q / scale;
  const lat = (r - q / 2) / (-scale);
  return { lat, lon };
}

// ─── Terrain Generation ──────────────────────────────────────────────────────

/**
 * Determine terrain type from latitude
 */
function getTerrainFromLatitude(lat) {
  for (const [terrain, config] of Object.entries(CONFIG.TERRAIN_BY_LAT)) {
    const [minLat, maxLat] = config.latRange;
    if (lat >= minLat && lat <= maxLat) {
      return terrain;
    }
  }
  return 'grassland';
}

/**
 * Generate elevation from terrain type and latitude
 */
function generateElevation(terrain, lat, cityType = null) {
  let range;

  if (cityType && CONFIG.ELEVATION_BY_CITY_TYPE[cityType]) {
    range = CONFIG.ELEVATION_BY_CITY_TYPE[cityType];
  } else if (CONFIG.TERRAIN_BY_LAT[terrain]) {
    range = CONFIG.TERRAIN_BY_LAT[terrain].elevation;
  } else {
    range = [2, 4];
  }

  // Random elevation within range
  return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
}

// ─── Hex Processing ──────────────────────────────────────────────────────────

/**
 * Process city data and generate hex entries
 */
function processCities(citiesData) {
  const hexMap = {
    hexes: [],
    coastlines: null, // Will be added later
  };

  const hexSet = new Set(); // Track unique hexes

  // Process cities
  if (citiesData.cities) {
    for (const city of citiesData.cities) {
      const { q, r } = latLonToAxial(city.lat, city.lon);
      const key = `${q},${r}`;

      if (!hexSet.has(key)) {
        hexSet.add(key);

        const terrain = getTerrainFromLatitude(city.lat);
        const elevation = generateElevation(terrain, city.lat, city.type);

        hexMap.hexes.push({
          q,
          r,
          terrain,
          elevation,
          name: city.name || '',
          description: city.region ? `Major city in ${city.region}` : '',
          type: city.type,
          region: city.region,
          lat: city.lat,
          lon: city.lon,
        });
      }
    }
  }

  // Process landmarks
  if (citiesData.landmarks) {
    for (const landmark of citiesData.landmarks) {
      const { q, r } = latLonToAxial(landmark.lat, landmark.lon);
      const key = `${q},${r}`;

      if (!hexSet.has(key)) {
        hexSet.add(key);

        const elevation = landmark.elevation
          ? Math.floor(landmark.elevation / 1000) // Convert meters to 0-10 scale
          : generateElevation(landmark.type, landmark.lat, landmark.type);

        hexMap.hexes.push({
          q,
          r,
          terrain: landmark.type,
          elevation: Math.min(10, elevation),
          name: landmark.name || '',
          description: `${landmark.type}`,
          type: landmark.type,
          lat: landmark.lat,
          lon: landmark.lon,
        });
      }
    }
  }

  return hexMap;
}

// ─── Coastline Placeholder ───────────────────────────────────────────────────

/**
 * Create placeholder coastline data
 * TODO: Download from Natural Earth ne_10m_land.geojson
 */
function generateCoastlineStub() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[]]
        },
        properties: {
          landMass: 'Stub - TODO: Import from Natural Earth'
        }
      }
    ],
    notes: 'Coastlines to be imported from Natural Earth in Phase 2'
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    // Load cities data
    const citiesPath = path.join(__dirname, 'earth-996-cities.json');
    if (!fs.existsSync(citiesPath)) {
      throw new Error(`Cities data not found: ${citiesPath}`);
    }

    const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
    console.log(`Loaded ${citiesData.cities?.length || 0} cities and ${citiesData.landmarks?.length || 0} landmarks`);

    // Generate hex map
    console.log('Converting lat/lon to axial hex coordinates...');
    const hexMap = processCities(citiesData);

    console.log(`Generated ${hexMap.hexes.length} hex entries`);

    // Add coastline stub
    hexMap.coastlines = generateCoastlineStub();

    // Build final output
    const output = {
      version: '1.0',
      year: 996,
      mapName: 'Earth 996 AD',
      mapType: 'world',
      mapInstanceId: 'earth-996',
      hexes: hexMap.hexes,
      landmarks: [],
      textLabels: [],
      imageOverlays: [],
      tokens: [],
      paths: [],
      fogOfWar: [],
      fogSettings: { enabled: false, opacity: 0.5, color: '#000000', hideIcons: false },
      canvasBackground: '#1a3a4a',
      continentGridEnabled: true,
      continentGridDensity: 1,
      detailGridEnabled: false,
      detailGridDensity: 0,
      showHexCoordinates: true,
      showSubHexCoordinates: false,
      detailHexes: [],
      subHexes: [],
      subHexLandmarks: [],
      subHexTokens: [],
      orientation: 'pointy',
      hexSize: 30,
      terrainTileOverrides: {},
      settlementBrushOverrides: {},
      dungeonTileOverrides: {},
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      layers: [],
      customTerrains: {},
      customDungeonTiles: {},
      nextLandmarkId: 1,
      nextTextLabelId: 1,
      nextImageOverlayId: 1,
      nextTokenId: 1,
      nextPathId: 1,
      metadata: {
        totalHexes: hexMap.hexes.length,
        totalLandmarks: 0,
        totalTextLabels: 0,
        totalTokens: 0,
        totalPaths: 0,
        totalCustomTerrains: 0,
        totalCustomDungeonTiles: 0,
      },
      exportMetadata: {
        exportType: 'earth-generator',
        levelMode: 'continents',
        scope: 'world',
        exportedAt: new Date().toISOString(),
      },
      coastlines: hexMap.coastlines,
    };

    // Write output
    const outputPath = path.join(__dirname, '..', 'src', 'lib', 'data', 'earth-996-hexmap.json');
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

    // Summary
    console.log(`\n✓ Earth hex map generated successfully!`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Total hexes: ${output.hexes.length}`);
    console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
    console.log(`\nNext steps:`);
    console.log(`  - Phase 2: Implement point-in-polygon lookup for coastlines`);
    console.log(`  - Phase 3: Integrate with game.js rendering`);
    console.log(`  - Phase 4: Add elevation enhancements`);
    console.log(`  - Phase 5: Optimize storage if file size > 10MB`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
