### Coverage Gap Resolutions (#144)

**Fixed 2 structural issues:**
- Deleted unused `deleteFile()` function in `storage.ts` (lines 77–83) — never called by any exported function
- Removed redundant outer try/catch in `storage.ts` loadTopic (lines 162–164) — `safeParseJson` never throws, making catch unreachable

**Documented 4 genuinely unreachable gaps with `/* c8 ignore */` comments:**
- `storage-idb.ts` lines 127–128: `isIDBReady()` catch block unreachable because module-level `db` singleton opens once at module load; subsequent calls reuse the open connection
- `mapDb.ts` lines 128–137: v2 migration handler runs only on first DB creation (oldVersion < 2); subsequent tests reuse the singleton, so `oldVersion < 2` never executes again; defensive loads elsewhere mitigate this
- `mapSync.ts` lines 51–56, 125–130: Tauri dynamic import branches unreachable because `IS_TAURI` is a module-level constant evaluated at import time; tests keep `__TAURI__` absent, locking the constant to false
- `stores.ts` lines 79, 85: SSR `typeof window !== 'undefined'` guard branches unreachable because jsdom always defines `window`; the actual persistence mechanism is tested and works correctly
