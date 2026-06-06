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
			'by-map-terrain': [string, string]; // [mapId, terrain]
		};
	};
	landmarks: {
		key: [string, string]; // [mapId, id]
		value: LandmarkRecord;
		indexes: {
			'by-map-q': [string, number]; // [mapId, q]
			'by-map-type': [string, string]; // [mapId, type]
		};
	};
}

const DB_NAME = 'holmgard-maps';
const DB_VERSION = 1;

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
		upgrade(db: IDBPDatabase<MapDBSchema>) {
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
				hexStore.createIndex('by-map-terrain', ['mapId', 'terrain']);
			}

			// Landmarks store
			if (!db.objectStoreNames.contains('landmarks')) {
				const landmarkStore = db.createObjectStore('landmarks', {
					keyPath: ['mapId', 'id']
				});
				landmarkStore.createIndex('by-map-q', ['mapId', 'q']);
				landmarkStore.createIndex('by-map-type', ['mapId', 'type']);
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
	const index = db.transaction('hexes').store.index('by-map-q');

	// Use bounded range to get candidates
	const range = IDBKeyRange.bound([mapId, q - radius], [mapId, q + radius]);
	const candidates = await index.getAll(range);

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
	const index = db.transaction('landmarks').store.index('by-map-q');

	// Use bounded range to get candidates
	const range = IDBKeyRange.bound([mapId, q - radius], [mapId, q + radius]);
	const candidates = await index.getAll(range);

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
	const hexIndex = tx.objectStore('hexes').index('by-map-q');
	const hexRange = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	const hexKeys = await hexIndex.getAllKeys(hexRange);
	for (const key of hexKeys) {
		await tx.objectStore('hexes').delete(key);
	}

	// Delete all landmarks for this map
	const landmarkIndex = tx.objectStore('landmarks').index('by-map-q');
	const landmarkRange = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	const landmarkKeys = await landmarkIndex.getAllKeys(landmarkRange);
	for (const key of landmarkKeys) {
		await tx.objectStore('landmarks').delete(key);
	}

	await tx.done;
}

/**
 * Get hex count for a map.
 */
export async function getHexCount(mapId: string): Promise<number> {
	const db = await getMapDb();
	const index = db.transaction('hexes').store.index('by-map-q');
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	const keys = await index.getAllKeys(range);
	return keys.length;
}

/**
 * Get landmark count for a map.
 */
export async function getLandmarkCount(mapId: string): Promise<number> {
	const db = await getMapDb();
	const index = db.transaction('landmarks').store.index('by-map-q');
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	const keys = await index.getAllKeys(range);
	return keys.length;
}

/**
 * Get all hexes for a map.
 */
export async function getAllHexes(mapId: string): Promise<HexRecord[]> {
	const db = await getMapDb();
	const index = db.transaction('hexes').store.index('by-map-q');
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	return index.getAll(range);
}

/**
 * Get all landmarks for a map.
 */
export async function getAllLandmarks(mapId: string): Promise<LandmarkRecord[]> {
	const db = await getMapDb();
	const index = db.transaction('landmarks').store.index('by-map-q');
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	return index.getAll(range);
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
