/**
 * Bidirectional bridge between a character's markdown lore topic and D1 fields.
 *
 * Convention: a `## Character Sheet` section containing `- **Key:** Value` bullets
 * is the structured zone. Everything outside that section is narrative — never touched
 * by the D1 sync.
 */

import type { CharacterRecord } from './d1-reads';

export interface CharacterPatch {
  character_type?: string;
  race?: string;
  character_class?: string;
  level?: number;
  hp?: number;
  max_hp?: number;
  ac?: number;
  alignment?: string;
  background?: string;
}

const SHEET_HEADING = '## Character Sheet';

// ── Parser: markdown → CharacterPatch ─────────────────────────────────────────

/**
 * Scan markdown for a `## Character Sheet` section and extract
 * `- **Key:** Value` lines into a CharacterPatch.
 * Returns null if the section is absent or contains no recognised fields.
 */
export function parseCharacterSheet(markdown: string): CharacterPatch | null {
  if (!markdown) return null;
  const lines = markdown.split('\n');
  let inSection = false;
  const fields: Record<string, string> = {};

  for (const line of lines) {
    if (line.trim() === SHEET_HEADING) {
      inSection = true;
      continue;
    }
    if (inSection) {
      // Any heading at any level ends the section
      if (/^#{1,6}\s/.test(line)) break;
      const m = line.match(/^-\s+\*\*([^*:]+):\*\*\s+(.+)$/);
      if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
    }
  }

  if (!inSection || Object.keys(fields).length === 0) return null;

  const patch: CharacterPatch = {};

  if (fields['type'])       patch.character_type  = fields['type'];
  if (fields['race'])       patch.race            = fields['race'];
  if (fields['class'])      patch.character_class = fields['class'];
  if (fields['alignment'])  patch.alignment       = fields['alignment'];
  if (fields['background']) patch.background      = fields['background'];

  if (fields['level']) {
    const v = parseInt(fields['level'], 10);
    if (!isNaN(v)) patch.level = v;
  }
  if (fields['ac']) {
    const v = parseInt(fields['ac'], 10);
    if (!isNaN(v)) patch.ac = v;
  }
  if (fields['hp']) {
    const hp = parseHpField(fields['hp']);
    if (hp) { patch.hp = hp.hp; patch.max_hp = hp.max_hp; }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function parseHpField(value: string): { hp: number; max_hp: number } | null {
  const parts = value.split('/').map(s => parseInt(s.trim(), 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { hp: parts[0], max_hp: parts[1] };
  }
  if (parts.length === 1 && !isNaN(parts[0])) {
    return { hp: parts[0], max_hp: parts[0] };
  }
  return null;
}

// ── Renderer: CharacterRecord → markdown section ───────────────────────────────

/** Render a `## Character Sheet` section from a CharacterRecord. */
export function renderCharacterSheet(record: CharacterRecord): string {
  const lines: string[] = [
    SHEET_HEADING,
    '',
    `- **Type:** ${record.character_type ?? 'npc'}`,
    `- **Race:** ${record.race ?? 'Unknown'}`,
    `- **Class:** ${record.character_class ?? 'fighter'}`,
    `- **Level:** ${record.level ?? 1}`,
    `- **HP:** ${record.hp ?? 0} / ${record.max_hp ?? 0}`,
    `- **AC:** ${record.ac ?? 10}`,
  ];
  if (record.alignment) lines.push(`- **Alignment:** ${record.alignment}`);
  if (record.background) lines.push(`- **Background:** ${record.background}`);
  return lines.join('\n');
}

/** Generate a starter lore document for a character that has no existing topic. */
export function generateCharacterTopic(record: CharacterRecord): string {
  return [
    `# ${record.name}`,
    '',
    renderCharacterSheet(record),
    '',
    '## Background',
    '',
    'Start writing here…',
  ].join('\n');
}
