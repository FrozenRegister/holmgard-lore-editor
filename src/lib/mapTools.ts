/**
 * Map query and pathfinding helpers.
 *
 * Wraps the local IndexedDB map data (src/lib/mapDb.ts) with higher-level
 * operations the editor UI and the Claude agentic loop can call:
 *
 *   - axial distance and neighbour enumeration (pure math)
 *   - A* pathfinding with terrain cost
 *   - landmark ↔ lore key link management, including an optional
 *     `**Map-Position:**` field write-back into the linked lore entry
 *   - "for this lore entry, what's around it on the map?" helpers
 *
 * All functions work against the LOCAL map store. Phase 2 will mirror
 * the same surface area on the Cloudflare Worker MCP side so the AI
 * can answer questions about maps that aren't on the current device.
 */
import {
	getAllHexes,
	setLandmarkLinkedLore,
	getLandmarksForLoreKey,
	getMapContext,
	getAllLandmarks,
	type HexRecord,
	type LandmarkRecord
} from './mapDb';
import type { HexCoord, Topic } from './types';
import { loadTopic, saveTopic } from './storage';
import { topics } from './stores';

// ── Geometry (pure) ───────────────────────────────────────────────────────────

/**
 * Axial hex distance between two hexes on a pointy-top or flat-top grid.
 * Formula: (|dq| + |dr| + |dq + dr|) / 2
 */
export function axialDistance(a: HexCoord, b: HexCoord): number {
	const dq = a.q - b.q;
	const dr = a.r - b.r;
	return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Six neighbour offsets for axial (pointy-top) coordinates. */
export const HEX_DIRECTIONS: ReadonlyArray<HexCoord> = [
	{ q: 1, r: 0 },
	{ q: 1, r: -1 },
	{ q: 0, r: -1 },
	{ q: -1, r: 0 },
	{ q: -1, r: 1 },
	{ q: 0, r: 1 }
];

/** Return the six axial neighbours of (q, r). */
export function hexNeighbors(q: number, r: number): HexCoord[] {
	return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

function key(q: number, r: number): string {
	return `${q},${r}`;
}

// ── Terrain costs ─────────────────────────────────────────────────────────────

/**
 * Default per-terrain movement cost. Impassable terrains are Infinity.
 * Override per call via findPath/computePathOnMap's `terrainCosts` option.
 */
export const DEFAULT_TERRAIN_COSTS: Record<string, number> = {
	grass: 1,
	plains: 1,
	forest: 2,
	hills: 2,
	mountains: 4,
	desert: 2,
	swamp: 3,
	sand: 2,
	tundra: 2,
	snow: 3,
	road: 0.5,
	water: Infinity,
	ocean: Infinity,
	ice: Infinity
};

// ── A* pathfinding ────────────────────────────────────────────────────────────

export interface FindPathOptions {
	/** Override terrain costs (merged on top of DEFAULT_TERRAIN_COSTS). */
	terrainCosts?: Record<string, number>;
	/** Safety cap on A* iterations. Default 5000. */
	maxSteps?: number;
}

export interface PathResult {
	path: HexCoord[];
	totalCost: number;
	steps: number;
}

/**
 * A* pathfinding over the hex graph for a given map.
 *
 * Returns null if no path exists or max steps is exceeded. If `from` and `to`
 * are the same hex, returns a single-step path of zero cost.
 *
 * Each step's cost is determined by the destination hex's terrain. Hexes not
 * present in the map (no record) are treated as passable with cost 1. Hexes
 * with impassable terrain (cost === Infinity, or negative) are skipped.
 */
export async function findPath(
	mapId: string,
	from: HexCoord,
	to: HexCoord,
	opts: FindPathOptions = {}
): Promise<PathResult | null> {
	const terrainCosts = { ...DEFAULT_TERRAIN_COSTS, ...(opts.terrainCosts ?? {}) };
	const maxSteps = opts.maxSteps ?? 5000;

	if (from.q === to.q && from.r === to.r) {
		return { path: [{ ...from }], totalCost: 0, steps: 0 };
	}

	// Preload all hexes for the map. For typical sizes (≤ few thousand hexes)
	// this is faster than per-neighbour IDB reads inside the inner loop.
	const allHexes = await getAllHexes(mapId);
	const hexMap = new Map<string, HexRecord>();
	for (const h of allHexes) hexMap.set(key(h.q, h.r), h);

	// If destination is impassable, no path exists.
	const destHex = hexMap.get(key(to.q, to.r));
	const destCost = destHex ? (terrainCosts[destHex.terrain] ?? 1) : 1;
	if (destCost === Infinity || destCost < 0) return null;

	type Entry = { f: number; q: number; r: number };
	const open: Entry[] = [];
	const closed = new Set<string>();
	const cameFrom = new Map<string, HexCoord>();
	const gScore = new Map<string, number>([[key(from.q, from.r), 0]]);

	const pushEntry = (q: number, r: number, g: number) => {
		const f = g + axialDistance({ q, r }, to);
		open.push({ f, q, r });
		// Lazy sort keeps the array short. For typical map sizes (≤ a few
		// thousand nodes) a linear scan is fast enough.
		open.sort((a, b) => a.f - b.f);
	};

	pushEntry(from.q, from.r, 0);

	let iterations = 0;
	while (open.length > 0) {
		if (++iterations > maxSteps) return null;
		const cur = open.shift()!;
		const ck = key(cur.q, cur.r);
		if (closed.has(ck)) continue;
		closed.add(ck);

		if (cur.q === to.q && cur.r === to.r) {
			// Reconstruct path
			const path: HexCoord[] = [{ q: cur.q, r: cur.r }];
			let k = ck;
			while (cameFrom.has(k)) {
				const prev = cameFrom.get(k)!;
				path.unshift(prev);
				k = key(prev.q, prev.r);
			}
			return { path, totalCost: gScore.get(ck) ?? 0, steps: iterations };
		}

		for (const nb of hexNeighbors(cur.q, cur.r)) {
			const nk = key(nb.q, nb.r);
			if (closed.has(nk)) continue;
			const hex = hexMap.get(nk);
			const cost = hex ? (terrainCosts[hex.terrain] ?? 1) : 1;
			if (cost === Infinity || cost < 0) continue;
			const tentativeG = (gScore.get(ck) ?? 0) + cost;
			if (tentativeG < (gScore.get(nk) ?? Infinity)) {
				cameFrom.set(nk, { q: cur.q, r: cur.r });
				gScore.set(nk, tentativeG);
				pushEntry(nb.q, nb.r, tentativeG);
			}
		}
	}
	return null;
}

/** Shortest axial distance between two hexes on a given map. */
export async function computeDistanceOnMap(
	_mapId: string,
	from: HexCoord,
	to: HexCoord
): Promise<number> {
	return axialDistance(from, to);
}

/** A* path on a given map. Returns null if unreachable. */
export async function computePathOnMap(
	mapId: string,
	from: HexCoord,
	to: HexCoord,
	opts?: FindPathOptions
): Promise<PathResult | null> {
	return findPath(mapId, from, to, opts);
}

// ── Lore write-back helper ────────────────────────────────────────────────────

const MAP_POSITION_RE = /^\*\*Map-Position:\*\*\s*.*$/m;

/**
 * Replace an existing `**Map-Position:** ...` line in a lore entry, or append
 * one. Other content is preserved.
 */
function upsertMapPositionField(text: string, mapId: string, q: number, r: number): string {
	const line = `**Map-Position:** ${mapId}, ${q}, ${r}`;
	if (MAP_POSITION_RE.test(text)) {
		return text.replace(MAP_POSITION_RE, line);
	}
	// Append at end, ensuring exactly one trailing newline before the new line.
	const trimmed = text.replace(/\s+$/, '');
	return `${trimmed}\n\n${line}\n`;
}

async function writeMapPositionToLore(
	loreKey: string,
	mapId: string,
	q: number,
	r: number
): Promise<void> {
	const existing = await loadTopic(loreKey);
	if (!existing) return; // Lore entry doesn't exist; caller may want to handle this
	const updatedText = upsertMapPositionField(existing.text, mapId, q, r);
	const now = new Date().toISOString();
	const updated: Topic = {
		...existing,
		text: updatedText,
		meta: {
			...existing.meta,
			updatedAt: now,
			version: (existing.meta?.version ?? 0) + 1
		}
	};
	await saveTopic(updated);
	topics.update((all) => all.map((t) => (t.key === loreKey ? updated : t)));
}

async function removeMapPositionFromLore(loreKey: string): Promise<void> {
	const existing = await loadTopic(loreKey);
	if (!existing) return;
	if (!MAP_POSITION_RE.test(existing.text)) return;
	const updatedText = existing.text.replace(MAP_POSITION_RE, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
	const now = new Date().toISOString();
	const updated: Topic = {
		...existing,
		text: updatedText,
		meta: {
			...existing.meta,
			updatedAt: now,
			version: (existing.meta?.version ?? 0) + 1
		}
	};
	await saveTopic(updated);
	topics.update((all) => all.map((t) => (t.key === loreKey ? updated : t)));
}

// ── Landmark ↔ Lore link management ───────────────────────────────────────────

export interface LinkOptions {
	/** Also inject/refresh `**Map-Position:**` into the lore entry. Default false. */
	writeLoreBack?: boolean;
}

/**
 * Link a landmark on a map to a lore topic key.
 * No-op (returns null) if the landmark does not exist.
 * If `opts.writeLoreBack` is true, also injects a `**Map-Position:**` field
 * into the lore entry so the lore and the map agree about position.
 */
export async function linkLandmarkToLore(
	mapId: string,
	landmarkId: string,
	loreKey: string,
	opts: LinkOptions = {}
): Promise<LandmarkRecord | null> {
	const updated = await setLandmarkLinkedLore(mapId, landmarkId, loreKey);
	if (!updated) return null;
	if (opts.writeLoreBack) {
		try {
			await writeMapPositionToLore(loreKey, mapId, updated.q, updated.r);
		} catch (err) {
			console.error('linkLandmarkToLore: lore write-back failed', err);
		}
	}
	return updated;
}

/**
 * Unlink a landmark. If the landmark was linked and `opts.writeLoreBack` is
 * true, also strips the `**Map-Position:**` line from the previously-linked
 * lore entry. Returns the updated (now-unlinked) record, or null if the
 * landmark did not exist.
 */
export async function unlinkLandmarkFromLore(
	mapId: string,
	landmarkId: string,
	opts: LinkOptions = {}
): Promise<LandmarkRecord | null> {
	// Capture the previous link so we can clean up the lore entry.
	const all = await getAllLandmarks(mapId);
	const before = all.find((l) => l.id === landmarkId);
	const updated = await setLandmarkLinkedLore(mapId, landmarkId, null);
	if (!updated) return null;
	if (opts.writeLoreBack && before?.linkedLoreKey) {
		try {
			await removeMapPositionFromLore(before.linkedLoreKey);
		} catch (err) {
			console.error('unlinkLandmarkFromLore: lore write-back failed', err);
		}
	}
	return updated;
}

/** All landmarks (across all maps) linked to a lore key. */
export async function getLandmarksForLore(
	loreKey: string
): Promise<LandmarkRecord[]> {
	return getLandmarksForLoreKey(loreKey);
}

/** First landmark linked to a lore key, or null. */
export async function getLandmarkForLore(
	loreKey: string
): Promise<LandmarkRecord | null> {
	const list = await getLandmarksForLoreKey(loreKey);
	return list[0] ?? null;
}

/** Like getMapContext, but anchored on the first landmark linked to a lore key. */
export async function getMapContextForLore(
	loreKey: string,
	radius: number = 10
): Promise<
	| {
			mapId: string;
			landmark: LandmarkRecord;
			terrain_breakdown: Array<{ terrain: string; count: number }>;
			nearby_landmarks: Array<LandmarkRecord & { dist: number }>;
	  }
	| null
> {
	const landmark = await getLandmarkForLore(loreKey);
	if (!landmark) return null;
	const ctx = await getMapContext(landmark.mapId, landmark.q, landmark.r, radius);
	return {
		mapId: landmark.mapId,
		landmark,
		terrain_breakdown: ctx.terrain_breakdown,
		nearby_landmarks: ctx.nearby_landmarks
	};
}

/**
 * Distance and path between a lore entry and a hex, or between two lore
 * entries, resolved via their linked landmarks.
 */
export async function distanceFromLoreToHex(
	loreKey: string,
	mapId: string,
	q: number,
	r: number
): Promise<number | null> {
	const landmark = await getLandmarkForLore(loreKey);
	if (!landmark || landmark.mapId !== mapId) return null;
	return axialDistance({ q: landmark.q, r: landmark.r }, { q, r });
}

export async function pathFromLoreToHex(
	loreKey: string,
	mapId: string,
	q: number,
	r: number,
	opts?: FindPathOptions
): Promise<PathResult | null> {
	const landmark = await getLandmarkForLore(loreKey);
	if (!landmark || landmark.mapId !== mapId) return null;
	return findPath(mapId, { q: landmark.q, r: landmark.r }, { q, r }, opts);
}
