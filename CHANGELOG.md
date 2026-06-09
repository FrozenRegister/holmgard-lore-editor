# Changelog

All notable changes to the Holmgard Lore Editor project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

### Changed

- **Extract shared `getTauriInvoke()` helper in `auth.ts`** (#21) — Replaced 7 duplicated Tauri-detection + dynamic-import blocks with a single memoized helper. All 7 public auth functions (`getAdminSecret`, `getClaudeApiKey`, `setClaudeApiKey`, `clearClaudeApiKey`, `getMcpApiKey`, `setMcpApiKey`, `clearMcpApiKey`) now delegate to `getTauriInvoke()`. This eliminates ~35 lines of duplication and ensures the Tauri dynamic import runs at most once per session.

### Added

- **Content-Security-Policy headers** (#35) — Three-layer defense across browser, Cloudflare Pages, and native Tauri: meta tag in `app.html` for dev/webview fallback, `_headers` file for production, and `tauri.conf.json` policy. Restricts default to `'self'`, allows inline styles for hex map editor, API calls to Anthropic and Cloudflare Workers, and blocks frames/objects/external images.
- **GitHub Actions automation pipeline** (#77) — Implemented 8 workflows for issue triage, agent assignment, parallel batching, and PR quality enforcement: setup-labels (bootstrap 24 labels), issue-tagger (auto-label by surface area + depth), parallelize-issues (group into conflict-free batches), agent-assignment (assign agent:claude/cline), agent-trigger (post work-orders), pr-quality (enforce CHANGELOG + docs), auto-merge (merge after CI), validate-workflows (YAML validation). Added testing-and-linting-guide.md. Updated CI to use pnpm@11.5.1 and Node 22.
- **Memoization tests for `getTauriInvoke`** (#21) — Added 2 new tests (`auth.test.ts`) verifying that the Tauri invoke import is reused across multiple auth function calls and that browser-mode caches `null` without re-importing.

### Fixed

- **River data loss on map reload** (#43) — `applyRestoredMap()` never read `riverEdges` and `rivers` from IndexedDB, causing maps with painted rivers to lose all river data when reloaded from disk. Added 'rivers' IDB store to restoration pipeline and updated E2E seeded map loader. Maps now persist river data across save/load cycles.
- **Race condition in `getTauriInvoke()` memoization** (#21, #74) — Added a promise-sentinel pattern (`_tauriInvokePromise`) so concurrent callers hitting the function before the first `await import()` resolves reuse the same in-flight promise instead of each starting a separate dynamic import.

### Security

- **`__TAURI__` falsy-value hardening** (#21, #74) — Added 4 tests confirming that `__TAURI__` values of `false`, `null`, `0`, and `''` all correctly fall through to localStorage mode (previously only `undefined` was explicitly tested). Added 2 concurrent-call tests in both Tauri and browser modes.
