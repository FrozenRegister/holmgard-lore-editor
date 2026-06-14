#!/usr/bin/env node

import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';

const manifest = JSON.parse(readFileSync('vendor-manifest.json', 'utf-8'));

const missing = [];
const mismatched = [];
const ok = [];

for (const { filename, sha256 } of manifest) {
  const filePath = `vendor-src/${filename}`;

  if (!existsSync(filePath)) {
    missing.push(filename);
    console.log(`  ✗ missing   ${filename}`);
    continue;
  }

  const content = readFileSync(filePath);
  const actual = createHash('sha256').update(content).digest('hex').toUpperCase();

  if (actual === sha256) {
    ok.push(filename);
    console.log(`  ✓ match     ${filename}`);
  } else {
    mismatched.push(filename);
    console.log(`  ⚠ MISMATCH  ${filename}`);
    console.log(`    expected: ${sha256}`);
    console.log(`    actual:   ${actual}`);
    console.log(`    → Run \`pnpm vendor:sync\` to update the manifest.`);
  }
}

console.log('');

if (missing.length === manifest.length) {
  console.log('⊘ No vendor files found in vendor-src/ — run pnpm vendor:fetch first.');
  process.exit(0);
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} file(s) missing from vendor-src/. Run pnpm vendor:fetch.`);
  process.exit(1);
}

if (mismatched.length > 0) {
  console.error(`⚠ ${mismatched.length} file(s) have unexpected checksums — upstream may have updated.`);
  process.exit(2);
}

console.log(`✓ All ${ok.length} vendor files verified.`);
process.exit(0);
