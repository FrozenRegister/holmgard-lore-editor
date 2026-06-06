import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto';

// Import after fake-indexeddb polyfill
import {
	getMapDb,
	getMaps,
	getHex,
	getHexRadius,
	getLandmarksInRadius,
	getMapContext,
	deleteMap,
	getHexCount,
	getLandmarkCount,
	updateMapPushedAt,
	getMap,
	getLandmark,
	putLandmark,
	setLandmarkLinkedLore,
	getLandmarksForLoreKey,
	getLandmarksForLoreKeyOnMap,
	type MapMeta,
	type HexRecord,
	type LandmarkRecord
} from '../mapDb';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function clearDb(): Promise<void> {
	const db = await getMapDb();
	// Clear all stores
	await db.clear('maps');
	await db.clear('hexes');
	await db.clear('landmarks');
}

async function seedMap(
	mapId: string,
	hexes: Partial<HexRecord>[],
	landmarks: Partial<LandmarkRecord>[]
): Promise<void> {
	const db = await getMapDb();
	const now = new Date().toISOString();

	// Insert map meta
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

	// Insert hexes
	for (const h of hexes) {
		const hex: HexRecord = {
			mapId,
			q: h.q!,
			r: h.r!,
			terrain: h.terrain || 'grass',
			name: h.name || '',
			description: h.description || ''
		};
		await db.put('hexes', hex);
	}

	// Insert landmarks
	for (const l of landmarks) {
		const landmark: LandmarkRecord = {
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
		};
		await db.put('landmarks', landmark);
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mapDb', () => {
	beforeAll(async () => {
		// Ensure DB is initialized
		await getMapDb();
	});

	beforeEach(async () => {
		await clearDb();
	});

	describe('getHexRadius', () => {
		it('returns center hex when radius is 0', async () => {
			await seedMap('map1', [{ q: 0, r: 0, terrain: 'grass' }], []);
			const result = await getHexRadius('map1', 0, 0, 0);
			expect(result).toHaveLength(1);
			expect(result[0].q).toBe(0);
			expect(result[0].r).toBe(0);
		});

		it('returns all hexes within radius 1', async () => {
			// Center + 6 neighbors in axial coordinates
			await seedMap(
				'map1',
				[
					{ q: 0, r: 0, terrain: 'grass' }, // center
					{ q: 1, r: 0, terrain: 'grass' }, // E
					{ q: 0, r: 1, terrain: 'forest' }, // SE
					{ q: -1, r: 1, terrain: 'water' }, // SW
					{ q: -1, r: 0, terrain: 'grass' }, // W
					{ q: 0, r: -1, terrain: 'grass' }, // NW
					{ q: 1, r: -1, terrain: 'grass' } // NE
				],
				[]
			);

			const result = await getHexRadius('map1', 0, 0, 1);
			expect(result).toHaveLength(7);
		});

		it('excludes hexes outside radius', async () => {
			await seedMap(
				'map1',
				[
					{ q: 0, r: 0, terrain: 'grass' },
					{ q: 2, r: 0, terrain: 'forest' }, // distance 2 from center
					{ q: 3, r: 0, terrain: 'water' } // distance 3 from center
				],
				[]
			);

			const result = await getHexRadius('map1', 0, 0, 1);
			expect(result).toHaveLength(1);
			expect(result[0].q).toBe(0);
			expect(result[0].r).toBe(0);
		});

		it('returns empty array for non-existent map', async () => {
			const result = await getHexRadius('nonexistent', 0, 0, 1);
			expect(result).toHaveLength(0);
		});
	});

	describe('getMapContext', () => {
		it('returns correct terrain_breakdown counts', async () => {
			await seedMap(
				'map1',
				[
					{ q: 0, r: 0, terrain: 'grass' },
					{ q: 1, r: 0, terrain: 'grass' },
					{ q: 0, r: 1, terrain: 'grass' },
					{ q: -1, r: 1, terrain: 'forest' },
					{ q: -1, r: 0, terrain: 'forest' },
					{ q: 0, r: -1, terrain: 'water' }
				],
				[]
			);

			const context = await getMapContext('map1', 0, 0, 10);
			expect(context.terrain_breakdown).toHaveLength(3);
			expect(context.terrain_breakdown[0]).toEqual({ terrain: 'grass', count: 3 });
			expect(context.terrain_breakdown[1]).toEqual({ terrain: 'forest', count: 2 });
			expect(context.terrain_breakdown[2]).toEqual({ terrain: 'water', count: 1 });
		});

		it('returns landmarks sorted by dist, capped at 20', async () => {
			const landmarks = Array.from({ length: 25 }, (_, i) => ({
				id: `lm-${i}`,
				q: i,
				r: 0,
				type: 'city',
				name: `City ${i}`,
				notes: ''
			}));

			await seedMap('map1', [{ q: 0, r: 0, terrain: 'grass' }], landmarks);

			const context = await getMapContext('map1', 0, 0, 30);
			expect(context.nearby_landmarks).toHaveLength(20);
			expect(context.nearby_landmarks[0].dist).toBe(0);
			expect(context.nearby_landmarks[1].dist).toBe(1);
			// Verify sorted by distance
			for (let i = 1; i < context.nearby_landmarks.length; i++) {
				expect(context.nearby_landmarks[i].dist).toBeGreaterThanOrEqual(
					context.nearby_landmarks[i - 1].dist
				);
			}
		});

		it('includes dist field on landmark results', async () => {
			await seedMap(
				'map1',
				[{ q: 0, r: 0, terrain: 'grass' }],
				[{ id: 'lm1', q: 2, r: 0, type: 'city', name: 'City', notes: '' }]
			);

			const context = await getMapContext('map1', 0, 0, 10);
			expect(context.nearby_landmarks).toHaveLength(1);
			expect(context.nearby_landmarks[0].dist).toBe(2);
		});
	});

	describe('getLandmarksInRadius', () => {
		it('returns dist field on results', async () => {
			await seedMap(
				'map1',
				[],
				[
					{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'Center', notes: '' },
					{ id: 'lm2', q: 3, r: 0, type: 'city', name: 'Far', notes: '' }
				]
			);

			const result = await getLandmarksInRadius('map1', 0, 0, 5);
			expect(result).toHaveLength(2);
			expect(result.find((l) => l.id === 'lm1')?.dist).toBe(0);
			expect(result.find((l) => l.id === 'lm2')?.dist).toBe(3);
		});

		it('filters by radius correctly', async () => {
			await seedMap(
				'map1',
				[],
				[
					{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'Center', notes: '' },
					{ id: 'lm2', q: 2, r: 0, type: 'city', name: 'Mid', notes: '' },
					{ id: 'lm3', q: 5, r: 0, type: 'city', name: 'Far', notes: '' }
				]
			);

			const result = await getLandmarksInRadius('map1', 0, 0, 2);
			expect(result).toHaveLength(2);
			expect(result.map((l) => l.id)).toContain('lm1');
			expect(result.map((l) => l.id)).toContain('lm2');
			expect(result.map((l) => l.id)).not.toContain('lm3');
		});
	});

	describe('deleteMap', () => {
		it('removes map from all stores', async () => {
			await seedMap(
				'map1',
				[
					{ q: 0, r: 0, terrain: 'grass' },
					{ q: 1, r: 0, terrain: 'forest' }
				],
				[
					{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'City', notes: '' }
				]
			);

			await deleteMap('map1');

			const maps = await getMaps();
			expect(maps).toHaveLength(0);

			const hexCount = await getHexCount('map1');
			expect(hexCount).toBe(0);

			const landmarkCount = await getLandmarkCount('map1');
			expect(landmarkCount).toBe(0);
		});

		it('does not affect other maps', async () => {
			await seedMap('map1', [{ q: 0, r: 0, terrain: 'grass' }], []);
			await seedMap('map2', [{ q: 1, r: 1, terrain: 'forest' }], []);

			await deleteMap('map1');

			const maps = await getMaps();
			expect(maps).toHaveLength(1);
			expect(maps[0].instanceId).toBe('map2');

			const hexCount = await getHexCount('map2');
			expect(hexCount).toBe(1);
		});
	});

	describe('updateMapPushedAt', () => {
		it('updates pushedAt timestamp', async () => {
			await seedMap('map1', [], []);

			const before = await getMap('map1');
			expect(before?.pushedAt).toBeNull();

			const now = new Date().toISOString();
			await updateMapPushedAt('map1', now);

			const after = await getMap('map1');
			expect(after?.pushedAt).toBe(now);
		});
	});

	describe('landmark linking', () => {
		it('getLandmark returns null for missing', async () => {
			const result = await getLandmark('map1', 'missing');
			expect(result).toBeNull();
		});

		it('getLandmark returns the record with linkedLoreKey defaulted to null', async () => {
			await seedMap('map1', [], [
				{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'Center', notes: '' }
			]);
			const result = await getLandmark('map1', 'lm1');
			expect(result).not.toBeNull();
			expect(result?.linkedLoreKey).toBeNull();
		});

		it('setLandmarkLinkedLore updates the link and returns the record', async () => {
			await seedMap('map1', [], [
				{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'Center', notes: '' }
			]);
			const updated = await setLandmarkLinkedLore('map1', 'lm1', 'location:crowkeep');
			expect(updated?.linkedLoreKey).toBe('location:crowkeep');
			const reread = await getLandmark('map1', 'lm1');
			expect(reread?.linkedLoreKey).toBe('location:crowkeep');
		});

		it('setLandmarkLinkedLore with null unlinks', async () => {
			await seedMap('map1', [], [
				{
					id: 'lm1',
					q: 0,
					r: 0,
					type: 'city',
					name: 'Center',
					notes: '',
					linkedLoreKey: 'location:crowkeep'
				}
			]);
			const updated = await setLandmarkLinkedLore('map1', 'lm1', null);
			expect(updated?.linkedLoreKey).toBeNull();
		});

		it('setLandmarkLinkedLore is a no-op for missing landmark', async () => {
			const result = await setLandmarkLinkedLore('map1', 'missing', 'location:x');
			expect(result).toBeNull();
		});

		it('putLandmark preserves existing linkedLoreKey when not provided', async () => {
			await seedMap('map1', [], [
				{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'Center', notes: '' }
			]);
			await setLandmarkLinkedLore('map1', 'lm1', 'location:crowkeep');
			// putLandmark without linkedLoreKey
			await putLandmark({
				mapId: 'map1',
				id: 'lm1',
				q: 0,
				r: 0,
				name: 'Center',
				type: 'city',
				notes: '',
				attributes: '{}',
				linkedMapId: null,
				visible: true,
				linkedLoreKey: null
			});
			const reread = await getLandmark('map1', 'lm1');
			// null in input is treated as "not provided" by the merge — should preserve existing
			expect(reread?.linkedLoreKey).toBe('location:crowkeep');
		});

		it('getLandmarksForLoreKey finds across maps', async () => {
			await seedMap('map1', [], [
				{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'A', notes: '', linkedLoreKey: 'location:crowkeep' }
			]);
			await seedMap('map2', [], [
				{ id: 'lm2', q: 1, r: 1, type: 'city', name: 'B', notes: '', linkedLoreKey: 'location:crowkeep' },
				{ id: 'lm3', q: 2, r: 2, type: 'city', name: 'C', notes: '', linkedLoreKey: 'location:other' }
			]);
			const result = await getLandmarksForLoreKey('location:crowkeep');
			expect(result.map((l) => l.id).sort()).toEqual(['lm1', 'lm2']);
		});

		it('getLandmarksForLoreKeyOnMap uses the index', async () => {
			await seedMap('map1', [], [
				{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'A', notes: '', linkedLoreKey: 'location:crowkeep' }
			]);
			await seedMap('map2', [], [
				{ id: 'lm2', q: 1, r: 1, type: 'city', name: 'B', notes: '', linkedLoreKey: 'location:crowkeep' }
			]);
			const result = await getLandmarksForLoreKeyOnMap('map2', 'location:crowkeep');
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('lm2');
		});

		it('getLandmarksForLoreKeyOnMap returns [] when no link matches', async () => {
			await seedMap('map1', [], [
				{ id: 'lm1', q: 0, r: 0, type: 'city', name: 'A', notes: '', linkedLoreKey: 'location:crowkeep' }
			]);
			const result = await getLandmarksForLoreKeyOnMap('map1', 'location:nope');
			expect(result).toEqual([]);
		});
	});
});
