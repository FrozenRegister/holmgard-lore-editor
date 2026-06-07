#!/usr/bin/env node

import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { loadEnv } from './load-env.mjs';

loadEnv();

const vendorManifestEnv = process.env.VENDOR_MANIFEST;

console.log('DEBUG: All env vars:', Object.keys(process.env).filter(k => k.includes('VENDOR')));
console.log('DEBUG: VENDOR_MANIFEST =', process.env.VENDOR_MANIFEST);

if (!vendorManifestEnv) {
  console.log('⊘ VENDOR_MANIFEST not set - skipping fetch (vendor files may already exist)');
  process.exit(0);
}

let manifest;
try {
  manifest = JSON.parse(vendorManifestEnv);
} catch (e) {
  console.error('Error: VENDOR_MANIFEST is not valid JSON. See .env.example.');
  process.exit(1);
}

if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error('Error: VENDOR_MANIFEST is not set. See .env.example.');
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
