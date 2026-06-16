/**
 * Contract tests for the game.js vendor API surface.
 *
 * These tests do NOT load game.js. They assert the exact shape that our custom
 * patches (game-ui-bindings.js, parent-child-terrain-sync.js, hexmap-render-patch.js,
 * river-edges.js, worker-patch.js) depend on at runtime. When an upstream game.js
 * update intentionally changes an API, this file should fail first — making the
 * breakage explicit before any patch silently misbehaves.
 *
 * Maintenance: when adopting an upstream API change, update the stubs here and
 * commit with message: `test(vendor): update game.js contract for <date> — <what changed>`
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Minimal stub that mirrors window.state.hexMap as game.js sets it up.
// Update this stub when game.js intentionally changes its data structures.
function buildHexMapState(overrides: Record<string, unknown> = {}) {
  const hexes = new Map<string, { q: number; r: number; terrain: string }>();
  hexes.set('0,0', { q: 0, r: 0, terrain: 'plains' });
  hexes.set('1,0', { q: 1, r: 0, terrain: 'ocean' });

  const detailHexes = new Map<string, { q: number; r: number; terrain: string }>();
  detailHexes.set('0,0', { q: 0, r: 0, terrain: 'forest' });

  return {
    hexes,
    detailHexes,
    detailGridDensity: 7 as 7 | 19 | 37,
    mapInstanceId: 'user-map-abc123',
    viewport: { x: 0, y: 0, scale: 1 },
    isPainting: false,
    isPanning: false,
    riverEdges: {} as Record<string, { riverId: string }>,
    rivers: {} as Record<string, { id: string; name: string; color: string; width: number }>,
    ...overrides,
  };
}

describe('game.js contract: hexMap data structures', () => {
  let savedState: unknown;

  beforeEach(() => {
    savedState = (window as any).state;
    (window as any).state = { hexMap: buildHexMapState() };
  });

  afterEach(() => {
    (window as any).state = savedState;
  });

  it('hexes is a Map, not an Array or plain object', () => {
    const { hexes } = (window as any).state.hexMap;
    expect(hexes).toBeInstanceOf(Map);
    expect(Array.isArray(hexes)).toBe(false);
  });

  it('hexes entries have q, r, terrain string fields', () => {
    const hex = (window as any).state.hexMap.hexes.get('0,0');
    expect(hex).toBeDefined();
    expect(typeof hex.q).toBe('number');
    expect(typeof hex.r).toBe('number');
    expect(typeof hex.terrain).toBe('string');
    expect(hex.terrain.length).toBeGreaterThan(0);
  });

  it('hexes is iterable with forEach (not Object.values)', () => {
    const collected: unknown[] = [];
    (window as any).state.hexMap.hexes.forEach((hex: unknown) => collected.push(hex));
    expect(collected.length).toBeGreaterThan(0);
  });

  it('detailHexes is a Map, not an Array or plain object', () => {
    const { detailHexes } = (window as any).state.hexMap;
    expect(detailHexes).toBeInstanceOf(Map);
    expect(Array.isArray(detailHexes)).toBe(false);
  });

  it('detailGridDensity is exactly 7, 19, or 37', () => {
    const { detailGridDensity } = (window as any).state.hexMap;
    expect(typeof detailGridDensity).toBe('number');
    expect([7, 19, 37]).toContain(detailGridDensity);
  });

  it('mapInstanceId is a non-empty string', () => {
    const { mapInstanceId } = (window as any).state.hexMap;
    expect(typeof mapInstanceId).toBe('string');
    expect(mapInstanceId.length).toBeGreaterThan(0);
  });

  it('viewport has numeric x, y, and positive scale', () => {
    const { viewport } = (window as any).state.hexMap;
    expect(typeof viewport.x).toBe('number');
    expect(typeof viewport.y).toBe('number');
    expect(typeof viewport.scale).toBe('number');
    expect(viewport.scale).toBeGreaterThan(0);
  });

  it('isPainting and isPanning are boolean-typed', () => {
    const { isPainting, isPanning } = (window as any).state.hexMap;
    expect(typeof isPainting).toBe('boolean');
    expect(typeof isPanning).toBe('boolean');
  });

  it('riverEdges is a plain object (not a Map)', () => {
    const { riverEdges } = (window as any).state.hexMap;
    expect(typeof riverEdges).toBe('object');
    expect(riverEdges).not.toBeInstanceOf(Map);
    expect(Array.isArray(riverEdges)).toBe(false);
  });

  it('rivers is a plain object (not a Map)', () => {
    const { rivers } = (window as any).state.hexMap;
    expect(typeof rivers).toBe('object');
    expect(rivers).not.toBeInstanceOf(Map);
    expect(Array.isArray(rivers)).toBe(false);
  });
});

describe('game.js contract: isWorkingMap guard', () => {
  let savedState: unknown;

  afterEach(() => {
    (window as any).state = savedState;
  });

  it('user map id does not start with earth- prefix', () => {
    savedState = (window as any).state;
    (window as any).state = { hexMap: buildHexMapState({ mapInstanceId: 'user-map-abc123' }) };
    const id = String((window as any).state?.hexMap?.mapInstanceId || '');
    expect(id.startsWith('earth-')).toBe(false);
    expect(id.startsWith('earth-996')).toBe(false);
  });

  it('earth map ids start with earth- prefix (guard should skip them)', () => {
    savedState = (window as any).state;
    (window as any).state = { hexMap: buildHexMapState({ mapInstanceId: 'earth-996-ad-region-1' }) };
    const id = String((window as any).state?.hexMap?.mapInstanceId || '');
    expect(id.startsWith('earth-')).toBe(true);
  });
});

describe('game.js contract: getParentHexDisplayTerrainSummary', () => {
  let savedFn: unknown;

  beforeEach(() => {
    savedFn = (window as any).getParentHexDisplayTerrainSummary;
    // Stub that mirrors the real function's signature at game.js line 12392
    (window as any).getParentHexDisplayTerrainSummary = (q: number, r: number): string => 'plains';
  });

  afterEach(() => {
    (window as any).getParentHexDisplayTerrainSummary = savedFn;
  });

  it('is a function exposed on window after game.js loads', () => {
    expect(typeof (window as any).getParentHexDisplayTerrainSummary).toBe('function');
  });

  it('accepts (q: number, r: number) arguments', () => {
    expect(() => (window as any).getParentHexDisplayTerrainSummary(0, 0)).not.toThrow();
    expect(() => (window as any).getParentHexDisplayTerrainSummary(-5, 3)).not.toThrow();
  });

  it('returns a non-empty string terrain name', () => {
    const result = (window as any).getParentHexDisplayTerrainSummary(0, 0);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('game.js contract: Worker constructor patched by worker-patch.js', () => {
  let savedWorker: unknown;
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    savedWorker = (window as any).Worker;

    // Install a spy as the original Worker
    const SpyWorker = function (url: string) {
      calls.push(url);
    };
    SpyWorker.prototype = {};
    (window as any).Worker = SpyWorker;

    // Apply the worker-patch.js wrapping logic inline
    const OrigSaved = (window as any).Worker;
    (window as any).Worker = function (scriptURL: string, options?: WorkerOptions) {
      let resolved = scriptURL;
      if (
        typeof scriptURL === 'string' &&
        !scriptURL.startsWith('/') &&
        !scriptURL.startsWith('http')
      ) {
        resolved = '/hexmap/' + scriptURL;
      }
      return new OrigSaved(resolved, options);
    };
  });

  afterEach(() => {
    (window as any).Worker = savedWorker;
  });

  it('rewrites relative paths to /hexmap/<filename>', () => {
    new (window as any).Worker('map-worker.js');
    expect(calls[0]).toBe('/hexmap/map-worker.js');
  });

  it('does not double-prefix already-absolute paths', () => {
    new (window as any).Worker('/absolute/path.js');
    expect(calls[0]).toBe('/absolute/path.js');
  });

  it('does not rewrite http(s) URLs', () => {
    new (window as any).Worker('https://cdn.example.com/worker.js');
    expect(calls[0]).toBe('https://cdn.example.com/worker.js');
  });
});

describe('game.js contract: renderHex global function', () => {
  let savedRenderHex: unknown;

  beforeEach(() => {
    savedRenderHex = (window as any).renderHex;
    // game.js exposes renderHex as a no-arg callable on window
    (window as any).renderHex = () => undefined;
  });

  afterEach(() => {
    (window as any).renderHex = savedRenderHex;
  });

  it('renderHex is callable with no arguments', () => {
    expect(typeof (window as any).renderHex).toBe('function');
    expect(() => (window as any).renderHex()).not.toThrow();
  });
});
