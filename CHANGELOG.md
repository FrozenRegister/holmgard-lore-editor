# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Rivers now properly clear between map loads to prevent cross-contamination (fixes #39)
- River edges now sync bidirectionally across parent and detail grid levels (fixes #37)

## [0.1.0] - 2026-06-10
### Added
- Initial release of Holmgard Lore Editor

### Fixed
- Rivers now properly clear between map loads to prevent cross-contamination (fixes #39)

## [0.1.0] - 2026-06-10
### Added
- Initial release of Holmgard Lore Editor

### Fixed
- Fixed data leakage in `newMap()` function that caused river, token, path, and fog data to persist across map creations (closes #42)

## [1.2.0] - 2026-06-10

### Added
- Added support for custom terrain types in the hex map editor
- Added new terrain brush tool for painting terrain types

### Changed
- Improved performance of the hex map rendering engine
- Updated the UI for better mobile compatibility

### Fixed
- Fixed issue with token placement not respecting hex boundaries
- Fixed bug in river generation that caused incorrect flow directions

## [1.1.0] - 2026-05-20

### Added
- Added support for importing and exporting maps in JSON format
- Added new terrain types: desert, tundra, and jungle

### Changed
- Improved the fog of war system for better visibility control
- Updated the token creation interface with new customization options

### Fixed
- Fixed issue with pathfinding not respecting impassable terrain
- Fixed bug in landmark placement that caused incorrect positioning

## [1.0.0] - 2026-04-15

### Added
- Initial release of the Holmgard Lore Editor
- Hex map editor with terrain painting and object placement
- Basic token and landmark creation system
- River generation and pathfinding tools
- Fog of war and visibility controls

[Unreleased]: https://github.com/FrozenRegister/holmgard-lore-editor/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/FrozenRegister/holmgard-lore-editor/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/FrozenRegister/holmgard-lore-editor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/FrozenRegister/holmgard-lore-editor/releases/tag/v1.0.0
