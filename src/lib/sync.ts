/**
 * Sync layer — JSON-RPC calls to MCP Worker + admin save.
 * Includes offline queue with exponential backoff.
 */
import type { Topic, TopicMeta, QueuedSave, ConflictInfo, AppSettings } from './types';
import { loadQueue, saveQueue } from './storage';

const JSON_RPC_VERSION = '2.0';
let _reqId = 1;
const nextId = () => _reqId++;

// Handles both old (raw string) and new ({ text, meta }) KV formats
function parseKvEntry(raw: string): { text: string; meta: TopicMeta } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.text === 'string') {
      return {
        text: parsed.text,
        meta: {
          version:   typeof parsed.meta?.version   === 'number' ? parsed.meta.version   : 1,
          updatedAt: typeof parsed.meta?.updatedAt === 'string' ? parsed.meta.updatedAt : new Date().toISOString(),
        },
      };
    }
  } catch {}
  return { text: raw, meta: { version: 1, updatedAt: new Date().toISOString() } };
}



// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

async function rpc<T>(
  host: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const url = `${host}/mcp`;
  const body = JSON.stringify({
    jsonrpc: JSON_RPC_VERSION,
    id: nextId(),
    method,
    params,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
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

export async function listTopicsRemote(host: string): Promise<string[]> {
  const result = await rpc<{ keys: string[] }>(host, 'list_topics', {});
  return result.keys ?? [];
}

export async function getTopicRemote(host: string, key: string): Promise<RemoteTopic | null> {
  try {
    const result = await rpc<{ key: string; text: string; meta: TopicMeta | undefined }>(
      host, 'get_lore', { key }
    );
    if (!result) return null;
    return {
      key: result.key,
      text: result.text,
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
  if (remote.text === local.text) return null;
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
  onConflict: (info: ConflictInfo) => void
): Promise<void> {
  const queue = await loadQueue();
  if (!queue.length) return;

  const remaining: QueuedSave[] = [];

  for (const item of queue) {
    if (item.attempts >= MAX_ATTEMPTS) continue; // drop after max attempts

    await new Promise((r) => setTimeout(r, backoffDelay(item.attempts)));

    try {
      await adminSave(settings.workerHost, item.key, item.text, secret);
    } catch (err) {
      console.warn(`Queue flush failed for "${item.key}" (attempt ${item.attempts + 1}):`, err);
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  await saveQueue(remaining);
}

// ── Full sync cycle ───────────────────────────────────────────────────────────

/**
 * Pull all topics from remote and return a map of remote topics.
 * Callers compare with local state to detect conflicts.
 */
export async function pullAll(host: string): Promise<Map<string, RemoteTopic>> {
  const keys = await listTopicsRemote(host);
  const map = new Map<string, RemoteTopic>();
  await Promise.all(
    keys.map(async (key) => {
      const t = await getTopicRemote(host, key);
      if (t) map.set(key, t);
    })
  );
  return map;
}
