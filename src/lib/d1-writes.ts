import type { CharacterPatch } from './character-sheet';
import type { CharacterRecord, EntityRelationRecord } from './d1-reads';
import { fetchCharacters } from './d1-reads';

/** Fetch a single character by D1 id. */
export async function fetchCharacterById(
  host: string,
  id: string,
): Promise<CharacterRecord | null> {
  const res = await fetch(`${host}/api/entities/characters/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Character fetch failed: ${res.status}`);
  const json = (await res.json()) as { character?: CharacterRecord };
  return json.character ?? null;
}

/** Find a character by its kv_origin (topic key like "character:aldric"). */
export async function fetchCharacterByKvOrigin(
  host: string,
  kvOrigin: string,
): Promise<CharacterRecord | null> {
  const all = await fetchCharacters(host);
  return all.find(c => c.kv_origin === kvOrigin) ?? null;
}

// ── Entity relations ──────────────────────────────────────────────────────────

export interface CreateRelationPayload {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation_type: string;
  attitude?: number | null;
  is_bidirectional?: boolean;
  color?: string | null;
  is_pinned?: boolean;
  is_private?: boolean;
  notes?: string | null;
}

export async function createEntityRelation(
  host: string,
  payload: CreateRelationPayload,
  adminSecret: string,
): Promise<string> {
  const res = await fetch(`${host}/admin/relations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create relation failed: ${res.status}`);
  const json = await res.json() as { id?: string };
  return json.id ?? '';
}

export async function updateEntityRelation(
  host: string,
  id: string,
  patch: Partial<Pick<EntityRelationRecord, 'relation_type' | 'attitude' | 'is_bidirectional' | 'color' | 'is_pinned' | 'is_private' | 'notes'>>,
  adminSecret: string,
): Promise<void> {
  const res = await fetch(`${host}/admin/relations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update relation failed: ${res.status}`);
}

export async function deleteEntityRelation(
  host: string,
  id: string,
  adminSecret: string,
): Promise<void> {
  const res = await fetch(`${host}/admin/relations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Secret': adminSecret },
  });
  if (!res.ok) throw new Error(`Delete relation failed: ${res.status}`);
}

/** PATCH a character's structured fields in D1. Requires the admin secret. */
export async function patchCharacter(
  host: string,
  id: string,
  patch: CharacterPatch,
  adminSecret: string,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const res = await fetch(`${host}/api/entities/characters/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Character PATCH failed: ${res.status}`);
}
