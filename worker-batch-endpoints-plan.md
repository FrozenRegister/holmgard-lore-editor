# Worker Batch Endpoints — Implementation Plan

## Background

The lore editor client (`holmgard-lore-editor`) was generating millions of Cloudflare Worker
invocations from a single user. Root cause: the sync layer was firing one HTTP request per
topic key instead of one request for all keys combined. For a user with 100 topics, a full
sync produced 101 simultaneous HTTP requests.

The client has been updated (PR #131) to call three new batch endpoints. Until those endpoints
are deployed, the client will receive HTTP 404 errors and sync will fail. The three endpoints
need to be implemented in this worker.

---

## Existing Patterns to Copy

Before writing any new code, read these existing handlers — the new endpoints are near-identical:

| New endpoint | Copy from |
|---|---|
| `get_lore_batch` MCP method | `get_topic_histories` MCP method |
| `POST /admin/set-lore-batch` | `POST /admin/set-lore` |
| `POST /admin/delete-lore-batch` | `POST /admin/delete-lore` |

The `get_topic_histories` handler already accepts `{ keys: string[] }` and returns
`Record<string, T[]>` in a single RPC call — `get_lore_batch` is the identical pattern
applied to `get_lore`.

---

## Endpoint 1 — `get_lore_batch` (MCP JSON-RPC method)

### Request

Sent to the existing `POST /mcp` endpoint as a JSON-RPC body:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "get_lore_batch",
  "params": {
    "keys": ["location:crowkeep", "character:aldric", "faction:ironveil"]
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "location:crowkeep": { "text": "...", "meta": { "version": 3, "updatedAt": "2026-06-01T00:00:00Z" } },
    "character:aldric":  { "text": "...", "meta": { "version": 1, "updatedAt": "2026-05-15T00:00:00Z" } },
    "faction:ironveil":  null
  }
}
```

### Implementation notes

- Keys not found in KV → return `null` for that key (not an error, not omitted).
- Internally: `Promise.all(keys.map(key => kv.get(key, 'json')))` — N KV reads happen inside
  one Worker invocation, only 1 HTTP round-trip from the client.
- The existing `get_lore` single-key method should remain unchanged for single-topic lookups.
- Auth: same API key check (`X-Api-Key` header) as the existing MCP methods.
- `params.keys` must be an array; return a JSON-RPC error if it is missing or not an array.

---

## Endpoint 2 — `POST /admin/set-lore-batch`

### Request body

```json
{
  "secret": "<admin-secret>",
  "items": [
    { "key": "location:crowkeep", "text": "Updated text for Crowkeep..." },
    { "key": "character:aldric",  "text": "Updated text for Aldric..." }
  ]
}
```

### Response (success)

```json
{ "ok": true, "saved": 2 }
```

### Response (failure)

```json
{ "ok": false, "error": "KV write failed", "failedKeys": ["location:crowkeep"] }
```

Return HTTP 500 on any KV write failure.

### Implementation notes

- Validate `secret` exactly as `POST /admin/set-lore` does.
- Write all items: `await Promise.all(items.map(({ key, text }) => kv.put(key, text, { metadata })))`.
- Each item must also append to the changelog (same logic as the single `/admin/set-lore`
  handler — a `"write"` op with `{ key, version, updatedAt }` per item). You can append all
  changelog entries in a single changelog update after all KV writes succeed, rather than one
  per write.
- If any KV put throws, return HTTP 500. The client will retry the entire batch on the next
  flush cycle.
- `items` must be a non-empty array; validate and return 400 if missing or empty.

---

## Endpoint 3 — `POST /admin/delete-lore-batch`

### Request body

```json
{
  "secret": "<admin-secret>",
  "keys": ["location:crowkeep", "character:aldric"]
}
```

### Response (success)

```json
{ "ok": true, "deleted": 2 }
```

### Implementation notes

- Validate `secret` exactly as `POST /admin/delete-lore` does.
- Delete all keys: `await Promise.all(keys.map(key => kv.delete(key)))`.
- Each deletion must append a `"delete"` op to the changelog (same as single `/admin/delete-lore`).
- If any KV delete throws, return HTTP 500.
- `keys` must be a non-empty array; validate and return 400 if missing or empty.

---

## Impact Once Deployed

| Scenario | Before | After |
|---|---|---|
| Full sync (100 topics) | 101 HTTP requests | 2 HTTP requests |
| Smart sync (5 changed topics) | 6 HTTP requests | 2 HTTP requests |
| Flush 20 queued saves | 20 HTTP requests | 1 HTTP request |
| Flush 10 pending deletes | 10 HTTP requests | 1 HTTP request |

---

## Client Contract (for reference)

The client functions that call these endpoints are in `src/lib/sync.ts` of the
`holmgard-lore-editor` repo. Their signatures are:

```typescript
// Calls get_lore_batch via POST /mcp
async function batchGetTopicsRemote(host, keys, apiKey): Promise<Map<string, RemoteTopic>>

// Calls POST /admin/set-lore-batch
async function adminSaveBatch(host, items: {key,text}[], secret): Promise<void>

// Calls POST /admin/delete-lore-batch
async function adminDeleteBatch(host, keys: string[], secret): Promise<void>
```

The client expects:
- `get_lore_batch` result to be `Record<string, { text: string; meta: TopicMeta } | null>`
- `/admin/set-lore-batch` to return HTTP 2xx on success (body not read)
- `/admin/delete-lore-batch` to return HTTP 2xx on success (body not read)

---

## Verification

After deploying:

1. Open the lore editor and trigger a manual **Sync** — DevTools Network tab should show
   exactly **2 requests** to the worker (`list_topics` + `get_lore_batch`), not N individual
   `get_lore` calls.
2. Edit a topic and wait for the offline queue to flush — should be **1 request** to
   `/admin/set-lore-batch` for any number of pending saves.
3. Delete a topic while offline, then sync — should be **1 request** to
   `/admin/delete-lore-batch`.
