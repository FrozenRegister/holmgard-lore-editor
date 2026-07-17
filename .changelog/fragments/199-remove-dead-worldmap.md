### Remove dead worldmap.ts module (#199)

- Deleted `src/lib/worldmap.ts` and its test file — a hierarchical continent/region hex proc-gen engine with zero production imports since the project pivoted to importing external Wonderdraft maps. Verified via a full-repo grep for `worldmap` imports (static and dynamic) that only its own test file referenced it.
- Its live presence in the tree was causing coding agents doing codebase searches to read its exported functions (`PerlinNoise`, `generateTiles`, `expandRegion`, etc.) as active, current-architecture code.
- Recoverable via `git log --all -- src/lib/worldmap.ts` if procedural in-app map generation is revisited — documented in `CLAUDE.md` and `docs/zoom-mechanisms-comparison.md`.
- Removed the stale file-tree references in `README.md` and `CLAUDE.md`.
