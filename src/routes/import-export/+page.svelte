<script lang="ts">
  import { topics, showToast } from '$lib/stores';
  import { saveTopic, loadAllTopics } from '$lib/storage';
  import type { Topic, ExportBundle } from '$lib/types';
  import JSZip from 'jszip';

  let importing = false;
  let exporting = false;
  let fileInput: HTMLInputElement = undefined!;

  // ── Export JSON bundle ────────────────────────────────────────────────────

  async function exportJSON() {
    exporting = true;
    try {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        topics: $topics,
      };
      const json = JSON.stringify(bundle, null, 2);
      downloadText(json, 'holmgard-lore-export.json', 'application/json');
      showToast('JSON bundle exported', 'success');
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`, 'error');
    } finally {
      exporting = false;
    }
  }

  // ── Export ZIP of Markdown files ─────────────────────────────────────────

  async function exportZip() {
    exporting = true;
    try {
      const zip = new JSZip();
      const folder = zip.folder('holmgard-lore');
      for (const topic of $topics) {
        folder!.file(`${topic.key}.md`, topic.text);
      }
      // Include meta manifest
      const manifest = $topics.map((t) => ({
        key: t.key,
        meta: t.meta,
      }));
      folder!.file('_manifest.json', JSON.stringify(manifest, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'holmgard-lore-export.zip');
      showToast('ZIP exported', 'success');
    } catch (err: any) {
      showToast(`ZIP export failed: ${err.message}`, 'error');
    } finally {
      exporting = false;
    }
  }

  // ── Import JSON bundle ────────────────────────────────────────────────────

  async function importJSON(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importing = true;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as Partial<ExportBundle>;

      if (bundle.version !== 1 || !Array.isArray(bundle.topics)) {
        showToast('Invalid bundle format', 'error');
        return;
      }

      let imported = 0;
      let skipped = 0;
      const current = $topics;

      for (const topic of bundle.topics) {
        if (!topic.key || typeof topic.text !== 'string') { skipped++; continue; }

        const existing = current.find((t) => t.key === topic.key);
        if (existing) {
          const existing_v = existing.meta?.version ?? 0;
          const import_v = topic.meta?.version ?? 0;
          if (import_v <= existing_v) { skipped++; continue; }
        }

        await saveTopic(topic);
        imported++;
      }

      const all = await loadAllTopics();
      topics.set(all);
      showToast(`Imported ${imported} topics (${skipped} skipped)`, 'success');
    } catch (err: any) {
      showToast(`Import failed: ${err.message}`, 'error');
    } finally {
      importing = false;
      if (fileInput) fileInput.value = '';
    }
  }

  // ── Import ZIP ────────────────────────────────────────────────────────────

  async function importZip(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importing = true;
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file('holmgard-lore/_manifest.json');

      let metaMap: Record<string, any> = {};
      if (manifestFile) {
        const raw = await manifestFile.async('string');
        const arr = JSON.parse(raw) as { key: string; meta: any }[];
        for (const entry of arr) metaMap[entry.key] = entry.meta;
      }

      let imported = 0;
      const promises: Promise<void>[] = [];

      zip.forEach((relativePath, zipEntry) => {
        if (!relativePath.endsWith('.md') || zipEntry.dir) return;
        const key = relativePath.replace(/^holmgard-lore\//, '').replace(/\.md$/, '');
        if (!key || key === '_manifest') return;

        promises.push(
          (async () => {
            const text = await zipEntry.async('string');
            const meta = metaMap[key] ?? {
              updatedAt: new Date().toISOString(),
              version: 1,
            };
            const topic: Topic = { key, text, meta };
            await saveTopic(topic);
            imported++;
          })()
        );
      });

      await Promise.all(promises);
      const all = await loadAllTopics();
      topics.set(all);
      showToast(`Imported ${imported} Markdown files from ZIP`, 'success');
    } catch (err: any) {
      showToast(`ZIP import failed: ${err.message}`, 'error');
    } finally {
      importing = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function downloadText(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="page import-export-page">
  <header class="page-header">
    <h1>Import / Export</h1>
    <p class="subtitle">Back up your lore or transfer topics between instances.</p>
  </header>

  <div class="card-grid">

    <!-- Export JSON -->
    <div class="card">
      <div class="card-icon">📦</div>
      <h2>Export JSON Bundle</h2>
      <p>Exports all topics as a single <code>.json</code> file including metadata.</p>
      <button class="btn btn-primary" on:click={exportJSON} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export JSON'}
      </button>
    </div>

    <!-- Export ZIP -->
    <div class="card">
      <div class="card-icon">🗜️</div>
      <h2>Export ZIP of Markdown</h2>
      <p>Exports each topic as a <code>.md</code> file inside a ZIP archive.</p>
      <button class="btn btn-primary" on:click={exportZip} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export ZIP'}
      </button>
    </div>

    <!-- Import JSON -->
    <div class="card">
      <div class="card-icon">📥</div>
      <h2>Import JSON Bundle</h2>
      <p>Import from a previously exported <code>.json</code> bundle. Newer versions win on conflict.</p>
      <label class="btn btn-secondary file-label" class:disabled={importing}>
        {importing ? 'Importing…' : 'Choose JSON file…'}
        <input
          type="file"
          accept=".json,application/json"
          on:change={importJSON}
          disabled={importing}
          class="hidden-input"
        />
      </label>
    </div>

    <!-- Import ZIP -->
    <div class="card">
      <div class="card-icon">📂</div>
      <h2>Import ZIP of Markdown</h2>
      <p>Import Markdown files from a ZIP. Must match the export format (or include <code>_manifest.json</code>).</p>
      <label class="btn btn-secondary file-label" class:disabled={importing}>
        {importing ? 'Importing…' : 'Choose ZIP file…'}
        <input
          type="file"
          accept=".zip,application/zip"
          on:change={importZip}
          disabled={importing}
          class="hidden-input"
        />
      </label>
    </div>

  </div>

  <div class="stats-row">
    <span>Currently loaded: <strong>{$topics.length} topics</strong></span>
  </div>
</div>

<style>
  .import-export-page {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow: auto;
  }

  h1 {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
  }

  .subtitle {
    color: var(--fg-muted);
    font-size: 0.9rem;
    margin: 0.25rem 0 0;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1rem;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .card-icon { font-size: 2rem; line-height: 1; }

  .card h2 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: var(--fg);
  }

  .card p {
    font-size: 0.875rem;
    color: var(--fg-muted);
    margin: 0;
    line-height: 1.5;
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.8em;
    background: var(--surface2);
    padding: 0.1em 0.35em;
    border-radius: 3px;
  }

  .file-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .file-label.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hidden-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .stats-row {
    font-size: 0.875rem;
    color: var(--fg-muted);
  }
</style>
