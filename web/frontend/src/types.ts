export interface MapProfile {
  height: number;
  width: number;
  parameters: Partial<SystemConfig>;
}

export interface MapRelief {
  azimuth: number;
  altitude: number;
  vertical_exaggeration: number;
  strength: number;
}

export interface TerrainMotif {
  strokes?: number[][][];
  dots?: number[][];
}

export interface TerrainTexture extends TerrainMotif {
  variants: TerrainMotif[];
}

export interface MapAppearance {
  relief: MapRelief;
  terrain_textures: Record<string, TerrainTexture>;
  texture_overview: {
    target_pixels: number;
    opacity: number;
    line_width: number;
  };
  texture_min_cell_pixels: number;
  texture_color: string;
  texture_opacity: number;
  texture_line_width: number;
  obstacle_shade: number;
  obstacle_texture_color: string;
  obstacle_texture_opacity: number;
}

export interface SystemConfig {
  MAP_PROFILE_VERSION?: string;
  NORMAL_MODEL_VERSION?: string;
  MAP_W: number;
  MAP_H: number;
  CELL_SIZE?: number;
  CONNECTIVITY: number;
  DEFAULT_REDUCTION_METHOD: string;
  USE_INCREMENTAL_SOLVER: boolean;
  MAP_DEFAULT_SEED: number;
  DEFAULT_SOLVER?: string;
  ISP_TIME_BUDGET_SEC?: number;
  ISP_MODEL?: "NORMAL" | "BRANDAO";
  INCREMENTAL_ASTAR_SCOPE?: string;
  MAP_ELEVATION_SCALE?: number;
  MAP_ELEVATION_FREQ?: number;
  MAP_ELEVATION_OCTAVES?: number;
  MAP_ELEVATION_PERSISTENCE?: number;
  MAP_MOISTURE_FREQ?: number;
  MAP_MOISTURE_OCTAVES?: number;
  MAP_ROUGHNESS_FREQ?: number;
  MAP_ROUGHNESS_OCTAVES?: number;
  MAP_TERRAIN_THRESHOLDS?: Record<string, number>;
  MAP_ROUGHNESS_THRESHOLDS?: Record<string, number>;
  MAP_MIN_MAIN_COMPONENT_RATIO?: number;
  MAP_MAX_GENERATION_ATTEMPTS?: number;
}

export interface GridLayersData {
  isp_model: "NORMAL" | "BRANDAO";
  elevation: number[][];
  terrain: string[][];
  obstacle: number[][];
  isp_model_version: string;
  cell_openings: CellOpening[];
  slope_adjustments: SlopeAdjustment[];
  environmental_speed_edges: SpeedIntervention[];
  robot_capability_edges: SpeedIntervention[];
  robot_speed_normal: number;
  robot_speed_theoretical: number;
  generation_profile: Partial<SystemConfig> & { MAP_PROFILE_VERSION: string };
  appearance: MapAppearance;
  steep_cells?: [number, number][];
  cell_size: number;
  max_slope_deg: number;
  speeds: Record<string, number>;
  terrain_colors: Record<string, string>;
}

export interface MapData extends GridLayersData {
  execution?: Partial<ExecutionMetadata>;
  grid: Record<string, unknown>;
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
  runtime_sec?: number | null;
  base_seed: number | null;
  effective_seed: number | null;
  generation_attempt: number | null;
}

export interface CellOpening {
  cell: [number, number];
  original_terrain: string;
  original_obstacle: number;
  impassable_terrain: boolean;
  opened_speed_mps: number;
}

export interface SlopeAdjustment {
  edge: [[number, number], [number, number]];
  original_slope_deg: number;
  effective_slope_deg: number;
}

export interface SpeedIntervention {
  edge: [[number, number], [number, number]];
  reference_speed_mps: number;
  target_speed_mps: number;
}

export interface SemanticModificationsData {
  model: "NORMAL" | "BRANDAO";
  terrain: number;
  cell_opening: number;
  slope: number;
  environmental_speed: number;
  robot_capability: number;
  terrain_nodes: [number, number][];
  terrain_assignments: [[number, number], string][];
  cell_openings: CellOpening[];
  slope_adjustments: SlopeAdjustment[];
  environmental_speed_edges: SpeedIntervention[];
  robot_capability_edges: SpeedIntervention[];
}

export interface LastResult {
  execution_status?: "completed" | "failed";
  execution_error?: string | null;
  success: boolean;
  original_optimal_path?: [number, number][];
  original_alternative_cost?: number | null;
  solver_status: string;
  runtime_sec: number | null;
  iterations: number | null;
  competing_paths_count?: number | null;
  graph_nodes?: number | null;
  graph_edges?: number | null;
  path_metrics?: {
    optimal_length_cells?: number | null;
    optimal_length_m?: number | null;
    alternative_length_cells?: number | null;
    alternative_length_m?: number | null;
    hausdorff_cells?: number | null;
    hausdorff_m?: number | null;
  } | null;
  iteration_metrics?:
    | {
        iteration?: number | null;
        graph_nodes?: number | null;
        graph_edges?: number | null;
      }[]
    | null;
  explanation_text: string;
  original_optimal_cost?: number | null;
  final_alternative_cost?: number | null;
  cost_baseline_text?: string;
  modifications?: SemanticModificationsData | null;
  prepared_grid?: GridLayersData;
  modified_grid?: GridLayersData;
  metrics?: ScenarioMetrics;
}

export interface SolveResponse {
  status: "completed" | "failed";
  result: LastResult;
  artifacts: string[];
  output_dir: string;
}

export interface NamingMetadata {
  map_index?: number;
  benchmark?: boolean;
  benchmark_group_id?: string;
}

export interface QueueItem {
  id: string;
  config: SystemConfig;
  savedFile?: string;
  outputDir?: string;
  naming?: NamingMetadata;
  benchmarkGroup?: string;
  groupKind?: "benchmark" | "comparison";
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

export interface ExportConfigPayload {
  config?: Partial<SystemConfig>;
  start: [number, number];
  goal: [number, number];
  user_path: [number, number][];
}

export interface SaveConfigurationItem extends ExportConfigPayload {
  naming?: NamingMetadata;
}

export interface SaveConfigurationsPayload {
  configurations: SaveConfigurationItem[];
}

export interface ImportConfigResponse extends MapData {
  user_path: [number, number][];
}

export interface ExecutionMetadata {
  run_id: string;
  benchmark_group_id?: string;
  attempt_index: number;
  execution_order: number;
  map_generation_sec?: number;
}

export interface ScenarioMetrics {
  model_version?: string;
  model?: string;
  strategy?: string;
  reduction?: string;
  stop_reason?: string;
  validation_status?: string;
  objective_certified?: boolean;
  objective_kind?: "WEIGHTED_INTERVENTION_COST" | "INTERVENTION_COUNT";
  certificate_scope?: string | null;
  certificate_reason?: string;
  deadline_outcome?: string;
  deadline_exceeded?: boolean;
  result_within_budget?: boolean;
  validated_after_deadline?: boolean;
  candidate_available?: boolean;
  candidate_from_solver_limit?: boolean;
  candidate_observed_after_deadline?: boolean;
  cost_states?: Record<string, string>;
  time_budget_sec?: number;
  validation_gap_sec?: number | null;
  final_original_path_cost?: number | null;
  final_optimal_cost?: number | null;
  full_graph_nodes?: number;
  full_graph_edges?: number;
  node_reduction_ratio?: number;
  edge_reduction_ratio?: number;
  initial_astar_expanded?: number;
  validation_astar_expanded?: number;
  cuts?: number;
  timing?: Record<string, number>;
  solver?: Record<string, string | number | boolean | null>;
  interventions?: Record<string, number | null>;
  preparation?: {
    version?: string | null;
    converted_blocked_cells?: number;
    converted_nodes?: [number, number][];
  };
  memory?: {
    method?: string | null;
    initial_bytes?: number | null;
    sampled_peak_bytes?: number | null;
    sampling_interval_sec?: number | null;
  };
  identity?: Partial<ExecutionMetadata> & {
    map_id?: string;
    prepared_scenario_id?: string | null;
    scenario_id?: string;
    started_at?: string;
    finished_at?: string;
  };
  reproduction?: {
    configuration?: SystemConfig;
    desired_path?: [number, number][];
    base_seed?: number | null;
    effective_seed?: number | null;
    start?: [number, number];
    goal?: [number, number];
  };
  error?: string;
}
