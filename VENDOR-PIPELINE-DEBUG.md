# Vendor Pipeline Deployment Debug

**Status:** 🟡 In Progress — VENDOR_MANIFEST environment variable set, but build may not be reading it correctly

**Last Updated:** 2026-06-07

## Problem

Vendor files (game.js, auth.js, cloud-storage.js, etc.) are not loading in the browser after deployment to Cloudflare Workers.

### Symptoms

1. **Local `pnpm deploy` works** — files are fetched from R2, minified, and included in build output
2. **Cloudflare CI build fails** — VENDOR_MANIFEST not detected during build:
   ```
   ⊘ VENDOR_MANIFEST not set - skipping fetch (vendor files may already exist)
   ⊘ No vendor files to bundle - skipping (may already be in static/hexmap/)
   ```
3. **Files not in browser devtools** — Network tab shows no requests for vendor files

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

### 🔴 Issues

1. **Build environment variable not reaching Node.js process**
   - Cloudflare Build & Deploy shows VENDOR_MANIFEST set
   - But `process.env.VENDOR_MANIFEST` is undefined during build
   - Logs show: "VENDOR_MANIFEST not set - skipping fetch"

2. **Possible root causes:**
   - Cloudflare CI doesn't inject build environment variables into the Node.js process the same way as local
   - Wrangler command or build step needs explicit configuration to pass env vars
   - Build environment variables only available to wrangler, not to npm scripts

### 🟡 Next Steps to Try

1. **Check wrangler.jsonc inheritance** — does wrangler automatically pass build env vars to npm scripts?
   - Reference: Cloudflare Workers documentation for build configuration
   - May need to explicitly pass env vars via wrangler command

2. **Alternative approach: Add env var to wrangler.jsonc directly**
   ```jsonc
   {
     "env": {
       "production": {
         "vars": {
           "VENDOR_MANIFEST": "..."
         }
       }
     }
   }
   ```
   But this commits the secret to git (bad practice)

3. **Use Cloudflare API to fetch VENDOR_MANIFEST at build time**
   - Create a script that reads from Cloudflare's Secrets Store API instead of process.env
   - Requires API token (different auth mechanism)

4. **Test if build env vars are available to scripts**
   - Add debug logging to scripts/fetch-deps.mjs to inspect all available env vars
   - Check if Cloudflare is setting env vars at all

5. **Switch to Cloudflare Pages instead of Workers**
   - Pages has better integration with git-based deployments
   - May handle environment variables more transparently

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
