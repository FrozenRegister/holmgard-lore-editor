import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ENTITY_TYPES, KNOWN_PREFIXES, getTopicPrefix, getEntityConfig } from '../entities';
import { ENTITY_FETCHERS, getEntityName, getEntitySummary } from '../d1-reads';
import type { CharacterRecord, LocationRecord, NationRecord, RegionRecord, QuestRecord, ItemRecord } from '../d1-reads';

// ── getTopicPrefix ────────────────────────────────────────────────────────────

describe('getTopicPrefix', () => {
  it('extracts prefix from standard key', () => {
    expect(getTopicPrefix('character:aldric')).toBe('character');
    expect(getTopicPrefix('location:eastgate')).toBe('location');
    expect(getTopicPrefix('quest:iron-seal')).toBe('quest');
  });

  it('extracts unknown prefixes too (not constrained to ENTITY_TYPES)', () => {
    expect(getTopicPrefix('note:misc')).toBe('note');
    expect(getTopicPrefix('dragon:smaug')).toBe('dragon');
  });

  it('returns only the first segment for multi-colon keys', () => {
    expect(getTopicPrefix('a:b:c')).toBe('a');
  });

  it('returns null when there is no colon', () => {
    expect(getTopicPrefix('holmgard')).toBeNull();
  });

  it('returns null when the colon is at position 0 (empty prefix)', () => {
    expect(getTopicPrefix(':bad')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getTopicPrefix('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(getTopicPrefix(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(getTopicPrefix(null)).toBeNull();
  });
});

// ── getEntityConfig ───────────────────────────────────────────────────────────

describe('getEntityConfig', () => {
  it('returns config for known prefix', () => {
    const cfg = getEntityConfig('character');
    expect(cfg).toBeDefined();
    expect(cfg!.prefix).toBe('character');
    expect(cfg!.label).toBe('Characters');
    expect(cfg!.singularLabel).toBe('Character');
  });

  it('returns undefined for unknown prefix', () => {
    expect(getEntityConfig('dragon')).toBeUndefined();
    expect(getEntityConfig('')).toBeUndefined();
    expect(getEntityConfig('Dragon')).toBeUndefined(); // case-sensitive
  });

  it('round-trips all ENTITY_TYPES prefixes', () => {
    for (const et of ENTITY_TYPES) {
      const cfg = getEntityConfig(et.prefix);
      expect(cfg).toBe(et);
    }
  });
});

// ── ENTITY_TYPES invariants ───────────────────────────────────────────────────

describe('ENTITY_TYPES', () => {
  it('has no entries with empty required fields', () => {
    for (const et of ENTITY_TYPES) {
      expect(et.prefix.length).toBeGreaterThan(0);
      expect(et.label.length).toBeGreaterThan(0);
      expect(et.singularLabel.length).toBeGreaterThan(0);
      expect(et.description.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate prefixes', () => {
    const prefixes = ENTITY_TYPES.map(e => e.prefix);
    const unique = new Set(prefixes);
    expect(unique.size).toBe(prefixes.length);
  });

  it('all prefixes are lowercase', () => {
    for (const et of ENTITY_TYPES) {
      expect(et.prefix).toBe(et.prefix.toLowerCase());
    }
  });

  it('D1-enabled types have apiSlug defined', () => {
    for (const et of ENTITY_TYPES) {
      if (et.hasD1) {
        expect(et.apiSlug).toBeDefined();
        expect((et.apiSlug ?? '').length).toBeGreaterThan(0);
      }
    }
  });
});

// ── KNOWN_PREFIXES ────────────────────────────────────────────────────────────

describe('KNOWN_PREFIXES', () => {
  it('size matches ENTITY_TYPES length', () => {
    expect(KNOWN_PREFIXES.size).toBe(ENTITY_TYPES.length);
  });

  it('contains all prefixes from ENTITY_TYPES', () => {
    for (const et of ENTITY_TYPES) {
      expect(KNOWN_PREFIXES.has(et.prefix)).toBe(true);
    }
  });

  it('does not contain unknown prefixes', () => {
    expect(KNOWN_PREFIXES.has('dragon')).toBe(false);
    expect(KNOWN_PREFIXES.has('')).toBe(false);
    expect(KNOWN_PREFIXES.has('Character')).toBe(false);
  });
});

// ── ENTITY_FETCHERS ───────────────────────────────────────────────────────────

describe('ENTITY_FETCHERS', () => {
  it('has a fetcher for every D1-enabled entity type', () => {
    for (const et of ENTITY_TYPES) {
      if (et.hasD1 && et.apiSlug) {
        expect(ENTITY_FETCHERS[et.apiSlug]).toBeDefined();
        expect(typeof ENTITY_FETCHERS[et.apiSlug]).toBe('function');
      }
    }
  });
});

// ── getEntityName ─────────────────────────────────────────────────────────────

describe('getEntityName', () => {
  it('returns the name field from any entity record', () => {
    const char: CharacterRecord = { id: '1', name: 'Aldric', character_type: 'pc', character_class: 'fighter', race: 'Human', level: 5, hp: 42, max_hp: 60, ac: 16, alignment: null, background: null, faction_id: null, current_room_id: null, kv_origin: null };
    expect(getEntityName(char)).toBe('Aldric');
  });

  it('returns "Unknown" when name is missing', () => {
    const bad = { id: '1' } as unknown as CharacterRecord;
    expect(getEntityName(bad)).toBe('Unknown');
  });
});

// ── getEntitySummary ──────────────────────────────────────────────────────────

describe('getEntitySummary', () => {
  it('formats character summary', () => {
    const char: CharacterRecord = { id: '1', name: 'Aldric', character_type: 'pc', character_class: 'fighter', race: 'Human', level: 5, hp: 42, max_hp: 60, ac: 16, alignment: null, background: null, faction_id: null, current_room_id: null, kv_origin: null };
    const summary = getEntitySummary('character', char);
    expect(summary).toContain('Human');
    expect(summary).toContain('fighter');
    expect(summary).toContain('5');
    expect(summary).toContain('42');
    expect(summary).toContain('60');
  });

  it('formats location summary', () => {
    const loc: LocationRecord = { id: '1', name: 'Eastgate', biome_context: 'urban', visited_count: 3, last_visited_at: null };
    expect(getEntitySummary('location', loc)).toContain('urban');
    expect(getEntitySummary('location', loc)).toContain('3');
  });

  it('handles location with null biome_context', () => {
    const loc: LocationRecord = { id: '1', name: 'Void', biome_context: null, visited_count: 0, last_visited_at: null };
    const summary = getEntitySummary('location', loc);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  it('formats nation summary', () => {
    const nation: NationRecord = { id: '1', name: 'Holmgard', leader: 'King Arn', ideology: 'feudal', aggression: 40, trust: 60, paranoia: 30, gdp: 5000 };
    const summary = getEntitySummary('nation', nation);
    expect(summary).toContain('King Arn');
    expect(summary).toContain('feudal');
  });

  it('formats region summary', () => {
    const region: RegionRecord = { id: '1', name: 'North Reach', type: 'tundra', owner_nation_id: null };
    expect(getEntitySummary('region', region)).toBe('tundra');
  });

  it('formats quest summary with giver', () => {
    const quest: QuestRecord = { id: '1', name: 'Iron Seal', description: 'Find the seal', status: 'active', giver: 'Merchant Elara' };
    const summary = getEntitySummary('quest', quest);
    expect(summary).toContain('active');
    expect(summary).toContain('Merchant Elara');
  });

  it('formats quest summary without giver', () => {
    const quest: QuestRecord = { id: '1', name: 'Lost', description: '', status: 'failed', giver: null };
    expect(getEntitySummary('quest', quest)).toBe('failed');
  });

  it('formats item summary', () => {
    const item: ItemRecord = { id: '1', name: 'Sword', type: 'weapon', value: 150, weight: 3 };
    const summary = getEntitySummary('item', item);
    expect(summary).toContain('weapon');
    expect(summary).toContain('150');
  });

  it('returns empty string for unknown entity type', () => {
    const char: CharacterRecord = { id: '1', name: 'X', character_type: 'npc', character_class: 'fighter', race: 'Human', level: 1, hp: 10, max_hp: 10, ac: 10, alignment: null, background: null, faction_id: null, current_room_id: null, kv_origin: null };
    expect(getEntitySummary('dragon', char)).toBe('');
  });
});

// ── fetch integration (mocked) ────────────────────────────────────────────────

describe('fetchEntities (mocked fetch)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchCharacters returns array on success', async () => {
    const mockChar: CharacterRecord = { id: 'a1', name: 'Aldric', character_type: 'pc', character_class: 'fighter', race: 'Human', level: 5, hp: 42, max_hp: 60, ac: 16, alignment: null, background: null, faction_id: null, current_room_id: null, kv_origin: 'character:aldric' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ characters: [mockChar], total: 1 }),
    }));
    const { fetchCharacters } = await import('../d1-reads');
    const result = await fetchCharacters('http://worker');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Aldric');
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));
    const { fetchCharacters } = await import('../d1-reads');
    await expect(fetchCharacters('http://worker')).rejects.toThrow('503');
  });

  it('returns empty array when response key is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0 }), // no "characters" key
    }));
    const { fetchCharacters } = await import('../d1-reads');
    const result = await fetchCharacters('http://worker');
    expect(result).toEqual([]);
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { fetchCharacters } = await import('../d1-reads');
    await expect(fetchCharacters('http://worker')).rejects.toThrow('network down');
  });
});

// ── fetchCharacterRelationships (Phase 5 backfill) ───────────────────────────

describe('fetchCharacterRelationships', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns npc_relationships and party_members on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        npc_relationships: [{ target_id: 'c2', target_name: 'Elara', familiarity: 'friend', disposition: 'friendly', interaction_count: 3, target_type: 'pc', target_kv_origin: null, last_interaction_at: null }],
        party_members: [{ character_id: 'c3', name: 'Borgil', character_type: 'npc', kv_origin: null, role: 'member', party_id: 'p1', party_name: 'The Wanderers' }],
      }),
    }));
    const { fetchCharacterRelationships } = await import('../d1-reads');
    const result = await fetchCharacterRelationships('http://w', 'c1');
    expect(result.npc_relationships).toHaveLength(1);
    expect(result.npc_relationships[0].target_name).toBe('Elara');
    expect(result.party_members).toHaveLength(1);
    expect(result.party_members[0].party_name).toBe('The Wanderers');
  });

  it('defaults missing arrays to empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    const { fetchCharacterRelationships } = await import('../d1-reads');
    const result = await fetchCharacterRelationships('http://w', 'c1');
    expect(result.npc_relationships).toEqual([]);
    expect(result.party_members).toEqual([]);
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { fetchCharacterRelationships } = await import('../d1-reads');
    await expect(fetchCharacterRelationships('http://w', 'c1')).rejects.toThrow('500');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net fail')));
    const { fetchCharacterRelationships } = await import('../d1-reads');
    await expect(fetchCharacterRelationships('http://w', 'c1')).rejects.toThrow('net fail');
  });
});

// ── fetchCharacterInventory (Phase 5 backfill) ───────────────────────────────

describe('fetchCharacterInventory', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns items array on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ item_id: 'i1', name: 'Sword', type: 'weapon', quantity: 1, equipped: true, slot: 'main_hand', value: 50, weight: 5 }], total: 1 }),
    }));
    const { fetchCharacterInventory } = await import('../d1-reads');
    const result = await fetchCharacterInventory('http://w', 'c1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sword');
    expect(result[0].equipped).toBe(true);
  });

  it('defaults to empty array when items key is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0 }),
    }));
    const { fetchCharacterInventory } = await import('../d1-reads');
    const result = await fetchCharacterInventory('http://w', 'c1');
    expect(result).toEqual([]);
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { fetchCharacterInventory } = await import('../d1-reads');
    await expect(fetchCharacterInventory('http://w', 'c1')).rejects.toThrow('503');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const { fetchCharacterInventory } = await import('../d1-reads');
    await expect(fetchCharacterInventory('http://w', 'c1')).rejects.toThrow('timeout');
  });
});

// ── fetchLocationById (Phase 6) ───────────────────────────────────────────────

describe('fetchLocationById', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns LocationDetailRecord on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        location: { id: 'r1', name: 'Eastgate', biome_context: 'urban', base_description: 'A gate.', visited_count: 3, last_visited_at: '2026-01-01', local_x: 5, local_y: 7, network_id: 'net1' },
      }),
    }));
    const { fetchLocationById } = await import('../d1-reads');
    const result = await fetchLocationById('http://w', 'r1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Eastgate');
    expect(result!.biome_context).toBe('urban');
    expect(result!.base_description).toBe('A gate.');
    expect(result!.local_x).toBe(5);
    expect(result!.network_id).toBe('net1');
  });

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { fetchLocationById } = await import('../d1-reads');
    const result = await fetchLocationById('http://w', 'missing');
    expect(result).toBeNull();
  });

  it('returns null when response has no location key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    const { fetchLocationById } = await import('../d1-reads');
    const result = await fetchLocationById('http://w', 'r1');
    expect(result).toBeNull();
  });

  it('throws on non-404 errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { fetchLocationById } = await import('../d1-reads');
    await expect(fetchLocationById('http://w', 'r1')).rejects.toThrow('500');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const { fetchLocationById } = await import('../d1-reads');
    await expect(fetchLocationById('http://w', 'r1')).rejects.toThrow('connection refused');
  });
});

// ── fetchLocationOccupants (Phase 6) ─────────────────────────────────────────

describe('fetchLocationOccupants', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns occupants array on success', async () => {
    const mockChar: CharacterRecord = { id: 'c1', name: 'Aldric', character_type: 'pc', character_class: 'fighter', race: 'Human', level: 5, hp: 42, max_hp: 60, ac: 16, alignment: null, background: null, faction_id: null, current_room_id: 'r1', kv_origin: 'character:aldric' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ occupants: [mockChar], total: 1 }),
    }));
    const { fetchLocationOccupants } = await import('../d1-reads');
    const result = await fetchLocationOccupants('http://w', 'r1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Aldric');
    expect(result[0].current_room_id).toBe('r1');
  });

  it('defaults to empty array when occupants key is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0 }),
    }));
    const { fetchLocationOccupants } = await import('../d1-reads');
    const result = await fetchLocationOccupants('http://w', 'r1');
    expect(result).toEqual([]);
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { fetchLocationOccupants } = await import('../d1-reads');
    await expect(fetchLocationOccupants('http://w', 'r1')).rejects.toThrow('500');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { fetchLocationOccupants } = await import('../d1-reads');
    await expect(fetchLocationOccupants('http://w', 'r1')).rejects.toThrow('offline');
  });
});

// ── fetchNationById ───────────────────────────────────────────────────────────

describe('fetchNationById', () => {
  it('returns a NationRecord on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ nation: { id: 'n1', name: 'Holmgard', leader: 'King Aldric', ideology: 'monarchy', aggression: 40, trust: 60, paranoia: 30, gdp: 12000 } }),
    }));
    const { fetchNationById } = await import('../d1-reads');
    const result = await fetchNationById('http://w', 'n1');
    expect(result?.name).toBe('Holmgard');
    expect(result?.gdp).toBe(12000);
  });

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { fetchNationById } = await import('../d1-reads');
    expect(await fetchNationById('http://w', 'missing')).toBeNull();
  });

  it('returns null when nation key is missing in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const { fetchNationById } = await import('../d1-reads');
    expect(await fetchNationById('http://w', 'n1')).toBeNull();
  });

  it('throws on non-404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { fetchNationById } = await import('../d1-reads');
    await expect(fetchNationById('http://w', 'n1')).rejects.toThrow('500');
  });
});

// ── fetchRegionById ───────────────────────────────────────────────────────────

describe('fetchRegionById', () => {
  it('returns a RegionDetailRecord with owner nation name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ region: { id: 'r1', name: 'Northern March', type: 'frontier', owner_nation_id: 'n1', owner_nation_name: 'Holmgard' } }),
    }));
    const { fetchRegionById } = await import('../d1-reads');
    const result = await fetchRegionById('http://w', 'r1');
    expect(result?.name).toBe('Northern March');
    expect(result?.owner_nation_name).toBe('Holmgard');
  });

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { fetchRegionById } = await import('../d1-reads');
    expect(await fetchRegionById('http://w', 'missing')).toBeNull();
  });

  it('returns null when region key is missing in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const { fetchRegionById } = await import('../d1-reads');
    expect(await fetchRegionById('http://w', 'r1')).toBeNull();
  });

  it('throws on non-404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { fetchRegionById } = await import('../d1-reads');
    await expect(fetchRegionById('http://w', 'r1')).rejects.toThrow('503');
  });
});

// ── fetchQuestById ────────────────────────────────────────────────────────────

describe('fetchQuestById', () => {
  it('returns a QuestRecord on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ quest: { id: 'q1', name: 'Retrieve the Crown', description: 'Find the Iron Crown.', status: 'active', giver: 'Aldric' } }),
    }));
    const { fetchQuestById } = await import('../d1-reads');
    const result = await fetchQuestById('http://w', 'q1');
    expect(result?.name).toBe('Retrieve the Crown');
    expect(result?.giver).toBe('Aldric');
  });

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { fetchQuestById } = await import('../d1-reads');
    expect(await fetchQuestById('http://w', 'missing')).toBeNull();
  });

  it('returns null when quest key is missing in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const { fetchQuestById } = await import('../d1-reads');
    expect(await fetchQuestById('http://w', 'q1')).toBeNull();
  });

  it('throws on non-404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { fetchQuestById } = await import('../d1-reads');
    await expect(fetchQuestById('http://w', 'q1')).rejects.toThrow('500');
  });
});

// ── fetchQuestLog ─────────────────────────────────────────────────────────────

describe('fetchQuestLog', () => {
  it('returns quest log entries on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ entries: [
        { id: 'ql1', note: 'Quest received.', created_at: '2026-01-01' },
        { id: 'ql2', note: 'Crown found.', created_at: '2026-01-05' },
      ], total: 2 }),
    }));
    const { fetchQuestLog } = await import('../d1-reads');
    const result = await fetchQuestLog('http://w', 'q1');
    expect(result).toHaveLength(2);
    expect(result[0].note).toBe('Quest received.');
    expect(result[1].created_at).toBe('2026-01-05');
  });

  it('defaults to empty array when entries key is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ total: 0 }) }));
    const { fetchQuestLog } = await import('../d1-reads');
    expect(await fetchQuestLog('http://w', 'q1')).toEqual([]);
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { fetchQuestLog } = await import('../d1-reads');
    await expect(fetchQuestLog('http://w', 'q1')).rejects.toThrow('500');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net down')));
    const { fetchQuestLog } = await import('../d1-reads');
    await expect(fetchQuestLog('http://w', 'q1')).rejects.toThrow('net down');
  });
});

// ── fetchItemById ─────────────────────────────────────────────────────────────

describe('fetchItemById', () => {
  it('returns an ItemRecord on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ item: { id: 'i1', name: 'Iron Crown', type: 'relic', value: 5000, weight: 2 } }),
    }));
    const { fetchItemById } = await import('../d1-reads');
    const result = await fetchItemById('http://w', 'i1');
    expect(result?.name).toBe('Iron Crown');
    expect(result?.value).toBe(5000);
  });

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { fetchItemById } = await import('../d1-reads');
    expect(await fetchItemById('http://w', 'missing')).toBeNull();
  });

  it('returns null when item key is missing in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const { fetchItemById } = await import('../d1-reads');
    expect(await fetchItemById('http://w', 'i1')).toBeNull();
  });

  it('throws on non-404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { fetchItemById } = await import('../d1-reads');
    await expect(fetchItemById('http://w', 'i1')).rejects.toThrow('503');
  });
});
