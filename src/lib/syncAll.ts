/**
 * Shared sync orchestrator — called by both the manual Sync button and the
 * auto-sync interval in the layout.
 */
import { get } from 'svelte/store';
import { topics, settings, syncState, conflictQueue, showToast } from './stores';
import { saveTopic } from './storage';
import { pushHistory } from './history';
import {
  pullAll,
  adminDelete,
  detectConflict,
  enqueuePendingDelete,
  dequeuePendingDeletes,
} from './sync';
import { getAdminSecret } from './auth';
import type { Topic, ConflictInfo } from './types';

export async function runSync(): Promise<void> {
  if (get(syncState).status === 'syncing') return;

  syncState.set({ status: 'syncing' });
  try {
    const $settings = get(settings);

    const pendingDeletes = dequeuePendingDeletes();
    if (pendingDeletes.length) {
      const secret = await getAdminSecret();
      if (secret) {
        for (const key of pendingDeletes) {
          try {
            await adminDelete($settings.workerHost, key, secret);
          } catch (err) {
            enqueuePendingDelete(key);
            console.warn(`Delete failed for "${key}", re-queued:`, err);
          }
        }
      } else {
        pendingDeletes.forEach(enqueuePendingDelete);
      }
    }

    const remote = await pullAll($settings.workerHost);
    const localMap = new Map(get(topics).map((t) => [t.key, t]));
    const conflicts: ConflictInfo[] = [];

    const newTopics: Topic[] = [];
    for (const [key, rTopic] of remote) {
      if (!localMap.has(key)) {
        const t: Topic = { key, text: rTopic.text, meta: { ...rTopic.meta } };
        await saveTopic(t);
        if ($settings.syncHistory) {
          await pushHistory(key, rTopic.text, rTopic.meta.version, 'remote');
        }
        newTopics.push(t);
      } else {
        const local = localMap.get(key)!;
        const conflict = detectConflict(local, rTopic, null);
        if (conflict) {
          conflicts.push(conflict);
          continue;
        }

        if ((rTopic.meta.version ?? 0) > (local.meta.version ?? 0)) {
          // texts matched (detectConflict passed), so only meta needs updating
          const updated: Topic = { ...local, meta: { ...rTopic.meta } };
          await saveTopic(updated);
          topics.update((ts) => ts.map((t) => (t.key === key ? updated : t)));
        }
      }
    }

    if (conflicts.length) {
      conflictQueue.set(conflicts);
      syncState.set({ status: 'conflict' });
      showToast(
        `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected — review required`,
        'warning',
      );
    }

    if (newTopics.length) {
      topics.update((ts) =>
        [...ts, ...newTopics].sort((a, b) => a.key.localeCompare(b.key)),
      );
    }

    for (const [key, local] of localMap) {
      if (!remote.has(key) && !local.meta.removedFromRemote) {
        const flagged: Topic = { ...local, meta: { ...local.meta, removedFromRemote: true } };
        await saveTopic(flagged);
        topics.update((ts) => ts.map((t) => (t.key === key ? flagged : t)));
      }
    }

    if (!conflicts.length) {
      syncState.set({ status: 'success', lastSync: new Date().toISOString() });
    }
  } catch (err: any) {
    syncState.set({ status: 'error', error: err.message });
    showToast('Sync failed — check connection', 'error');
  }
}
