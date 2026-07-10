/**
 * Map synchronization - pushes and pulls map data between local IndexedDB and the Cloudflare Worker.
 */
import { get } from 'svelte/store';
import { settings } from './stores';
import {
	getAllHexes,
	getAllLandmarks,
	updateMapPushedAt,
	saveHex,
	saveLandmark,
	clearMapData,
	type HexRecord,
	type LandmarkRecord
} from './mapDb';
import { getAdminSecret } from './auth';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

const BATCH_SIZE = 500;

/**
 * Custom error class for map sync failures.
 */
export class MapSyncError extends Error {
	constructor(message: string, public cause?: Error) {
		super(message);
		this.name = 'MapSyncError';
	}
}

/**
 * Pull a map's hexes and landmarks from the Worker (D1) into local IndexedDB.
 * Used for cold-start loading and map synchronization.
 * @returns Object with counts of fetched hexes and landmarks
 * @throws MapSyncError on failure
 */
export async function pullMapFromWorker(mapId: string): Promise<{ hexCount: number; landmarkCount: number }> {
	const $settings = get(settings);

	// Validate workerHost
	if (!$settings.workerHost || !$settings.workerHost.trim()) {
		throw new MapSyncError('Worker host is not configured');
	}

	const workerHost = $settings.workerHost.replace(/\/$/, '');

	// Get admin secret
	let adminSecret: string | null;
	if (IS_TAURI) {
		/* c8 ignore next 6 */
		// Unreachable in tests: IS_TAURI is a module-level constant (line 18) evaluated once
		// at import time (IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window).
		// This test file explicitly keeps __TAURI__ absent, so IS_TAURI = false and remains false
		// throughout. The Tauri branch can only execute in the actual Tauri desktop build, not in
		// the test environment. The @tauri-apps/api/tauri module is mocked for future use if
		// IS_TAURI is converted to a runtime check, but dynamic imports cannot be mocked retroactively.
		try {
			const { invoke } = await import('@tauri-apps/api/tauri');
			adminSecret = await invoke<string | null>('get_secret', { key: 'admin_secret' });
		} catch {
			adminSecret = null;
		}
	} else {
		adminSecret = await getAdminSecret();
	}

	if (!adminSecret) {
		throw new MapSyncError('Admin secret is not configured');
	}

	// Fetch hexes and landmarks from worker
	const response = await fetch(`${workerHost}/internal/map-readback`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Admin-Secret': adminSecret
		},
		body: JSON.stringify({ mapId })
	});

	if (!response.ok) {
		let errorMsg = `HTTP ${response.status}`;
		try {
			const text = await response.text();
			if (text) errorMsg += `: ${text}`;
		} catch {
			// Ignore body read errors
		}
		throw new MapSyncError(errorMsg);
	}

	const data = (await response.json()) as { ok?: boolean; hexes?: HexRecord[]; landmarks?: LandmarkRecord[] };

	if (!data.ok || !data.hexes || !data.landmarks) {
		throw new MapSyncError('Invalid response from map-readback endpoint');
	}

	// Clear local map state and write fetched data
	await clearMapData(mapId);

	// Save all hexes
	for (const hex of data.hexes) {
		await saveHex(hex);
	}

	// Save all landmarks
	for (const landmark of data.landmarks) {
		await saveLandmark(landmark);
	}

	return { hexCount: data.hexes.length, landmarkCount: data.landmarks.length };
}

/**
 * Push a map's hexes and landmarks to the Worker.
 * @throws MapSyncError on failure
 */
export async function pushMapToWorker(mapId: string): Promise<void> {
	const $settings = get(settings);

	// Validate workerHost
	if (!$settings.workerHost || !$settings.workerHost.trim()) {
		throw new MapSyncError('Worker host is not configured');
	}

	const workerHost = $settings.workerHost.replace(/\/$/, '');

	// Get admin secret
	let adminSecret: string | null;
	if (IS_TAURI) {
		/* c8 ignore next 6 */
		// Unreachable in tests: IS_TAURI is a module-level constant (line 18) evaluated once
		// at import time (IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window).
		// This test file explicitly keeps __TAURI__ absent, so IS_TAURI = false and remains false
		// throughout. The Tauri branch can only execute in the actual Tauri desktop build, not in
		// the test environment. The @tauri-apps/api/tauri module is mocked for future use if
		// IS_TAURI is converted to a runtime check, but dynamic imports cannot be mocked retroactively.
		try {
			const { invoke } = await import('@tauri-apps/api/tauri');
			adminSecret = await invoke<string | null>('get_secret', { key: 'admin_secret' });
		} catch {
			adminSecret = null;
		}
	} else {
		adminSecret = await getAdminSecret();
	}

	if (!adminSecret) {
		throw new MapSyncError('Admin secret is not configured');
	}

	// Get all hexes and landmarks for this map
	const hexes = await getAllHexes(mapId);
	const landmarks = await getAllLandmarks(mapId);

	// Push hexes in batches
	for (let i = 0; i < hexes.length; i += BATCH_SIZE) {
		const batch = hexes.slice(i, i + BATCH_SIZE);
		await pushBatch(
			`${workerHost}/admin/map/push-hexes`,
			{ mapId, hexes: batch },
			adminSecret
		);
	}

	// Push landmarks in batches
	for (let i = 0; i < landmarks.length; i += BATCH_SIZE) {
		const batch = landmarks.slice(i, i + BATCH_SIZE);
		await pushBatch(
			`${workerHost}/admin/map/push-landmarks`,
			{ mapId, landmarks: batch },
			adminSecret
		);
	}

	// Update pushedAt timestamp
	await updateMapPushedAt(mapId, new Date().toISOString());
}

/**
 * Push a batch of data to the Worker.
 */
async function pushBatch(
	url: string,
	body: Record<string, unknown>,
	adminSecret: string
): Promise<void> {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Admin-Secret': adminSecret
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		let errorMsg = `HTTP ${response.status}`;
		try {
			const text = await response.text();
			if (text) errorMsg += `: ${text}`;
		} catch {
			// Ignore body read errors
		}
		throw new MapSyncError(errorMsg);
	}
}