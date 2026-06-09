# Changelog

All notable changes to the Holmgard Lore Editor project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

### Changed

- **Extract shared `getTauriInvoke()` helper in `auth.ts`** (#21) — Replaced 7 duplicated Tauri-detection + dynamic-import blocks with a single memoized helper. All 7 public auth functions (`getAdminSecret`, `getClaudeApiKey`, `setClaudeApiKey`, `clearClaudeApiKey`, `getMcpApiKey`, `setMcpApiKey`, `clearMcpApiKey`) now delegate to `getTauriInvoke()`. This eliminates ~35 lines of duplication and ensures the Tauri dynamic import runs at most once per session.

### Added

- **Memoization tests for `getTauriInvoke`** (#21) — Added 2 new tests (`auth.test.ts`) verifying that the Tauri invoke import is reused across multiple auth function calls and that browser-mode caches `null` without re-importing.