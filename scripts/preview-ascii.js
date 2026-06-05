#!/usr/bin/env node
/** Quick ASCII sanity check of the generated hex Earth. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const region = process.argv[2] || 'world';
const file = path.join(__dirname, '..', 'src', 'lib', 'data', `earth-996-${region}.json`);
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`=== ${map.mapName} (${map.hexes.length} hexes) ===`);

// Reconstruct col/row from offset coords: r=row, col = q + floor(row/2)
const cells = new Map();
let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
for (const h of map.hexes) {
  const row = h.r;
  const col = h.q + Math.floor(row / 2);
  cells.set(`${col},${row}`, h.terrain);
  if (col < minCol) minCol = col; if (col > maxCol) maxCol = col;
  if (row < minRow) minRow = row; if (row > maxRow) maxRow = row;
}

const glyph = { water: '.', plains: ',', desert: ':', jungle: '#', forest: '^', tundra: '-', mountain: 'M', arctic: '*' };
const W = 110, H = 44;
const colSpan = maxCol - minCol, rowSpan = maxRow - minRow;
let out = '';
for (let y = 0; y < H; y++) {
  const row = minRow + Math.round((y / (H - 1)) * rowSpan);
  let line = '';
  for (let x = 0; x < W; x++) {
    const col = minCol + Math.round((x / (W - 1)) * colSpan);
    const t = cells.get(`${col},${row}`);
    line += t ? (glyph[t] || '?') : ' ';
  }
  out += line + '\n';
}
console.log(out);
console.log(`cols[${minCol}..${maxCol}] rows[${minRow}..${maxRow}]  legend: .water ,plains :desert #jungle ^forest -tundra Mmountain`);
