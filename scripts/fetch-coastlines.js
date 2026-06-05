#!/usr/bin/env node

/**
 * Fetch Natural Earth coastline data and integrate into HexMap
 * Downloads ne_10m_land.geojson and adds coastlines to earth-996-hexmap.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Natural Earth URL for 10m land boundaries
const COASTLINE_URL = 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip';
// Fallback: simpler land/water boundary
const LAND_URL = 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip';

/**
 * Download file from URL
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    const file = fs.createWriteStream(outputPath);

    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Downloaded to ${outputPath}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

/**
 * Create stub coastline data for now
 * TODO: Parse actual GeoJSON and convert coordinates
 */
function generateCoastlineStub() {
  return {
    type: 'FeatureCollection',
    features: [
      // European coastlines (simplified)
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[-10, 50], [0, 55], [10, 54], [15, 50], [10, 45], [0, 45], [-10, 48], [-10, 50]]
          ]
        },
        properties: { landMass: 'Europe', continentId: 'europe' }
      },
      // North Africa
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[-10, 35], [0, 35], [10, 35], [20, 32], [30, 30], [40, 32], [30, 27], [20, 28], [10, 30], [0, 32], [-10, 33], [-10, 35]]
          ]
        },
        properties: { landMass: 'Africa North', continentId: 'africa' }
      },
      // Asia Minor
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[27, 40], [35, 42], [45, 40], [45, 35], [40, 32], [35, 35], [30, 37], [27, 38], [27, 40]]
          ]
        },
        properties: { landMass: 'Asia Minor', continentId: 'asia' }
      },
      // Middle East / Arabia
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[32, 36], [40, 38], [50, 35], [55, 28], [50, 20], [45, 18], [40, 20], [35, 25], [32, 28], [32, 36]]
          ]
        },
        properties: { landMass: 'Arabia', continentId: 'asia' }
      },
      // East Asia (simplified)
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[100, 50], [130, 50], [145, 45], [140, 35], [130, 30], [115, 25], [105, 20], [100, 25], [100, 50]]
          ]
        },
        properties: { landMass: 'East Asia', continentId: 'asia' }
      },
      // Sub-Saharan Africa
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[10, 25], [25, 28], [35, 25], [40, 20], [38, 10], [35, 0], [30, -5], [20, -8], [15, -5], [12, 0], [10, 10], [10, 25]]
          ]
        },
        properties: { landMass: 'Africa South', continentId: 'africa' }
      },
      // India
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[65, 35], [77, 35], [82, 28], [80, 8], [73, 8], [68, 15], [65, 25], [65, 35]]
          ]
        },
        properties: { landMass: 'India', continentId: 'asia' }
      },
      // Southeast Asia
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[95, 28], [105, 28], [110, 20], [110, 5], [105, 0], [100, 5], [98, 15], [95, 20], [95, 28]]
          ]
        },
        properties: { landMass: 'Southeast Asia', continentId: 'asia' }
      }
    ]
  };
}

/**
 * Integrate coastlines into HexMap
 */
function integrateCoastlines(hexmapPath, coastlines) {
  const hexmap = JSON.parse(fs.readFileSync(hexmapPath, 'utf8'));

  console.log(`\nIntegrating coastlines into HexMap...`);
  hexmap.coastlines = coastlines;

  fs.writeFileSync(hexmapPath, JSON.stringify(hexmap, null, 2), 'utf8');
  console.log(`✓ Coastlines added to ${hexmapPath}`);

  return hexmap;
}

async function main() {
  try {
    const hexmapPath = path.join(__dirname, '..', 'src', 'lib', 'data', 'earth-996-hexmap.json');

    // For now, use stub coastlines
    // TODO: Download and parse actual Natural Earth GeoJSON
    console.log('Generating coastline data...');
    const coastlines = generateCoastlineStub();

    // Integrate into HexMap
    const hexmap = integrateCoastlines(hexmapPath, coastlines);

    console.log(`\n✓ Coastlines integrated!`);
    console.log(`  Features: ${coastlines.features.length}`);
    console.log(`  File size: ${(fs.statSync(hexmapPath).size / 1024).toFixed(1)} KB`);
    console.log(`\nNext: Implement point-in-polygon lookup in game.js`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
