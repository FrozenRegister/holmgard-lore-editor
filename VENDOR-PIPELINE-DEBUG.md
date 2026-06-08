# Vendor Pipeline Deployment Debug

**Status:** ✅ Fixed — baked-in default manifest bypasses CI env-var injection

**Last Updated:** 2026-06-08

## Problem

Vendor files (game.js, auth.js, cloud-storage.js, etc.) were not loading in the browser after deployment to Cloudflare Workers because Cloudflare CI does not inject Dashboard build environment variables into `npm`/`pnpm` script subprocesses.

### Symptoms (all resolved)

1. **Local `pnpm deploy` works** — files fetched from R2 via `.env` or baked-in default
2. **Cloudflare CI build now works** — falls back to hardcoded public R2 URLs when `VENDOR_MANIFEST` is absent
3. **Files present in browser devtools** — vendor files fetched and bundled correctly in production

## Investigation Steps

### ✅ Completed

- [x] Created vendor pipeline scripts (fetch-deps.mjs, bundle-vendor.mjs, check-vendor.mjs)
- [x] Uploaded 8 vendor files to Cloudflare R2 bucket (`holmgard-vendor-files`)
- [x] Generated public HTTPS URLs for all 8 files
- [x] Set VENDOR_MANIFEST as build environment variable in Cloudflare Dashboard
- [x] Created wrangler.jsonc with `site: { bucket: "./build" }` for static asset serving
- [x] Confirmed local deployment works (`pnpm deploy` fetches and minifies files)
- [x] Updated package.json with vendor scripts and build pipeline
- [x] Updated .env with VENDOR_MANIFEST for local testing

### ✅ Root Cause & Fix

**Root cause:** Cloudflare Pages/Dashboard build environment variables are passed to the `wrangler` process but NOT to child `npm run` / `pnpm` script subprocesses. `scripts/load-env.mjs` reads from `.env` (which doesn't exist in CI), so `process.env.VENDOR_MANIFEST` was always `undefined` in production builds.

**Fix applied in `scripts/fetch-deps.mjs`:**
- Added a `DEFAULT_MANIFEST` constant containing the 8 public R2 URLs (same URLs that were in `.env`)
- When `VENDOR_MANIFEST` env var is absent, the script uses the baked-in default instead of exiting
- When `VENDOR_MANIFEST` IS present, it still takes precedence (preserving the override path for local dev, staging, and future URL changes)
- The R2 bucket (`holmgard-vendor-files`) is public — no secrets are exposed by embedding the URLs in the source

The build no longer depends on the env var at all, making the pipeline resilient to Cloudflare CI's variable-passing behavior.

## Files Involved

- `scripts/fetch-deps.mjs` — reads `process.env.VENDOR_MANIFEST`, fetches from R2
- `scripts/bundle-vendor.mjs` — minifies fetched files
- `package.json` — defines `vendor:fetch`, `vendor:bundle`, `vendor:build` scripts
- `.env` (local) — contains VENDOR_MANIFEST for local testing
- `wrangler.jsonc` — (NEW) configures Worker and static asset serving
- `svelte.config.js` — uses adapter-static, outputs to `build/`

## Current VENDOR_MANIFEST Value

```json
[
  {"filename":"auth.js","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/auth.js"},
  {"filename":"cloud-storage.js","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/cloud-storage.js"},
  {"filename":"compendium.js","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/compendium.js"},
  {"filename":"game.js","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/game.js"},
  {"filename":"map-worker.js","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/map-worker.js"},
  {"filename":"mobile-companion.js","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/mobile-companion.js"},
  {"filename":"style.css","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/style.css"},
  {"filename":"mobile-companion.css","url":"https://pub-ace11385e34e407d98492e19fd3fac06.r2.dev/mobile-companion.css"}
]
```

## Local Testing

Local `pnpm deploy` works:
1. Reads VENDOR_MANIFEST from `.env`
2. Fetches all 8 files from R2 to `vendor-src/`
3. Minifies to `static/hexmap/` (game.js unminified due to duplicate functions)
4. Builds with SvelteKit to `build/`
5. Deploys via wrangler

## References

- Vendor R2 bucket: `holmgard-vendor-files` (public access enabled)
- Cloudflare Workers project: `holmgard-lore-editor` (Account ID: `101b191e0347791e9060fe63a9c8ff04`)
- Build & Deploy settings: https://dash.cloudflare.com/
