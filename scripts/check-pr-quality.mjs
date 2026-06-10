#!/usr/bin/env node

/**
 * Client-side PR quality pre-check.
 *
 * Mirrors the CI checks in .github/workflows/pr-quality.yml:
 *   1. check-changelog — CHANGELOG.md must be in the diff
 *   2. check-docs     — a file under docs/ must be in the diff,
 *                       OR the latest commit message (or a PR_DOCS env var)
 *                       must contain "## Documentation"
 *
 * Run manually:  node scripts/check-pr-quality.mjs
 * Or wire into a git hook (e.g. pre-push).
 *
 * Set PR_DOCS="true" to skip the docs check (for workflow-only changes
 * documented via PR body).
 */

import { execSync } from 'child_process';

const BASE = process.argv[2] || 'origin/main';

let files;
try {
  files = execSync(`git diff --name-only ${BASE}...HEAD`, { encoding: 'utf8' })
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
} catch {
  console.error('Could not compute diff against', BASE);
  console.error('Make sure the remote "origin" exists and you have fetched it.');
  process.exit(1);
}

let exitCode = 0;

// ── check-changelog ────────────────────────────────────────────
const hasChangelog = files.some(f => f === 'CHANGELOG.md');

if (!hasChangelog) {
  console.error(
    '❌  CHANGELOG.md not modified in this branch.\n' +
    '    Every PR must include a CHANGELOG entry under [Unreleased].\n' +
    '    If this is an emergency hotfix, push with SKIP_QUALITY_CHECKS=true.\n'
  );
  exitCode = 1;
} else {
  console.log('✓  CHANGELOG.md modified');
}

// ── check-docs ─────────────────────────────────────────────────
const hasDocsFile = files.some(f => f.startsWith('docs/'));

let hasDocsSection = false;
try {
  const body = execSync('git log -1 --format=%B', { encoding: 'utf8' });
  hasDocsSection = body.includes('## Documentation');
} catch {
  // non-zero exit if no commits yet — that's fine
}

if (!hasDocsFile && !hasDocsSection) {
  console.error(
    '❌  No docs/ file modified and no "## Documentation" section in commit message.\n' +
    '    Every PR must either modify a file under docs/ OR include a\n' +
    '    "## Documentation" section in the PR body (simulated here via\n' +
    '    the latest commit message).\n' +
    '    If this is an emergency hotfix, push with SKIP_QUALITY_CHECKS=true.\n'
  );
  exitCode = 1;
} else {
  const reason = hasDocsFile ? 'docs/ files modified' : '## Documentation in commit message';
  console.log(`✓  Docs check passed (${reason})`);
}

if (exitCode === 0) {
  console.log('\n✔  All PR quality checks passed locally.');
} else {
  console.log(
    '\nTo skip these checks in CI, apply the "skip-quality-checks" label to the PR.'
  );
}

process.exit(exitCode);