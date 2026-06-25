import { describe, it, expect } from 'vitest';
import {
  buildCharacterContext,
  buildLocationContext,
  buildInsightPrompt,
} from '../entity-context';
import type { CharacterRecord, CharacterRelationships, CharacterInventoryItem, LocationDetailRecord } from '../d1-reads';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_CHAR: CharacterRecord = {
  id: 'c1',
  name: 'Aldric',
  character_type: 'pc',
  character_class: 'fighter',
  race: 'Human',
  level: 5,
  hp: 42,
  max_hp: 60,
  ac: 16,
  alignment: 'Neutral Good',
  background: 'Soldier',
  faction_id: null,
  current_room_id: null,
  kv_origin: 'character:aldric',
};

const EMPTY_RELS: CharacterRelationships = { npc_relationships: [], party_members: [] };

const BASE_LOC: LocationDetailRecord = {
  id: 'r1',
  name: 'Eastgate',
  biome_context: 'urban',
  visited_count: 3,
  last_visited_at: '2026-01-10',
  base_description: 'A bustling market gate.',
  local_x: 12,
  local_y: 7,
  network_id: null,
};

// ── buildCharacterContext ─────────────────────────────────────────────────────

describe('buildCharacterContext', () => {
  it('includes name and D1 stats header', () => {
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: [], topicText: '', currentLocation: null });
    expect(ctx).toContain('# Character: Aldric');
    expect(ctx).toContain('- Race: Human');
    expect(ctx).toContain('- Class: fighter');
    expect(ctx).toContain('- Level: 5');
    expect(ctx).toContain('- HP: 42/60');
    expect(ctx).toContain('- AC: 16');
  });

  it('includes alignment and background when set', () => {
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: [], topicText: '', currentLocation: null });
    expect(ctx).toContain('- Alignment: Neutral Good');
    expect(ctx).toContain('- Background: Soldier');
  });

  it('omits alignment and background when null', () => {
    const char = { ...BASE_CHAR, alignment: null, background: null };
    const ctx = buildCharacterContext({ character: char, relationships: EMPTY_RELS, inventory: [], topicText: '', currentLocation: null });
    expect(ctx).not.toContain('Alignment');
    expect(ctx).not.toContain('Background');
  });

  it('includes current location when provided', () => {
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: [], topicText: '', currentLocation: BASE_LOC });
    expect(ctx).toContain('- Current Location: Eastgate (urban)');
  });

  it('omits biome from location line when biome_context is null', () => {
    const locNoBiome = { ...BASE_LOC, biome_context: null };
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: [], topicText: '', currentLocation: locNoBiome });
    expect(ctx).toContain('- Current Location: Eastgate');
    expect(ctx).not.toContain('(null)');
  });

  it('omits current location section when null', () => {
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: [], topicText: '', currentLocation: null });
    expect(ctx).not.toContain('Current Location');
  });

  it('includes party members section', () => {
    const rels: CharacterRelationships = {
      npc_relationships: [],
      party_members: [{ character_id: 'c2', name: 'Elara', character_type: 'pc', kv_origin: null, role: 'healer', party_id: 'p1', party_name: 'The Wanderers' }],
    };
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: rels, inventory: [], topicText: '', currentLocation: null });
    expect(ctx).toContain('## Party Members');
    expect(ctx).toContain('- Elara (healer) — The Wanderers');
  });

  it('includes known characters section with interaction count', () => {
    const rels: CharacterRelationships = {
      npc_relationships: [{ target_id: 'c3', target_name: 'Borgil', target_type: 'npc', target_kv_origin: null, familiarity: 'friend', disposition: 'friendly', interaction_count: 7, last_interaction_at: null }],
      party_members: [],
    };
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: rels, inventory: [], topicText: '', currentLocation: null });
    expect(ctx).toContain('## Known Characters');
    expect(ctx).toContain('- Borgil: friend, friendly — 7 interactions');
  });

  it('omits interaction count when zero', () => {
    const rels: CharacterRelationships = {
      npc_relationships: [{ target_id: 'c3', target_name: 'Stranger', target_type: 'npc', target_kv_origin: null, familiarity: 'stranger', disposition: 'neutral', interaction_count: 0, last_interaction_at: null }],
      party_members: [],
    };
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: rels, inventory: [], topicText: '', currentLocation: null });
    expect(ctx).not.toContain('interactions');
  });

  it('splits inventory into equipped and carried sections', () => {
    const inv: CharacterInventoryItem[] = [
      { item_id: 'i1', name: 'Longsword', type: 'weapon', quantity: 1, equipped: true, slot: 'main_hand', value: 50, weight: 3 },
      { item_id: 'i2', name: 'Ration', type: 'food', quantity: 5, equipped: false, slot: null, value: 1, weight: 1 },
    ];
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: inv, topicText: '', currentLocation: null });
    expect(ctx).toContain('## Equipped');
    expect(ctx).toContain('- Longsword (weapon, main_hand)');
    expect(ctx).toContain('## Carried');
    expect(ctx).toContain('- Ration ×5 (food)');
  });

  it('omits slot from equipped item when null', () => {
    const inv: CharacterInventoryItem[] = [
      { item_id: 'i1', name: 'Ring of Protection', type: 'ring', quantity: 1, equipped: true, slot: null, value: 500, weight: 0 },
    ];
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: inv, topicText: '', currentLocation: null });
    expect(ctx).toContain('- Ring of Protection (ring)');
    expect(ctx).not.toContain('null');
  });

  it('includes lore narrative when topicText is set', () => {
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: [], topicText: 'He is a veteran of the Iron War.', currentLocation: null });
    expect(ctx).toContain('## Lore Narrative');
    expect(ctx).toContain('He is a veteran of the Iron War.');
  });

  it('omits lore narrative section when topicText is empty', () => {
    const ctx = buildCharacterContext({ character: BASE_CHAR, relationships: EMPTY_RELS, inventory: [], topicText: '   ', currentLocation: null });
    expect(ctx).not.toContain('## Lore Narrative');
  });

  it('handles malformed character with missing optional fields', () => {
    const bad = { ...BASE_CHAR, alignment: null, background: null, faction_id: null, current_room_id: null } as CharacterRecord;
    expect(() => buildCharacterContext({ character: bad, relationships: EMPTY_RELS, inventory: [], topicText: '', currentLocation: null })).not.toThrow();
  });
});

// ── buildLocationContext ──────────────────────────────────────────────────────

describe('buildLocationContext', () => {
  it('includes name and D1 stats', () => {
    const ctx = buildLocationContext({ location: BASE_LOC, occupants: [], topicText: '' });
    expect(ctx).toContain('# Location: Eastgate');
    expect(ctx).toContain('- Biome: urban');
    expect(ctx).toContain('- Visited: 3×');
    expect(ctx).toContain('- Last visited: 2026-01-10');
    expect(ctx).toContain('- Map coordinates: (12, 7)');
    expect(ctx).toContain('## Description');
    expect(ctx).toContain('A bustling market gate.');
  });

  it('omits biome line when biome_context is null', () => {
    const loc = { ...BASE_LOC, biome_context: null };
    const ctx = buildLocationContext({ location: loc, occupants: [], topicText: '' });
    expect(ctx).not.toContain('Biome');
  });

  it('omits last_visited_at line when null', () => {
    const loc = { ...BASE_LOC, last_visited_at: null };
    const ctx = buildLocationContext({ location: loc, occupants: [], topicText: '' });
    expect(ctx).not.toContain('Last visited');
  });

  it('omits coordinates when local_x or local_y is null', () => {
    const loc = { ...BASE_LOC, local_x: null, local_y: null };
    const ctx = buildLocationContext({ location: loc, occupants: [], topicText: '' });
    expect(ctx).not.toContain('Map coordinates');
  });

  it('omits description section when null', () => {
    const loc = { ...BASE_LOC, base_description: null };
    const ctx = buildLocationContext({ location: loc, occupants: [], topicText: '' });
    expect(ctx).not.toContain('## Description');
  });

  it('includes occupants section', () => {
    const ctx = buildLocationContext({ location: BASE_LOC, occupants: [BASE_CHAR], topicText: '' });
    expect(ctx).toContain('## Current Occupants');
    expect(ctx).toContain('- Aldric (Human fighter, Lv.5)');
  });

  it('omits occupants section when empty', () => {
    const ctx = buildLocationContext({ location: BASE_LOC, occupants: [], topicText: '' });
    expect(ctx).not.toContain('## Current Occupants');
  });

  it('includes lore narrative when provided', () => {
    const ctx = buildLocationContext({ location: BASE_LOC, occupants: [], topicText: 'The gate is ancient.' });
    expect(ctx).toContain('## Lore Narrative');
    expect(ctx).toContain('The gate is ancient.');
  });

  it('omits lore narrative when topicText is blank', () => {
    const ctx = buildLocationContext({ location: BASE_LOC, occupants: [], topicText: '\n  \n' });
    expect(ctx).not.toContain('## Lore Narrative');
  });

  it('handles malformed location with null optional fields', () => {
    const bad = { ...BASE_LOC, biome_context: null, base_description: null, last_visited_at: null, local_x: null, local_y: null, network_id: null } as LocationDetailRecord;
    expect(() => buildLocationContext({ location: bad, occupants: [], topicText: '' })).not.toThrow();
  });
});

// ── buildInsightPrompt ────────────────────────────────────────────────────────

describe('buildInsightPrompt', () => {
  it('wraps entity context with a system instruction', () => {
    const ctx = '# Character: Aldric\n- Level: 5';
    const prompt = buildInsightPrompt(ctx);
    expect(prompt).toContain('worldbuilding assistant');
    expect(prompt).toContain('# Character: Aldric');
    expect(prompt).toContain('GM-actionable');
  });

  it('returns a non-empty string for empty context', () => {
    const prompt = buildInsightPrompt('');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});
