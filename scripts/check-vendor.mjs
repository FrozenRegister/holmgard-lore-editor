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
  const allMissing = missing.length === vendorFiles.length;
  if (allMissing) {
    console.log('⊘ No vendor files found - this is OK for CI (they will be fetched during deploy)');
    process.exit(0);
  } else {
    console.error(`Some vendor files missing: ${missing.join(', ')}. Run \`npm run vendor:build\` to complete.`);
    process.exit(1);
  }
}

console.log('✓ All vendor files present');
process.exit(0);
