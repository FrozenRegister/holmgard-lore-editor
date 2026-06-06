declare global {
  // eslint-disable-next-line no-var
  var __TAURI__: unknown;

  interface Window {
    state?: any;
    zoomIn?: () => void;
    zoomOut?: () => void;
    renderHex?: () => void;
    newMap?: () => void;
    quickCloudSave?: () => void;
    importMapFromFile?: () => void;
    exportAsPNG?: () => void;
    exportAsJSON?: () => void;
    showFoundryExportDialog?: () => void;
    shareMap?: () => void;
    openExamplesModal?: () => void;
    undoRedoSystem?: { undo?: () => void; redo?: () => void };
    openSettingsModal?: () => void;
    resetToolTutorials?: () => void;
    togglePerfHud?: () => void;
    runHexMapPerfBenchmarksFromUI?: () => void;
    saveLatestHexMapBenchmarkBaseline?: () => void;
    copyLatestHexMapBenchmarkReportFromUI?: () => void;
    copyLatestHexMapBenchmarkComparisonFromUI?: () => void;
    clearHexMapBenchmarkBaseline?: () => void;
    showAuthModal?: (mode: string) => void;
    showNotification?: (msg: string, type: string) => void;
    handleMobileCompendiumButton?: () => void;
    toggleMobilePanMode?: (panMode: boolean) => void;
    setViewMode?: (mode: string) => void;
    setHexMode?: (mode: string) => void;
    selectTerrainTool?: (tool: string) => void;
    toggleFillMode?: (checked: boolean) => void;
    updateBrushSize?: (size: number | string) => void;
    updateSettlementBrushOpacity?: (opacity: number | string) => void;
    showTokenCreator?: () => void;
    showLandmarkCreator?: () => void;
    toggleLayersPanel?: () => void;
    returnToParentMap?: () => void;
    closeMobilePanels?: () => void;
    closeModal?: (modalId: string) => void;
    saveSettings?: () => void;
    toggleHexCoordinates?: (element?: any) => void;
    toggleContinentGrid?: (element?: any) => void;
    updateContinentGridDensity?: (value: string) => void;
    toggleDetailGrid?: (element?: any) => void;
    updateDetailGridDensity?: (value: string) => void;
    hexEarthToggleAuto?: (element?: any) => void;
    hexEarthSetZoomIn?: (value: string) => void;
    hexEarthSetZoomOut?: (value: string) => void;
    setHexOrientationUI?: (orient: string) => void;
    toggleDeveloperTools?: (element?: any) => void;
  }
}

export {};
