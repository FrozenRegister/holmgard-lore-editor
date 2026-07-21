### Tick Driver Result Display (#442)

- **Compatibility:** Editor now properly displays `tick_driver` results from time.advance operations on the MCP backend
- **No UI changes:** Backend infrastructure for tick hooks, shadow state, and topological sorting is fully implemented; editor displays results as part of the advance response
- **Future phases:** UI for selecting specific hooks will be added in Phase 2
