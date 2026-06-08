# Project Lifecycle: Solo Dev + AI Workflow

This document defines how features and fixes move from conception to production in the Holmgard Lore Editor. It is optimized for a solo developer working with an AI agent (Claude 3.5 Sonnet).

## 1. Planning (The Source of Truth)

- **GitHub Projects:** All work begins as a draft issue in [Project #3](https://github.com/users/FrozenRegister/projects/3).
- **Implementation Briefs:** For complex features (e.g., Map-Lore linking), a spec is written in `docs/future/`. This acts as the "persistent memory" for the AI across different chat sessions.

## 2. Development (The AI Loop)

The project follows an AI-native "Red-Green-Refactor" loop:

1. **Context:** Provide the AI with relevant `types.ts`, implementation files, and the implementation brief.
2. **Tests First:** Ask the AI to write a Vitest suite in `src/lib/__tests__`.
3. **Implementation:** The AI writes the logic to pass the tests.
4. **Local Verification:** Run `pnpm test` and `pnpm test:e2e:ui` locally to confirm no regressions.

## 3. The Quality Gate (CI)

Even without human code reviews, we use a "Branch & Merge" strategy to leverage the CI pipeline as an automated auditor:

1. **Work in a Branch:** `git checkout -b feat/feature-name`.
2. **Push to Trigger CI:** `git push`.
3. **Automated Audit:** The `ci.yml` workflow performs:
    - **Svelte-check:** Catches type mismatches and Svelte-specific errors.
    - **Vitest:** Runs unit/integration tests (ensuring the 500+ existing tests pass).
    - **Coverage Analysis:** The `coverage-gap-analysis.ts` script ensures no file drops below **80% coverage**.
4. **Merge:** Once the GitHub UI shows the "Green" checkmark, merge into `main`.

## 4. Deployment

The project uses a hybrid deployment model:

### Web / Cloudflare

```bash
pnpm deploy
```

This triggers the **Vendor Pipeline**:

1. Fetches legacy `game.js` and assets from Cloudflare R2 via `scripts/fetch-deps.mjs`.
2. Minifies and bundles via esbuild using `scripts/bundle-vendor.mjs`.
3. Deploys the SvelteKit app to Cloudflare Workers.

### Desktop (Tauri)

```bash
pnpm tauri:build
```

Generates native binaries for local desktop use.

## 5. Session Closure (Handoff)

At the end of a work session, use the session-end script to ensure continuity for the next session:

```powershell
. .\scripts\session-end.ps1
Add-SessionSummary -Title "..." -Summary "..." -Todos "...", "..." -Status Done
```

This appends a summary to the GitHub Project, serving as the context for the next AI interaction.

## Core Principles

### Local-First Safety

The app uses a complex sync model (`syncAll.ts`). Never modify storage or sync logic without running the full test suite to prevent data corruption.

### Documentation as Code

All technical decisions (e.g., switching from localStorage to IndexedDB) must be recorded in `README.md` or a `DEBUG.md` file so the AI understands the architecture in future sessions.

### Vendor Integrity

Do not edit vendor files in `static/hexmap/` directly. All custom map logic should live in `game-ui-bindings.js` to avoid being overwritten by the deployment pipeline.

## Summary of Scripts

| Script | Purpose |
| :--- | :--- |
| `pnpm check` | Verify types before committing |
| `pnpm test:coverage` | Generate local report to find coverage gaps |
| `scripts/fetch-deps.mjs` | Pulls external map engine assets from R2 |
| `scripts/session-end.ps1` | Updates the GitHub project for AI handoff |
