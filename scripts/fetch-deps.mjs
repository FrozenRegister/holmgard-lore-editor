#!/usr/bin/env node

import { mkdir, writeFile, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { loadEnv } from './load-env.mjs';

loadEnv();

// Hashes only — no URLs. URLs come from env vars or R2.
const hashManifest = JSON.parse(await readFile('vendor-manifest.json', 'utf-8'));
const sha256Map = Object.fromEntries(hashManifest.map(e => [e.filename, e.sha256]));

const vendorDir = 'vendor-src';
await mkdir(vendorDir, { recursive: true });

const r2Bucket = process.env.R2_BUCKET_NAME;

if (r2Bucket) {
  // Build mode: fetch from private R2 via wrangler
  console.log(`Fetching ${hashManifest.length} files from private R2 (${r2Bucket})...`);

  for (const { filename, sha256 } of hashManifest) {
    const outPath = `${vendorDir}/${filename}`;
    try {
      execSync(`npx wrangler r2 object get "${filename}" --bucket "${r2Bucket}" --file "${outPath}"`, {
        stdio: ['ignore', 'ignore', 'inherit'],
        env: process.env,
      });
    } catch (e) {
      console.error(`Error: Failed to fetch ${filename} from R2: ${e.message}`);
      process.exit(1);
    }

    const content = await readFile(outPath);
    const actual = createHash('sha256').update(content).digest('hex').toUpperCase();
    if (actual !== sha256) {
      console.warn(`  ⚠  ${filename} — CHECKSUM MISMATCH (R2 has a newer version than manifest)`);
      console.warn(`     expected: ${sha256}`);
      console.warn(`     actual:   ${actual}`);
      console.warn(`     Run pnpm vendor:sync to update vendor-manifest.json.`);
    } else {
      console.log(`  ✓  ${filename}`);
    }
  }
} else {
  // URL mode: fetch from URLs supplied via env var
  const vendorManifestEnv = process.env.VENDOR_MANIFEST || process.env.VENDOR_SOURCE_MANIFEST;

  if (!vendorManifestEnv) {
    console.error('Error: No fetch source configured.');
    console.error('  Set R2_BUCKET_NAME (+ CLOUDFLARE_API_TOKEN) to fetch from private R2, or');
    console.error('  set VENDOR_MANIFEST / VENDOR_SOURCE_MANIFEST to a JSON array of {filename, url}.');
    console.error('  See .env.example for details.');
    process.exit(1);
  }

  let urlManifest;
  try {
    urlManifest = JSON.parse(vendorManifestEnv);
  } catch {
    console.error('Error: VENDOR_MANIFEST / VENDOR_SOURCE_MANIFEST is not valid JSON.');
    process.exit(1);
  }

  console.log(`Fetching ${urlManifest.length} files from URLs...`);
  const vendorToken = process.env.VENDOR_TOKEN;

  for (const { filename, url } of urlManifest) {
    const outPath = `${vendorDir}/${filename}`;
    let content;

    if (url.startsWith('file://')) {
      const filePath = url.slice(7).replace(/^\/([a-zA-Z]:)/, '$1');
      content = await readFile(filePath);
    } else {
      const headers = vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {};
      let response;
      try {
        response = await fetch(url, { headers });
      } catch (e) {
        console.error(`Error: Failed to fetch ${filename}: ${e.message}`);
        process.exit(1);
      }
      if (!response.ok) {
        console.error(`Error: Failed to fetch ${filename}: HTTP ${response.status}`);
        process.exit(1);
      }
      content = Buffer.from(await response.arrayBuffer());
    }

    await writeFile(outPath, content);

    const actual = createHash('sha256').update(content).digest('hex').toUpperCase();
    const expected = sha256Map[filename];
    if (expected && actual !== expected) {
      console.log(`  ⚠  ${filename} — CHECKSUM MISMATCH (upstream may have updated)`);
      console.log(`     expected: ${expected}`);
      console.log(`     actual:   ${actual}`);
    } else {
      console.log(`  ✓  ${filename}`);
    }
  }
}

console.log(`\nFetched ${hashManifest.length} files.`);
