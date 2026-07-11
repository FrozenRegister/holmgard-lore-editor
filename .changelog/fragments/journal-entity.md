### Journal/Session Log Entity Type

- Added new Journal entity type for campaign session logs and narrative entries
- D1 tables: `journals` (session records) and `journal_participants` (linked entities)
- Journal list page with newest-first sorting by date
- Journal detail page with entry text, participant links, and date display
- Fetch functions: `fetchJournals`, `fetchJournalById`, `fetchJournalParticipants`
- Participant auto-linking to entity detail pages
- Full test coverage for journal fetching and entity summary formatting
