export interface CharacterRecord {
  id: string;
  name: string;
  character_type: string;
  character_class: string;
  race: string;
  level: number;
  hp: number;
  max_hp: number;
  ac: number;
  alignment: string | null;
  background: string | null;
  faction_id: string | null;
  current_room_id: string | null;
  kv_origin: string | null;
}

export interface LocationRecord {
  id: string;
  name: string;
  biome_context: string | null;
  visited_count: number;
  last_visited_at: string | null;
}

export interface LocationDetailRecord extends LocationRecord {
  base_description: string | null;
  local_x: number | null;
  local_y: number | null;
  network_id: string | null;
}

export interface NationRecord {
  id: string;
  name: string;
  leader: string;
  ideology: string;
  aggression: number;
  trust: number;
  paranoia: number;
  gdp: number;
}

export interface RegionRecord {
  id: string;
  name: string;
  type: string;
  owner_nation_id: string | null;
}

export interface RegionDetailRecord extends RegionRecord {
  owner_nation_name: string | null;
}

export interface QuestRecord {
  id: string;
  name: string;
  description: string;
  status: string;
  giver: string | null;
}

export interface QuestLogEntry {
  id: string;
  note: string;
  created_at: string;
}

export interface ItemRecord {
  id: string;
  name: string;
  type: string;
  value: number;
  weight: number;
}

export interface RaceRecord {
  id: string;
  name: string;
  description: string;
  is_extinct: boolean;
  parent_race_id: string | null;
}

export type EntityRecord =
  | CharacterRecord
  | LocationRecord
  | NationRecord
  | RegionRecord
  | QuestRecord
  | ItemRecord
  | RaceRecord;

async function fetchEntities<T>(host: string, slug: string): Promise<T[]> {
  const res = await fetch(`${host}/api/entities/${slug}`);
  if (!res.ok) throw new Error(`Entity fetch failed: ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  return ((json[slug] as T[] | undefined) ?? []);
}

export const fetchCharacters = (host: string) => fetchEntities<CharacterRecord>(host, 'characters');
export const fetchLocations  = (host: string) => fetchEntities<LocationRecord>(host, 'locations');
export const fetchNations    = (host: string) => fetchEntities<NationRecord>(host, 'nations');
export const fetchRegions    = (host: string) => fetchEntities<RegionRecord>(host, 'regions');
export const fetchQuests     = (host: string) => fetchEntities<QuestRecord>(host, 'quests');
export const fetchItems      = (host: string) => fetchEntities<ItemRecord>(host, 'items');
export const fetchRaces      = (host: string) => fetchEntities<RaceRecord>(host, 'races');

export const ENTITY_FETCHERS: Record<string, (host: string) => Promise<EntityRecord[]>> = {
  characters: fetchCharacters as (host: string) => Promise<EntityRecord[]>,
  locations:  fetchLocations  as (host: string) => Promise<EntityRecord[]>,
  nations:    fetchNations    as (host: string) => Promise<EntityRecord[]>,
  regions:    fetchRegions    as (host: string) => Promise<EntityRecord[]>,
  quests:     fetchQuests     as (host: string) => Promise<EntityRecord[]>,
  items:      fetchItems      as (host: string) => Promise<EntityRecord[]>,
  races:      fetchRaces      as (host: string) => Promise<EntityRecord[]>,
};

// ── Character relationship + inventory types ──────────────────────────────────

export interface NpcRelationshipRecord {
  target_id: string;
  target_name: string;
  target_type: string;
  target_kv_origin: string | null;
  familiarity: string;
  disposition: string;
  interaction_count: number;
  last_interaction_at: string | null;
}

export interface PartyMemberRecord {
  character_id: string;
  name: string;
  character_type: string;
  kv_origin: string | null;
  role: string;
  party_id: string;
  party_name: string;
}

export interface CharacterRelationships {
  npc_relationships: NpcRelationshipRecord[];
  party_members: PartyMemberRecord[];
}

export interface CharacterInventoryItem {
  item_id: string;
  name: string;
  type: string;
  quantity: number;
  equipped: boolean;
  slot: string | null;
  value: number;
  weight: number;
}

export async function fetchCharacterRelationships(host: string, id: string): Promise<CharacterRelationships> {
  const res = await fetch(`${host}/api/entities/characters/${encodeURIComponent(id)}/relationships`);
  if (!res.ok) throw new Error(`Relationships fetch failed: ${res.status}`);
  const json = await res.json() as Partial<CharacterRelationships>;
  return {
    npc_relationships: json.npc_relationships ?? [],
    party_members: json.party_members ?? [],
  };
}

export async function fetchCharacterInventory(host: string, id: string): Promise<CharacterInventoryItem[]> {
  const res = await fetch(`${host}/api/entities/characters/${encodeURIComponent(id)}/inventory`);
  if (!res.ok) throw new Error(`Inventory fetch failed: ${res.status}`);
  const json = await res.json() as { items?: CharacterInventoryItem[] };
  return json.items ?? [];
}

export async function fetchLocationById(host: string, id: string): Promise<LocationDetailRecord | null> {
  const res = await fetch(`${host}/api/entities/locations/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Location fetch failed: ${res.status}`);
  const json = await res.json() as { location?: LocationDetailRecord };
  return json.location ?? null;
}

export async function fetchLocationOccupants(host: string, id: string): Promise<CharacterRecord[]> {
  const res = await fetch(`${host}/api/entities/locations/${encodeURIComponent(id)}/occupants`);
  if (!res.ok) throw new Error(`Occupants fetch failed: ${res.status}`);
  const json = await res.json() as { occupants?: CharacterRecord[] };
  return json.occupants ?? [];
}

// ── Entity relations ──────────────────────────────────────────────────────────

export interface EntityRelationRecord {
  id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation_type: string;
  attitude: number | null;
  is_bidirectional: boolean;
  color: string | null;
  is_pinned: boolean;
  is_private: boolean;
  notes: string | null;
  created_at: string;
}

export async function fetchEntityRelations(
  host: string,
  entityTypeSlug: string,
  entityId: string,
): Promise<EntityRelationRecord[]> {
  const res = await fetch(
    `${host}/api/entities/${encodeURIComponent(entityTypeSlug)}/${encodeURIComponent(entityId)}/relations`,
  );
  if (!res.ok) throw new Error(`Relations fetch failed: ${res.status}`);
  const json = await res.json() as { relations?: EntityRelationRecord[] };
  return json.relations ?? [];
}

/** Get the display name from any entity record (all types share a `name` field). */
export function getEntityName(record: EntityRecord): string {
  return (record as { name: string }).name ?? 'Unknown';
}

/** Format a one-line subtitle for a D1 entity record based on its type. */
export function getEntitySummary(entityType: string, record: EntityRecord): string {
  switch (entityType) {
    case 'character': {
      const r = record as CharacterRecord;
      return `${r.race} ${r.character_class} · Lv.${r.level} · ${r.hp}/${r.max_hp} HP · AC ${r.ac}`;
    }
    case 'location': {
      const r = record as LocationRecord;
      const biome = r.biome_context ?? 'unknown biome';
      return `${biome} · visited ${r.visited_count}×`;
    }
    case 'nation': {
      const r = record as NationRecord;
      return `led by ${r.leader} · ${r.ideology}`;
    }
    case 'region': {
      const r = record as RegionRecord;
      return r.type;
    }
    case 'quest': {
      const r = record as QuestRecord;
      return r.giver ? `${r.status} · from ${r.giver}` : r.status;
    }
    case 'item': {
      const r = record as ItemRecord;
      return `${r.type} · ${r.value}gp`;
    }
    case 'race': {
      const r = record as RaceRecord;
      return r.is_extinct ? 'Extinct' : 'Active';
    }
    default:
      return '';
  }
}

// ── Entity detail fetch functions ─────────────────────────────────────────────

export async function fetchNationById(host: string, id: string): Promise<NationRecord | null> {
  const res = await fetch(`${host}/api/entities/nations/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Nation fetch failed: ${res.status}`);
  const json = await res.json() as { nation?: NationRecord };
  return json.nation ?? null;
}

export async function fetchRegionById(host: string, id: string): Promise<RegionDetailRecord | null> {
  const res = await fetch(`${host}/api/entities/regions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Region fetch failed: ${res.status}`);
  const json = await res.json() as { region?: RegionDetailRecord };
  return json.region ?? null;
}

export async function fetchQuestById(host: string, id: string): Promise<QuestRecord | null> {
  const res = await fetch(`${host}/api/entities/quests/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Quest fetch failed: ${res.status}`);
  const json = await res.json() as { quest?: QuestRecord };
  return json.quest ?? null;
}

export async function fetchQuestLog(host: string, id: string): Promise<QuestLogEntry[]> {
  const res = await fetch(`${host}/api/entities/quests/${encodeURIComponent(id)}/log`);
  if (!res.ok) throw new Error(`Quest log fetch failed: ${res.status}`);
  const json = await res.json() as { entries?: QuestLogEntry[] };
  return json.entries ?? [];
}

export async function fetchItemById(host: string, id: string): Promise<ItemRecord | null> {
  const res = await fetch(`${host}/api/entities/items/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Item fetch failed: ${res.status}`);
  const json = await res.json() as { item?: ItemRecord };
  return json.item ?? null;
}

export async function fetchRaceById(host: string, id: string): Promise<RaceRecord | null> {
  const res = await fetch(`${host}/api/entities/races/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Race fetch failed: ${res.status}`);
  const json = await res.json() as { race?: RaceRecord };
  return json.race ?? null;
}
