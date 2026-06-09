# AI Automation Pipeline

This document describes the shared GitHub Actions automation system used across both `holmgard-lore-mcp` and `holmgard-lore-editor` repositories, including issue triage, agent assignment, parallel batching, and PR quality enforcement.

**Note:** Both repositories use the same automation workflows for consistency. See the `holmgard-lore-mcp` repository for the complete detailed documentation, label definitions, and troubleshooting guide: [`docs/ai-automation-pipeline.md`](https://github.com/FrozenRegister/holmgard-lore-mcp/blob/main/docs/ai-automation-pipeline.md)

## Quick Start

### Step 1: Bootstrap Labels

Run the **Setup Labels** workflow:

1. Go to **Actions** → **Setup Labels**
2. Click **Run workflow**
3. Wait for completion — all 24 labels will be created

### Step 2: Tag New Issues

- **Automatic:** New issues are auto-tagged by surface area and complexity
- **Manual:** Existing issues can be manually labeled or will be auto-tagged on next edit

### Step 3: Batch and Assign

When ready to parallelize:

1. Go to **Actions** → **Parallelize Issues**
2. Click **Run workflow**
3. Each issue receives a `batch:N` label, assignment comment, and work-order

### Step 4: Develop

Check out the branch from the work-order comment:

```bash
git checkout -b issue/<number>-<slug>
# ... implement ...
npm run test  # or pnpm test in this repo
git push origin issue/<number>-<slug>
```

### Step 5: Merge

When ready and all CI checks pass:
- Manually merge, OR
- Apply the `auto-merge` label to queue for automatic merge

---

## Workflows Summary

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **Setup Labels** | Manual | Bootstrap all 24 required labels |
| **Issue Tagger** | Issue opened/edited | Auto-label by surface area & depth |
| **Parallelize Issues** | Manual | Group open issues into batches |
| **Agent Assignment** | Batch label applied | Assign AI agent (claude/cline) |
| **Agent Trigger** | Agent label applied | Post work-order comment |
| **PR Quality** | PR opened/updated | Require CHANGELOG & docs |
| **Auto-Merge** | Auto-merge label | Merge after CI passes |

---

## Labels Used

### Surface Areas
- `surface:API` — HTTP routes, endpoints, handlers
- `surface:state` — Storage, KV, state management
- `surface:utils` — Helpers, utilities, shared code
- `surface:build` — CI, deploy, bundling
- `surface:docs` — Documentation, changelog
- `surface:tests` — Test coverage
- `surface:admin` — Admin, auth, secrets

### Depth (Complexity)
- `depth:0` — Trivial (typo, config)
- `depth:1` — Small (single-file)
- `depth:2` — Moderate (2–3 files)
- `depth:3` — Complex (cross-cutting)
- `depth:4` — Major (new subsystem)

### Batching & Assignment
- `batch:1`, `batch:2`, `batch:3` — Parallel work groups
- `agent:claude`, `agent:cline` — Assigned AI agent

### Quality & Process
- `auto-merge` — Auto-merge after CI
- `skip-quality-checks` — Bypass CHANGELOG/docs checks (hotfix only)

---

## Key Rules

1. **Every PR needs CHANGELOG.md updates** (or `skip-quality-checks` to bypass)
2. **Every PR needs docs updates** (either files under `docs/` or a `## Documentation` section in PR body)
3. **Tests must pass** before merge
4. **Issues in the same batch share surface areas** and should be worked sequentially
5. **Issues in different batches** can be worked in parallel

---

## For More Information

See the complete documentation in `holmgard-lore-mcp`:
- **Full guide:** [`docs/ai-automation-pipeline.md`](https://github.com/FrozenRegister/holmgard-lore-mcp/blob/main/docs/ai-automation-pipeline.md)
- **Architecture:** [`CLAUDE.md`](https://github.com/FrozenRegister/holmgard-lore-mcp/blob/main/CLAUDE.md)
- **Issue:** [#33](https://github.com/FrozenRegister/holmgard-lore-mcp/issues/33)
