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
  kv_origin: string | null;
}

export interface LocationRecord {
  id: string;
  name: string;
  biome_context: string | null;
  visited_count: number;
  last_visited_at: string | null;
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

export interface QuestRecord {
  id: string;
  name: string;
  description: string;
  status: string;
  giver: string | null;
}

export interface ItemRecord {
  id: string;
  name: string;
  type: string;
  value: number;
  weight: number;
}

export type EntityRecord =
  | CharacterRecord
  | LocationRecord
  | NationRecord
  | RegionRecord
  | QuestRecord
  | ItemRecord;

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

export const ENTITY_FETCHERS: Record<string, (host: string) => Promise<EntityRecord[]>> = {
  characters: fetchCharacters as (host: string) => Promise<EntityRecord[]>,
  locations:  fetchLocations  as (host: string) => Promise<EntityRecord[]>,
  nations:    fetchNations    as (host: string) => Promise<EntityRecord[]>,
  regions:    fetchRegions    as (host: string) => Promise<EntityRecord[]>,
  quests:     fetchQuests     as (host: string) => Promise<EntityRecord[]>,
  items:      fetchItems      as (host: string) => Promise<EntityRecord[]>,
};

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
    default:
      return '';
  }
}
