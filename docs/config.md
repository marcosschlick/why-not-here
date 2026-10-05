# System Configuration Reference

This document serves as the official reference for all configuration modules located in `src/config/`. Parameters define simulation topology, procedural generation, vehicle mechanics, path planning, and Inverse Shortest Path (ISP) optimization.

---

## 1. Grid Topology (`src/config/config_grid.py`)

Defines spatial matrix dimensions, cell resolution, and default cell properties.

| Parameter           | Type    | Default Value | Description                                                            |
| :------------------ | :------ | :------------ | :--------------------------------------------------------------------- |
| `MAP_W`             | `int`   | `128`         | Grid width in columns.                                                 |
| `MAP_H`             | `int`   | `64`          | Grid height in rows.                                                   |
| `CELL_SIZE`         | `float` | `1.0`         | Spatial resolution of each cell in meters ($1.0 \times 1.0\text{ m}$). |
| `CONNECTIVITY`      | `int`   | `8`           | Neighborhood connectivity model (`4` for Von Neumann, `8` for Moore).  |
| `DEFAULT_TERRAIN`   | `str`   | `"GRASS"`     | Default terrain assigned to uninitialized cells.                       |
| `DEFAULT_ELEVATION` | `float` | `0.0`         | Initial cell elevation in meters.                                      |
| `DEFAULT_OBSTACLE`  | `int`   | `0`           | Initial obstacle state (`0` = free, `1` = impassable obstacle).        |

---

## 2. Procedural Map Generation (`src/config/config_map.py`)

Controls the independent Perlin fields, terrain classification thresholds, contextual obstacles, and connectivity retries.

| Parameter                      | Type               | Default Value | Description                                                                 |
| :----------------------------- | :----------------- | :------------ | :-------------------------------------------------------------------------- |
| `MAP_DEFAULT_SEED`             | `int`              | `42`          | Seed for reproducible generation and deterministic retry seeds.             |
| `MAP_ELEVATION_SCALE`          | `float`            | `4.0`         | Elevation amplitude in meters.                                              |
| `MAP_ELEVATION_FREQ`           | `float`            | `0.06`        | Spatial frequency for the elevation Perlin field.                            |
| `MAP_ELEVATION_OCTAVES`        | `int`              | `3`           | Number of elevation noise octaves.                                           |
| `MAP_MOISTURE_FREQ`            | `float`            | `0.03`        | Spatial frequency for the normalized moisture Perlin field.                  |
| `MAP_MOISTURE_OCTAVES`         | `int`              | `2`           | Number of moisture noise octaves.                                             |
| `MAP_ROUGHNESS_FREQ`           | `float`            | `0.05`        | Spatial frequency for the normalized roughness Perlin field.                 |
| `MAP_ROUGHNESS_OCTAVES`        | `int`              | `2`           | Number of roughness noise octaves.                                            |
| `MAP_TERRAIN_THRESHOLDS`       | `dict[str, float]` | See config    | Normalized elevation and moisture cutoffs used by the ordered classifier.    |
| `MAP_ROUGHNESS_THRESHOLDS`     | `dict[str, float]` | See config    | Per-terrain roughness cutoffs; lower values create more obstacles.           |
| `MAP_MIN_MAIN_COMPONENT_RATIO` | `float`            | `0.70`        | Minimum fraction of all grid cells in the largest traversable component.     |
| `MAP_MAX_GENERATION_ATTEMPTS`  | `int`              | `5`           | Maximum deterministic seed attempts before generation fails with an error.   |

`MAP_TERRAIN_THRESHOLDS` contains `LOWLAND_ELEVATION_MAX=0.28`, `WATER_MOISTURE_MIN=0.70`, `MUD_MOISTURE_MIN=0.48`, `ROCKY_ELEVATION_MIN=0.76`, `ROCKY_MOISTURE_MAX=0.40`, `FOREST_MOISTURE_MIN=0.66`, `DRY_MOISTURE_MAX=0.34`, and `GRASSLAND_ELEVATION_MIN=0.58`. `MAP_ROUGHNESS_THRESHOLDS` contains `FOREST=0.74`, `ROCKY=0.72`, `GRASSLAND=0.88`, `GRASS=0.90`, `DRY_VEGETATION=0.90`, `MUD=0.97`, and `SAND=0.98`.

`WATER_RIVER` represents impassable aquatic regions classified from low elevation and high moisture; it does not represent a simulated river network. Slope angles follow `θ = atan(Δz / d)` (converted to degrees for the traversability limit). Their distribution depends on elevation scale, elevation frequency, and `CELL_SIZE`; the current calibration uses `CELL_SIZE=1.0` and is not intended to remain physically equivalent at every resolution.

---

## 3. Terrain Physics & Vehicle Dynamics (`src/config/config_terrain.py`)

Defines traversability speeds, slope thresholds, and mechanical limits based on the Husky UGV.

| Parameter             | Type               | Default Value                        | Description                                                                        |
| :-------------------- | :----------------- | :----------------------------------- | :--------------------------------------------------------------------------------- |
| `MAX_SLOPE_DEG`       | `float`            | `20.0`                               | Maximum traversable slope in degrees ($\alpha_{\max} = 20.0^\circ$).               |
| `TERRAINS`            | `dict[str, float]` | Ten built-in terrain speeds          | Nominal traversal speeds in m/s for each terrain type.                             |
| `TERRAIN_COLORS`      | `dict[str, str]`   | Hex colors for all built-in terrains | Fixed `#RRGGBB` map palette shared by the Web canvas and Python renderers. |
| `BASE_TERRAIN`        | `str`              | `"GRASS"`                            | Reference terrain type for base traversability calculations.                       |
| `WATER_TERRAIN`       | `str`              | `"WATER_RIVER"`                      | Terrain identifier used for explicit water-traversability overrides.                |
| `IMPASSABLE_TERRAINS` | `set[str]`         | `{"WATER_RIVER"}`                    | Terrain types with nominal speed $\le 0.0\text{ m/s}$, always including water.       |
| `V_MAX`               | `float`            | `1.2`                                | Dynamically derived maximum nominal speed across all terrains in m/s.              |

---

## 4. Path Planning (`src/config/config_planning.py`)

Configures forward heuristic search algorithms and default routing endpoints.

| Parameter         | Type                      | Default Value | Description                                                             |
| :---------------- | :------------------------ | :------------ | :---------------------------------------------------------------------- |
| `DEFAULT_PLANNER` | `str`                     | `"ASTAR"`     | Default path planning algorithm (`"ASTAR"` or `"DIJKSTRA"`).            |
| `START_COORD`     | `tuple[int, int] \| None` | `None`        | Fixed start coordinate `(row, col)`, or `None` for top-left default.    |
| `GOAL_COORD`      | `tuple[int, int] \| None` | `None`        | Fixed goal coordinate `(row, col)`, or `None` for bottom-right default. |

Automatic endpoints are selected in the same traversable component, using the largest component when both are automatic. With one fixed endpoint, the automatic endpoint stays in its component. Coordinate ties are resolved by row and column. Fixed endpoints must be in bounds and on traversable terrain; a physical obstacle at a fixed endpoint is cleared. Water cannot be cleared this way.

---

## 5. Inverse Shortest Path Formulation (`src/config/config_isp.py`)

Defines the semantic target used by terrain interventions in the MILP formulation.

| Parameter        | Type    | Default Value      | Description                                                                      |
| :--------------- | :------ | :----------------- | :------------------------------------------------------------------------------- |
| `TARGET_TERRAIN` | `str`   | `"COMPACTED_SOIL"` | Semantic target terrain used for soil paving/upgrade modifications.              |

The MILP objective assigns unit cost to each binary terrain, obstacle, and slope intervention. Its prohibitive transition penalty is derived from the active graph and is not a user configuration parameter.

Terrain defaults are fixed by the configuration modules and cannot be changed through the Web form, configuration API, or experiment JSON. Terrain names must be unique, colors use `#RRGGBB`, and speeds at or below `0.0` are impassable. `DEFAULT_TERRAIN` must exist in the registry. `BASE_TERRAIN` and `TARGET_TERRAIN` must reference terrains with positive speeds. `IMPASSABLE_TERRAINS` and `V_MAX` are derived from the fixed registry. The solver reads the target speed from the grid's speed registry.

Procedural terrain classification uses normalized elevation and moisture fields. Every terrain produced by the classifier must exist in `TERRAINS`; generation reports a clear error when a required terrain is missing. `DEFAULT_TERRAIN` remains the terrain for uninitialized cells. The Web application uses the built-in terrain registry and palette.

---

## 6. Optimization Solver Backend (`src/config/config_solver.py`)

Specifies the mathematical programming solver backend and runtime limits.

| Parameter            | Type    | Default Value | Description                                                                |
| :------------------- | :------ | :------------ | :------------------------------------------------------------------------- |
| `DEFAULT_SOLVER`     | `str`   | `"HIGHS"`     | Primary MIP solver backend for CVXPY (`"HIGHS"` or optional `"GUROBI"`).   |
| `SOLVER_TIMEOUT_SEC` | `float` | `6000.0`      | Single-run solver timeout in seconds.                                      |
| `MIP_GAP_TOLERANCE`  | `float` | `1e-4`        | Relative optimality gap tolerance between dual bound and integer solution. |

The selected solver must be installed in the active Python environment. The system does not automatically fall back to another backend when the selected solver is unavailable.

`INCREMENTAL_TOLERANCE` is an absolute comparison tolerance; `MIP_GAP_TOLERANCE` is the relative optimality gap passed to the MIP solver.

---

## 7. Incremental Closed-Loop Solver (`src/config/config_incremental.py`)

Governs the cutting-plane iterative solver and closed-loop validation cycle.

| Parameter                 | Type    | Default Value | Description                                                                                                                                                                                                                                                                                      |
| :------------------------ | :------ | :------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `USE_INCREMENTAL_SOLVER`  | `bool`  | `False`       | Solver mode (`False` = monolithic MILP, `True` = cutting-plane incremental solver).                                                                                                                                                                                                              |
| `MAX_ISP_ITERATIONS`      | `int`   | `50`          | Maximum number of cutting-plane iterations.                                                                                                                                                                                                                                                      |
| `INCREMENTAL_TOLERANCE`   | `float` | `1e-4`        | Absolute path-cost comparison tolerance, in seconds, used by closed-loop validation.                                                                                                                                                                                                             |
| `CLOSED_LOOP_TIMEOUT_SEC` | `float` | `300.0`       | Global timeout in seconds for the entire closed-loop process.                                                                                                                                                                                                                                    |
| `INCREMENTAL_ASTAR_SCOPE` | `str`   | `"GLOBAL"`    | Incremental solver search scope (`"GLOBAL"` = full grid; `"SUBGRAPH"` = reduced subgraph, followed by a full-grid validation of a subgraph-optimal candidate). With reduction `NONE`, the scope is forced to `GLOBAL`. A candidate that fails global validation returns `SUBGRAPH_OPTIMAL_ONLY`. |

---

## 8. Graph Reduction Strategies (`src/config/config_reduction.py`)

Controls subgraph pruning heuristics to reduce problem dimension before optimization.

| Parameter                  | Type  | Default Value | Description                                                                                   |
| :------------------------- | :---- | :------------ | :-------------------------------------------------------------------------------------------- |
| `DEFAULT_REDUCTION_METHOD` | `str` | `"NONE"`      | Active reduction strategy (`"NONE"`, `"BBOX"`, `"FLOODFILL"`, `"SPARSIFIED"`, `"PATH_ONLY"`). |
| `BBOX_MARGIN`              | `int` | `2`           | Cell margin padding applied around bounding box boundaries.                                   |

---

## 9. Storage & Paths (`src/config/config_storage.py`)

Standardizes persistence paths for map definitions, output visuals, and execution artifacts.

| Parameter          | Type  | Default Value     | Description                                                                                                                                                                                                                                                                                   |
| :----------------- | :---- | :---------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OUTPUT_DIR`       | `str` | `""`              | API artifact persistence requires a selected directory. The CLI resolves an empty value to the project root. Runs store the base map in `map/` (`map.png`, `map.json`) and ISP images in `results/` (`optimal_path.png`, `alternative_path.png`, `path_comparison.png`, `changes.png`, `changes_and_paths.png`, `log.txt`). The three route images are always written; change images are written when candidate modifications are returned, including globally rejected or interrupted candidates. Their subtitles identify path validation and minimum-intervention certification status. Previously generated numbered PNGs are left untouched and are not returned as current artifacts. |

---

## 10. Unified Experiment Serialization Schema (JSON)

Standardizes export, import, and reproduction of experiments across both the Web client and the CLI.

| Field                                         | Type                | Description                                                                                                                            |
| :-------------------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP_H`, `MAP_W`                              | `int`               | Matrix dimensions (rows, columns).                                                                                                     |
| `CELL_SIZE`                                   | `float`             | Metric resolution per cell.                                                                                                            |
| `CLOSED_LOOP_TIMEOUT_SEC`                     | `float`             | Overall timeout for closed-loop ISP execution in seconds.                                                                              |
| `MAP_ELEVATION_OCTAVES`, `MAP_MOISTURE_FREQ`, `MAP_MOISTURE_OCTAVES` | `int` / `float` | Elevation and moisture field settings. |
| `CONNECTIVITY`                                | `int`               | Grid neighborhood model (`4` or `8`).                                                                                                  |
| `MAP_DEFAULT_SEED`                            | `int`               | Procedural map seed.                                                                                                                   |
| `MAP_ELEVATION_SCALE`, `MAP_ELEVATION_FREQ`   | `float`             | Perlin noise amplitude and frequency for elevation.                                                                                    |
| `MAP_ROUGHNESS_FREQ`, `MAP_ROUGHNESS_OCTAVES`, `MAP_ROUGHNESS_THRESHOLDS` | `float` / `int` / `dict` | Roughness field and contextual obstacle settings. |
| `MAP_TERRAIN_THRESHOLDS`                      | `dict[str, float]`  | Elevation and moisture cutoffs for terrain classification.                                                                              |
| `MAP_MIN_MAIN_COMPONENT_RATIO`, `MAP_MAX_GENERATION_ATTEMPTS` | `float` / `int` | Connectivity acceptance and retry limits. |
| `DEFAULT_SOLVER`                              | `str`               | MIP solver backend (`"HIGHS"` or `"GUROBI"`). HiGHS is the default; Gurobi is the backend alternative. SCIP and CBC are not supported. |
| `SOLVER_TIMEOUT_SEC`                          | `float`             | Solver time limit in seconds.                                                                                                          |
| `USE_INCREMENTAL_SOLVER`                      | `bool`              | `True` for iterative cutting-plane, `False` for monolithic MILP.                                                                       |
| `MAX_ISP_ITERATIONS`                          | `int`               | Maximum cutting-plane iterations.                                                                                                      |
| `INCREMENTAL_ASTAR_SCOPE`                     | `str`               | A\* search scope (`"GLOBAL"` or `"SUBGRAPH"`).                                                                                         |
| `DEFAULT_REDUCTION_METHOD`                    | `str`               | Active reduction method (`"NONE"`, `"BBOX"`, `"FLOODFILL"`, `"SPARSIFIED"`, `"PATH_ONLY"`).                                            |
| `BBOX_MARGIN`                                 | `int`               | Cell padding around bounding box.                                                                                                      |
| `DEFAULT_PLANNER`                             | `str`               | Path planner algorithm (`"ASTAR"` or `"DIJKSTRA"`).                                                                                    |
| `OUTPUT_DIR`                                  | `str`               | Directory path for generated artifacts.                                                                                                |
| `start`                                       | `[row, col]`        | Origin coordinate pair.                                                                                                                |
| `goal`                                        | `[row, col]`        | Destination coordinate pair.                                                                                                           |
| `p_user`                                      | `[[row, col], ...]` | Full alternative trajectory from start to goal.                                                                                        |

Experiment JSON files use a flat object with mandatory `start`, `goal`, and non-empty `p_user` fields. Optional configuration fields may be omitted and use the built-in defaults; the JSON is not a complete snapshot of all code defaults. Terrain defaults, including `MAX_SLOPE_DEG`, `DEFAULT_TERRAIN`, `BASE_TERRAIN`, `TARGET_TERRAIN`, `TERRAINS`, and `TERRAIN_COLORS`, are supplied by the backend and are not accepted in experiment JSON. Nested `config` objects, endpoint aliases `START_COORD`/`GOAL_COORD`, the route alias `user_path`, the reduction alias `PATHONLY`, and unknown parameters are rejected. Files using removed formats must be regenerated; no migration or automatic conversion is provided. The current HTTP solve/export/save requests still use their own `config` and `user_path` fields.

Runtime edits to configurable parameters are held in memory and do not rewrite Python configuration modules. Direct calls to the procedural generator read omitted parameters from the current runtime configuration. Water remains impassable through `IMPASSABLE_TERRAINS` and uses `obstacle=0`; map JSON loading copies the stored obstacle matrix directly and uses the fixed default terrain speeds and maximum slope from the current configuration. Map JSON does not store `speeds` or `max_slope_deg`; it requires the keys `base_seed`, `effective_seed`, and `generation_attempt`. An explicit `null` represents unknown generation provenance, while an absent key is an error. Procedural generation fills these keys with the base seed, effective seed, and zero-based generation attempt.

Map persistence and solve use only `OUTPUT_DIR/map/map.json`; missing maps fail explicitly. There is no mirrored write or fallback to `maps/`. Artifact discovery uses only `map/` and `results/` in the selected directory. Downloads use the requested path in the explicit directory, or the current directory if omitted, without searching other directories or historical layouts. Artifact URLs always retain their directory, including `output`.

Starting a direct solve resets the previous result and artifact state. A missing map returns HTTP 404 and marks status as failed, with no previous result or artifacts attached. An idle runner does not discover artifacts from another execution.

Generation and map import API responses include transient `cell_size`, `max_slope_deg`, `speeds`, `terrain_colors`, and `steep_cells` metadata for Web rendering. These values are not written to map JSON. Preview requests return an empty `map_image_url` because no new image is persisted. Before solving, the Web client persists the displayed experiment with its endpoints and manual route. Direct HTTP clients must also persist the intended map before solving; a preview does not replace an existing file. ISP requests may specify `start` and `goal`; omitted endpoints come from a supplied route, or are selected automatically without inherited endpoints when no route is supplied. Successful or candidate interventions include the `modified_grid` layers and transient terrain metadata for Web rendering. `/api/run` always generates new maps and automatic routes, resetting inherited endpoints; it does not execute an imported manual route. Terrain legends use the fixed backend terrain registry and colors. The `OUTPUT_DIR` field must contain a user-selected path whenever an API request persists artifacts.

ISP incidence, affine coefficient, and McCormick matrices use sparse CSR storage after LIL construction. Linear vectors remain dense. The formulas, finite Big-M penalties, objective, intervention domain, and diagonal policy are unchanged. Global validation remains necessary to certify a physically valid solution, even when the MILP reports `OPTIMAL`.
