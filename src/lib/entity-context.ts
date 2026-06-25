// Builds the AI context string passed to Claude for entity insight panels.
// Pure functions only — no side effects, no imports from framework or stores.

import type { CharacterRecord, CharacterRelationships, CharacterInventoryItem, LocationDetailRecord } from './d1-reads';

export interface CharacterContextOptions {
  character: CharacterRecord;
  relationships: CharacterRelationships;
  inventory: CharacterInventoryItem[];
  topicText: string;
  currentLocation: LocationDetailRecord | null;
}

export interface LocationContextOptions {
  location: LocationDetailRecord;
  occupants: CharacterRecord[];
  topicText: string;
}

export function buildCharacterContext(opts: CharacterContextOptions): string {
  const { character, relationships, inventory, topicText, currentLocation } = opts;

  const lines: string[] = [
    `# Character: ${character.name}`,
    '',
    '## D1 Profile',
    `- Type: ${character.character_type}`,
    `- Race: ${character.race}`,
    `- Class: ${character.character_class}`,
    `- Level: ${character.level}`,
    `- HP: ${character.hp}/${character.max_hp}`,
    `- AC: ${character.ac}`,
  ];

  if (character.alignment) lines.push(`- Alignment: ${character.alignment}`);
  if (character.background) lines.push(`- Background: ${character.background}`);
  if (character.faction_id) lines.push(`- Faction ID: ${character.faction_id}`);

  if (currentLocation) {
    lines.push(`- Current Location: ${currentLocation.name}${currentLocation.biome_context ? ` (${currentLocation.biome_context})` : ''}`);
  }

  if (relationships.party_members.length > 0) {
    lines.push('', '## Party Members');
    for (const m of relationships.party_members) {
      lines.push(`- ${m.name} (${m.role}) — ${m.party_name}`);
    }
  }

  if (relationships.npc_relationships.length > 0) {
    lines.push('', '## Known Characters');
    for (const r of relationships.npc_relationships) {
      const interactions = r.interaction_count > 0 ? ` — ${r.interaction_count} interactions` : '';
      lines.push(`- ${r.target_name}: ${r.familiarity}, ${r.disposition}${interactions}`);
    }
  }

  const equipped = inventory.filter(i => i.equipped);
  const carried = inventory.filter(i => !i.equipped);

  if (equipped.length > 0) {
    lines.push('', '## Equipped');
    for (const i of equipped) {
      lines.push(`- ${i.name} (${i.type}${i.slot ? `, ${i.slot}` : ''})`);
    }
  }

  if (carried.length > 0) {
    lines.push('', '## Carried');
    for (const i of carried) {
      lines.push(`- ${i.name} ×${i.quantity} (${i.type})`);
    }
  }

  if (topicText.trim()) {
    lines.push('', '## Lore Narrative', topicText.trim());
  }

  return lines.join('\n');
}

export function buildLocationContext(opts: LocationContextOptions): string {
  const { location, occupants, topicText } = opts;

  const lines: string[] = [
    `# Location: ${location.name}`,
    '',
    '## D1 Profile',
  ];

  if (location.biome_context) lines.push(`- Biome: ${location.biome_context}`);
  lines.push(`- Visited: ${location.visited_count}×`);
  if (location.last_visited_at) lines.push(`- Last visited: ${location.last_visited_at}`);
  if (location.local_x != null && location.local_y != null) {
    lines.push(`- Map coordinates: (${location.local_x}, ${location.local_y})`);
  }
  if (location.base_description) {
    lines.push('', '## Description', location.base_description);
  }

  if (occupants.length > 0) {
    lines.push('', '## Current Occupants');
    for (const o of occupants) {
      lines.push(`- ${o.name} (${o.race} ${o.character_class}, Lv.${o.level})`);
    }
  }

  if (topicText.trim()) {
    lines.push('', '## Lore Narrative', topicText.trim());
  }

  return lines.join('\n');
}

export function buildInsightPrompt(entityContext: string): string {
  return (
    'You are a worldbuilding assistant for the Holmgard tabletop campaign. ' +
    'You have been given structured data about a world entity. ' +
    'Write a concise narrative insight (3–5 sentences) that synthesizes the entity\'s key traits, ' +
    'relationships, and situation into something useful for a GM running a session. ' +
    'Focus on what is most dramatically interesting or GM-actionable. ' +
    'Speak in the present tense as if describing the world right now.\n\n' +
    entityContext
  );
}
