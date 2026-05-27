/**
 * Shared sync orchestrator — called by both the manual Sync button and the
 * auto-sync interval in the layout.
 *
 * runSync()       — full pull of all remote topics (manual / first-run)
 * runSmartSync()  — delta pull: fetches /changes first, then only re-fetches
 *                   the topics that actually changed (auto-sync interval)
 */
import { get } from 'svelte/store'
import { topics, settings, syncState, conflictQueue, showToast } from './stores'
import { saveTopic } from './storage'
import { pushHistory } from './history'
import {
  pullAll,
  adminDelete,
  detectConflict,
  enqueuePendingDelete,
  dequeuePendingDeletes,
  getTopicRemote,
  getChanges,
} from './sync'
import type { ChangelogEntry } from './sync'
import { getAdminSecret } from './auth'
import type { Topic, ConflictInfo } from './types'

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function flushPendingDeletes(host: string): Promise<void> {
  const pendingDeletes = dequeuePendingDeletes()
  if (!pendingDeletes.length) return
  const secret = await getAdminSecret()
  if (secret) {
    for (const key of pendingDeletes) {
      try {
        await adminDelete(host, key, secret)
      } catch (err) {
        enqueuePendingDelete(key)
        console.warn(`Delete failed for "${key}", re-queued:`, err)
      }
    }
  } else {
    pendingDeletes.forEach(enqueuePendingDelete)
  }
}

// ── Full sync (manual Sync button, first run, changelog fallback) ───────────────

export async function runSync(): Promise<void> {
  if (get(syncState).status === 'syncing') return
  syncState.set({ status: 'syncing' })
  try {
    const $settings = get(settings)
    await flushPendingDeletes($settings.workerHost)

    const remote = await pullAll($settings.workerHost)
    const localMap = new Map(get(topics).map((t) => [t.key, t]))
    const conflicts: ConflictInfo[] = []
    const newTopics: Topic[] = []

    for (const [key, rTopic] of remote) {
      if (!localMap.has(key)) {
        const t: Topic = { key, text: rTopic.text, meta: { ...rTopic.meta } }
        await saveTopic(t)
        if ($settings.syncHistory) await pushHistory(key, rTopic.text, rTopic.meta.version, 'remote')
        newTopics.push(t)
      } else {
        const local = localMap.get(key)!
        const conflict = detectConflict(local, rTopic, null)
        if (conflict) {
          conflicts.push(conflict)
          continue
        }
        if ((rTopic.meta.version ?? 0) > (local.meta.version ?? 0)) {
          const updated: Topic = { ...local, meta: { ...rTopic.meta } }
          await saveTopic(updated)
          topics.update((ts) => ts.map((t) => (t.key === key ? updated : t)))
        }
      }
    }

    if (conflicts.length) {
      conflictQueue.set(conflicts)
      syncState.set({ status: 'conflict' })
      showToast(
        `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected — review required`,
        'warning',
      )
    }
    if (newTopics.length) {
      topics.update((ts) =>
        [...ts, ...newTopics].sort((a, b) => a.key.localeCompare(b.key)),
      )
    }
    for (const [key, local] of localMap) {
      if (!remote.has(key) && !local.meta.removedFromRemote) {
        const flagged: Topic = {
          ...local,
          meta: { ...local.meta, removedFromRemote: true },
        }
        await saveTopic(flagged)
        topics.update((ts) => ts.map((t) => (t.key === key ? flagged : t)))
      }
    }

    if (!conflicts.length) {
      syncState.set({ status: 'success', lastSync: new Date().toISOString() })
    }
  } catch (err: any) {
    syncState.set({ status: 'error', error: err.message })
    showToast('Sync failed — check connection', 'error')
  }
}

// ── Smart sync (auto-sync interval) ───────────────────────────────────────────
// 1 KV read if nothing changed. N reads only for changed topics.
// Returns false if it had to abort and the caller should trigger a full sync.

export async function runSmartSync(since: string): Promise<boolean> {
  const $settings = get(settings)

  let changes: ChangelogEntry[]
  try {
    changes = await getChanges($settings.workerHost, since)
  } catch (err) {
    console.warn('Smart sync: changelog fetch failed, falling back to full sync', err)
    return false // caller will do runSync()
  }

  // Nothing wrote since last sync — update timestamp and done. Zero topic reads.
  if (changes.length === 0) {
    syncState.update((s) => ({ ...s, lastSync: new Date().toISOString() }))
    return true
  }

  // De-duplicate: keep only the latest change per key.
  const latestByKey = new Map<string, ChangelogEntry>()
  for (const entry of changes) {
    const existing = latestByKey.get(entry.key)
    if (!existing || new Date(entry.updatedAt) > new Date(existing.updatedAt)) {
      latestByKey.set(entry.key, entry)
    }
  }

  const localMap = new Map(get(topics).map((t) => [t.key, t]))
  const conflicts: ConflictInfo[] = []
  const newTopics: Topic[] = []

  for (const [key, change] of latestByKey) {
    // Handle deletes
    if (change.op === 'delete') {
      if (localMap.has(key)) {
        const local = localMap.get(key)!
        if (!local.meta.removedFromRemote) {
          const flagged: Topic = {
            ...local,
            meta: { ...local.meta, removedFromRemote: true },
          }
          await saveTopic(flagged)
          topics.update((ts) => ts.map((t) => (t.key === key ? flagged : t)))
        }
      }
      continue
    }

    // Fetch only this changed topic
    let remote
    try {
      remote = await getTopicRemote($settings.workerHost, key)
    } catch {
      continue
    }
    if (!remote) continue

    const local = localMap.get(key)
    if (!local) {
      // Brand new topic the editor doesn't have yet
      const t: Topic = { key, text: remote.text, meta: { ...remote.meta } }
      await saveTopic(t)
      if ($settings.syncHistory) await pushHistory(key, remote.text, remote.meta.version, 'remote')
      newTopics.push(t)
    } else {
      const conflict = detectConflict(local, remote, null)
      if (conflict) {
        conflicts.push(conflict)
        continue
      }
      if ((remote.meta.version ?? 0) > (local.meta.version ?? 0)) {
        const updated: Topic = { ...local, text: remote.text, meta: { ...remote.meta } }
        await saveTopic(updated)
        topics.update((ts) => ts.map((t) => (t.key === key ? updated : t)))
      }
    }
  }

  if (newTopics.length) {
    topics.update((ts) =>
      [...ts, ...newTopics].sort((a, b) => a.key.localeCompare(b.key)),
    )
  }

  if (conflicts.length) {
    conflictQueue.update((q) => [...q, ...conflicts])
    syncState.set({ status: 'conflict' })
    showToast(
      `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected — review required`,
      'warning',
    )
  } else {
    syncState.update((s) => ({
      ...s,
      status: s.status === 'conflict' ? 'conflict' : 'success',
      lastSync: new Date().toISOString(),
    }))
  }

  return true
}
