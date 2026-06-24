/**
 * Post-build: patch build/_headers to include SHA256 hashes of any inline
 * scripts SvelteKit injects (e.g. the __sveltekit_* initializer).
 *
 * The hash changes every build, so we compute it here rather than hardcoding
 * it in static/_headers. This keeps the script-src 'self' enforcement viable
 * without having to use 'unsafe-inline'.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const headersPath = 'build/_headers';
const htmlPath = 'build/index.html';

const html = readFileSync(htmlPath, 'utf8');

// Extract every <script>...</script> block that has no src= attribute
const inlineScripts = [];
const scriptRe = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRe.exec(html)) !== null) {
  const content = match[1];
  if (content.trim()) {
    inlineScripts.push(content);
  }
}

if (inlineScripts.length === 0) {
  console.log('[patch-csp] No inline scripts found — _headers unchanged.');
  process.exit(0);
}

const hashes = inlineScripts.map(s => {
  const h = createHash('sha256').update(s, 'utf8').digest('base64');
  return `'sha256-${h}'`;
});

console.log(`[patch-csp] Found ${inlineScripts.length} inline script(s), hashes: ${hashes.join(', ')}`);

const headers = readFileSync(headersPath, 'utf8');

// Replace script-src directive: insert hashes after 'self'
const patched = headers.replace(
  /(script-src\s+'self')(\s|;|$)/,
  `$1 ${hashes.join(' ')}$2`,
);

if (patched === headers) {
  console.warn('[patch-csp] Could not find "script-src \'self\'" in _headers — no change made.');
  process.exit(0);
}

writeFileSync(headersPath, patched, 'utf8');
console.log('[patch-csp] _headers patched with inline script hashes.');
