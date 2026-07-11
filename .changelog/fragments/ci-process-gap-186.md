### CI/process improvements for structural integrity

- **Added `vite build` step to CI pipeline** — detects import failures, asset breakage, and structural compilation errors that `svelte-check` alone might miss
- **Added RelationsPanel e2e smoke test** — verifies the component's template renders (catches accidental template deletions before merge)
- **Recommended branch protection enhancement** — require at least one approval before merge to add human review as a safety net for large diffs

Addresses #186: CI/process gap that nearly allowed a 263-line template deletion to slip through. Build step and e2e test provide defense-in-depth; branch protection (GitHub Settings) should be configured separately by repository admin.
