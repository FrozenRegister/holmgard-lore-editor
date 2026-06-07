#!/usr/bin/env node
/**
 * Analyze workingMap.json WITHOUT dumping its content.
 * Reports only summary stats so we can copy its conventions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const p = path.join(__dirname, '..', 'src', 'lib', 'data', 'workingMap.json');

interface Hex {
  q: number;
  r: number;
  terrain: string;
  lat?: number;
  [key: string]: unknown;
}

interface MapData {
  hexes: Hex[];
  width?: number;
  height?: number;
  columns?: number;
  [key: string]: unknown;
}

if (!fs.existsSync(p)) {
  console.error(`File not found: ${p}`);
  process.exit(1);
}

const map: MapData = JSON.parse(fs.readFileSync(p, 'utf8'));
const hexes: Hex[] = map.hexes || [];

let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
const terrainCounts: Record<string, number> = {};
let hasLatLon = false;
let sampleKeys: string[] | null = null;
const seenCoords = new Set<string>();
const duplicates: string[] = [];

// screen-space (pointy-top): x = q + r/2, y = r
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

for (const h of hexes) {
  const coordKey = `${h.q},${h.r}`;
  if (seenCoords.has(coordKey)) {
    duplicates.push(coordKey);
  } else {
    seenCoords.add(coordKey);
  }

  if (h.q < minQ) minQ = h.q;
  if (h.q > maxQ) maxQ = h.q;
  if (h.r < minR) minR = h.r;
  if (h.r > maxR) maxR = h.r;
  
  terrainCounts[h.terrain] = (terrainCounts[h.terrain] || 0) + 1;
  
  if (h.lat !== undefined) hasLatLon = true;
  if (!sampleKeys) sampleKeys = Object.keys(h);

  const x = h.q + h.r / 2;
  const y = h.r;
  if (x < minX) minX = x;
  if (x > maxX) maxX = x;
  if (y < minY) minY = y;
  if (y > maxY) maxY = y;
}

const targetWidth = (map.width ?? map.columns) as number | undefined;
const targetHeight = map.height as number | undefined;

const missing: string[] = [];
const outside: string[] = [];

if (hexes.length > 0) {
  // Define the "intended" boundaries. If metadata provides width/height, we use them 
  // relative to the calculated minimums. maxX in pointy-top hexes can be fractional (offset 0.5).
  const boundXMax = typeof targetWidth === 'number' ? minX + targetWidth - 0.5 : maxX;
  const boundYMax = typeof targetHeight === 'number' ? minY + targetHeight - 1 : maxY;

  // Check for gaps within the intended screen-space rectangle
  for (let r = minY; r <= boundYMax; r++) {
    const qStart = Math.ceil(minX - r / 2);
    const qEnd = Math.floor(boundXMax - r / 2);
    for (let q = qStart; q <= qEnd; q++) {
      if (!seenCoords.has(`${q},${r}`)) {
        missing.push(`${q},${r}`);
      }
    }
  }

  // Detect hexes that fall outside the intended rectangle
  for (const h of hexes) {
    const x = h.q + h.r / 2;
    const y = h.r;
    if (x < minX || x > boundXMax || y < minY || y > boundYMax) {
      outside.push(`${h.q},${h.r}`);
    }
  }
}

console.log('=== workingMap.json analysis ===');
console.log('Top-level keys:', Object.keys(map).join(', '));
console.log('Total hexes:', hexes.length);
console.log('Duplicate coordinates:', duplicates.length);
if (duplicates.length > 0) {
  console.log(`  Sample duplicates: ${duplicates.slice(0, 5).join('; ')}${duplicates.length > 5 ? '...' : ''}`);
}
console.log('Missing coordinates (screen-space gaps):', missing.length);
if (missing.length > 0) {
  console.log(`  Sample missing: ${missing.slice(0, 5).join('; ')}${missing.length > 5 ? '...' : ''}`);
}
console.log('Outside intended bounds:', outside.length);
if (outside.length > 0) {
  console.log(`  Target dimensions used: ${targetWidth ?? 'auto'}x${targetHeight ?? 'auto'}`);
  console.log(`  Sample outside: ${outside.slice(0, 5).join('; ')}${outside.length > 5 ? '...' : ''}`);
}
console.log('Hex object keys:', sampleKeys?.join(', '));
console.log('Has lat/lon on hexes:', hasLatLon);
console.log('');
console.log(`Axial bounds: q[${minQ}..${maxQ}]  r[${minR}..${maxR}]`);
console.log(`  q span: ${maxQ - minQ}  r span: ${maxR - minR}`);
console.log('');
console.log('Screen-space (x=q+r/2, y=r):');
console.log(`  x[${minX.toFixed(1)}..${maxX.toFixed(1)}]  width=${(maxX - minX).toFixed(1)}`);
console.log(`  y[${minY}..${maxY}]  height=${maxY - minY}`);
console.log(`  aspect (w/h): ${((maxX - minX) / (maxY - minY)).toFixed(2)}`);
console.log('');

// Is the FILLED region a rectangle in screen space? Check corner occupancy.
const rowX: Record<number, { min: number; max: number }> = {};
for (const h of hexes) {
  const x = h.q + h.r / 2;
  const y = h.r;
  if (!rowX[y]) rowX[y] = { min: Infinity, max: -Infinity };
  if (x < rowX[y].min) rowX[y].min = x;
  if (x > rowX[y].max) rowX[y].max = x;
}
const ys = Object.keys(rowX).map(Number).sort((a, b) => a - b);
console.log('Row x-range sampling (screen rectangle test):');
for (let i = 0; i < ys.length; i += Math.max(1, Math.floor(ys.length / 8))) {
  const y = ys[i];
  console.log(`  y=${y}  x:[${rowX[y].min.toFixed(1)}..${rowX[y].max.toFixed(1)}]`);
}
console.log('');
console.log('Terrain distribution:');
const sorted = Object.entries(terrainCounts).sort((a, b) => b[1] - a[1]);
for (const [t, c] of sorted) {
  console.log(`  ${t}: ${c} (${(100 * c / hexes.length).toFixed(1)}%)`);
}