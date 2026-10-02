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

Controls pseudorandom seed, Perlin noise scales, and biome thresholds for terrain synthesis.

| Parameter                | Type               | Default Value                                                                                                     | Description                                                          |
| :----------------------- | :----------------- | :---------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| `MAP_DEFAULT_SEED`       | `int`              | `42`                                                                                                              | Random seed for reproducible procedural map generation.              |
| `MAP_ELEVATION_SCALE`    | `float`            | `2.0`                                                                                                             | Maximum elevation amplitude in meters.                               |
| `MAP_ELEVATION_FREQ`     | `float`            | `0.06`                                                                                                            | Spatial frequency for Perlin noise elevation.                        |
| `MAP_ELEVATION_OCTAVES`  | `int`              | `3`                                                                                                               | Number of noise octaves for elevation detail.                        |
| `MAP_BIOME_FREQ`         | `float`            | `0.03`                                                                                                            | Spatial frequency for biome noise distribution.                      |
| `MAP_BIOME_OCTAVES`      | `int`              | `2`                                                                                                               | Number of noise octaves for biome distribution.                      |
| `MAP_BIOME_THRESHOLDS`   | `dict[str, float]` | `{"WATER_RIVER": 0.20, "MUD": 0.32, "SAND": 0.45, "DRY_VEGETATION": 0.60, "GRASS": 0.80, "COMPACTED_SOIL": 1.00}` | Normalized cumulative thresholds for terrain classification.         |
| `MAP_OBSTACLE_FREQ`      | `float`            | `0.05`                                                                                                            | Spatial frequency for obstacle cluster Perlin noise.                 |
| `MAP_OBSTACLE_THRESHOLD` | `float`            | `0.85`                                                                                                            | Noise threshold above which a cell is assigned as an obstacle (`1`). |

---

## 3. Terrain Physics & Vehicle Dynamics (`src/config/config_terrain.py`)

Defines traversability speeds, slope thresholds, and mechanical limits based on the Husky UGV.

| Parameter             | Type               | Default Value                        | Description                                                                        |
| :-------------------- | :----------------- | :----------------------------------- | :--------------------------------------------------------------------------------- |
| `MAX_SLOPE_DEG`       | `float`            | `20.0`                               | Maximum traversable slope in degrees ($\alpha_{\max} = 20.0^\circ$).               |
| `TERRAINS`            | `dict[str, float]` | Ten built-in terrain speeds          | Nominal traversal speeds in m/s for each terrain type.                             |
| `TERRAIN_COLORS`      | `dict[str, str]`   | Hex colors for all built-in terrains | User-editable `#RRGGBB` map palette shared by the Web canvas and Python renderers. |
| `BASE_TERRAIN`        | `str`              | `"GRASS"`                            | Reference terrain type for base traversability calculations.                       |
| `IMPASSABLE_TERRAINS` | `set[str]`         | `{"WATER_RIVER"}`                    | Dynamically derived set of terrain types with nominal speed $\le 0.0\text{ m/s}$.  |
| `V_MAX`               | `float`            | `1.2`                                | Dynamically derived maximum nominal speed across all terrains in m/s.              |

---

## 4. Path Planning (`src/config/config_planning.py`)

Configures forward heuristic search algorithms and default routing endpoints.

| Parameter         | Type                      | Default Value | Description                                                             |
| :---------------- | :------------------------ | :------------ | :---------------------------------------------------------------------- |
| `DEFAULT_PLANNER` | `str`                     | `"ASTAR"`     | Default path planning algorithm (`"ASTAR"` or `"DIJKSTRA"`).            |
| `COST_TOLERANCE`  | `float`                   | `1e-6`        | Numerical floating-point tolerance for cost comparisons.                |
| `START_COORD`     | `tuple[int, int] \| None` | `None`        | Fixed start coordinate `(row, col)`, or `None` for top-left default.    |
| `GOAL_COORD`      | `tuple[int, int] \| None` | `None`        | Fixed goal coordinate `(row, col)`, or `None` for bottom-right default. |

---

## 5. Inverse Shortest Path Formulation (`src/config/config_isp.py`)

Defines the semantic target used by terrain interventions in the MILP formulation.

| Parameter        | Type    | Default Value      | Description                                                                      |
| :--------------- | :------ | :----------------- | :------------------------------------------------------------------------------- |
| `TARGET_TERRAIN` | `str`   | `"COMPACTED_SOIL"` | Semantic target terrain used for soil paving/upgrade modifications.              |
| `TARGET_SPEED`   | `float` | `1.2`              | Nominal traversal speed of `TARGET_TERRAIN` in m/s (`TERRAINS[TARGET_TERRAIN]`). |

The MILP objective assigns unit cost to each binary terrain, obstacle, and slope intervention. Its prohibitive transition penalty is derived from the active graph and is not a user configuration parameter.

The Web terrain registry keeps the `TERRAINS` and `TERRAIN_COLORS` keys in sync. Terrain names must be unique, colors use `#RRGGBB`, and speeds at or below `0.0` are impassable. `DEFAULT_TERRAIN` must exist in the registry. `BASE_TERRAIN` and `TARGET_TERRAIN` must reference terrains with positive speeds. `IMPASSABLE_TERRAINS`, `V_MAX`, and `TARGET_SPEED` are recalculated whenever the registry or selected terrains change. The current default, base, and target terrains cannot be removed until another terrain is selected.

Procedural biome assignment continues to use the built-in biome threshold order. Removed biome names are skipped, and the selected `DEFAULT_TERRAIN` is used when no remaining biome threshold matches. Custom terrains are available as defaults and ISP targets, and their chosen colors are used whenever they appear in map data.

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
| `MAPS_DIR`         | `str` | `"maps"`          | Relative directory path for serialized procedural map files.                                                                                                                                                                                                                                  |
| `DEFAULT_MAP_FILE` | `str` | `"maps/map.json"` | Default file path for serialized map JSON definitions.                                                                                                                                                                                                                                        |
| `DEFAULT_MAP_IMG`  | `str` | `"maps/map.png"`  | Default file path for rendered map preview images.                                                                                                                                                                                                                                            |
| `OUTPUT_DIR`       | `str` | `""`              | Must be explicitly selected before generating persisted artifacts. Output runs are organized into `map/` (`map.png`, `map.json`) and `results/` (solution plots and `log.txt`). Up to five plots are generated; plots 4 and 5 are saved only when the ISP solver returns a successful result. |

---

## 10. Unified Experiment Serialization Schema (JSON)

Standardizes export, import, and reproduction of experiments across both the Web client and the CLI.

| Field                                         | Type                | Description                                                                                                                            |
| :-------------------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP_H`, `MAP_W`                              | `int`               | Matrix dimensions (rows, columns).                                                                                                     |
| `CELL_SIZE`                                   | `float`             | Metric resolution per cell.                                                                                                            |
| `MAX_SLOPE_DEG`                               | `float`             | Maximum traversable slope in degrees.                                                                                                  |
| `CLOSED_LOOP_TIMEOUT_SEC`                     | `float`             | Overall timeout for closed-loop ISP execution in seconds.                                                                              |
| `MAP_BIOME_FREQ`                              | `float`             | Spatial frequency used to distribute procedural biomes.                                                                                |
| `CONNECTIVITY`                                | `int`               | Grid neighborhood model (`4` or `8`).                                                                                                  |
| `MAP_DEFAULT_SEED`                            | `int`               | Procedural map seed.                                                                                                                   |
| `MAP_ELEVATION_SCALE`, `MAP_ELEVATION_FREQ`   | `float`             | Perlin noise amplitude and frequency for elevation.                                                                                    |
| `MAP_OBSTACLE_FREQ`, `MAP_OBSTACLE_THRESHOLD` | `float`             | Obstacle cluster noise frequency and threshold.                                                                                        |
| `DEFAULT_SOLVER`                              | `str`               | MIP solver backend (`"HIGHS"` or `"GUROBI"`). HiGHS is the default; Gurobi is the backend alternative. SCIP and CBC are not supported. |
| `SOLVER_TIMEOUT_SEC`                          | `float`             | Solver time limit in seconds.                                                                                                          |
| `USE_INCREMENTAL_SOLVER`                      | `bool`              | `True` for iterative cutting-plane, `False` for monolithic MILP.                                                                       |
| `MAX_ISP_ITERATIONS`                          | `int`               | Maximum cutting-plane iterations.                                                                                                      |
| `INCREMENTAL_ASTAR_SCOPE`                     | `str`               | A\* search scope (`"GLOBAL"` or `"SUBGRAPH"`).                                                                                         |
| `DEFAULT_REDUCTION_METHOD`                    | `str`               | Active reduction method (`"NONE"`, `"BBOX"`, `"FLOODFILL"`, `"SPARSIFIED"`, `"PATH_ONLY"`).                                            |
| `BBOX_MARGIN`                                 | `int`               | Cell padding around bounding box.                                                                                                      |
| `TARGET_TERRAIN`                              | `str`               | Semantic target terrain for soil upgrades.                                                                                             |
| `DEFAULT_TERRAIN`                             | `str`               | Terrain assigned to uninitialized cells and used as the procedural biome fallback.                                                     |
| `BASE_TERRAIN`                                | `str`               | Traversable reference terrain for ISP traversability calculations.                                                                     |
| `TERRAINS`, `TERRAIN_COLORS`                  | `dict`              | Terrain speeds and `#RRGGBB` colors, included in each exported experiment.                                                             |
| `DEFAULT_PLANNER`                             | `str`               | Path planner algorithm (`"ASTAR"` or `"DIJKSTRA"`).                                                                                    |
| `OUTPUT_DIR`                                  | `str`               | Directory path for generated artifacts.                                                                                                |
| `start`                                       | `[row, col]`        | Origin coordinate pair.                                                                                                                |
| `goal`                                        | `[row, col]`        | Destination coordinate pair.                                                                                                           |
| `p_user`                                      | `[[row, col], ...]` | Full alternative trajectory from start to goal.                                                                                        |

Experiment JSON files include the terrain registry and the configuration fields listed above so a custom terrain setup can be reproduced. Legacy JSON files without optional configuration fields remain valid and use the built-in defaults. Runtime edits are held in memory and do not rewrite Python configuration modules. The `OUTPUT_DIR` field must contain a user-selected path whenever an API request persists artifacts.
