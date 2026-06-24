/**
 * Sync layer — JSON-RPC calls to MCP Worker + admin save.
 * Includes offline queue with exponential backoff.
 */
import type { Topic, TopicMeta, QueuedSave, ConflictInfo, AppSettings, TopicSnapshot } from './types';
import { loadQueue, saveQueue } from './storage';

const JSON_RPC_VERSION = '2.0';
let _reqId = 1;
const nextId = () => _reqId++;

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

async function rpc<T>(
  host: string,
  method: string,
  params: Record<string, unknown> = {},
  apiKey?: string
): Promise<T> {
  const url = `${host}/mcp`;
  const body = JSON.stringify({
    jsonrpc: JSON_RPC_VERSION,
    id: nextId(),
    method,
    params,
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
  } else {
    console.warn('[sync] rpc() called without an API key — requests may be rejected by the Worker. Set your MCP API key in Settings.');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    const errMsg = res.status === 401
      ? `HTTP 401: Unauthorized — check your MCP API key in Settings`
      : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errMsg);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result as T;
}

// ── MCP tools ─────────────────────────────────────────────────────────────────

export interface RemoteTopic {
  key: string;
  text: string;
  meta: TopicMeta;
}

export async function listTopicsRemote(host: string, apiKey?: string): Promise<string[]> {
  const result = await rpc<{ keys: string[] }>(host, 'list_topics', {}, apiKey);
  return result.keys ?? [];
}

export async function getTopicRemote(host: string, key: string, apiKey?: string): Promise<RemoteTopic | null> {
  try {
    const result = await rpc<{ key: string; text: string; meta: TopicMeta | undefined }>(
      host, 'get_lore', { key }, apiKey
    );
    if (!result) return null;
    return {
      key: result.key,
      text: result.text ?? '',
      meta: result.meta ?? { version: 0, updatedAt: new Date().toISOString() },
    };
  } catch {
    return null;
  }
}




// ── Admin save ────────────────────────────────────────────────────────────────

export async function adminSave(
  host: string,
  key: string,
  text: string,
  secret: string
): Promise<void> {
  const url = `${host}/admin/set-lore`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, text, secret }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Admin save failed (${res.status}): ${msg}`);
  }
}

/**
 * Save multiple lore entries in a single HTTP request.
 * Requires POST /admin/set-lore-batch on the worker.
 */
export async function adminSaveBatch(
  host: string,
  items: Array<{ key: string; text: string }>,
  secret: string
): Promise<void> {
  if (!items.length) return;
  const url = `${host}/admin/set-lore-batch`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, secret }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Admin batch save failed (${res.status}): ${msg}`);
  }
}

// ── Admin delete ──────────────────────────────────────────────────────────────

export async function adminDelete(
  host: string,
  key: string,
  secret: string
): Promise<void> {
  const url = `${host}/admin/delete-lore`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, secret }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Admin delete failed (${res.status}): ${msg}`);
  }
}

/**
 * Delete multiple lore entries in a single HTTP request.
 * Requires POST /admin/delete-lore-batch on the worker.
 */
export async function adminDeleteBatch(
  host: string,
  keys: string[],
  secret: string
): Promise<void> {
  if (!keys.length) return;
  const url = `${host}/admin/delete-lore-batch`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys, secret }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Admin batch delete failed (${res.status}): ${msg}`);
  }
}

// ── Pending-delete queue (persisted to localStorage) ──────────────────────────

const PENDING_DELETES_KEY = 'lore_pending_deletes';

export function enqueuePendingDelete(key: string): void {
  const existing: string[] = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) ?? '[]');
  if (!existing.includes(key)) {
    existing.push(key);
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(existing));
  }
}

export function dequeuePendingDeletes(): string[] {
  const keys: string[] = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) ?? '[]');
  localStorage.removeItem(PENDING_DELETES_KEY);
  return keys;
}



// ── Conflict detection ────────────────────────────────────────────────────────

export function detectConflict(
  local: Topic,
  remote: RemoteTopic,
  base: string | null
): ConflictInfo | null {
  if (local.text === remote.text) return null;
  if (base !== null && remote.text === base) return null; // remote unchanged since last sync

  return {
    key: local.key,
    base: base ?? '',
    local: local.text,
    remote: remote.text,
    remoteMeta: remote.meta,
  };
}

// ── Offline queue with exponential backoff ────────────────────────────────────

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 2000;

function backoffDelay(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempts, 300_000); // cap at 5 min
}

export async function enqueue(key: string, text: string): Promise<void> {
  const queue = await loadQueue();
  const existing = queue.findIndex((q) => q.key === key);
  const entry: QueuedSave = {
    key,
    text,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };
  if (existing >= 0) {
    queue[existing] = entry;
  } else {
    queue.push(entry);
  }
  await saveQueue(queue);
}

export async function flushQueue(
  settings: AppSettings,
  secret: string,
  _onConflict?: (info: ConflictInfo) => void
): Promise<void> {
  const queue = await loadQueue();
  if (!queue.length) return;

  const eligible = queue.filter((item) => item.attempts < MAX_ATTEMPTS);
  const exceeded = queue.filter((item) => item.attempts >= MAX_ATTEMPTS);

  exceeded.forEach((item) =>
    console.warn(`Dropping queue item "${item.key}" after ${MAX_ATTEMPTS} attempts`)
  );

  if (!eligible.length) {
    await saveQueue([]);
    return;
  }

  // Apply backoff based on the highest attempt count in the batch
  const maxAttempts = Math.max(...eligible.map((i) => i.attempts));
  if (maxAttempts > 0) {
    await new Promise((r) => setTimeout(r, backoffDelay(maxAttempts)));
  }

  // One batch request instead of N parallel individual saves
  try {
    await adminSaveBatch(
      settings.workerHost,
      eligible.map((item) => ({ key: item.key, text: item.text })),
      secret
    );
    await saveQueue([]);
  } catch (err) {
    console.warn('Queue batch flush failed, will retry:', err);
    await saveQueue(eligible.map((item) => ({ ...item, attempts: item.attempts + 1 })));
  }
}

export async function batchGetTopicsRemote(host: string, keys: string[], apiKey?: string): Promise<Map<string, RemoteTopic>> {
  if (!keys.length) return new Map();
  // Single RPC call returning all requested topics — requires get_lore_batch on the worker.
  const result = await rpc<Record<string, { text: string; meta: TopicMeta } | null>>(
    host, 'get_lore_batch', { keys }, apiKey
  );
  const map = new Map<string, RemoteTopic>();
  for (const [key, val] of Object.entries(result ?? {})) {
    if (val) {
      map.set(key, {
        key,
        text: val.text ?? '',
        meta: val.meta ?? { version: 0, updatedAt: new Date().toISOString() },
      });
    }
  }
  return map;
}

/**
 * Pull all topics from remote in 2 calls: 1 list + 1 batch fetch.
 */
export async function pullAll(host: string, apiKey?: string): Promise<Map<string, RemoteTopic>> {
  const keys = await listTopicsRemote(host, apiKey);
  return batchGetTopicsRemote(host, keys, apiKey);
}

/**
 * Fetch snapshot histories for multiple topics in one call.
 */
export async function getTopicHistories(
  host: string,
  keys: string[],
  apiKey?: string
): Promise<Map<string, TopicSnapshot[]>> {
  if (!keys.length) return new Map();
  const result = await rpc<Record<string, Array<{ text: string; meta: TopicMeta }>>>(
    host,
    'get_topic_histories',
    { keys },
    apiKey
  );
  const map = new Map<string, TopicSnapshot[]>();
  for (const [key, snapshots] of Object.entries(result)) {
    map.set(key, snapshots ?? []);
  }
  return map;
}

// ── Changelog (delta sync) ─────────────────────────────────────────────────────
export interface ChangelogEntry {
  key: string
  version: number
  updatedAt: string
  op: 'write' | 'delete' | string
}

/**
 * Fetch only the write events that occurred after `since`.
 * Costs exactly 1 KV read on the server — no per-topic reads.
 * Throws on network failure so callers can fall back to a full sync.
 */
export async function getChanges(host: string, since: string, apiKey?: string): Promise<ChangelogEntry[]> {
  if (!since || typeof since !== 'string' || isNaN(Date.parse(since))) {
    console.warn('[sync] getChanges called with invalid since param:', since);
    return [];
  }
  const url = `${host}/changes?since=${encodeURIComponent(since)}`
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
  } else {
    console.warn('[sync] getChanges() called without an API key — requests may be rejected by the Worker. Set your MCP API key in Settings.');
  }
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const errMsg = res.status === 401
      ? `HTTP 401: Unauthorized — check your MCP API key in Settings`
      : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errMsg);
  }
  const json = await res.json() as { changes?: ChangelogEntry[] }
  return json.changes ?? []
}
