export interface SystemConfig {
  MAP_W: number;
  MAP_H: number;
  CELL_SIZE?: number;
  CONNECTIVITY: number;
  DEFAULT_TERRAIN?: string;
  BASE_TERRAIN?: string;
  DEFAULT_REDUCTION_METHOD: string;
  USE_INCREMENTAL_SOLVER: boolean;
  OUTPUT_DIR: string;
  MAP_DEFAULT_SEED: number;
  DEFAULT_PLANNER?: string;
  DEFAULT_SOLVER?: string;
  SOLVER_TIMEOUT_SEC?: number;
  TARGET_TERRAIN?: string;
  TERRAINS?: Record<string, number>;
  TERRAIN_COLORS?: Record<string, string>;
  MAX_SLOPE_DEG?: number;
  CLOSED_LOOP_TIMEOUT_SEC?: number;
  MAX_ISP_ITERATIONS?: number;
  BBOX_MARGIN?: number;
  INCREMENTAL_ASTAR_SCOPE?: string;
  MAP_ELEVATION_SCALE?: number;
  MAP_ELEVATION_FREQ?: number;
  MAP_ELEVATION_OCTAVES?: number;
  MAP_MOISTURE_FREQ?: number;
  MAP_MOISTURE_OCTAVES?: number;
  MAP_ROUGHNESS_FREQ?: number;
  MAP_ROUGHNESS_OCTAVES?: number;
  MAP_TERRAIN_THRESHOLDS?: Record<string, number>;
  MAP_ROUGHNESS_THRESHOLDS?: Record<string, number>;
  MAP_MIN_MAIN_COMPONENT_RATIO?: number;
  MAP_MAX_GENERATION_ATTEMPTS?: number;
  [key: string]: unknown;
}

export interface GridLayersData {
  elevation: number[][];
  terrain: string[][];
  obstacle: number[][];
  water_overrides?: [number, number][];
  steep_cells?: [number, number][];
  cell_size?: number;
  max_slope_deg?: number;
  elevation_shade_min?: number;
  elevation_shade_max?: number;
  speeds?: Record<string, number>;
}

export interface MapData extends GridLayersData {
  h: number;
  w: number;
  connectivity: number;
  start: [number, number];
  goal: [number, number];
  auto_path: [number, number][];
  optimal_path: [number, number][];
  optimal_cost?: number | null;
  map_image_url: string;
  config: SystemConfig;
  generation?: MapGenerationMetadata;
}

export interface MapGenerationMetadata {
  base_seed: number | null;
  effective_seed: number | null;
  generation_attempt: number | null;
}

export interface SemanticModificationsData {
  terrain: number;
  obstacle: number;
  slope: number;
  water?: number;
  terrain_nodes?: [number, number][];
  obstacle_nodes?: [number, number][];
  slope_edges?: [[number, number], [number, number]][];
  water_nodes?: [number, number][];
}

export interface LastResult {
  success: boolean;
  solver_status: string;
  runtime_sec: number;
  iterations: number;
  explanation_text: string;
  original_optimal_cost?: number | null;
  final_alternative_cost?: number | null;
  cost_baseline_text?: string;
  modifications?: SemanticModificationsData | null;
  modified_grid?: GridLayersData;
}

export interface SolveResponse {
  status: string;
  result: LastResult;
  artifacts: string[];
}

export interface QueueItem {
  id: string;
  config: SystemConfig;
  configurationName?: string;
  status:
    | "pending"
    | "generating_map"
    | "awaiting_route"
    | "solving"
    | "saved"
    | "completed"
    | "failed";
  mapData?: MapData;
  userPath?: [number, number][];
  result?: LastResult;
  artifacts?: string[];
  error?: string;
}

export interface ExecutionStatus {
  running: boolean;
  current_run: number;
  total_runs: number;
  status: string;
  error: string | null;
  last_result: LastResult | null;
  artifacts: string[];
  generation_runs?: MapGenerationMetadata[];
}

export interface DirectoryListing {
  current: string;
  parent: string;
  directories: string[];
  relative_to_root: string;
  project_root: string;
}

export interface CheckDirResult {
  exists: boolean;
  file_count: number;
  has_artifacts: boolean;
  files: string[];
}

export interface ExportConfigPayload {
  config?: Partial<SystemConfig>;
  start: [number, number];
  goal: [number, number];
  user_path: [number, number][];
}

export interface SaveConfigurationItem extends ExportConfigPayload {
  name: string;
}

export interface SaveConfigurationsPayload {
  destination_dir: string;
  configurations: SaveConfigurationItem[];
}

export interface ImportConfigResponse extends MapData {
  user_path: [number, number][];
}
