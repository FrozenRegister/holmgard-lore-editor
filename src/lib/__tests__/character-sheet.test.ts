import { describe, it, expect } from 'vitest';
import {
  parseCharacterSheet,
  renderCharacterSheet,
  generateCharacterTopic,
} from '../character-sheet';
import type { CharacterRecord } from '../d1-reads';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FULL_SHEET = `# Aldric

## Character Sheet

- **Type:** pc
- **Race:** Human
- **Class:** fighter
- **Level:** 5
- **HP:** 42 / 60
- **AC:** 16
- **Alignment:** Neutral Good
- **Background:** Soldier

## Background

He grew up in the north.`;

const MINIMAL_SHEET = `## Character Sheet

- **Race:** Elf
- **Level:** 3`;

const mockRecord: CharacterRecord = {
  id: 'abc-123',
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
  kv_origin: 'character:aldric',
};

// ── parseCharacterSheet ───────────────────────────────────────────────────────

describe('parseCharacterSheet', () => {
  it('parses all fields from a full sheet', () => {
    const patch = parseCharacterSheet(FULL_SHEET);
    expect(patch).not.toBeNull();
    expect(patch!.character_type).toBe('pc');
    expect(patch!.race).toBe('Human');
    expect(patch!.character_class).toBe('fighter');
    expect(patch!.level).toBe(5);
    expect(patch!.hp).toBe(42);
    expect(patch!.max_hp).toBe(60);
    expect(patch!.ac).toBe(16);
    expect(patch!.alignment).toBe('Neutral Good');
    expect(patch!.background).toBe('Soldier');
  });

  it('parses a minimal sheet with only recognised fields present', () => {
    const patch = parseCharacterSheet(MINIMAL_SHEET);
    expect(patch).not.toBeNull();
    expect(patch!.race).toBe('Elf');
    expect(patch!.level).toBe(3);
    expect(patch!.hp).toBeUndefined();
    expect(patch!.alignment).toBeUndefined();
  });

  it('returns null when no ## Character Sheet section exists', () => {
    expect(parseCharacterSheet('# Just a title\n\nSome prose.')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCharacterSheet('')).toBeNull();
  });

  it('returns null when section exists but has no recognised fields', () => {
    const md = `## Character Sheet\n\n- **Unknown:** stuff`;
    expect(parseCharacterSheet(md)).toBeNull();
  });

  it('stops parsing at the next heading', () => {
    const md = `## Character Sheet\n\n- **Race:** Orc\n\n## Background\n\n- **Class:** rogue`;
    const patch = parseCharacterSheet(md);
    expect(patch!.race).toBe('Orc');
    expect(patch!.character_class).toBeUndefined();
  });

  it('parses HP as single value → hp and max_hp both set to same number', () => {
    const md = `## Character Sheet\n\n- **HP:** 30`;
    const patch = parseCharacterSheet(md);
    expect(patch!.hp).toBe(30);
    expect(patch!.max_hp).toBe(30);
  });

  it('parses HP as "current / max" format', () => {
    const md = `## Character Sheet\n\n- **HP:** 15 / 50`;
    const patch = parseCharacterSheet(md);
    expect(patch!.hp).toBe(15);
    expect(patch!.max_hp).toBe(50);
  });

  it('ignores non-integer level', () => {
    const md = `## Character Sheet\n\n- **Level:** banana`;
    expect(parseCharacterSheet(md)).toBeNull();
  });

  it('ignores non-integer AC', () => {
    const md = `## Character Sheet\n\n- **AC:** ??`;
    expect(parseCharacterSheet(md)).toBeNull();
  });

  it('handles malformed input — null/undefined cast gracefully', () => {
    expect(parseCharacterSheet(undefined as unknown as string)).toBeNull();
    expect(parseCharacterSheet(null as unknown as string)).toBeNull();
  });
});

// ── renderCharacterSheet ───────────────────────────────────────────────────────

describe('renderCharacterSheet', () => {
  it('renders a full character record', () => {
    const md = renderCharacterSheet(mockRecord);
    expect(md).toContain('## Character Sheet');
    expect(md).toContain('- **Type:** pc');
    expect(md).toContain('- **Race:** Human');
    expect(md).toContain('- **Class:** fighter');
    expect(md).toContain('- **Level:** 5');
    expect(md).toContain('- **HP:** 42 / 60');
    expect(md).toContain('- **AC:** 16');
    expect(md).toContain('- **Alignment:** Neutral Good');
    expect(md).toContain('- **Background:** Soldier');
  });

  it('omits alignment line when null', () => {
    const rec = { ...mockRecord, alignment: null };
    const md = renderCharacterSheet(rec);
    expect(md).not.toContain('Alignment');
  });

  it('omits background line when null', () => {
    const rec = { ...mockRecord, background: null };
    const md = renderCharacterSheet(rec);
    expect(md).not.toContain('Background');
  });

  it('uses defaults for missing numeric fields', () => {
    const rec = { ...mockRecord, level: undefined as unknown as number, ac: undefined as unknown as number, hp: undefined as unknown as number, max_hp: undefined as unknown as number };
    const md = renderCharacterSheet(rec);
    expect(md).toContain('- **Level:** 1');
    expect(md).toContain('- **HP:** 0 / 0');
    expect(md).toContain('- **AC:** 10');
  });

  it('round-trips: rendered output can be parsed back', () => {
    const rendered = renderCharacterSheet(mockRecord);
    const patch = parseCharacterSheet(rendered);
    expect(patch).not.toBeNull();
    expect(patch!.character_type).toBe(mockRecord.character_type);
    expect(patch!.race).toBe(mockRecord.race);
    expect(patch!.level).toBe(mockRecord.level);
    expect(patch!.hp).toBe(mockRecord.hp);
    expect(patch!.max_hp).toBe(mockRecord.max_hp);
    expect(patch!.ac).toBe(mockRecord.ac);
  });
});

// ── generateCharacterTopic ────────────────────────────────────────────────────

describe('generateCharacterTopic', () => {
  it('generates a document starting with the character name heading', () => {
    const md = generateCharacterTopic(mockRecord);
    expect(md.startsWith('# Aldric')).toBe(true);
  });

  it('contains a Character Sheet section', () => {
    const md = generateCharacterTopic(mockRecord);
    expect(md).toContain('## Character Sheet');
  });

  it('contains a Background section with starter text', () => {
    const md = generateCharacterTopic(mockRecord);
    expect(md).toContain('## Background');
    expect(md).toContain('Start writing here');
  });

  it('generated sheet section is parseable', () => {
    const md = generateCharacterTopic(mockRecord);
    const patch = parseCharacterSheet(md);
    expect(patch).not.toBeNull();
    expect(patch!.race).toBe('Human');
  });
});
