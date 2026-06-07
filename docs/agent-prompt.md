# Agent prompt — holmgard-lore-editor (and sibling repos)

Copy-paste the block below into a fresh Cline or Claude chat to bring the
agent up to speed on this repo's conventions, the GitHub Project tracker,
and the session-end workflow.

---

You are working in **FrozenRegister/holmgard-lore-editor** (and possibly its
sibling repos). Follow these conventions.

## 1. Project tracking

We track planned work in a GitHub Project (V2), **#3**
("holmgard-lore-editor development", owner: FrozenRegister).
All planning goes through `gh`, not custom scripts. The project node id is
`PVT_kwHOEMCAyM4BZ3n-` and the URL is
<https://github.com/users/FrozenRegister/projects/3>.

- **One-time auth** (the user's machine should already be set up):
  `gh auth refresh -s project` then verify with `gh auth status`.
- **Common ops**: `gh project list / view / item-list / item-create / item-edit / field-list`.
  See `.clinerules` for the full recipe cheatsheet.

## 2. New-topic convention

**When a new feature, phase, or topic is discussed and is not being implemented
immediately, add it to the project as a draft issue.** The body must include:

1. Concise title naming the feature
2. Status header as the first line: `**Status: back-burner. Full spec: <doc-path>**`
3. Implementation prompt — copy-pasteable for a future agent session, with all
   context, file paths, constraints, and acceptance criteria
4. Open questions at the end (if any)

If the work lives in a different repo, name that repo in the header and link
to its issues/PRs. Confirm with the user before creating items unless they
explicitly asked to track the topic.

## 3. Session-end protocol

At the end of a Cline/Claude session (when the user says "session summary",
"wrap up", or "log this"), call `Add-SessionSummary` to append a draft
issue to project #3:

```powershell
. .\scripts\session-end.ps1
Add-SessionSummary `
  -Title "Short, specific title (no leading `TEST:` outside test runs)" `
  -Summary "1-3 sentences: what landed and what's the state." `
  -Todos "First follow-up", "Second follow-up" `
  -FilesTouched "src/lib/foo.ts", "src/lib/__tests__/foo.test.ts" `
  -Doc "docs/future/<feature>.md" `
  -Status Done       # or "In Progress" or "Todo" (default Todo)
```

Always pass `-DryRun` first in a non-obvious case to preview the body, then
drop `-DryRun` to actually create it. Always confirm with the user before
creating the item unless they explicitly asked for the summary.

The body shape is standardized (see `.clinerules` for the full template):
`Status header` → `## Summary` → `## Todos (for next session)` → `## Files touched` → `## Context` → repo + project URL footer.

If `Add-SessionSummary` errors with `missing required scopes [project]`, run
`gh auth refresh -h github.com -s project` once and complete the browser prompt.

## 4. Git workflow

When the user asks to review and push:

- Split into **multiple logical commits** grouped by concern (one per
  library/module, one per UI page, dependencies separately, etc.). Use
  conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`,
  `refactor:`).
- **Push once** after all commits are made. Don't ask before pushing —
  this is default behavior.
- **Pair a new `.ts` file with its tests** in the same commit when possible
  (matches the existing `library/core module` pattern in this repo's history).

## 5. Key files

- **`.clinerules`** — canonical source of truth for the above. If this
  prompt ever conflicts with `.clinerules`, follow `.clinerules`.
- **`scripts/session-end.ps1`** — the `Add-SessionSummary` helper
- **`docs/style-guide.md`** — UI tokens, typography standards, and coding patterns.
- **`docs/future/<feature>.md`** — back-burner feature specs (e.g.
  `claude-map-tools.md` for the map↔MCP plan)
- **`scripts/`** — `gh`-driven scripts only. No custom PowerShell toolkits
  calling raw GraphQL — `gh` covers everything natively (including body
  edits on real issues via `gh issue edit`).

## 6. Sibling repos

- **holmgard-lore-mcp** — Cloudflare Worker serving the lore MCP server.
  Some phases of the map↔MCP plan live there (see `docs/future/claude-map-tools.md`).
  Track those phases as separate draft items in this same project, with
  the sibling repo named in the header.
