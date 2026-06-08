# Issue #46: Editor MCP Authentication Not Working — Handoff Prompt

## Quick Context
The Holmgard Lore Editor (SvelteKit frontend) connects to the MCP Worker at `https://holmgard-lore-mcp.frozenregister.workers.dev`. The user cannot authenticate — sync operations fail because the `X-Api-Key` header is not being sent, or the key the user has is wrong. Previous work (see session summary below) added diagnostics, fixed a false-positive test, and wired the `check_authentication` tool — but authentication still does not succeed.

## The user has confirmed:
- "I still cannot authenticate"
- "the MCP isn't working"

## What We've Already Done (in main, commit 60943cf)
Three PRs have already landed:

| PR | What |
|----|------|
| #47 | `sync.ts`, `mcp.ts`, `syncAll.ts` — `console.warn()` when API key is missing; 401 errors produce a hint to check Settings |
| #51 | Fixed `testAdminSecret()` in Settings page — was testing the wrong endpoint. Fixed false positive on the admin secret "Test" button. |
| #53 | Added `checkAuth()` helper in `mcp.ts` that calls Worker's `check_authentication` tool. Wired it into both `testConnection()` and `testMcpApiKey()` on the Settings page. Added 4 unit tests. |

**Current test count: 512 passing.**

## New Agent Prompt

---

You are fixing a broken authentication flow between the Holmgard Lore Editor frontend and the MCP Worker.

**Your mission: Find and fix why the editor cannot authenticate to the MCP Worker.** The issue is **not** resolved. Diagnostic logging was already added, the test buttons now work correctly, and a `checkAuth()` helper already exists. Something more fundamental is broken.

### Step 1 — Reproduce and diagnose

Run these commands to understand the Worker's behavior:

```powershell
# Confirm the Worker is alive
curl https://holmgard-lore-mcp.frozenregister.workers.dev/mcp -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Check authentication WITHOUT a key (should return authenticated: false)
curl -s https://holmgard-lore-mcp.frozenregister.workers.dev/mcp -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_authentication","arguments":{}}}'

# Check authentication WITH the key the user says they have (storm-altar-twilight-dryad-ember)
curl -s https://holmgard-lore-mcp.frozenregister.workers.dev/mcp -X POST -H "Content-Type: application/json" -H "X-Api-Key: storm-altar-twilight-dryad-ember" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_authentication","arguments":{}}}'

# Try list_topics with the key
curl -s https://holmgard-lore-mcp.frozenregister.workers.dev/mcp -X POST -H "Content-Type: application/json" -H "X-Api-Key: storm-altar-twilight-dryad-ember" -d '{"jsonrpc":"2.0","id":1,"method":"list_topics","params":{}}'
```

### Step 2 — Trace the actual data flow in the editor

Key files to examine:

- **`src/lib/auth.ts`** — `getMcpApiKey()` reads from `localStorage.getItem('hle:mcpApiKey')` or Tauri keyring. Verify the key name is correct.
- **`src/routes/settings/+page.svelte`** — Where the user enters and saves the MCP API key. The `saveMcpKey()` function calls `setMcpApiKey()` which writes to `localStorage.setItem('hle:mcpApiKey', key)`.
- **`src/lib/sync.ts`** — `rpc()` function builds headers with `if (apiKey) headers['X-Api-Key'] = apiKey` and calls fetch. This is where sync requests are made.
- **`src/lib/syncAll.ts`** — `runSync()` and `runSmartSync()` call `getMcpApiKey()` and pass it to sync functions.
- **`src/lib/mcp.ts`** — `callTool()` and `listTools()` also build headers with the apiKey parameter.

### Step 3 — Diagnostic checklist

Start the dev server (`pnpm dev`), open browser console, and:

1. Open Settings page — does the MCP API Key section show "Set ✓" or "Not set"?
2. Click "Test" in the MCP Worker section with a key entered — what does the toast say? (Should now say definitively "valid" or "rejected")
3. Open DevTools → Application → Local Storage — is `hle:mcpApiKey` present? Is its value correct?
4. Open DevTools → Network tab — trigger a sync. Look at the request headers. Does `X-Api-Key` appear in the request? What is the response status and body?
5. Check browser console for `[sync]` and `[mcp]` and `[syncAll]` log messages.

### Step 4 — Potential root causes to investigate

1. **The key is not actually an MCP API key** — `storm-altar-twilight-dryad-ember` might be an admin secret or a different credential. Confirm with the user what this value is.
2. **Two different keys may be needed** — `X-Api-Key` (for /mcp reads) and a separate admin secret (for /admin/* writes). They may be different values.
3. **The Worker may use a different auth scheme** — it might check `X-Admin-Secret` or some other header, not `X-Api-Key`. The `check_authentication` tool's response will tell us.
4. **CORS or CSP issues** — the browser might be blocking the request before headers are sent.
5. **Missing API key in the chain** — somewhere between `getMcpApiKey()` and the actual `fetch()` call, the key might be lost (e.g., `null ?? undefined` → `undefined`, which browsers drop from headers).

### Step 5 — Fix and test

Once you find the root cause, fix it, add tests, commit with a descriptive message, push to a new branch, open a PR, and merge.

**Referenced issues:** #46 (original), #47 (merged), #51 (merged), #53 (merged)  
**Follow-up issues:** #48, #49, #50

---

## Repo Info
- **Repo:** `FrozenRegister/holmgard-lore-editor`
- **Current commit on main:** `60943cf3ea47accf7345af1b7529b87880b6c860`
- **Project:** SvelteKit frontend + Cloudflare Worker backend
- **Test command:** `pnpm test` (should be 512 tests)