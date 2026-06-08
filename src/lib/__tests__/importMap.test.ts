import { describe, it, expect } from 'vitest';
import { normalizeLoadedMapCollections } from '../importMap';

describe('importMap.ts normalization', () => {
  it('converts object-based collections to arrays', () => {
    const input = {
      hexes: {
        '0,0': { q: 0, r: 0, terrain: 'grass' },
        '0,1': { q: 0, r: 1, terrain: 'water' }
      },
      mapName: 'Test Map'
    } as any;

    const result = normalizeLoadedMapCollections({ ...input });
    expect(Array.isArray(result.hexes)).toBe(true);
    expect(result.hexes).toHaveLength(2);
    expect(result.hexes).toContainEqual({ q: 0, r: 0, terrain: 'grass' });
  });

  it('leaves existing arrays untouched', () => {
    const input = { 
      tokens: [{ id: '1' }],
      landmarks: []
    } as any;
    const result = normalizeLoadedMapCollections({ ...input });
    expect(result).toEqual(input);
  });
});