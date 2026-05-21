/**
 * Local version history — keeps the last 50 saves per topic.
 * Stored as `history/<key>.json` via the storage layer.
 */
import { invoke } from '@tauri-apps/api/tauri';
import type { HistoryEntry } from './types';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;
const MAX_ENTRIES = 50;
const HISTORY_DIR = 'history';

function historyPath(key: string) {
  return `${HISTORY_DIR}/${encodeURIComponent(key)}.json`;
}

async function readRaw(path: string): Promise<string | null> {
  if (IS_TAURI) {
    try { return await invoke<string>('fs_read', { path }); } catch { return null; }
  }
  return localStorage.getItem(`hle:file:${path}`);
}

async function writeRaw(path: string, content: string): Promise<void> {
  if (IS_TAURI) {
    await invoke('fs_write', { path, content });
  } else {
    localStorage.setItem(`hle:file:${path}`, content);
  }
}

export async function loadHistory(key: string): Promise<HistoryEntry[]> {
  const raw = await readRaw(historyPath(key));
  if (!raw) return [];
  try { return JSON.parse(raw) as HistoryEntry[]; } catch { return []; }
}

export async function pushHistory(
  key: string,
  text: string,
  version: number
): Promise<void> {
  const entries = await loadHistory(key);
  const entry: HistoryEntry = {
    savedAt: new Date().toISOString(),
    version,
    text,
  };
  // Newest first; trim to MAX_ENTRIES
  const updated = [entry, ...entries].slice(0, MAX_ENTRIES);
  await writeRaw(historyPath(key), JSON.stringify(updated, null, 2));
}

export async function clearHistory(key: string): Promise<void> {
  if (IS_TAURI) {
    try { await invoke('fs_delete', { path: historyPath(key) }); } catch { /* ok */ }
  } else {
    localStorage.removeItem(`hle:file:${historyPath(key)}`);
  }
}
