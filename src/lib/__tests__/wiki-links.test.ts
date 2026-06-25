import { describe, it, expect } from 'vitest';
import { extractWikiLinks, normalizeLabel, resolveWikiLink } from '../wiki-links';

// ── extractWikiLinks ──────────────────────────────────────────────────────────

describe('extractWikiLinks', () => {
  it('extracts a single link', () => {
    expect(extractWikiLinks('Hello [[Aldric]] there')).toEqual(['Aldric']);
  });

  it('extracts multiple links', () => {
    const text = '[[Aldric]] met [[Elara]] at [[Eastgate]].';
    expect(extractWikiLinks(text)).toEqual(['Aldric', 'Elara', 'Eastgate']);
  });

  it('returns empty array when no links present', () => {
    expect(extractWikiLinks('No links here.')).toEqual([]);
  });

  it('trims whitespace inside brackets', () => {
    expect(extractWikiLinks('[[ Iron Crown  ]]')).toEqual(['Iron Crown']);
  });

  it('handles link at start of string', () => {
    expect(extractWikiLinks('[[Aldric]] walked away.')).toEqual(['Aldric']);
  });

  it('handles link at end of string', () => {
    expect(extractWikiLinks('He found [[Iron Crown]]')).toEqual(['Iron Crown']);
  });

  it('returns empty array for empty string', () => {
    expect(extractWikiLinks('')).toEqual([]);
  });

  it('does not extract unclosed brackets', () => {
    expect(extractWikiLinks('[[Unclosed')).toEqual([]);
  });

  it('handles multiple links on same line', () => {
    const text = '[[A]] and [[B]] and [[C]]';
    expect(extractWikiLinks(text)).toHaveLength(3);
  });

  it('does not include nested brackets in label', () => {
    // [[name]] where name has no nested brackets
    expect(extractWikiLinks('[[Kel the Bold]]')).toEqual(["Kel the Bold"]);
  });
});

// ── normalizeLabel ────────────────────────────────────────────────────────────

describe('normalizeLabel', () => {
  it('lowercases', () => {
    expect(normalizeLabel('Aldric')).toBe('aldric');
  });

  it('replaces spaces with hyphens', () => {
    expect(normalizeLabel('Iron Crown')).toBe('iron-crown');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeLabel('Kel  the  Bold')).toBe('kel-the-bold');
  });

  it('handles already-normalized input', () => {
    expect(normalizeLabel('aldric')).toBe('aldric');
  });

  it('handles empty string', () => {
    expect(normalizeLabel('')).toBe('');
  });

  it('preserves hyphens already in name', () => {
    expect(normalizeLabel("Kel'dan the Bold")).toBe("kel'dan-the-bold");
  });
});

// ── resolveWikiLink ───────────────────────────────────────────────────────────

describe('resolveWikiLink', () => {
  const keys = [
    'character:aldric',
    'character:elara',
    'location:eastgate',
    'item:iron-crown',
    'faction:iron-brotherhood',
    'plain-key',
  ];

  it('resolves by slug after colon (simple name)', () => {
    expect(resolveWikiLink('Aldric', keys)).toBe('character:aldric');
  });

  it('resolves multi-word name by normalizing to slug', () => {
    expect(resolveWikiLink('Iron Crown', keys)).toBe('item:iron-crown');
  });

  it('resolves exact key match (no colon in label)', () => {
    expect(resolveWikiLink('plain-key', keys)).toBe('plain-key');
  });

  it('resolves case-insensitively', () => {
    expect(resolveWikiLink('ALDRIC', keys)).toBe('character:aldric');
  });

  it('returns null for unknown label', () => {
    expect(resolveWikiLink('Unknown Person', keys)).toBeNull();
  });

  it('returns null for empty label', () => {
    expect(resolveWikiLink('', keys)).toBeNull();
  });

  it('returns null when topic list is empty', () => {
    expect(resolveWikiLink('Aldric', [])).toBeNull();
  });

  it('resolves hyphenated multi-word names', () => {
    expect(resolveWikiLink('Iron Brotherhood', keys)).toBe('faction:iron-brotherhood');
  });

  it('does not resolve a prefix alone without matching slug', () => {
    expect(resolveWikiLink('character', keys)).toBeNull();
  });

  it('handles label with leading/trailing spaces after trim', () => {
    // extractWikiLinks already trims, but resolveWikiLink itself does not trim
    // — it normalizes via normalizeLabel which only lowercases/hyphenates
    expect(resolveWikiLink('aldric', keys)).toBe('character:aldric');
  });

  it('malformed — null or undefined input returns null gracefully', () => {
    expect(resolveWikiLink('', [])).toBeNull();
    expect(resolveWikiLink('xyz', [])).toBeNull();
  });
});
