/**
 * Map synchronization - pushes local map data to the Cloudflare Worker.
 *
 * TODO: The Worker needs these endpoints:
 *   POST /admin/map/push-hexes      body: { mapId, hexes[] }  → upsert into D1 hexes table
 *   POST /admin/map/push-landmarks  body: { mapId, landmarks[] } → upsert into D1 landmarks
 */
import { get } from 'svelte/store';
import { settings } from './stores';
import {
	getAllHexes,
	getAllLandmarks,
	updateMapPushedAt
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