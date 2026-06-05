#!/usr/bin/env node
/**
 * Analyze workingMap.json WITHOUT dumping its content.
 * Reports only summary stats so we can copy its conventions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '..', 'src', 'lib', 'data', 'workingMap.json');

const map = JSON.parse(fs.readFileSync(p, 'utf8'));
const hexes = map.hexes || [];

let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
const terrainCounts = {};
let hasLatLon = false;
let sampleKeys = null;

// screen-space (pointy-top): x = q + r/2, y = r
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

for (const h of hexes) {
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

console.log('=== workingMap.json analysis ===');
console.log('Top-level keys:', Object.keys(map).join(', '));
console.log('Total hexes:', hexes.length);
console.log('Hex object keys:', sampleKeys?.join(', '));
console.log('Has lat/lon on hexes:', hasLatLon);
console.log('');
console.log('Axial bounds: q[' + minQ + '..' + maxQ + ']  r[' + minR + '..' + maxR + ']');
console.log('  q span:', maxQ - minQ, ' r span:', maxR - minR);
console.log('');
console.log('Screen-space (x=q+r/2, y=r):');
console.log('  x[' + minX.toFixed(1) + '..' + maxX.toFixed(1) + ']  width=' + (maxX - minX).toFixed(1));
console.log('  y[' + minY + '..' + maxY + ']  height=' + (maxY - minY));
console.log('  aspect (w/h):', ((maxX - minX) / (maxY - minY)).toFixed(2));
console.log('');

// Is the FILLED region a rectangle in screen space? Check corner occupancy.
// For each integer y (row), find min/max x. If rectangle, min/max x should be ~constant across rows.
const rowX = {};
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
  console.log('  y=' + y + '  x:[' + rowX[y].min.toFixed(1) + '..' + rowX[y].max.toFixed(1) + ']');
}
console.log('');
console.log('Terrain distribution:');
const sorted = Object.entries(terrainCounts).sort((a, b) => b[1] - a[1]);
for (const [t, c] of sorted) {
  console.log('  ' + t + ': ' + c + ' (' + (100 * c / hexes.length).toFixed(1) + '%)');
}
