#!/usr/bin/env node
/**
 * Fetches vendor files from the upstream source (hexatlas.net), compares checksums
 * against vendor-manifest.json, uploads changed files to private R2, and updates
 * the manifest. Run by the vendor-sync GitHub Actions workflow.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { loadEnv } from './load-env.mjs';

loadEnv();

const manifestPath = 'vendor-manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const manifestMap = Object.fromEntries(manifest.map(e => [e.filename, e.sha256]));

const sourceManifestEnv = process.env.VENDOR_SOURCE_MANIFEST;
if (!sourceManifestEnv) {
  console.error('Error: VENDOR_SOURCE_MANIFEST is not set. This script requires upstream source URLs.');
  console.error('Store them as a GitHub Actions secret — never in tracked code.');
  process.exit(1);
}

let sourceManifest;
try {
  sourceManifest = JSON.parse(sourceManifestEnv);
} catch {
  console.error('Error: VENDOR_SOURCE_MANIFEST is not valid JSON.');
  process.exit(1);
}

mkdirSync('vendor-src', { recursive: true });

const r2Bucket = process.env.R2_BUCKET_NAME;
const forceUpload = process.env.VENDOR_FORCE_UPLOAD === '1';
const changed = [];

if (forceUpload) {
  console.log(`Checking ${sourceManifest.length} files against upstream (force-upload mode)...`);
} else {
  console.log(`Checking ${sourceManifest.length} files against upstream...`);
}

for (const { filename, url } of sourceManifest) {
  let bytes;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (e) {
    console.error(`Error: Failed to fetch ${filename}: ${e.message}`);
    process.exit(1);
  }

  const actual = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const expected = manifestMap[filename];

  if (actual === expected && !forceUpload) {
    console.log(`  ✓ unchanged  ${filename}`);
    continue;
  }

  if (actual !== expected) {
    console.log(`  ⚠ CHANGED    ${filename}`);
    console.log(`    old: ${expected ?? '(not in manifest)'}`);
    console.log(`    new: ${actual}`);
  } else {
    console.log(`  ↑ force-uploading  ${filename}`);
  }

  const outPath = `vendor-src/${filename}`;
  writeFileSync(outPath, bytes);

  if (r2Bucket) {
    console.log(`    Uploading to R2: ${r2Bucket}/${filename}`);
    try {
      execSync(
        `npx wrangler r2 object put "${filename}" --bucket "${r2Bucket}" --file "${outPath}"`,
        { stdio: ['ignore', 'inherit', 'inherit'], env: process.env }
      );
    } catch (e) {
      console.error(`    Error uploading ${filename} to R2: ${e.message}`);
      process.exit(1);
    }
  }

  if (actual !== expected) {
    manifestMap[filename] = actual;
    changed.push(filename);
  }
}

console.log('');

if (changed.length === 0) {
  console.log('✓ No upstream changes detected.');
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, 'changed=false\n', { flag: 'a' });
  }
  process.exit(0);
}

// Write updated manifest (preserve file order)
const updated = manifest.map(e => ({ filename: e.filename, sha256: manifestMap[e.filename] }));
writeFileSync(manifestPath, JSON.stringify(updated, null, 2).replace(/\[/, '[\n ').replace(/\]/, '\n]') + '\n', 'utf-8');
// Re-write with consistent formatting
writeFileSync(
  manifestPath,
  '[\n' +
    updated.map(e => `  { "filename": ${JSON.stringify(e.filename).padEnd(22)}, "sha256": "${e.sha256}" }`).join(',\n') +
  '\n]\n',
  'utf-8'
);

console.log(`⚠ ${changed.length} file(s) changed: ${changed.join(', ')}`);
console.log('Updated vendor-manifest.json.');

if (r2Bucket) {
  console.log('Uploaded changed files to R2.');
} else {
  console.log('R2_BUCKET_NAME not set — skipped R2 upload.');
}

if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, 'changed=true\n', { flag: 'a' });
  writeFileSync(process.env.GITHUB_OUTPUT, `files=${changed.join(',')}\n`, { flag: 'a' });
}
