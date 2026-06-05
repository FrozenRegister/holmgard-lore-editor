// ── Topic model ───────────────────────────────────────────────────────────────

export interface TopicMeta {
  updatedAt: string; // ISO-8601
  version: number;
  syncedAt?: string;
  removedFromRemote?: boolean;
  syncedRemoteText?: string; // last known remote text (used for conflict detection)
}

export interface Topic {
  key: string;
  text: string; // Markdown (may contain ```json / ```xml blocks)
  meta: TopicMeta;
}

// ── Version history ───────────────────────────────────────────────────────────

export interface HistoryEntry {
  savedAt: string;
  version: number;
  text: string;
  source?: 'local' | 'remote' | 'conflict';
}

export interface TopicSnapshot {
  text: string;
  meta: TopicMeta;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'conflict'
  | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSync?: string;
  error?: string;
}

export interface ConflictInfo {
  key: string;
  base: string;   // last known remote version before local edits
  local: string;  // current local text
  remote: string; // current remote text
  remoteMeta: TopicMeta;
}

// ── Offline queue ─────────────────────────────────────────────────────────────

export interface QueuedSave {
  key: string;
  text: string;
  enqueuedAt: string;
  attempts: number;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface AppSettings {
  workerHost: string; // e.g. https://holmgard-lore-mcp.frozenregister.workers.dev
  encryptedSecret?: string; // AES-GCM ciphertext (base64), backed up on disk
  iv?: string;              // base64 IV used during encryption
  autoSyncIntervalSecs: number; // 0 = disabled; default 30
  autoSync: boolean;
  syncHistory: boolean;  // when false, remote syncs skip writing history entries
}

// ── Import / Export bundle ────────────────────────────────────────────────────

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  topics: Topic[];
}

// ── MCP Event Log ─────────────────────────────────────────────────────────────

export interface McpEvent {
  entity_key: string;
  verb: string;
  object?: string;
  location?: string;
  thread?: string;
  detail?: string;
  at: string; // ISO timestamp
}

export interface ActiveThread {
  thread_name: string;
  category: string;
  character: string;
  status: string;
}

// ── Hex Map ───────────────────────────────────────────────────────────────────

export interface HexCoord {
  q: number;
  r: number;
}

export interface Hex extends HexCoord {
  terrain: string;
  elevation?: number; // 0-10 scale; optional for backwards compatibility
  name: string;
  description: string;
  type?: string; // alias for terrain in some contexts
  region?: string;
  lat?: number;
  lon?: number;
}

export interface DetailHex extends HexCoord {
  terrain: string;
}

export interface Landmark extends HexCoord {
  id: string;
  name: string;
  type: string;
  style: string;
  icon: string;
  color: string;
  showLabel: boolean;
  labelPosition: string;
  size: number;
  hideTerrainIcon: boolean;
  attributes: Record<string, unknown>;
  notes: string;
  visible: boolean;
  gridLevel: string;
  created: string;
  detailAnchorDQ: number;
  detailAnchorDR: number;
  detailDisplayMode: string;
  linkedMapId: string;
  linkedMapName: string;
  linkedMapType: string;
  iconColor: string;
  isDungeonObject: boolean;
  linkedMapThumbnailUrl: string;
  iconScale: number;
  iconOffsetX: number;
  iconOffsetY: number;
  allowIconOverflow: boolean;
  typeId: string;
  variantId: null;
  appearanceMode: string;
  labelFontSize: number;
}

export interface HexMap {
  version: string;
  mapName: string;
  mapType: string;
  mapInstanceId: string;
  hexes: Hex[];
  landmarks: Landmark[];
  textLabels: TextLabel[];
  imageOverlays: unknown[];
  tokens: Token[];
  paths: Path[];
  fogOfWar: unknown[];
  fogSettings: FogSettings;
  canvasBackground: string;
  continentGridEnabled: boolean;
  continentGridDensity: number;
  detailGridEnabled: boolean;
  detailGridDensity: number;
  showHexCoordinates: boolean;
  showSubHexCoordinates: boolean;
  detailHexes: DetailHex[];
  subHexes: unknown[];
  subHexLandmarks: unknown[];
  subHexTokens: unknown[];
  orientation: string;
  hexSize: number;
  terrainTileOverrides: Record<string, unknown>;
  settlementBrushOverrides: Record<string, unknown>;
  dungeonTileOverrides: Record<string, unknown>;
  viewport: Viewport;
  layers: Layer[];
  customTerrains: Record<string, CustomTerrain>;
  customDungeonTiles: Record<string, DungeonTile>;
  nextLandmarkId: number;
  nextTextLabelId: number;
  nextImageOverlayId: number;
  nextTokenId: number;
  nextPathId: number;
  metadata: MapMetadata;
  exportMetadata: ExportMetadata;
}

export interface TextLabel extends HexCoord {
  id: number;
  text: string;
  visibility: string;
  color: string;
  outlineColor: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  align: string;
  background: boolean;
  backgroundColor: string;
  maxFontPx: number;
  minZoom: number;
  offsetX: number;
  offsetY: number;
  visible: boolean;
  gridLevel: string;
  created: string;
}

export interface Token extends HexCoord {
  id: string;
  name: string;
  type: string;
  displayMode: string;
  color: string;
  iconColor: string;
  icon: string | null;
  image: string | null;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  label: string;
  size: number;
  attributes: Record<string, unknown>;
  notes: string;
  visible: boolean;
  gridLevel: string;
  scale: number;
  created: string;
  showNameLabel: boolean;
  detailAnchorDQ: number;
  detailAnchorDR: number;
}

export interface PathPoint extends HexCoord {
  offsetX: number;
  offsetY: number;
  snapMode: string;
}

export interface Path {
  id: string;
  type: string;
  style: string;
  width: number;
  color: string;
  dashSpacing: number;
  snapMode: string;
  points: PathPoint[];
  created: string;
  gridLevel: string;
  layer: string;
  routing: string;
}

export interface FogSettings {
  enabled: boolean;
  opacity: number;
  color: string;
  hideIcons: boolean;
}

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Layer {
  id: string;
  name: string;
  order: number;
  visible: boolean;
}

export interface CustomTerrain {
  isCustom: boolean;
  name: string;
  color: string;
  icon: string;
  iconColor: string;
  id: string;
  tileVariants: unknown[];
  mainColor: string;
}

// Dir 0=NE(1,-1), 1=E(1,0), 2=SE(0,1) — canonical directions only.
// Dirs 3/4/5 are stored as their canonical opposite from the neighbor hex.
export type RiverEdgeDir = 0 | 1 | 2;

export interface RiverEdgeData {
  riverId: string;
}

export interface River {
  id: string;
  name: string;
  color: string;
  width: number;
}

export interface DungeonTile {
  isCustom: boolean;
  name: string;
  color: string;
  icon: null;
  iconColor: string;
  id: string;
  tileVariants: unknown[];
  mainColor: string;
  tileImage?: string;
}

export interface MapMetadata {
  totalHexes: number;
  totalLandmarks: number;
  totalTextLabels: number;
  totalTokens: number;
  totalPaths: number;
  totalCustomTerrains: number;
  totalCustomDungeonTiles: number;
}

export interface ExportMetadata {
  exportType: string;
  levelMode: string;
  scope: string;
  exportedAt: string;
}

// ── GeoJSON for coastlines ────────────────────────────────────────────────────

export interface CoastlineMap {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
    properties?: Record<string, unknown>;
  }>;
}
