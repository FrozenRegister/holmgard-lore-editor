<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { settings, showToast } from '$lib/stores';
  import { renderMarkdown } from '$lib/marked-config';
  import { fetchJournalById, fetchJournalParticipants, getEntityName } from '$lib/d1-reads';
  import type { JournalDetailRecord, JournalParticipant } from '$lib/d1-reads';

  // ── Route param ───────────────────────────────────────────────────────────────
  $: id = $page.params.id ?? '';

  // ── Journal state ────────────────────────────────────────────────────────────
  let journal: JournalDetailRecord | null = null;
  let participants: JournalParticipant[] = [];
  let journalLoading = false;
  let journalError: string | null = null;

  // ── Load journal from D1 ────────────────────────────────────────────────────
  $: if (id && $settings.workerHost) loadJournal();

  async function loadJournal() {
    journalLoading = true;
    journalError = null;
    journal = null;
    participants = [];
    try {
      journal = await fetchJournalById($settings.workerHost, id);
      if (!journal) { journalError = 'Journal not found'; return; }

      // Load participants
      try {
        participants = await fetchJournalParticipants($settings.workerHost, id);
      } catch (e) {
        console.warn('Failed to load participants:', e);
        participants = [];
      }
    } catch (e) {
      journalError = e instanceof Error ? e.message : 'Failed to load journal';
    } finally {
      journalLoading = false;
    }
  }

  function formatDate(year: number | null, month: number | null, day: number | null): string {
    if (!year || !month || !day) return 'No date set';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
</script>

{#if journalLoading}
  <div class="journal-page loading">Loading journal…</div>
{:else if journalError}
  <div class="journal-page error">
    <p>Error: {journalError}</p>
    <a href="/entities/journal" class="btn btn-secondary">Back to Journals</a>
  </div>
{:else if journal}
  <div class="journal-page">
    <header class="journal-header">
      <div class="header-content">
        <h1>{journal.name}</h1>
        <div class="date-badge">
          {formatDate(journal.date_year, journal.date_month, journal.date_day)}
        </div>
        {#if journal.is_private}
          <div class="private-badge">Private</div>
        {/if}
      </div>
    </header>

    <!-- Entry text -->
    <section class="entry-section">
      <div class="entry-content">
        {@html renderMarkdown(journal.entry)}
      </div>
    </section>

    <!-- Participants -->
    {#if participants.length > 0}
      <section class="participants-section">
        <h2>Linked Entities</h2>
        <div class="participant-list">
          {#each participants as participant (participant.entity_id)}
            <a
              href="/entities/{encodeURIComponent(participant.entity_type)}/{encodeURIComponent(participant.entity_id)}"
              class="participant-chip"
              title="View {participant.entity_name}"
            >
              <span class="chip-badge">{participant.entity_type}</span>
              <span class="chip-name">{participant.entity_name}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <footer class="journal-footer">
      <small>Created: {new Date(journal.created_at).toLocaleString()}</small>
      {#if journal.updated_at !== journal.created_at}
        <small>Updated: {new Date(journal.updated_at).toLocaleString()}</small>
      {/if}
    </footer>
  </div>
{:else}
  <div class="journal-page error">
    <p>No journal data available</p>
    <a href="/entities/journal" class="btn btn-secondary">Back to Journals</a>
  </div>
{/if}

<style>
  .journal-page {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
    overflow: auto;
  }

  .journal-page.loading,
  .journal-page.error {
    align-items: center;
    justify-content: center;
    min-height: 300px;
  }

  .journal-page.error {
    color: var(--fg-muted);
  }

  .journal-header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 1.5rem;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  h1 {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
  }

  .date-badge {
    background: var(--surface2);
    color: var(--fg-muted);
    padding: 0.35rem 0.7rem;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .private-badge {
    background: var(--warning-bg, #fef3c7);
    color: var(--warning-fg, #92400e);
    padding: 0.35rem 0.7rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .entry-section {
    flex: 1;
    overflow: auto;
  }

  .entry-content {
    line-height: 1.7;
    color: var(--fg);
  }

  .entry-content :global(h1),
  .entry-content :global(h2),
  .entry-content :global(h3),
  .entry-content :global(h4),
  .entry-content :global(h5),
  .entry-content :global(h6) {
    color: var(--accent);
    margin-top: 1.25rem;
    margin-bottom: 0.75rem;
  }

  .entry-content :global(h1:first-child) {
    margin-top: 0;
  }

  .entry-content :global(p) {
    margin-bottom: 1rem;
  }

  .entry-content :global(a) {
    color: var(--link);
    text-decoration: none;
  }

  .entry-content :global(a:hover) {
    text-decoration: underline;
  }

  .participants-section {
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
  }

  .participants-section h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--fg-muted);
    margin: 0 0 1rem;
  }

  .participant-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .participant-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.85rem;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 999px;
    text-decoration: none;
    color: var(--fg);
    font-size: 0.85rem;
    transition: all 0.2s ease;
  }

  .participant-chip:hover {
    background: var(--surface3);
    border-color: var(--accent);
  }

  .chip-badge {
    display: inline-block;
    background: var(--accent);
    color: var(--bg);
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .chip-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .journal-footer {
    border-top: 1px solid var(--border);
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--fg-muted);
  }

  .journal-footer small {
    display: block;
  }

  @media (max-width: 768px) {
    .journal-page { padding: 1rem; gap: 1rem; }
    h1 { font-size: 1.35rem; }
    .header-content { flex-direction: column; align-items: flex-start; }
  }
</style>
