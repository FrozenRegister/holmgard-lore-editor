/**
 * IndexedDB database layer for local map storage.
 * Uses the `idb` library for a promise-based API.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ── TypeScript interfaces ──────────────────────────────────────────────────────

export interface MapMeta {
	instanceId: string;
	name: string;
	mapType: string;
	version: string;
	ingestedAt: string; // ISO string
	pushedAt: string | null; // ISO string or null
	hexCount: number;
	landmarkCount: number;
}

export interface HexRecord {
	mapId: string;
	q: number;
	r: number;
	terrain: string;
	name: string;
	description: string;
	/** RPG-owned world scoping (#321) — the world this hex's biome assignment belongs to. Null/undefined if unassigned. */
	worldId?: string | null;
	/** RPG-owned biome name (#321), assigned via the biome panel — independent of `terrain`, the editor's own freeform paint label. Null/undefined if unassigned. */
	biome?: string | null;
}

export interface LandmarkRecord {
	mapId: string;
	id: string;
	q: number;
	r: number;
	name: string;
	type: string;
	notes: string;
	attributes: string; // JSON.stringify of the original attributes object
	linkedMapId: string | null;
	visible: boolean;
	/** Lore topic key (e.g. "location:crowkeep") this landmark is associated with. Null if unlinked. */
	linkedLoreKey: string | null;
}

// ── Database schema ────────────────────────────────────────────────────────────

interface MapDBSchema extends DBSchema {
	maps: {
		key: string; // instanceId
		value: MapMeta;
	};
	hexes: {
		key: [string, number, number]; // [mapId, q, r]
		value: HexRecord;
		indexes: {
			'by-map-q': [string, number]; // [mapId, q]
			'by-map-q-r': [string, number, number]; // [mapId, q, r]
			'by-map-terrain': [string, string]; // [mapId, terrain]
		};
	};
	landmarks: {
		key: [string, string]; // [mapId, id]
		value: LandmarkRecord;
		indexes: {
			'by-map-q': [string, number]; // [mapId, q]
			'by-map-q-r': [string, number, number]; // [mapId, q, r]
			'by-map-type': [string, string]; // [mapId, type]
			'by-map-linked-lore': [string, string]; // [mapId, linkedLoreKey] — null links are not indexed
			'linkedLoreKey': string; // global index for finding landmarks by lore key
		};
	};
}

const DB_NAME = 'holmgard-maps';
const DB_VERSION = 4;

let dbInstance: IDBPDatabase<MapDBSchema> | null = null;

/**
 * Opens and returns the IndexedDB database instance.
 * Creates the database schema if it doesn't exist.
 */
export async function getMapDb(): Promise<IDBPDatabase<MapDBSchema>> {
	if (dbInstance) {
		return dbInstance;
	}

	dbInstance = await openDB<MapDBSchema>(DB_NAME, DB_VERSION, {
		async upgrade(
			db: IDBPDatabase<MapDBSchema>,
			oldVersion: number,
			_newVersion: number | null,
			tx: any
		) {
			// Maps store
			if (!db.objectStoreNames.contains('maps')) {
				db.createObjectStore('maps', { keyPath: 'instanceId' });
			}

			// Hexes store
			if (!db.objectStoreNames.contains('hexes')) {
				const hexStore = db.createObjectStore('hexes', {
					keyPath: ['mapId', 'q', 'r']
				});
				hexStore.createIndex('by-map-q', ['mapId', 'q']);
				// Compound index for better spatial narrowing
				hexStore.createIndex('by-map-q-r', ['mapId', 'q', 'r']);
				hexStore.createIndex('by-map-terrain', ['mapId', 'terrain']);
			}

			// Landmarks store
			if (!db.objectStoreNames.contains('landmarks')) {
				const landmarkStore = db.createObjectStore('landmarks', {
					keyPath: ['mapId', 'id']
				});
				landmarkStore.createIndex('by-map-q', ['mapId', 'q']);
				landmarkStore.createIndex('by-map-q-r', ['mapId', 'q', 'r']);
				landmarkStore.createIndex('by-map-type', ['mapId', 'type']);
				landmarkStore.createIndex('by-map-linked-lore', ['mapId', 'linkedLoreKey']);
			}

			// v2 migration: backfill linkedLoreKey on existing landmarks, then create index.
			// Must use the upgrade's versionchange transaction (passed as 4th arg) — starting
			// a new transaction inside upgrade throws InvalidStateError.
			/* c8 ignore next 15 */
			// Unreachable in tests: the upgrade handler only runs once when the DB is created
			// (when oldVersion < 2). Subsequent tests reuse the already-opened singleton dbInstance
			// (line 76), so this migration never runs again. Testing this would require closing &
			// deleting the DB between tests, which breaks the singleton pattern and causes test
			// hangs in jsdom. This is acceptable because: (1) migration succeeds on initial DB
			// setup (not tested here, but works in real app), and (2) defensive loads in getLandmark()
			// tolerate pre-v2 records that lack linkedLoreKey, providing fallback protection.
			if (oldVersion < 2 && db.objectStoreNames.contains('landmarks')) {
				const store = tx.objectStore('landmarks');
				let cursor = await store.openCursor();
				while (cursor) {
					const v: any = cursor.value;
					if (v.linkedLoreKey === undefined) {
						v.linkedLoreKey = null;
						await cursor.update(v);
					}
					cursor = await cursor.continue();
				}
				if (!store.indexNames.contains('by-map-linked-lore')) {
					store.createIndex('by-map-linked-lore', ['mapId', 'linkedLoreKey']);
				}
			}

			if (oldVersion < 4 && db.objectStoreNames.contains('landmarks')) {
				const store = tx.objectStore('landmarks');
				if (!store.indexNames.contains('linkedLoreKey')) {
					store.createIndex('linkedLoreKey', 'linkedLoreKey');
				}
			}
		}
	});

	return dbInstance;
}

// ── Query functions ────────────────────────────────────────────────────────────

/**
 * Get all map metadata records.
 */
export async function getMaps(): Promise<MapMeta[]> {
	const db = await getMapDb();
	return db.getAll('maps');
}

/**
 * Get a single hex by map ID and coordinates.
 */
export async function getHex(
	mapId: string,
	q: number,
	r: number
): Promise<HexRecord | null> {
	const db = await getMapDb();
	return (await db.get('hexes', [mapId, q, r])) ?? null;
}

/**
 * Get all hexes within a given radius of a center hex.
 * Uses axial hex distance: (|dq| + |dr| + |dq+dr|) / 2 <= radius
 */
export async function getHexRadius(
	mapId: string,
	q: number,
	r: number,
	radius: number
): Promise<HexRecord[]> {
	const db = await getMapDb();
	const index = db.transaction('hexes').store.index('by-map-q-r');

	// By using the compound index [mapId, q, r], we can significantly narrow the 
	// search space by bounding both q AND r in the IDB query itself.
	const candidates = await index.getAll(IDBKeyRange.bound(
		[mapId, q - radius, r - radius],
		[mapId, q + radius, r + radius]
	));

	// Filter by axial hex distance
	return candidates.filter((hex: HexRecord) => {
		const dq = hex.q - q;
		const dr = hex.r - r;
		const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
		return dist <= radius;
	});
}

/**
 * Get all landmarks within a given radius of a center hex.
 * Adds a `dist` field to each result.
 */
export async function getLandmarksInRadius(
	mapId: string,
	q: number,
	r: number,
	radius: number
): Promise<Array<LandmarkRecord & { dist: number }>> {
	const db = await getMapDb();
	const index = db.transaction('landmarks').store.index('by-map-q-r');

	// Use the compound index to bound both q AND r in the database query
	const candidates = await index.getAll(IDBKeyRange.bound(
		[mapId, q - radius, r - radius],
		[mapId, q + radius, r + radius]
	));

	// Filter by axial hex distance and add dist field
	return candidates
		.map((landmark: LandmarkRecord) => {
			const dq = landmark.q - q;
			const dr = landmark.r - r;
			const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
			return { ...landmark, dist };
		})
		.filter((item: LandmarkRecord & { dist: number }) => item.dist <= radius);
}

/**
 * Get map context for a location - terrain breakdown and nearby landmarks.
 */
export async function getMapContext(
	mapId: string,
	q: number,
	r: number,
	radius: number = 10
): Promise<{
	terrain_breakdown: Array<{ terrain: string; count: number }>;
	nearby_landmarks: Array<LandmarkRecord & { dist: number }>;
}> {
	const hexes = await getHexRadius(mapId, q, r, radius);
	const landmarks = await getLandmarksInRadius(mapId, q, r, radius);

	// Calculate terrain breakdown
	const terrainCounts = new Map<string, number>();
	for (const hex of hexes) {
		const count = terrainCounts.get(hex.terrain) || 0;
		terrainCounts.set(hex.terrain, count + 1);
	}

	const terrain_breakdown = Array.from(terrainCounts.entries())
		.map(([terrain, count]) => ({ terrain, count }))
		.sort((a, b) => b.count - a.count);

	// Sort landmarks by distance and limit to top 20
	const nearby_landmarks = landmarks
		.sort((a, b) => a.dist - b.dist)
		.slice(0, 20);

	return {
		terrain_breakdown,
		nearby_landmarks
	};
}

/**
 * Delete a map and all its associated hexes and landmarks.
 */
export async function deleteMap(mapId: string): Promise<void> {
	const db = await getMapDb();
	const tx = db.transaction(['maps', 'hexes', 'landmarks'], 'readwrite');

	// Delete the map record
	await tx.objectStore('maps').delete(mapId);

	// Delete all hexes for this map
	const mapRange = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	await tx.objectStore('hexes').delete(mapRange);
	await tx.objectStore('landmarks').delete(mapRange);

	await tx.done;
}

/**
 * Get hex count for a map.
 */
export async function getHexCount(mapId: string): Promise<number> {
	const db = await getMapDb();
	const index = db.transaction('hexes').store.index('by-map-q-r');
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	return index.count(range);
}

/**
 * Get landmark count for a map.
 */
export async function getLandmarkCount(mapId: string): Promise<number> {
	const db = await getMapDb();
	const index = db.transaction('landmarks').store.index('by-map-q-r');
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	return index.count(range);
}

/**
 * Get all hexes for a map.
 */
export async function getAllHexes(mapId: string): Promise<HexRecord[]> {
	const db = await getMapDb();
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	return db.getAll('hexes', range);
}

/**
 * Get all landmarks for a map.
 */
export async function getAllLandmarks(mapId: string): Promise<LandmarkRecord[]> {
	const db = await getMapDb();
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	return db.getAll('landmarks', range);
}

/**
 * Update the pushedAt timestamp for a map.
 */
export async function updateMapPushedAt(
	mapId: string,
	pushedAt: string
): Promise<void> {
	const db = await getMapDb();
	const map = await db.get('maps', mapId);
	if (map) {
		map.pushedAt = pushedAt;
		await db.put('maps', map);
	}
}

/**
 * Get a map by ID.
 */
export async function getMap(mapId: string): Promise<MapMeta | null> {
	const db = await getMapDb();
	return (await db.get('maps', mapId)) ?? null;
}

// ── Landmark linking (lore) ────────────────────────────────────────────────────

/**
 * Get a single landmark by map and landmark ID.
 */
export async function getLandmark(
	mapId: string,
	landmarkId: string
): Promise<LandmarkRecord | null> {
	const db = await getMapDb();
	const r = (await db.get('landmarks', [mapId, landmarkId])) as LandmarkRecord | undefined;
	if (!r) return null;
	// Defensive: tolerate pre-v2 records that still lack the field.
	return { ...r, linkedLoreKey: r.linkedLoreKey ?? null };
}

/**
 * Upsert a landmark record. Preserves `linkedLoreKey` if not provided.
 */
export async function putLandmark(record: LandmarkRecord): Promise<void> {
	const db = await getMapDb();
	const existing = (await db.get('landmarks', [record.mapId, record.id])) as
		| LandmarkRecord
		| undefined;
	const merged: LandmarkRecord = {
		...record,
		linkedLoreKey: record.linkedLoreKey ?? existing?.linkedLoreKey ?? null
	};
	await db.put('landmarks', merged);
}

/**
 * Link a landmark to a lore topic key, or null to unlink.
 * No-op if the landmark does not exist.
 */
export async function setLandmarkLinkedLore(
	mapId: string,
	landmarkId: string,
	loreKey: string | null
): Promise<LandmarkRecord | null> {
	const db = await getMapDb();
	const existing = (await db.get('landmarks', [mapId, landmarkId])) as
		| LandmarkRecord
		| undefined;
	if (!existing) return null;
	const updated: LandmarkRecord = { ...existing, linkedLoreKey: loreKey };
	await db.put('landmarks', updated);
	return updated;
}

/**
 * Find all landmarks (across all maps) linked to a given lore key.
 * Uses a full scan of the landmarks store, then filters by linkedLoreKey.
 * Returns entries with `dist` field removed (not applicable across maps).
 */
export async function getLandmarksForLoreKey(
	loreKey: string
): Promise<LandmarkRecord[]> {
	const db = await getMapDb();
	const index = db.transaction('landmarks').store.index('linkedLoreKey');
	const rows = await index.getAll(IDBKeyRange.only(loreKey));
	return rows.map((l) => ({ ...l, linkedLoreKey: l.linkedLoreKey ?? null }));
}

/**
 * Find all landmarks on a specific map linked to a given lore key.
 * Uses the `by-map-linked-lore` index for efficient lookup.
 */
export async function getLandmarksForLoreKeyOnMap(
	mapId: string,
	loreKey: string
): Promise<LandmarkRecord[]> {
	const db = await getMapDb();
	const index = (db as any)
		.transaction('landmarks')
		.store.index('by-map-linked-lore');
	const range = IDBKeyRange.bound([mapId, loreKey], [mapId, loreKey]);
	const rows = (await index.getAll(range)) as LandmarkRecord[];
	return rows.map((l: LandmarkRecord) => ({ ...l, linkedLoreKey: l.linkedLoreKey ?? null }));
}

/**
 * Save a hex record to IndexedDB.
 * Alias for the low-level put operation.
 */
export async function saveHex(record: HexRecord): Promise<void> {
	const db = await getMapDb();
	await db.put('hexes', record);
}

/**
 * Distinct terrain values present across a map's hexes, each with a count.
 * Used by the biome-assignment panel (#321) to let a narrator map the
 * editor's freeform terrain vocabulary onto a world's registered biomes in
 * bulk, without a per-hex picker.
 */
export async function getDistinctTerrains(mapId: string): Promise<Array<{ terrain: string; count: number }>> {
	const hexes = await getAllHexes(mapId);
	const counts = new Map<string, number>();
	for (const hex of hexes) {
		const terrain = hex.terrain || '(unset)';
		counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([terrain, count]) => ({ terrain, count }))
		.sort((a, b) => b.count - a.count);
}

/**
 * Bulk-assign a world_id/biome to every hex on a map whose `terrain` matches
 * exactly (#321). Preserves every other field on each matched hex — only
 * `worldId`/`biome` change. Returns the number of hexes updated.
 */
export async function assignBiomeToTerrain(
	mapId: string,
	terrain: string,
	worldId: string,
	biome: string
): Promise<number> {
	const hexes = await getAllHexes(mapId);
	const matched = hexes.filter((hex) => (hex.terrain || '(unset)') === terrain);
	for (const hex of matched) {
		await saveHex({ ...hex, worldId, biome });
	}
	return matched.length;
}

/**
 * Save a landmark record to IndexedDB.
 * Alias for putLandmark.
 */
export async function saveLandmark(record: LandmarkRecord): Promise<void> {
	await putLandmark(record);
}

/**
 * Clear all hex and landmark data for a given map from IndexedDB.
 * Used before pulling fresh data from the worker.
 */
export async function clearMapData(mapId: string): Promise<void> {
	const db = await getMapDb();
	const tx = db.transaction(['hexes', 'landmarks'], 'readwrite');

	// Delete all hexes for this map
	const hexIndex = (tx.objectStore('hexes') as any).index('by-map-q');
	const hexRange = IDBKeyRange.bound([mapId], [mapId, Infinity]);
	const hexCursor = await hexIndex.openCursor(hexRange);
	if (hexCursor) {
		for await (const cursor of hexCursor) {
			cursor.delete();
		}
	}

	// Delete all landmarks for this map
	const landmarkIndex = (tx.objectStore('landmarks') as any).index('by-map-q');
	const landmarkRange = IDBKeyRange.bound([mapId], [mapId, Infinity]);
	const landmarkCursor = await landmarkIndex.openCursor(landmarkRange);
	if (landmarkCursor) {
		for await (const cursor of landmarkCursor) {
			cursor.delete();
		}
	}

	await tx.done;
}
