### CI — make Vendor Integrity Check advisory, auto-file drift issue
- `Vendor Integrity Check` no longer blocks PR merges when upstream vendor files (hexatlas.net, via R2) drift from `vendor-manifest.json` — the mismatch doesn't affect the running app since new files aren't pulled in until `pnpm vendor:sync` runs and its PR merges.
- On detecting drift, CI now auto-files a tracking issue (idempotent — skips creating a duplicate if one is already open) instead of silently going green with no record.
- Adds the `vendor-drift` label to `setup-labels.yml`.
