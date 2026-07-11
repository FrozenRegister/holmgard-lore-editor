### CI — make Vendor Integrity Check advisory, auto-file drift issue
- `Vendor Integrity Check` no longer blocks PR merges when upstream vendor files (hexatlas.net, via R2) drift from `vendor-manifest.json` — the mismatch doesn't affect the running app since new files aren't pulled in until `pnpm vendor:sync` runs and its PR merges.
- On detecting drift, CI now auto-files a tracking issue (idempotent — skips creating a duplicate if one is already open) instead of silently going green with no record.
- Adds the `vendor-drift` label to `setup-labels.yml`.
- Also fixes `pr-quality.yml`'s duplicate `Vendor Integrity` job, which had `continue-on-error` at the job level instead of the checksum step — job-level only stops the overall workflow run from failing, but the job's own check-run conclusion still reports `failure`, which still blocks auto-merge. Moved to the step, matching the working `ci.yml` pattern.
- Fixes `Build Verification`, which never had `CLOUDFLARE_API_TOKEN`/`R2_BUCKET_NAME` wired into its own `pnpm build` step — previously masked because `build` depends on `vendor-check` and was always skipped while that job failed.
