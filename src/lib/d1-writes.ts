import type { CharacterPatch } from './character-sheet';
import type { CharacterRecord } from './d1-reads';
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
