import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';
import { get } from 'svelte/store';

import {
	axialDistance,
	hexNeighbors,
	HEX_DIRECTIONS,
	DEFAULT_TERRAIN_COSTS,
	findPath,
	computeDistanceOnMap,
	computePathOnMap,
	linkLandmarkToLore,
	unlinkLandmarkFromLore,
	getLandmarksForLore,
	getLandmarkForLore,
	getMapContextForLore,
	distanceFromLoreToHex,
	pathFromLoreToHex
} from '../mapTools';
import {
	getMapDb,
	type MapMeta,
	type HexRecord,
	type LandmarkRecord
} from '../mapDb';
import { topics } from '../stores';
import { loadTopic, saveTopic } from '../storage';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function clearDb(): Promise<void> {
	const db = await getMapDb();
	await db.clear('maps');
	await db.clear('hexes');
	await db.clear('landmarks');
}

async function seedMap(
	mapId: string,
	hexes: Partial<HexRecord>[],
	landmarks: Partial<LandmarkRecord>[] = []
): Promise<void> {
	const db = await getMapDb();
	const now = new Date().toISOString();
	const mapMeta: MapMeta = {
		instanceId: mapId,
		name: 'Test Map',
		mapType: 'test',
		version: '1.0',
		ingestedAt: now,
		pushedAt: null,
		hexCount: hexes.length,
		landmarkCount: landmarks.length
	};
	await db.put('maps', mapMeta);
	for (const h of hexes) {
		await db.put('hexes', {
			mapId,
			q: h.q!,
			r: h.r!,
			terrain: h.terrain || 'grass',
			name: h.name || '',
			description: h.description || ''
		});
	}
	for (const l of landmarks) {
		await db.put('landmarks', {
			mapId,
			id: l.id!,
			q: l.q!,
			r: l.r!,
			name: l.name || '',
			type: l.type || '',
			notes: l.notes || '',
			attributes: JSON.stringify(l.attributes || {}),
			linkedMapId: l.linkedMapId ?? null,
			visible: l.visible ?? true,
			linkedLoreKey: l.linkedLoreKey ?? null
		});
	}
}

async function seedLoreTopic(key: string, text: string): Promise<void> {
	await saveTopic({
		key,
		text,
		meta: { updatedAt: new Date().toISOString(), version: 1 }
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mapTools', () => {
	beforeAll(async () => {
		await getMapDb();
	});

	beforeEach(async () => {
		await clearDb();
		// Reset topics store between tests
		topics.set([]);
	});

	describe('axialDistance', () => {
		it('returns 0 for same hex', () => {
			expect(axialDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
		});

		it('returns 1 for adjacent hexes', () => {
			expect(axialDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
			expect(axialDistance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1);
			expect(axialDistance({ q: 5, r: 5 }, { q: 5, r: 4 })).toBe(1);
		});

		it('returns N for N-step paths', () => {
			expect(axialDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
			expect(axialDistance({ q: 0, r: 0 }, { q: -2, r: 2 })).toBe(2);
		});

		it('is symmetric', () => {
			const a = { q: 4, r: -2 };
			const b = { q: -1, r: 3 };
			expect(axialDistance(a, b)).toBe(axialDistance(b, a));
		});
	});

	describe('hexNeighbors', () => {
		it('returns 6 unique neighbours', () => {
			const ns = hexNeighbors(0, 0);
			expect(ns).toHaveLength(6);
			const keys = new Set(ns.map((n) => `${n.q},${n.r}`));
			expect(keys.size).toBe(6);
		});

		it('offsets by 1 in each axial direction', () => {
			const ns = hexNeighbors(5, 5);
			for (const d of HEX_DIRECTIONS) {
				expect(ns).toContainEqual({ q: 5 + d.q, r: 5 + d.r });
			}
		});
	});

	describe('DEFAULT_TERRAIN_COSTS', () => {
		it('marks water and ocean as impassable', () => {
			expect(DEFAULT_TERRAIN_COSTS.water).toBe(Infinity);
			expect(DEFAULT_TERRAIN_COSTS.ocean).toBe(Infinity);
		});
		it('grass is the cheapest passable terrain', () => {
			expect(DEFAULT_TERRAIN_COSTS.grass).toBe(1);
		});
	});

	describe('findPath', () => {
		it('returns a single-step zero-cost path for same hex', async () => {
			const r = await findPath('map1', { q: 0, r: 0 }, { q: 0, r: 0 });
			expect(r?.path).toEqual([{ q: 0, r: 0 }]);
			expect(r?.totalCost).toBe(0);
		});

		it('returns a path across multiple hexes', async () => {
			// A 5x1 strip of grass from (0,0) to (4,0)
			const hexes: Partial<HexRecord>[] = [];
			for (let q = 0; q <= 4; q++) hexes.push({ q, r: 0, terrain: 'grass' });
			await seedMap('map1', hexes);
			const r = await findPath('map1', { q: 0, r: 0 }, { q: 4, r: 0 });
			expect(r).not.toBeNull();
			expect(r?.path[0]).toEqual({ q: 0, r: 0 });
			expect(r?.path[r!.path.length - 1]).toEqual({ q: 4, r: 0 });
			expect(r?.path.length).toBe(5);
		});

		it('respects terrain cost (mountains > grass, picks cheaper detour)', async () => {
			// Direct: (0,0) -> (1,0) [mountains, cost 4] -> (2,0) [grass, cost 1] = 5
			// Detour: (0,0) -> (0,1) [grass, 1] -> (1,1) [grass, 1] -> (2,0) [grass, 1] = 3
			// Detour is strictly cheaper, A* must take it.
			await seedMap('map1', [
				{ q: 0, r: 0, terrain: 'grass' },
				{ q: 1, r: 0, terrain: 'mountains' },
				{ q: 2, r: 0, terrain: 'grass' },
				{ q: 0, r: 1, terrain: 'grass' },
				{ q: 1, r: 1, terrain: 'grass' },
				{ q: 2, r: 1, terrain: 'grass' }
			]);
			const r = await findPath('map1', { q: 0, r: 0 }, { q: 2, r: 0 });
			expect(r).not.toBeNull();
			// Should avoid the mountains hex
			expect(r?.path).not.toContainEqual({ q: 1, r: 0 });
			expect(r?.totalCost).toBe(3);
		});

		it('returns null if destination is impassable', async () => {
			await seedMap('map1', [
				{ q: 0, r: 0, terrain: 'grass' },
				{ q: 1, r: 0, terrain: 'water' }
			]);
			const r = await findPath('map1', { q: 0, r: 0 }, { q: 1, r: 0 });
			expect(r).toBeNull();
		});

		it('returns null if no path exists (impassable ring)', async () => {
			// Surround (0,0) with water; no path out
			await seedMap('map1', [
				{ q: 0, r: 0, terrain: 'grass' },
				{ q: 1, r: 0, terrain: 'water' },
				{ q: 1, r: -1, terrain: 'water' },
				{ q: 0, r: -1, terrain: 'water' },
				{ q: -1, r: 0, terrain: 'water' },
				{ q: -1, r: 1, terrain: 'water' },
				{ q: 0, r: 1, terrain: 'water' }
			]);
			const r = await findPath('map1', { q: 0, r: 0 }, { q: 2, r: 0 });
			expect(r).toBeNull();
		});

		it('respects user terrain-cost overrides', async () => {
			await seedMap('map1', [
				{ q: 0, r: 0, terrain: 'grass' },
				{ q: 1, r: 0, terrain: 'forest' },
				{ q: 2, r: 0, terrain: 'grass' }
			]);
			// Override: treat forest as cost 0. The cost of the path is the
			// sum of destination-hex costs (so the start hex's grass is not
			// counted): grass(start) -> forest(0) -> grass(1) = 1.
			const r = await findPath('map1', { q: 0, r: 0 }, { q: 2, r: 0 }, {
				terrainCosts: { forest: 0 }
			});
			expect(r?.totalCost).toBe(1);
		});
	});

	describe('computeDistanceOnMap / computePathOnMap', () => {
		it('computeDistanceOnMap matches axialDistance', async () => {
			expect(
				await computeDistanceOnMap('map1', { q: 0, r: 0 }, { q: 3, r: -1 })
			).toBe(axialDistance({ q: 0, r: 0 }, { q: 3, r: -1 }));
		});

		it('computePathOnMap delegates to findPath', async () => {
			await seedMap('map1', [
				{ q: 0, r: 0, terrain: 'grass' },
				{ q: 1, r: 0, terrain: 'grass' }
			]);
			const r = await computePathOnMap('map1', { q: 0, r: 0 }, { q: 1, r: 0 });
			expect(r?.path).toEqual([
				{ q: 0, r: 0 },
				{ q: 1, r: 0 }
			]);
		});
	});

	describe('linkLandmarkToLore / unlinkLandmarkFromLore', () => {
		it('links and unlinks without writeLoreBack', async () => {
			await seedMap('map1', [{ q: 0, r: 0, terrain: 'grass' }], [
				{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'Center', notes: '' }
			]);
			const linked = await linkLandmarkToLore('map1', 'lm1', 'location:crowkeep');
			expect(linked?.linkedLoreKey).toBe('location:crowkeep');
			const unlinked = await unlinkLandmarkFromLore('map1', 'lm1');
			expect(unlinked?.linkedLoreKey).toBeNull();
		});

		it('writes a Map-Position line into the lore entry on link with writeLoreBack', async () => {
			await seedLoreTopic('location:crowkeep', '# Crowkeep\n\nA mountain fortress.');
			await seedMap('map1', [{ q: 3, r: 5, terrain: 'grass' }], [
				{ id: 'lm1', q: 3, r: 5, type: 'city', name: 'Center', notes: '' }
			]);
			const linked = await linkLandmarkToLore('map1', 'lm1', 'location:crowkeep', {
				writeLoreBack: true
			});
			expect(linked?.linkedLoreKey).toBe('location:crowkeep');
			const lore = await loadTopic('location:crowkeep');
			expect(lore?.text).toContain('**Map-Position:** map1, 3, 5');
		});

		it('updates the Map-Position line on relink', async () => {
			await seedLoreTopic('location:crowkeep', '# Crowkeep\n\n**Map-Position:** map1, 0, 0');
			await seedMap('map2', [{ q: 7, r: 2, terrain: 'grass' }], [
				{ id: 'lm1', q: 7, r: 2, type: 'city', name: 'Center', notes: '' }
			]);
			await linkLandmarkToLore('map2', 'lm1', 'location:crowkeep', { writeLoreBack: true });
			const lore = await loadTopic('location:crowkeep');
			expect(lore?.text).toContain('**Map-Position:** map2, 7, 2');
			expect(lore?.text).not.toContain('map1, 0, 0');
		});

		it('strips Map-Position on unlink with writeLoreBack', async () => {
			await seedLoreTopic(
				'location:crowkeep',
				'# Crowkeep\n\n**Map-Position:** map1, 3, 5'
			);
			await seedMap('map1', [{ q: 3, r: 5, terrain: 'grass' }], [
				{
					id: 'lm1',
					q: 3,
					r: 5,
					type: 'city',
					name: 'Center',
					notes: '',
					linkedLoreKey: 'location:crowkeep'
				}
			]);
			await unlinkLandmarkFromLore('map1', 'lm1', { writeLoreBack: true });
			const lore = await loadTopic('location:crowkeep');
			expect(lore?.text).not.toContain('Map-Position');
		});

		it('returns null when the landmark does not exist', async () => {
			const r = await linkLandmarkToLore('map1', 'missing', 'location:crowkeep');
			expect(r).toBeNull();
		});
	});

	describe('lore-side queries', () => {
		beforeEach(async () => {
			await seedMap('map1', [{ q: 1, r: 1, terrain: 'grass' }], [
				{ id: 'lm1', q: 1, r: 1, type: 'city', name: 'A', notes: '', linkedLoreKey: 'location:crowkeep' }
			]);
			await seedMap('map2', [{ q: 2, r: 2, terrain: 'forest' }], [
				{ id: 'lm2', q: 2, r: 2, type: 'city', name: 'B', notes: '', linkedLoreKey: 'location:crowkeep' }
			]);
		});

		it('getLandmarksForLore returns all linked landmarks', async () => {
			const result = await getLandmarksForLore('location:crowkeep');
			expect(result.map((l) => l.id).sort()).toEqual(['lm1', 'lm2']);
		});

		it('getLandmarkForLore returns the first match', async () => {
			const result = await getLandmarkForLore('location:crowkeep');
			expect(result).not.toBeNull();
			expect(['lm1', 'lm2']).toContain(result!.id);
		});

		it('getLandmarkForLore returns null when no link', async () => {
			const result = await getLandmarkForLore('location:no-such-thing');
			expect(result).toBeNull();
		});

		it('getMapContextForLore returns terrain and nearby landmarks', async () => {
			const ctx = await getMapContextForLore('location:crowkeep', 5);
			expect(ctx).not.toBeNull();
			expect(ctx?.mapId).toMatch(/map[12]/);
			expect(ctx?.landmark.id).toMatch(/lm[12]/);
		});

		it('getMapContextForLore returns null when not linked', async () => {
			const ctx = await getMapContextForLore('location:no-such-thing', 5);
			expect(ctx).toBeNull();
		});

		it('distanceFromLoreToHex computes axial distance when same map', async () => {
			const d = await distanceFromLoreToHex('location:crowkeep', 'map1', 5, 5);
			expect(d).not.toBeNull();
			expect(d).toBe(axialDistance({ q: 1, r: 1 }, { q: 5, r: 5 }));
		});

		it('distanceFromLoreToHex returns null when maps differ', async () => {
			const d = await distanceFromLoreToHex('location:crowkeep', 'mapX', 5, 5);
			expect(d).toBeNull();
		});

		it('pathFromLoreToHex returns a path on the same map', async () => {
			// Build a small open map: 6x6 grass
			const hexes: Partial<HexRecord>[] = [];
			for (let q = -3; q <= 3; q++) {
				for (let r = -3; r <= 3; r++) {
					hexes.push({ q, r, terrain: 'grass' });
				}
			}
			await seedMap('map1', hexes, [
				{ id: 'lm1', q: 1, r: 1, type: 'city', name: 'A', notes: '', linkedLoreKey: 'location:crowkeep' }
			]);
			const p = await pathFromLoreToHex('location:crowkeep', 'map1', 3, 3);
			expect(p).not.toBeNull();
			expect(p!.path[0]).toEqual({ q: 1, r: 1 });
			expect(p!.path[p!.path.length - 1]).toEqual({ q: 3, r: 3 });
		});
	});
});
