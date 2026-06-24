import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Import after fake-indexeddb polyfill
import { ingestMap } from '../mapIngest';
import { getMapDb, getMaps, getHexCount, getLandmarkCount, getAllHexes, getAllLandmarks } from '../mapDb';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function clearDb(): Promise<void> {
	const db = await getMapDb();
	await db.clear('maps');
	await db.clear('hexes');
	await db.clear('landmarks');
}

function makeValidMapJson(overrides: Partial<{
	mapInstanceId: string;
	mapName: string;
	mapType: string;
	version: string;
	hexes: Array<{ q: number; r: number; terrain: string; name: string; description: string }>;
	landmarks: Array<{ id: string; q: number; r: number; name: string; type: string; notes: string; attributes: Record<string, unknown> }>;
}> = {}): string {
	const data = {
		version: overrides.version || '1.0',
		mapName: overrides.mapName || 'Test Map',
		mapType: overrides.mapType || 'world',
		mapInstanceId: overrides.mapInstanceId || 'test-map-123',
		hexes: overrides.hexes || [
			{ q: 0, r: 0, terrain: 'grass', name: '', description: '' },
			{ q: 1, r: 0, terrain: 'forest', name: '', description: '' },
		],
		landmarks: overrides.landmarks || [
			{ id: 'lm1', q: 0, r: 0, name: 'Capital', type: 'city', notes: '', attributes: {} },
		],
	};
	return JSON.stringify(data);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mapIngest', () => {
	beforeAll(async () => {
		await getMapDb();
	});

	beforeEach(async () => {
		await clearDb();
	});

	describe('ingestMap', () => {
		it('ingests valid JSON successfully and returns correct counts', async () => {
			const json = makeValidMapJson({
				hexes: [
					{ q: 0, r: 0, terrain: 'grass', name: '', description: '' },
					{ q: 1, r: 0, terrain: 'forest', name: '', description: '' },
					{ q: 0, r: 1, terrain: 'water', name: '', description: '' },
				],
				landmarks: [
					{ id: 'lm1', q: 0, r: 0, name: 'City', type: 'city', notes: '', attributes: {} },
					{ id: 'lm2', q: 1, r: 0, name: 'Fort', type: 'fort', notes: '', attributes: {} },
				],
			});

			const result = await ingestMap(json);

			expect(result.mapId).toBe('test-map-123');
			expect(result.hexes).toBe(3);
			expect(result.landmarks).toBe(2);

			// Verify data is in the database
			const maps = await getMaps();
			expect(maps).toHaveLength(1);
			expect(maps[0].name).toBe('Test Map');
			expect(maps[0].hexCount).toBe(3);
			expect(maps[0].landmarkCount).toBe(2);

			const hexCount = await getHexCount('test-map-123');
			expect(hexCount).toBe(3);

			const landmarkCount = await getLandmarkCount('test-map-123');
			expect(landmarkCount).toBe(2);
		});

		it('throws when mapInstanceId is missing', async () => {
			const json = JSON.stringify({
				version: '1.0',
				mapName: 'Test',
				mapType: 'world',
				hexes: [{ q: 0, r: 0, terrain: 'grass', name: '', description: '' }],
				landmarks: [],
			});

			await expect(ingestMap(json)).rejects.toThrow('missing mapInstanceId');
		});

		it('throws when hexes array is missing', async () => {
			const json = JSON.stringify({
				version: '1.0',
				mapName: 'Test',
				mapType: 'world',
				mapInstanceId: 'test-123',
				landmarks: [],
			});

			await expect(ingestMap(json)).rejects.toThrow('missing or invalid hexes array');
		});

		it('throws when version is missing', async () => {
			const json = JSON.stringify({
				mapName: 'Test',
				mapType: 'world',
				mapInstanceId: 'test-123',
				hexes: [{ q: 0, r: 0, terrain: 'grass', name: '', description: '' }],
				landmarks: [],
			});

			await expect(ingestMap(json)).rejects.toThrow('missing version');
		});

		it('re-ingest clears existing hexes and landmarks before inserting', async () => {
			// First ingest
			const json1 = makeValidMapJson({
				hexes: [
					{ q: 0, r: 0, terrain: 'grass', name: '', description: '' },
					{ q: 1, r: 0, terrain: 'forest', name: '', description: '' },
				],
				landmarks: [
					{ id: 'lm1', q: 0, r: 0, name: 'City', type: 'city', notes: '', attributes: {} },
				],
			});

			await ingestMap(json1);
			expect(await getHexCount('test-map-123')).toBe(2);
			expect(await getLandmarkCount('test-map-123')).toBe(1);

			// Re-ingest with different data
			const json2 = makeValidMapJson({
				hexes: [
					{ q: 5, r: 5, terrain: 'desert', name: '', description: '' },
				],
				landmarks: [
					{ id: 'lm-new', q: 5, r: 5, name: 'Oasis', type: 'town', notes: '', attributes: {} },
					{ id: 'lm-new2', q: 6, r: 6, name: 'Pyramid', type: 'landmark', notes: '', attributes: {} },
				],
			});

			await ingestMap(json2);

			// Verify old data is gone and new data is present
			expect(await getHexCount('test-map-123')).toBe(1);
			expect(await getLandmarkCount('test-map-123')).toBe(2);

			const hexes = await getAllHexes('test-map-123');
			expect(hexes[0].q).toBe(5);
			expect(hexes[0].r).toBe(5);
			expect(hexes[0].terrain).toBe('desert');

			const landmarks = await getAllLandmarks('test-map-123');
			expect(landmarks.map((l) => l.id)).toContain('lm-new');
			expect(landmarks.map((l) => l.id)).toContain('lm-new2');
			expect(landmarks.map((l) => l.id)).not.toContain('lm1');
		});

		it('preserves pushedAt when re-ingesting', async () => {
			// First ingest
			await ingestMap(makeValidMapJson());

			// Manually set pushedAt
			const db = await getMapDb();
			const map = await db.get('maps', 'test-map-123');
			map!.pushedAt = '2026-01-01T00:00:00.000Z';
			await db.put('maps', map!);

			// Re-ingest
			await ingestMap(makeValidMapJson());

			// Verify pushedAt is preserved
			const mapAfter = await db.get('maps', 'test-map-123');
			expect(mapAfter?.pushedAt).toBe('2026-01-01T00:00:00.000Z');
		});

		it('chunks hexes > 200 across multiple transactions', async () => {
			// Create 450 hexes
			const hexes = Array.from({ length: 450 }, (_, i) => ({
				q: i,
				r: 0,
				terrain: 'grass',
				name: '',
				description: '',
			}));

			const json = makeValidMapJson({ hexes });
			await ingestMap(json);

			// Verify all hexes are stored
			expect(await getHexCount('test-map-123')).toBe(450);
		});

		it('chunks landmarks > 200 across multiple transactions', async () => {
			// Create 450 landmarks
			const landmarks = Array.from({ length: 450 }, (_, i) => ({
				id: `lm-${i}`,
				q: i,
				r: 0,
				name: `Landmark ${i}`,
				type: 'city',
				notes: '',
				attributes: {},
			}));

			const json = makeValidMapJson({ landmarks });
			await ingestMap(json);

			// Verify all landmarks are stored
			expect(await getLandmarkCount('test-map-123')).toBe(450);
		});

		it('handles landmarks with missing optional fields', async () => {
			const json = makeValidMapJson({
				landmarks: [
					{ id: 'lm1', q: 0, r: 0, name: 'City', type: 'city', notes: '', attributes: {} },
					{ id: 'lm2', q: 1, r: 0, name: 'Fort', type: 'fort', notes: '', attributes: { population: 100 } },
				],
			});

			await ingestMap(json);

			const landmarks = await getAllLandmarks('test-map-123');
			expect(landmarks).toHaveLength(2);
			expect(landmarks[0].linkedMapId).toBeNull();
			expect(landmarks[0].visible).toBe(true);
			expect(landmarks[1].attributes).toBe('{"population":100}');
		});

		it('handles empty landmarks array', async () => {
			const json = makeValidMapJson({
				landmarks: [],
			});

			await ingestMap(json);

			expect(await getLandmarkCount('test-map-123')).toBe(0);
		});

		it('throws on invalid JSON', async () => {
			await expect(ingestMap('not valid json')).rejects.toThrow();
		});

		// Lines 46-52: optional fields mapName, mapType, landmarks?.length ?? 0
		it('uses fallback "Unnamed Map" when mapName is absent', async () => {
			const data = {
				mapInstanceId: 'fallback-name-map',
				version: '1.0',
				hexes: [{ q: 0, r: 0, terrain: 'grass', name: '', description: '' }],
				// mapName intentionally absent
			};
			await ingestMap(JSON.stringify(data));
			const maps = await getMaps();
			const map = maps.find(m => m.instanceId === 'fallback-name-map');
			expect(map?.name).toBe('Unnamed Map');
		});

		it('uses fallback "unknown" when mapType is absent', async () => {
			const data = {
				mapInstanceId: 'fallback-type-map',
				version: '1.0',
				hexes: [{ q: 0, r: 0, terrain: 'grass', name: '', description: '' }],
				mapName: 'Test',
				// mapType intentionally absent
			};
			await ingestMap(JSON.stringify(data));
			const maps = await getMaps();
			const map = maps.find(m => m.instanceId === 'fallback-type-map');
			expect(map?.mapType).toBe('unknown');
		});

		it('uses landmarkCount 0 when landmarks field is absent', async () => {
			const data = {
				mapInstanceId: 'no-landmarks-map',
				version: '1.0',
				mapName: 'Test',
				mapType: 'world',
				hexes: [{ q: 0, r: 0, terrain: 'grass', name: '', description: '' }],
				// landmarks intentionally absent
			};
			await ingestMap(JSON.stringify(data));
			const maps = await getMaps();
			const map = maps.find(m => m.instanceId === 'no-landmarks-map');
			expect(map?.landmarkCount).toBe(0);
		});

		// Line 87: data.landmarks || [] fallback (landmarks absent)
		it('handles absent landmarks field gracefully (no crash, 0 landmarks stored)', async () => {
			const data = {
				mapInstanceId: 'absent-landmarks',
				version: '1.0',
				mapName: 'Test',
				mapType: 'world',
				hexes: [{ q: 0, r: 0, terrain: 'grass', name: '', description: '' }],
				// no landmarks key at all
			};
			const result = await ingestMap(JSON.stringify(data));
			expect(result.landmarks).toBe(0);
			expect(await getLandmarkCount('absent-landmarks')).toBe(0);
		});

		// Lines 93-96: optional landmark fields name || '', type || '', notes || '', attributes || {}
		it('normalises absent optional landmark fields to empty defaults', async () => {
			const data = {
				mapInstanceId: 'sparse-landmark-map',
				version: '1.0',
				mapName: 'Test',
				mapType: 'world',
				hexes: [{ q: 0, r: 0, terrain: 'grass', name: '', description: '' }],
				landmarks: [
					// id, q, r required; all other optional fields absent
					{ id: 'lm-sparse', q: 0, r: 0 },
				],
			};
			await ingestMap(JSON.stringify(data));
			const landmarks = await getAllLandmarks('sparse-landmark-map');
			expect(landmarks).toHaveLength(1);
			expect(landmarks[0].name).toBe('');
			expect(landmarks[0].type).toBe('');
			expect(landmarks[0].notes).toBe('');
			expect(landmarks[0].attributes).toBe('{}');
		});
	});
});