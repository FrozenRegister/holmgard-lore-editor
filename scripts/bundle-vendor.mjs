#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { mkdir, stat, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { loadEnv } from './load-env.mjs';

loadEnv();

const vendorMap = [
  { src: 'vendor-src/auth.js', out: 'static/hexmap/auth.js', type: 'js', format: 'iife' },
  { src: 'vendor-src/cloud-storage.js', out: 'static/hexmap/cloud-storage.js', type: 'js', format: 'iife' },
  { src: 'vendor-src/compendium.js', out: 'static/hexmap/compendium.js', type: 'js', format: 'iife' },
  { src: 'vendor-src/game.js', out: 'static/hexmap/game.js', type: 'js', format: 'iife' },
  { src: 'vendor-src/map-worker.js', out: 'static/hexmap/map-worker.js', type: 'js', format: 'iife' },
  { src: 'vendor-src/mobile-companion.js', out: 'static/hexmap/mobile-companion.js', type: 'js', format: 'iife' },
  { src: 'vendor-src/style.css', out: 'static/hexmap/style.css', type: 'css' },
  { src: 'vendor-src/mobile-companion.css', out: 'static/hexmap/mobile-companion.css', type: 'css' },
];

const missing = vendorMap.filter(({ src }) => !existsSync(src)).map(({ src }) => src);
if (missing.length > 0) {
  console.error(`Missing vendor files: ${missing.join(', ')}. Run \`npm run vendor:build\` first.`);
  process.exit(1);
}

await mkdir('static/hexmap', { recursive: true });

for (const { src, out, type, format } of vendorMap) {
  const beforeStat = await stat(src);
  const beforeBytes = beforeStat.size;

  const options = {
    entryPoints: [src],
    outfile: out,
    bundle: false,
    minify: true,
    logLevel: 'error',
    charset: 'utf8',
  };

  if (type === 'js') {
    Object.assign(options, {
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      target: 'es2020',
      format: 'iife',
    });
  } else if (type === 'css') {
    Object.assign(options, {
      loader: { '.css': 'css' },
    });
  }

  try {
    await esbuild.build(options);
  } catch (e) {
    if (src.includes('game.js')) {
      console.error(`Warning: Failed to minify ${src}, using unminified version`);
      const unminified = await readFile(src, 'utf-8');
      await writeFile(out, unminified, 'utf-8');
    } else {
      throw e;
    }
  }

  const afterStat = await stat(out);
  const afterBytes = afterStat.size;
  const filename = src.split('/').pop();
  console.log(`  minified  ${filename}  (${beforeBytes}B → ${afterBytes}B)`);
}

console.log('All 8 vendor files ready in static/hexmap/');
