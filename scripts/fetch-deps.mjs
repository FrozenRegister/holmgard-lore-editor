#!/usr/bin/env node

import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { loadEnv } from './load-env.mjs';

loadEnv();

const DEFAULT_MANIFEST = [
  { filename: 'auth.js',              url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/auth.js' },
  { filename: 'cloud-storage.js',     url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/cloud-storage.js' },
  { filename: 'compendium.js',        url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/compendium.js' },
  { filename: 'game.js',              url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/game.js' },
  { filename: 'map-worker.js',        url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/map-worker.js' },
  { filename: 'mobile-companion.js',  url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/mobile-companion.js' },
  { filename: 'style.css',            url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/style.css' },
  { filename: 'mobile-companion.css', url: 'https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/mobile-companion.css' },
];

const vendorManifestEnv = process.env.VENDOR_MANIFEST;

let manifest;
if (vendorManifestEnv) {
  // Env var present — use it (supports local overrides and staging)
  console.log('✓ VENDOR_MANIFEST env var found — using explicit manifest');
  try {
    manifest = JSON.parse(vendorManifestEnv);
  } catch (e) {
    console.error('Error: VENDOR_MANIFEST is not valid JSON. See .env.example.');
    process.exit(1);
  }
} else {
  // CI / Cloudflare Pages: env var not injected into npm scripts — use baked-in default
  console.log('⊘ VENDOR_MANIFEST not set — using baked-in default manifest (public R2 URLs)');
  manifest = DEFAULT_MANIFEST;
}

if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error('Error: VENDOR_MANIFEST resolved to an empty list — nothing to fetch.');
  process.exit(1);
}

const vendorDir = 'vendor-src';
await mkdir(vendorDir, { recursive: true });

const vendorToken = process.env.VENDOR_TOKEN;

for (const entry of manifest) {
  const { filename, url } = entry;

  let content;

  // Support local file:// paths for development/testing
  if (url.startsWith('file://')) {
    const filePath = url.slice(7).replace(/^\/([a-zA-Z]:)/, '$1');
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (e) {
      console.error(`Error: Failed to read ${filename} from ${filePath}: ${e.message}`);
      process.exit(1);
    }
  } else {
    const headers = {};
    if (vendorToken) {
      headers['Authorization'] = `Bearer ${vendorToken}`;
    }

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

    content = await response.text();
  }

  const outPath = `${vendorDir}/${filename}`;
  await writeFile(outPath, content, 'utf-8');
  console.log(`  fetched  ${filename}`);
}

console.log(`Fetched ${manifest.length}/${manifest.length} files.`);
