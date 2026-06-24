export interface EntityTypeConfig {
  prefix: string;
  label: string;
  singularLabel: string;
  description: string;
  hasD1: boolean;
  apiSlug?: string;
}

export const ENTITY_TYPES: EntityTypeConfig[] = [
  { prefix: 'character', label: 'Characters', singularLabel: 'Character', description: 'People, NPCs, and named beings.',    hasD1: true,  apiSlug: 'characters' },
  { prefix: 'location',  label: 'Locations',  singularLabel: 'Location',  description: 'Places and points of interest.',     hasD1: true,  apiSlug: 'locations'  },
  { prefix: 'quest',     label: 'Quests',     singularLabel: 'Quest',     description: 'Active and completed quests.',       hasD1: true,  apiSlug: 'quests'     },
  { prefix: 'item',      label: 'Items',      singularLabel: 'Item',      description: 'Artifacts, equipment, and objects.', hasD1: true,  apiSlug: 'items'      },
  { prefix: 'nation',    label: 'Nations',    singularLabel: 'Nation',    description: 'Sovereign states and polities.',     hasD1: true,  apiSlug: 'nations'    },
  { prefix: 'region',    label: 'Regions',    singularLabel: 'Region',    description: 'Geographic and cultural regions.',   hasD1: true,  apiSlug: 'regions'    },
  { prefix: 'faction',   label: 'Factions',   singularLabel: 'Faction',   description: 'Organizations and guilds.',          hasD1: false                        },
  { prefix: 'scene',     label: 'Scenes',     singularLabel: 'Scene',     description: 'Narrative scenes and encounters.',   hasD1: false                        },
];

export const KNOWN_PREFIXES = new Set(ENTITY_TYPES.map(e => e.prefix));

/** Extract the type prefix from a topic key ("character:aldric" → "character"). Returns null for malformed or missing keys. */
export function getTopicPrefix(key: string | null | undefined): string | null {
  if (!key) return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  return key.slice(0, idx);
}

export function getEntityConfig(prefix: string): EntityTypeConfig | undefined {
  return ENTITY_TYPES.find(e => e.prefix === prefix);
}
