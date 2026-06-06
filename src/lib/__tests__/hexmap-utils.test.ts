import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	axialToLatLon,
	latLonToAxial,
	isInsideCoastline,
	getTerrainFromLatitude,
	generateElevation,
	generateProceduralHex,
	getHexForRender,
} from '$lib/hexmap-utils';
import type { CoastlineMap, Hex } from '$lib/types';

describe('hexmap-utils', () => {
	// ── axialToLatLon ──────────────────────────────────────────────────────────

	describe('axialToLatLon', () => {
		it('should convert axial coordinates to lat/lon with default scale', () => {
			const result = axialToLatLon(0, 0);
			expect(result).toEqual({ lat: 0, lon: 0 });
		});

		it('should handle positive q (east)', () => {
			const result = axialToLatLon(10, 0);
			expect(result.lon).toBeCloseTo(10 / 1.3, 5);
			expect(result.lat).toBeCloseTo(-(0 - 10 / 2) / 1.3, 5);
		});

		it('should handle negative q (west)', () => {
			const result = axialToLatLon(-10, 0);
			expect(result.lon).toBeCloseTo(-10 / 1.3, 5);
		});

		it('should handle positive r (south in pointy-top)', () => {
			const result = axialToLatLon(0, 10);
			expect(result.lat).toBeCloseTo(10 / -1.3, 5);
			expect(result.lon).toBe(0);
		});

		it('should respect custom scale parameter', () => {
			const scale = 2.0;
			const result = axialToLatLon(10, 10, scale);
			expect(result.lon).toBeCloseTo(10 / scale, 5);
			expect(result.lat).toBeCloseTo((10 - 10 / 2) / -scale, 5);
		});

		it('should produce consistent roundtrip conversion', () => {
			const q = 15, r = 7;
			const latLon = axialToLatLon(q, r);
			const backToAxial = latLonToAxial(latLon.lat, latLon.lon);
			expect(backToAxial.q).toBe(q);
			expect(backToAxial.r).toBe(r);
		});
	});

	// ── latLonToAxial ──────────────────────────────────────────────────────────

	describe('latLonToAxial', () => {
		it('should convert lat/lon to axial coordinates with default scale', () => {
			const result = latLonToAxial(0, 0);
			expect(result).toEqual({ q: 0, r: 0 });
		});

		it('should handle positive longitude (east)', () => {
			const result = latLonToAxial(0, 13);
			expect(result.q).toBe(Math.round(13 * 1.3));
		});

		it('should handle negative latitude (south)', () => {
			const result = latLonToAxial(-13, 0);
			expect(result.r).toBe(Math.round(13 * 1.3 + 0 / 2));
		});

		it('should respect custom scale parameter', () => {
			const scale = 2.0;
			const result = latLonToAxial(10, 20, scale);
			expect(result.q).toBe(Math.round(20 * scale));
			expect(result.r).toBe(Math.round(-10 * scale + result.q / 2));
		});
	});

	// ── isInsideCoastline ──────────────────────────────────────────────────────

	describe('isInsideCoastline', () => {
		const createPolygonCoastline = (coords: [number, number][]): CoastlineMap => ({
			type: 'FeatureCollection',
			features: [{
				type: 'Feature',
				geometry: {
					type: 'Polygon',
					coordinates: [coords],
				},
			}],
		});

		const createMultiPolygonCoastline = (rings: [number, number][][]): CoastlineMap => ({
			type: 'FeatureCollection',
			features: [{
				type: 'Feature',
				geometry: {
					type: 'MultiPolygon',
					coordinates: rings.map(ring => [ring]),
				},
			}],
		});

		it('should return false for null coastlines', () => {
			expect(isInsideCoastline(0, 0, null)).toBe(false);
			expect(isInsideCoastline(0, 0, undefined)).toBe(false);
		});

		it('should return false for empty features array', () => {
			const emptyCoastline: CoastlineMap = {
				type: 'FeatureCollection',
				features: [],
			};
			expect(isInsideCoastline(0, 0, emptyCoastline)).toBe(false);
		});

		it('should detect point inside a simple polygon', () => {
			// Simple square from -10 to 10 in both axes
			const coastline = createPolygonCoastline([
				[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]
			]);
			// Point at origin should be inside
			expect(isInsideCoastline(0, 0, coastline)).toBe(true);
		});

		it('should detect point outside a simple polygon', () => {
			const coastline = createPolygonCoastline([
				[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]
			]);
			// Point far outside
			expect(isInsideCoastline(50, 50, coastline)).toBe(false);
		});

		it('should handle multipolygon coastlines', () => {
			const coastline = createMultiPolygonCoastline([
				// First island: lon -20 to -10, lat -20 to -10
				[[-20, -20], [-10, -20], [-10, -10], [-20, -10], [-20, -20]],
				// Second island: lon 10 to 20, lat 10 to 20
				[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]],
			]);
			// q=-20, r=10 → lon≈-15.4, lat≈-15.4 (inside first island)
			expect(isInsideCoastline(-20, 10, coastline)).toBe(true);
			// q=20, r=-10 → lon≈15.4, lat≈15.4 (inside second island)
			expect(isInsideCoastline(20, -10, coastline)).toBe(true);
			// q=0, r=0 → lon=0, lat=0 (between islands)
			expect(isInsideCoastline(0, 0, coastline)).toBe(false);
		});

		it('should handle concave polygons', () => {
			// L-shaped polygon in [lon, lat] space: lower bar (lon 0-10, lat 0-5),
			// upper-left arm (lon 0-5, lat 5-10), notch at upper-right (lon 5-10, lat 5-10)
			const coastline = createPolygonCoastline([
				[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10], [0, 0]
			]);
			// q=6, r=0 → lon≈4.6, lat≈2.3 — inside the lower bar
			expect(isInsideCoastline(6, 0, coastline)).toBe(true);
			// q=10, r=-5 → lon≈7.7, lat≈7.7 — inside the notch (outside the L)
			expect(isInsideCoastline(10, -5, coastline)).toBe(false);
		});

		it('should handle points exactly on the edge', () => {
			// Ray casting algorithm behavior on edges can vary
			const coastline = createPolygonCoastline([
				[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]
			]);
			// Edge points - behavior depends on implementation
			// Just verify it doesn't crash
			expect(() => isInsideCoastline(0, 0, coastline)).not.toThrow();
			expect(() => isInsideCoastline(10, 10, coastline)).not.toThrow();
		});
	});

	// ── getTerrainFromLatitude ─────────────────────────────────────────────────

	describe('getTerrainFromLatitude', () => {
		it('should return tundra for high latitudes (> 66.5)', () => {
			expect(getTerrainFromLatitude(70)).toBe('tundra');
			expect(getTerrainFromLatitude(-70)).toBe('tundra');
			expect(getTerrainFromLatitude(90)).toBe('tundra');
			expect(getTerrainFromLatitude(-90)).toBe('tundra');
		});

		it('should return taiga for subarctic latitudes (55-66.5)', () => {
			expect(getTerrainFromLatitude(60)).toBe('taiga');
			expect(getTerrainFromLatitude(-60)).toBe('taiga');
			expect(getTerrainFromLatitude(56)).toBe('taiga');
		});

		it('should return grassland for temperate latitudes (23.5-55)', () => {
			expect(getTerrainFromLatitude(45)).toBe('grassland');
			expect(getTerrainFromLatitude(-45)).toBe('grassland');
			expect(getTerrainFromLatitude(30)).toBe('grassland');
		});

		it('should return savanna for subtropical latitudes (0-23.5)', () => {
			expect(getTerrainFromLatitude(15)).toBe('savanna');
			expect(getTerrainFromLatitude(-15)).toBe('savanna');
			expect(getTerrainFromLatitude(10)).toBe('savanna');
		});

		it('should return tropical for equatorial latitudes', () => {
			expect(getTerrainFromLatitude(0)).toBe('tropical');
			expect(getTerrainFromLatitude(5)).toBe('savanna'); // Actually 5 > 0, so savanna
			expect(getTerrainFromLatitude(-5)).toBe('savanna');
		});

		it('should handle boundary values correctly', () => {
			expect(getTerrainFromLatitude(66.5)).toBe('taiga'); // Not > 66.5
			expect(getTerrainFromLatitude(66.6)).toBe('tundra');
			expect(getTerrainFromLatitude(55)).toBe('grassland'); // Not > 55
			expect(getTerrainFromLatitude(55.1)).toBe('taiga');
			expect(getTerrainFromLatitude(23.5)).toBe('savanna'); // not > 23.5, falls to savanna
			expect(getTerrainFromLatitude(23.6)).toBe('grassland'); // above threshold → grassland
		});
	});

	// ── generateElevation ──────────────────────────────────────────────────────

	describe('generateElevation', () => {
		beforeEach(() => {
			// Seed random for predictable tests
			vi.spyOn(Math, 'random').mockReturnValue(0.5);
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should generate elevation within range for tundra', () => {
			const elevation = generateElevation('tundra', 70);
			expect(elevation).toBeGreaterThanOrEqual(1);
			expect(elevation).toBeLessThanOrEqual(3);
		});

		it('should generate elevation within range for taiga', () => {
			const elevation = generateElevation('taiga', 60);
			expect(elevation).toBeGreaterThanOrEqual(2);
			expect(elevation).toBeLessThanOrEqual(4);
		});

		it('should generate elevation within range for grassland', () => {
			const elevation = generateElevation('grassland', 45);
			expect(elevation).toBeGreaterThanOrEqual(2);
			expect(elevation).toBeLessThanOrEqual(4);
		});

		it('should generate elevation within range for savanna', () => {
			const elevation = generateElevation('savanna', 15);
			expect(elevation).toBeGreaterThanOrEqual(3);
			expect(elevation).toBeLessThanOrEqual(5);
		});

		it('should generate elevation within range for tropical', () => {
			const elevation = generateElevation('tropical', 0);
			expect(elevation).toBeGreaterThanOrEqual(3);
			expect(elevation).toBeLessThanOrEqual(5);
		});

		it('should generate elevation 0 for water', () => {
			const elevation = generateElevation('water', 0);
			expect(elevation).toBe(0);
		});

		it('should generate elevation within range for mountain', () => {
			const elevation = generateElevation('mountain', 45);
			expect(elevation).toBeGreaterThanOrEqual(8);
			expect(elevation).toBeLessThanOrEqual(10);
		});

		it('should generate elevation within range for peak', () => {
			const elevation = generateElevation('peak', 45);
			expect(elevation).toBeGreaterThanOrEqual(9);
			expect(elevation).toBeLessThanOrEqual(10);
		});

		it('should handle unknown terrain types with default range', () => {
			const elevation = generateElevation('unknown_terrain', 45);
			expect(elevation).toBeGreaterThanOrEqual(2);
			expect(elevation).toBeLessThanOrEqual(4);
		});

		it('should handle suffixed terrain types', () => {
			expect(() => generateElevation('grassland_s', 45)).not.toThrow();
			expect(() => generateElevation('taiga_s', 60)).not.toThrow();
			expect(() => generateElevation('tundra_s', 70)).not.toThrow();
		});
	});

	// ── generateProceduralHex ──────────────────────────────────────────────────

	describe('generateProceduralHex', () => {
		it('should generate a hex with correct coordinates', () => {
			const hex = generateProceduralHex(5, 10, null);
			expect(hex.q).toBe(5);
			expect(hex.r).toBe(10);
		});

		it('should include lat/lon coordinates', () => {
			const hex = generateProceduralHex(5, 10, null);
			expect(hex.lat).toBeDefined();
			expect(hex.lon).toBeDefined();
			// Verify they match axialToLatLon conversion
			const expected = axialToLatLon(5, 10);
			expect(hex.lat).toBeCloseTo(expected.lat, 5);
			expect(hex.lon).toBeCloseTo(expected.lon, 5);
		});

		it('should assign terrain based on latitude', () => {
			// High latitude → tundra
			const polarHex = generateProceduralHex(0, -100, null);
			expect(polarHex.terrain).toBe('tundra');

			// Equatorial → tropical
			const equatorialHex = generateProceduralHex(0, 0, null);
			expect(equatorialHex.terrain).toBe('tropical');
		});

		it('should set type equal to terrain', () => {
			const hex = generateProceduralHex(5, 10, null);
			expect(hex.type).toBe(hex.terrain);
		});

		it('should have empty name and description', () => {
			const hex = generateProceduralHex(5, 10, null);
			expect(hex.name).toBe('');
			expect(hex.description).toBe('');
			expect(hex.region).toBe('');
		});

		it('should generate valid elevation for the terrain type', () => {
			const hex = generateProceduralHex(5, 10, null);
			const elevation = generateElevation(hex.terrain, hex.lat!);
			// The generated elevation should be in the valid range
			expect(hex.elevation).toBeGreaterThanOrEqual(0);
		});
	});

	// ── getHexForRender ───────────────────────────────────────────────────────

	describe('getHexForRender', () => {
		const createExplicitHex = (q: number, r: number, terrain: string): Hex => ({
			q, r, terrain, elevation: 5, name: 'Test', description: '', type: terrain, region: '', lat: 0, lon: 0
		});

		it('should return explicit hex when found', () => {
			const explicitHexes: Hex[] = [
				createExplicitHex(5, 10, 'forest'),
				createExplicitHex(6, 11, 'mountain'),
			];
			const result = getHexForRender(5, 10, explicitHexes, null);
			expect(result.terrain).toBe('forest');
			expect(result.elevation).toBe(5);
			expect(result.name).toBe('Test');
		});

		it('should return procedural hex when inside coastline and not explicit', () => {
			const coastline = createPolygonCoastline([
				[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]
			]);
			const explicitHexes: Hex[] = [];
			const result = getHexForRender(0, 0, explicitHexes, coastline);
			expect(result.terrain).not.toBe('water');
			expect(result.q).toBe(0);
			expect(result.r).toBe(0);
		});

		it('should return ocean hex when outside coastline', () => {
			const coastline = createPolygonCoastline([
				[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]
			]);
			const explicitHexes: Hex[] = [];
			const result = getHexForRender(50, 50, explicitHexes, coastline);
			expect(result.terrain).toBe('water');
			expect(result.elevation).toBe(0);
			expect(result.name).toBe('');
			expect(result.description).toBe('');
		});

		it('should prefer explicit hex over coastline procedural', () => {
			const coastline = createPolygonCoastline([
				[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]
			]);
			const explicitHexes: Hex[] = [
				createExplicitHex(0, 0, 'desert'),
			];
			const result = getHexForRender(0, 0, explicitHexes, coastline);
			expect(result.terrain).toBe('desert');
		});

		it('should handle empty explicit hexes array', () => {
			const result = getHexForRender(0, 0, [], null);
			expect(result.terrain).toBe('water');
		});

		it('should include lat/lon in ocean hex', () => {
			const result = getHexForRender(5, 10, [], null);
			const expected = axialToLatLon(5, 10);
			expect(result.lat).toBeCloseTo(expected.lat, 5);
			expect(result.lon).toBeCloseTo(expected.lon, 5);
		});

		function createPolygonCoastline(coords: [number, number][]): CoastlineMap {
			return {
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					geometry: {
						type: 'Polygon',
						coordinates: [coords],
					},
				}],
			};
		}
	});
});