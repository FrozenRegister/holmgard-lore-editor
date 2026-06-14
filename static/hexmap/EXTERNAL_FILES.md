# External Files

These files are sourced from an upstream provider and are excluded from the public repo via `.gitignore`.
Do not edit them directly. They are fetched at build time from the private R2 bucket (`holmgard-vendor-files`).

## Source of truth

Checksums are now maintained programmatically in [`vendor-manifest.json`](../../vendor-manifest.json) at the repo root.
The `vendor-sync` workflow (`.github/workflows/vendor-sync.yml`) automatically detects upstream changes,
uploads new versions to R2, updates the manifest, and opens a PR for review.

## Verification

```bash
# Verify local vendor-src/ files against vendor-manifest.json
pnpm vendor:check

# Re-fetch from private R2
pnpm vendor:fetch

# Check upstream source for new versions (requires VENDOR_SOURCE_MANIFEST secret)
pnpm vendor:sync
```

## File inventory

| File | Purpose |
|------|---------|
| `game.js` | Core hex map rendering engine |
| `auth.js` | Authentication helpers |
| `cloud-storage.js` | Cloud storage integration |
| `compendium.js` | Compendium panel |
| `map-worker.js` | Web worker for map processing |
| `mobile-companion.js` | Mobile companion UI |
| `style.css` | Game map styles |
| `mobile-companion.css` | Mobile companion styles |
| `small_logo.svg` | Logo asset |

## Change log

| Date | File | Reason |
|------|------|--------|
| 2026-06-14 | all | Migrated checksums to `vendor-manifest.json`; pipeline switched to private R2 |
