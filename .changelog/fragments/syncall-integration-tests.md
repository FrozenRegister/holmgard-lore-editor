### Test — integration coverage for syncAll.ts (#66)
- Adds `src/lib/__tests__/syncAll.integration.test.ts` covering `runSync` and `runSmartSync`: new/updated/removed topic handling, conflict detection, pending-delete flush (including admin-secret-missing and admin-batch-failure re-queue paths), changelog deduplication, and the "already syncing"/"no API key" guard clauses.
- Brings `syncAll.ts` from 0% to 100% line coverage in the integration suite.
- Part of the file-by-file integration test backfill tracked in #66; `syncAll.ts` was next in that issue's stated priority order after `sync.ts` (already covered).
