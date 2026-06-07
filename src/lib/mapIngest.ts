/**
 * Map ingestion logic - parses and stores map data from imported JSON files.
 */
import {
	getMapDb,
	type MapMeta,
	type HexRecord,
	type LandmarkRecord
} from './mapDb';
import type { Hex, Landmark, HexMap } from '$lib/types';

const CHUNK_SIZE = 200;

/**
 * Ingest a map from a JSON string.
 * @throws Error if the JSON is invalid or missing required fields
 */
export async function ingestMap(
	jsonString: string
): Promise<{ mapId: string; hexes: number; landmarks: number }> {
	// Parse and validate the JSON
	const data = JSON.parse(jsonString) as HexMap;

	if (!data.mapInstanceId) {
		throw new Error('Invalid map file: missing mapInstanceId');
	}
	if (!data.hexes || !Array.isArray(data.hexes)) {
		throw new Error('Invalid map file: missing or invalid hexes array');
	}
	if (!data.version) {
		throw new Error('Invalid map file: missing version');
	}

	const mapId = data.mapInstanceId;
	const now = new Date().toISOString();

	const db = await getMapDb();

	// Check if map already exists to preserve pushedAt
	const existingMap = await db.get('maps', mapId);
	const pushedAt = existingMap?.pushedAt ?? null;

	// Upsert map metadata
	const mapMeta: MapMeta = {
		instanceId: mapId,
		name: data.mapName || 'Unnamed Map',
		mapType: data.mapType || 'unknown',
		version: data.version,
		ingestedAt: now,
		pushedAt,
		hexCount: data.hexes.length,
		landmarkCount: data.landmarks?.length ?? 0
	};

	await db.put('maps', mapMeta);

	// Delete existing hexes for this map
	await deleteHexesForMap(db, mapId);

	// Delete existing landmarks for this map
	await deleteLandmarksForMap(db, mapId);

	// Insert hexes in chunks
	const hexes = data.hexes.map(
		(h): HexRecord => ({
			mapId,
			q: h.q,
			r: h.r,
			terrain: h.terrain,
			name: h.name || '',
			description: h.description || ''
		})
	);

	for (let i = 0; i < hexes.length; i += CHUNK_SIZE) {
		const chunk = hexes.slice(i, i + CHUNK_SIZE);
		const tx = db.transaction('hexes', 'readwrite');
		for (const hex of chunk) {
			await tx.objectStore('hexes').put(hex);
		}
		await tx.done;
	}

	// Insert landmarks in chunks.
	// linkedLoreKey is null on fresh ingest; users attach lore entries via
	// the /maps UI or setLandmarkLinkedLore() after ingest.
	const landmarks = (data.landmarks || []).map(
		(l): LandmarkRecord => ({
			mapId,
			id: l.id,
			q: l.q,
			r: l.r,
			name: l.name || '',
			type: l.type || '',
			notes: l.notes || '',
			attributes: JSON.stringify(l.attributes || {}),
			linkedMapId: l.linkedMapId ?? null,
			visible: l.visible ?? true,
			linkedLoreKey: null
		})
	);

	for (let i = 0; i < landmarks.length; i += CHUNK_SIZE) {
		const chunk = landmarks.slice(i, i + CHUNK_SIZE);
		const tx = db.transaction('landmarks', 'readwrite');
		for (const landmark of chunk) {
			await tx.objectStore('landmarks').put(landmark);
		}
		await tx.done;
	}

	return {
		mapId,
		hexes: hexes.length,
		landmarks: landmarks.length
	};
}

/**
 * Delete all hexes for a given map.
 */
async function deleteHexesForMap(
	db: Awaited<ReturnType<typeof getMapDb>>,
	mapId: string
): Promise<void> {
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	await db.delete('hexes', range);
}

/**
 * Delete all landmarks for a given map.
 */
async function deleteLandmarksForMap(
	db: Awaited<ReturnType<typeof getMapDb>>,
	mapId: string
): Promise<void> {
	const range = IDBKeyRange.bound([mapId], [mapId, '\uffff']);
	await db.delete('landmarks', range);
}