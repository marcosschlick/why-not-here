export interface SystemConfig {
  MAP_W: number;
  MAP_H: number;
  CONNECTIVITY: number;
  DEFAULT_REDUCTION_METHOD: string;
  USE_INCREMENTAL_SOLVER: boolean;
  OUTPUT_DIR: string;
  MAP_DEFAULT_SEED: number;
  DEFAULT_PLANNER?: string;
  DEFAULT_SOLVER?: string;
  SOLVER_TIMEOUT_SEC?: number;
  TARGET_TERRAIN?: string;
  MAX_ISP_ITERATIONS?: number;
  BBOX_MARGIN?: number;
  INCREMENTAL_ASTAR_SCOPE?: string;
  MAP_ELEVATION_SCALE?: number;
  MAP_ELEVATION_FREQ?: number;
  MAP_OBSTACLE_FREQ?: number;
  MAP_OBSTACLE_THRESHOLD?: number;
  [key: string]: unknown;
}

export interface MapData {
  h: number;
  w: number;
  connectivity: number;
  start: [number, number];
  goal: [number, number];
  elevation: number[][];
  terrain: string[][];
  obstacle: number[][];
  auto_path: [number, number][];
  optimal_path: [number, number][];
  optimal_cost?: number | null;
  map_image_url: string;
  config: SystemConfig;
}

export interface SemanticModificationsData {
  terrain: number;
  obstacle: number;
  slope: number;
  terrain_nodes?: [number, number][];
  obstacle_nodes?: [number, number][];
  slope_edges?: [[number, number], [number, number]][];
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
