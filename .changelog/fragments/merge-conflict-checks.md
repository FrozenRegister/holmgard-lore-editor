### Merge Conflict Detection

- **Added conflict checking to CLAUDE.md** with command to detect conflicts early: `git merge-base --is-ancestor origin/main HEAD`
- **Added GitHub Actions workflow check** `check-merge-conflicts` that runs on PR open/synchronize/ready_for_review/edited
- Workflow verifies branch is based on latest main and detects merge conflicts before CI runs
- Provides clear instructions for local conflict resolution via rebase

This proactive approach catches issues during development and prevents stale branches from causing conflicts at merge time.
