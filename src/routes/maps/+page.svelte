<script lang="ts">
	import { onMount } from 'svelte';
	import { showToast, settings } from '$lib/stores';
	import { ingestMap } from '$lib/mapIngest';
	import { pushMapToWorker, MapSyncError } from '$lib/mapSync';
	import { getWorldBiomesRemote, type WorldBiome } from '$lib/sync';
	import { getMcpApiKey } from '$lib/auth';
	import {
		getMaps,
		deleteMap,
		getDistinctTerrains,
		assignBiomeToTerrain,
		type MapMeta
	} from '$lib/mapDb';

	let maps: MapMeta[] = [];
	let isImporting = false;
	let importError = '';
	let pushingMapId: string | null = null;
	let showReIngestFor: string | null = null;

	// ── Biome assignment panel (#321) ──────────────────────────────────────────
	// Lets a narrator map the editor's freeform terrain vocabulary onto a
	// world's registered biomes in bulk, so pushed hexes carry worldId/biome
	// instead of just the raw terrain label. A separate, editor-owned panel —
	// does not touch the live hex-canvas editor's own (vendored) terrain palette.
	let showBiomePanelFor: string | null = null;
	let biomeWorldId: Record<string, string> = {};
	let worldBiomes: Record<string, WorldBiome[]> = {};
	let distinctTerrains: Record<string, Array<{ terrain: string; count: number }>> = {};
	let biomeTerrainSelection: Record<string, Record<string, string>> = {};
	let loadingBiomesFor: string | null = null;
	let applyingBiomesFor: string | null = null;

	async function toggleBiomePanel(mapId: string) {
		if (showBiomePanelFor === mapId) {
			showBiomePanelFor = null;
			return;
		}
		showBiomePanelFor = mapId;
		if (!distinctTerrains[mapId]) {
			distinctTerrains[mapId] = await getDistinctTerrains(mapId);
			biomeTerrainSelection[mapId] = biomeTerrainSelection[mapId] ?? {};
		}
	}

	async function loadBiomes(mapId: string) {
		const worldId = (biomeWorldId[mapId] ?? '').trim();
		if (!worldId) {
			showToast('Enter a World ID first', 'error');
			return;
		}
		loadingBiomesFor = mapId;
		try {
			const host = $settings.workerHost?.replace(/\/$/, '') ?? '';
			const apiKey = (await getMcpApiKey()) ?? undefined;
			const biomes = await getWorldBiomesRemote(host, worldId, apiKey);
			worldBiomes = { ...worldBiomes, [mapId]: biomes };
			if (biomes.length === 0) {
				showToast('No biomes registered for this world yet', 'info');
			} else {
				showToast(`Loaded ${biomes.length} biome(s)`, 'success');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Unknown error';
			showToast(`Failed to load biomes: ${msg}`, 'error');
		} finally {
			loadingBiomesFor = null;
		}
	}

	async function applyBiomeAssignments(mapId: string) {
		const worldId = (biomeWorldId[mapId] ?? '').trim();
		if (!worldId) {
			showToast('Enter a World ID first', 'error');
			return;
		}
		const selections = biomeTerrainSelection[mapId] ?? {};
		const entries = Object.entries(selections).filter(([, biome]) => biome);
		if (entries.length === 0) {
			showToast('Pick a biome for at least one terrain', 'error');
			return;
		}
		applyingBiomesFor = mapId;
		try {
			let total = 0;
			for (const [terrain, biome] of entries) {
				total += await assignBiomeToTerrain(mapId, terrain, worldId, biome);
			}
			showToast(`Assigned biomes to ${total} hex(es) — push to MCP to sync`, 'success');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Unknown error';
			showToast(`Failed to assign biomes: ${msg}`, 'error');
		} finally {
			applyingBiomesFor = null;
		}
	}

	onMount(async () => {
		await loadMaps();
	});

	async function loadMaps() {
		try {
			maps = await getMaps();
		} catch (err) {
			console.error('Failed to load maps:', err);
			showToast('Failed to load maps', 'error');
		}
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Validate file extension
		if (!file.name.endsWith('.json')) {
			importError = 'Please select a .json file';
			showToast('Invalid file type — select a .json map file', 'error');
			return;
		}

		isImporting = true;
		importError = '';

		try {
			const text = await file.text();
			const result = await ingestMap(text);
			showToast(
				`Map imported: ${result.hexes} hexes, ${result.landmarks} landmarks`,
				'success'
			);
			await loadMaps();
			// Reset file input
			input.value = '';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Unknown error';
			importError = msg;
			showToast(`Import failed: ${msg}`, 'error');
		} finally {
			isImporting = false;
		}
	}

	async function handleReIngestFileSelect(event: Event, mapId: string) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isImporting = true;
		importError = '';

		try {
			const text = await file.text();
			const result = await ingestMap(text);
			showToast(
				`Map re-ingested: ${result.hexes} hexes, ${result.landmarks} landmarks`,
				'success'
			);
			showReIngestFor = null;
			await loadMaps();
			input.value = '';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Unknown error';
			importError = msg;
			showToast(`Re-ingest failed: ${msg}`, 'error');
		} finally {
			isImporting = false;
		}
	}

	async function handlePushToMcp(mapId: string) {
		pushingMapId = mapId;
		try {
			await pushMapToWorker(mapId);
			showToast('Map pushed to MCP successfully', 'success');
			await loadMaps();
		} catch (err) {
			const msg = err instanceof MapSyncError ? err.message : 'Unknown error';
			showToast(`Push failed: ${msg}`, 'error');
		} finally {
			pushingMapId = null;
		}
	}

	async function handleDelete(mapId: string, mapName: string) {
		if (!confirm(`Delete "${mapName}"? This cannot be undone.`)) return;

		try {
			await deleteMap(mapId);
			showToast('Map deleted', 'success');
			await loadMaps();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Unknown error';
			showToast(`Delete failed: ${msg}`, 'error');
		}
	}

	function formatDate(isoString: string | null): string {
		if (!isoString) return 'Never';
		const d = new Date(isoString);
		return d.toLocaleDateString([], {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="page maps-page">
	<header class="page-header">
		<h1>Maps</h1>
	</header>

	<!-- Import section -->
	<section class="settings-section import-section">
		<h2>Import Map</h2>
		<p class="section-desc">
			Import a .json map file exported from Wonderdraft or similar tools.
			Only essential data (hexes, landmarks) is stored — rendering fields are discarded.
		</p>

		<div class="field">
			<label for="map-import">Import map file</label>
			<div class="import-row">
				<input
					id="map-import"
					type="file"
					accept=".json"
					on:change={handleFileSelect}
					disabled={isImporting}
					class="file-input"
				/>
				{#if isImporting}
					<span class="importing-indicator">Importing…</span>
				{/if}
			</div>
			{#if importError}
				<p class="error-text">{importError}</p>
			{/if}
		</div>
	</section>

	<!-- Maps list section -->
	<section class="settings-section maps-list-section">
		<h2>Imported Maps</h2>

		{#if maps.length === 0}
			<div class="empty-state">
				<p>No maps imported yet. Import a .json map file above.</p>
			</div>
		{:else}
			<ul class="maps-list">
				{#each maps as map (map.instanceId)}
					<li class="map-card">
						<div class="map-header">
							<div class="map-title-row">
								<span class="map-name">{map.name}</span>
								<span class="badge">{map.mapType}</span>
								<span class="badge badge-version">v{map.version}</span>
							</div>
							<p class="map-stats">
								{map.hexCount} hexes · {map.landmarkCount} landmarks
							</p>
						</div>

						<div class="map-meta">
							<p class="meta-item">
								<strong>Ingested:</strong> {formatDate(map.ingestedAt)}
							</p>
							<p class="meta-item">
								<strong>Pushed to MCP:</strong>
								{#if map.pushedAt}
									<span class="pushed-ok">{formatDate(map.pushedAt)}</span>
								{:else}
									<span class="pushed-never">Never</span>
								{/if}
							</p>
						</div>

						<!-- Re-ingest file input (shown on demand) -->
						{#if showReIngestFor === map.instanceId}
							<div class="reingest-row">
								<input
									type="file"
									accept=".json"
									on:change={(e) => handleReIngestFileSelect(e, map.instanceId)}
									disabled={isImporting}
									class="file-input"
								/>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									on:click={() => showReIngestFor = null}
								>
									Cancel
								</button>
							</div>
						{/if}

						<div class="map-actions">
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								on:click={() => showReIngestFor = showReIngestFor === map.instanceId ? null : map.instanceId}
							>
								Re-ingest
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								on:click={() => toggleBiomePanel(map.instanceId)}
							>
								{showBiomePanelFor === map.instanceId ? 'Hide Biomes' : 'Assign Biomes'}
							</button>
							<button
								type="button"
								class="btn btn-primary btn-sm"
								disabled={pushingMapId === map.instanceId}
								on:click={() => handlePushToMcp(map.instanceId)}
							>
								{pushingMapId === map.instanceId ? 'Pushing…' : 'Push to MCP'}
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm danger"
								on:click={() => handleDelete(map.instanceId, map.name)}
							>
								Delete
							</button>
						</div>

						<!-- Biome assignment panel (#321) -->
						{#if showBiomePanelFor === map.instanceId}
							<div class="biome-panel">
								<p class="section-desc">
									Map this map's terrain labels onto a world's registered biomes. Assignments
									are stored locally and included the next time you push this map to MCP.
								</p>
								<div class="field">
									<label for="biome-world-{map.instanceId}">World ID</label>
									<div class="import-row">
										<input
											id="biome-world-{map.instanceId}"
											type="text"
											class="text-input"
											placeholder="e.g. a1b2c3d4-..."
											bind:value={biomeWorldId[map.instanceId]}
										/>
										<button
											type="button"
											class="btn btn-ghost btn-sm"
											disabled={loadingBiomesFor === map.instanceId}
											on:click={() => loadBiomes(map.instanceId)}
										>
											{loadingBiomesFor === map.instanceId ? 'Loading…' : 'Load Biomes'}
										</button>
									</div>
								</div>

								{#if distinctTerrains[map.instanceId]?.length}
									<div class="terrain-mapping">
										{#each distinctTerrains[map.instanceId] as { terrain, count } (terrain)}
											<div class="terrain-row">
												<span class="terrain-label">{terrain} <span class="terrain-count">({count})</span></span>
												<select
													class="text-input"
													bind:value={biomeTerrainSelection[map.instanceId][terrain]}
												>
													<option value="">— unassigned —</option>
													{#each worldBiomes[map.instanceId] ?? [] as biome (biome.id)}
														<option value={biome.name}>{biome.glyph} {biome.name}</option>
													{/each}
												</select>
											</div>
										{/each}
									</div>
									<button
										type="button"
										class="btn btn-primary btn-sm"
										disabled={applyingBiomesFor === map.instanceId}
										on:click={() => applyBiomeAssignments(map.instanceId)}
									>
										{applyingBiomesFor === map.instanceId ? 'Applying…' : 'Apply Assignments'}
									</button>
								{:else}
									<p class="empty-state">No terrain data on this map yet.</p>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>


<style>
	.maps-page {
		padding: 2rem;
		max-width: 800px;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	h1 {
		font-family: var(--font-display);
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--accent);
		margin: 0;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1.5rem;
	}

	.settings-section h2 {
		font-size: 1rem;
		font-weight: 700;
		color: var(--accent2);
		margin: 0;
	}

	.section-desc {
		font-size: 0.85rem;
		color: var(--fg-muted);
		margin: 0;
		line-height: 1.5;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--fg);
	}

	.import-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.file-input {
		flex: 1;
		padding: 0.5rem;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--fg);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.file-input::-webkit-file-upload-button {
		padding: 0.4rem 0.8rem;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: var(--surface2);
		color: var(--fg);
		cursor: pointer;
		margin-right: 0.5rem;
	}

	.importing-indicator {
		font-size: 0.85rem;
		color: var(--accent);
	}

	.error-text {
		font-size: 0.8rem;
		color: #e57373;
		margin: 0;
	}

	.empty-state {
		text-align: center;
		padding: 2rem;
		color: var(--fg-muted);
	}

	.maps-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.map-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.map-header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.map-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.map-name {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--fg);
	}

	.badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: rgba(201, 168, 76, 0.2);
		color: var(--accent);
		text-transform: capitalize;
	}

	.badge-version {
		background: var(--surface2);
		color: var(--fg-muted);
	}

	.map-stats {
		font-size: 0.85rem;
		color: var(--fg-muted);
		margin: 0;
	}

	.map-meta {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.meta-item {
		font-size: 0.8rem;
		color: var(--fg-muted);
		margin: 0;
	}

	.meta-item strong {
		color: var(--fg);
	}

	.pushed-ok {
		color: #81c784;
	}

	.pushed-never {
		color: var(--fg-muted);
		font-style: italic;
	}

	.reingest-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem;
		background: var(--surface);
		border-radius: 6px;
	}

	.map-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.45rem 0.85rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
		border: 1px solid transparent;
		text-decoration: none;
	}

	.btn-primary {
		background: var(--accent);
		color: #1a1a1a;
		border-color: var(--accent);
	}

	.btn-primary:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-ghost {
		background: transparent;
		color: var(--fg);
		border-color: var(--border);
	}

	.btn-ghost:hover {
		background: var(--surface2);
	}

	.btn-sm {
		padding: 0.35rem 0.65rem;
		font-size: 0.8rem;
	}

	.btn.danger {
		color: #e57373;
	}

	.btn.danger:hover {
		background: rgba(229, 115, 115, 0.12);
	}

	.biome-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.text-input {
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--fg);
		font-size: 0.85rem;
	}

	.terrain-mapping {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.terrain-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.terrain-label {
		font-size: 0.85rem;
		color: var(--fg);
		text-transform: capitalize;
	}

	.terrain-count {
		color: var(--fg-muted);
		font-weight: 400;
	}
</style>