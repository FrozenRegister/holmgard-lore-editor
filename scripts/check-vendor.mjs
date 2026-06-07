#!/usr/bin/env node

import { existsSync } from 'fs';

const vendorFiles = [
  'static/hexmap/auth.js',
  'static/hexmap/cloud-storage.js',
  'static/hexmap/compendium.js',
  'static/hexmap/game.js',
  'static/hexmap/map-worker.js',
  'static/hexmap/mobile-companion.js',
  'static/hexmap/style.css',
  'static/hexmap/mobile-companion.css',
];

const missing = vendorFiles.filter(file => !existsSync(file));

if (missing.length > 0) {
  console.error(`Missing vendor files: ${missing.join(', ')}. Run \`npm run vendor:build\` first.`);
  process.exit(1);
}

process.exit(0);
