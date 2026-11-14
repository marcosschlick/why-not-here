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
| `MAP_ELEVATION_PERSISTENCE`    | `float`            | `0.5`         | Relative amplitude of successive elevation octaves, resolved per size.      |
| `MAP_MOISTURE_FREQ`            | `float`            | `0.03`        | Spatial frequency for the normalized moisture Perlin field.                  |
| `MAP_MOISTURE_OCTAVES`         | `int`              | `2`           | Number of moisture noise octaves.                                             |
| `MAP_ROUGHNESS_FREQ`           | `float`            | `0.05`        | Spatial frequency for the normalized roughness Perlin field.                 |
| `MAP_ROUGHNESS_OCTAVES`        | `int`              | `2`           | Number of roughness noise octaves.                                            |
| `MAP_TERRAIN_THRESHOLDS`       | `dict[str, float]` | See config    | Normalized elevation and moisture cutoffs used by the ordered classifier.    |
| `MAP_ROUGHNESS_THRESHOLDS`     | `dict[str, float]` | See config    | Per-terrain roughness cutoffs; lower values create more obstacles.           |
| `MAP_MIN_MAIN_COMPONENT_RATIO` | `float`            | `0.70`        | Minimum fraction of all grid cells in the largest traversable component.     |
| `MAP_MAX_GENERATION_ATTEMPTS`  | `int`              | `5`           | Maximum deterministic seed attempts before generation fails with an error.   |

`MAP_TERRAIN_THRESHOLDS` contains `LOWLAND_ELEVATION_MAX=0.28`, `WATER_MOISTURE_MIN=0.70`, `WATER_MIN_COMPONENT_RATIO=0.0015`, `MUD_MOISTURE_MIN=0.48`, `ROCKY_ELEVATION_MIN=0.76`, `ROCKY_MOISTURE_MAX=0.40`, `FOREST_MOISTURE_MIN=0.66`, `DENSE_FOREST_MOISTURE_MIN=0.82`, `DRY_MOISTURE_MAX=0.34`, and `GRASSLAND_ELEVATION_MIN=0.58`. After terrain classification, water components connected by sides must contain at least `max(4, ceil(WATER_MIN_COMPONENT_RATIO * height * width))` cells. Smaller components become MUD before obstacle generation. Maps may have no water if all components are too small; no lakes or connecting channels are added. `MAP_ROUGHNESS_THRESHOLDS` contains `FOREST=0.82`, `ROCKY=0.80`, `GRASSLAND=0.95`, `GRASS=0.95`, `DRY_VEGETATION=0.95`, `MUD=0.95`, and `SAND=0.95`.

`WATER_RIVER` represents impassable aquatic regions classified from low elevation and high moisture; it does not represent a simulated river network. Slope angles follow `θ = atan(Δz / d)` (converted to degrees for the traversability limit). Their distribution depends on elevation scale, elevation frequency, and `CELL_SIZE`; the current calibration uses `CELL_SIZE=1.0` and is not intended to remain physically equivalent at every resolution.

---

## 3. Terrain Physics & Vehicle Dynamics (`src/config/config_terrain.py`)

Defines traversability speeds, slope thresholds, and mechanical limits based on the Husky UGV.

| Parameter             | Type               | Default Value                        | Description                                                                        |
| :-------------------- | :----------------- | :----------------------------------- | :--------------------------------------------------------------------------------- |
| `MAX_SLOPE_DEG`       | `float`            | `20.0`                               | Maximum traversable slope in degrees ($\alpha_{\max} = 20.0^\circ$).               |
| `TERRAINS`            | `dict[str, float]` | Eleven built-in terrain speeds          | Nominal traversal speeds in m/s for each terrain type.                             |
| `TERRAIN_COLORS`      | `dict[str, str]`   | Hex colors for all built-in terrains | Fixed `#RRGGBB` map palette shared by the Web canvas and Python renderers. |
| `WATER_TERRAIN`       | `str`              | `"WATER_RIVER"`                      | Identifier of the aquatic terrain class.                |
| `IMPASSABLE_TERRAINS` | `set[str]`         | `{"WATER_RIVER", "DENSE_FOREST"}`                    | Terrain types with nominal speed $\le 0.0\text{ m/s}$, always including water.       |
| `ROBOT_SPEED_NORMAL` | `float` | `1.0` | Normal robot speed cap in m/s. |
| `V_MAX`               | `float`            | `1.0`                                | Dynamically derived maximum nominal speed across all terrains in m/s.              |

---

## 4. Path Planning (`src/config/config_planning.py`)

Uses A* for forward path planning and configures default routing endpoints.

| Parameter         | Type                      | Default Value | Description                                                             |
| :---------------- | :------------------------ | :------------ | :---------------------------------------------------------------------- |
| `START_COORD`     | `tuple[int, int] \| None` | `None`        | Fixed start coordinate `(row, col)`, or `None` for top-left default.    |
| `GOAL_COORD`      | `tuple[int, int] \| None` | `None`        | Fixed goal coordinate `(row, col)`, or `None` for bottom-right default. |

Automatic endpoints are selected in the same traversable component, using the largest component when both are automatic. With one fixed endpoint, the automatic endpoint stays in its component. Coordinate ties are resolved by row and column. Fixed endpoints must be in bounds and on traversable terrain; blocked fixed endpoints are rejected and are never cleared. Water and dense forest cannot be opened by endpoint selection; existing openings remain traversable.

---

## 5. Inverse Shortest Path Formulation (`src/config/config_isp.py`)

Defines the normal model's four Eder-inspired intervention categories. The normal robot limit is `ROBOT_SPEED_NORMAL=1.0` m/s, the theoretical limit is 5.0 m/s, and `NORMAL_MODEL_VERSION=normal-eder-grid-v1` identifies the required semantic contract. Compacted soil now has a nominal speed of 1.0 m/s. All normal terrain speeds are bounded by the normal robot limit.

One cell opening resolves every original blocking cause at unit cost. Impassable terrain opens at the minimum configured positive terrain speed (currently 0.3 m/s). Directed excessive slopes are clamped to their signed 20-degree limit, without modifying elevations or the reverse edge. Below 75% of the normal limit, a directed speed intervention sets the effective edge velocity to 1 m/s; at or above 75%, only the hypothetical 5 m/s capability intervention is available. Activated speed interventions use `distance / target_speed` without an additional slope penalty, but still require cell and slope passage corrections. Eligibility is frozen from original conditions. For blocked edges, the finite reference ignores binary obstacles, replaces impassable speeds with the minimum positive speed, and retains the original slope penalty. This provisional classification is a project adaptation, not an explicit rule in Eder.

| Parameter        | Type    | Default Value      | Description                                                                      |
| :--------------- | :------ | :----------------- | :------------------------------------------------------------------------------- |
| `NORMAL_MODEL_VERSION` | `str` | `"normal-eder-grid-v1"` | Required current normal intervention semantics. |
| `ROBOT_SPEED_THEORETICAL` | `float` | `5.0` | Theoretical speed in m/s; must be finite and greater than the grid's maximum nominal speed. |
| `ROBOT_SPEED_ELIGIBILITY_RATIO` | `float` | `0.75` | Frozen original effective speed divided by the normal robot limit; below this ratio only environmental speed intervention is eligible. |

The normal objective counts cell openings, directed slope adjustments, environmental speed interventions and hypothetical robot capability interventions, all with unit weight. Obstacles and impassable terrain in the same cell form one opening with both original causes retained. Start and goal cells are protected. Interventions on incident edges remain allowed. The Brandao adaptation retains its independent weighted terrain-assignment objective described in [benchmark.md](benchmark.md).

The original edge reference is the harmonic mean of endpoint terrain speeds divided by `1 + max(0, original_slope / MAX_SLOPE_DEG)`. For blocked terrain, the minimum configured positive speed substitutes its zero speed; physical obstacle flags are ignored only for this finite reference. Classification uses a strict `< 0.75 * ROBOT_SPEED_NORMAL` comparison and never changes during optimization. A blocked edge can therefore receive its required opening and slope corrections plus one separately charged speed intervention. Both speed targets are effective velocities: they replace, rather than multiply, the normal terrain-and-slope velocity. The parameters are code-only; no new Web controls or numerical experiment configuration fields are exposed.

Terrain defaults are fixed by the configuration modules. Names must be unique, speeds finite and no greater than the normal robot limit, and colors use `#RRGGBB`. Nonpositive speeds are impassable. `DEFAULT_TERRAIN` must exist in the registry. `IMPASSABLE_TERRAINS` and `V_MAX` are derived from the registry. `NORMAL_MODEL_VERSION` is required metadata in saved experiment JSON, rather than an editable parameter. The unused base-terrain parameter has been removed.

Procedural terrain classification uses normalized elevation and moisture fields. Every terrain produced by the classifier must exist in `TERRAINS`; generation reports a clear error when a required terrain is missing. `DEFAULT_TERRAIN` remains the terrain for uninitialized cells. The Web application uses the built-in terrain registry and palette.

---

## 6. Optimization Solver Backend (`src/config/config_solver.py`)

Specifies the mathematical programming solver backend and runtime limits.

| Parameter            | Type    | Default Value | Description                                                                |
| :------------------- | :------ | :------------ | :------------------------------------------------------------------------- |
| `ISP_TIME_BUDGET_SEC` | `float` | `1800.0` | Cooperative per-scenario budget including preparation, construction, solving and validation. |
| `DEFAULT_SOLVER`     | `str`   | `"HIGHS"`     | Primary MIP solver backend for CVXPY (`"HIGHS"` or optional `"GUROBI"`).   |
| `MIP_GAP_TOLERANCE`  | `float` | `1e-4`        | Relative optimality gap tolerance between dual bound and integer solution. |

The selected solver must be installed in the active Python environment. The system does not automatically fall back to another backend when the selected solver is unavailable.

`INCREMENTAL_TOLERANCE` is an absolute comparison tolerance; `MIP_GAP_TOLERANCE` is the relative optimality gap passed to the MIP solver.

---

## 7. Incremental Closed-Loop Solver (`src/config/config_incremental.py`)

Governs the cutting-plane iterative solver and closed-loop validation cycle.

| Parameter                 | Type    | Default Value | Description                                                                                                                                                                                                                                                                                      |
| :------------------------ | :------ | :------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `USE_INCREMENTAL_SOLVER`  | `bool`  | `False`       | Solver mode (`False` = monolithic MILP, `True` = cutting-plane incremental solver).                                                                                                                                                                                                              |
| `INCREMENTAL_TOLERANCE`   | `float` | `1e-4`        | Absolute path-cost comparison tolerance, in seconds, used by closed-loop validation.                                                                                                                                                                                                             |
| `INCREMENTAL_ASTAR_SCOPE` | `str`   | `"GLOBAL"`    | Incremental solver search scope (`"GLOBAL"` = full grid; `"SUBGRAPH"` = reduced subgraph, followed by a full-grid validation of a subgraph-optimal candidate). With reduction `NONE`, the scope is forced to `GLOBAL`. A candidate that fails global validation returns `SUBGRAPH_OPTIMAL_ONLY`. |

---

## 8. Graph Reduction Strategies (`src/config/config_reduction.py`)

Controls subgraph pruning heuristics to reduce problem dimension before optimization.

| Parameter                  | Type  | Default Value | Description                                                                                   |
| :------------------------- | :---- | :------------ | :-------------------------------------------------------------------------------------------- |
| `DEFAULT_REDUCTION_METHOD` | `str` | `"NONE"`      | Active reduction strategy (`"NONE"`, `"BBOX"`, `"FLOODFILL"`, `"SPARSIFIED"`, `"PATH_ONLY"`). |

`BBOX` contains exactly the minimum bounding rectangle of the original optimal and desired paths, without padding, and the grid edges between its nodes; formulation preparation does not expand it. `FLOODFILL` retains both paths and the cells strictly between them, using the even-odd rule to determine the interior. Overlapping sections enclose no area. `PATH_ONLY` contains only the vertices of the two paths and both directions of their consecutive edges, without cross edges; each direction uses its own traversal cost, and formulation preparation does not add neighboring vertices or edges. Global optimality validation uses the full grid independently of the reduced graph.

`SPARSIFIED` contracts fixed traversable chains inside the minimum bounding rectangle. Only intermediate nodes with exactly two traversable neighbors can be removed; path nodes, junctions, and the semantic protection mask are preserved. Consecutive terrain and slope traversability indicators must match. Shortcut costs sum the original segment costs independently in each direction, and retain their complete physical paths. Existing cheaper connections win, with original connections preserved on ties. Impassable fixed incident links do not count as traversable neighbors and cannot create a traversable shortcut.

Reduction and semantic closure are separate stages. The common entry point protects the intervention domain and its incident neighbors before sparsification. Subsequent preparation adds nodes and edges needed for semantic decisions, except for `BBOX`, `FLOODFILL`, and `PATH_ONLY`, whose optimization graphs remain within their extracted regions. The even-odd interior and conservative chain contraction are explicit grid adaptations of Eder's preprocessing description. Reduced graphs can omit competing paths, so global validation remains necessary.

Result logs, records and the API report actual formulation nodes/directed edges and per-iteration sizes. Incremental global competitors can augment the reduced graph with physical external edges. Both strategies now use the same preparation-through-validation runtime boundaries. Geometry includes route lengths and symmetric discrete vertex Hausdorff distances in cells and meters. See [Computational ISP benchmark](benchmark.md) for definitions and certification conditions.

---

## 9. Storage & Paths

The backend reserves a unique directory under `results/` for each execution and writes configuration JSON files under `configurations/`. Names use `experiment-<H>x<W>-<YYYYMMDD-HHmmss>`, with numeric collision suffixes. Multi-map batches add `-map-<index>`; benchmark variants add `-monolithic-<reduction>` or `-incremental-<reduction>`. Directories and files are created exclusively, and failed execution directories remain available for inspection. A failed configuration batch removes only files created by that save operation.

`POST /api/config/save` accepts configuration items with `config`, `start`, `goal`, `user_path`, and optional `naming` metadata (`map_index`, `benchmark`, `benchmark_group_id`). It returns actual paths in `saved_files`. `POST /api/isp/solve` accepts the same optional `naming` metadata plus `execution` identifiers, attempt, execution order and optional map-generation time and returns the effective `output_dir` and artifact URLs. `POST /api/run` accepts `runs` source maps and applies the same automatic trio rule; status counts the actual scenario executions and includes `output_dirs`. Pipeline operations are serialized because configuration values are shared in memory.

Runs store the base map in `map/` (`map.png`, `map.json`) and ISP images in `results/` (`optimal_path.png`, `alternative_path.png`, `path_comparison.png`, `changes.png`, `changes_and_paths.png`, `log.txt`, `scenario.json`, `prepared_map.json`, `candidate_map.json`). The three route images are always written; change images are written when candidate modifications are returned. CLI experiment execution also reserves a unique directory under `results/`. Standalone CLI map generation and saved-map ISP use the internal current directory, initially `results/`, and do not overwrite existing artifact directories.

Old experiment configurations containing `DEFAULT_PLANNER` or `OUTPUT_DIR` and API calls containing removed destination or file-name fields are unsupported and must be recreated in the current format. No migration or automatic conversion is provided.

### Simulation Benchmark

Benchmark is initially disabled and unavailable in questionnaire preparation. Each map executes seventeen scenarios: five `NORMAL` monolithic combinations and ten incremental combinations (both requested scopes for each of five reductions), followed by `BRANDAO` monolithic and incremental with `NONE`. Both requested scopes use effective `GLOBAL` with `NONE`. Outside the full benchmark, a normal incremental/`NONE` configuration automatically generates the normal execution plus both Brandao executions; other configurations run once. A map and reviewed route are shared across its execution group.

Configuration creation saves only normal inputs: one file per individual configuration or fifteen per full benchmark map. Executing/importing an individual normal incremental/`NONE` file generates the trio; among saved benchmark members only the `GLOBAL` incremental/`NONE` file generates the trio, including via `python -B src/main.py run configuration.json`. Brandao-only files are rejected rather than converted. There is no format migration or deduplication. The manual model selector and comparison button have been removed; `ISP_MODEL` remains an internal execution/reproduction parameter.

`POST /api/config/scenarios` accepts `config`, `benchmark`, and `purpose` (`run` or `create`); it returns `configurations` without executing or publishing settings. CLI and Web share its expansion function. `/api/isp/solve` still executes one resolved scenario per request. Results add `execution_status` and `execution_error`, independent of scientific `success`. Queue groups complete even when processed scenarios are infeasible or time-limited, unless there is an actual execution error. See [Computational ISP benchmark](benchmark.md).

## 10. Unified Experiment Serialization Schema (JSON)

Standardizes export, import, and reproduction of experiments across both the Web client and the CLI.

| Field                                         | Type                | Description                                                                                                                            |
| :-------------------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP_H`, `MAP_W`                              | `int`               | Matrix dimensions (rows, columns).                                                                                                     |
| `CELL_SIZE`                                   | `float`             | Metric resolution per cell.                                                                                                            |
| `MAP_ELEVATION_OCTAVES`, `MAP_MOISTURE_FREQ`, `MAP_MOISTURE_OCTAVES` | `int` / `float` | Elevation and moisture field settings. |
| `CONNECTIVITY`                                | `int`               | Grid neighborhood model (`4` or `8`).                                                                                                  |
| `MAP_DEFAULT_SEED`                            | `int`               | Procedural map seed.                                                                                                                   |
| `MAP_ELEVATION_SCALE`, `MAP_ELEVATION_FREQ`   | `float`             | Perlin noise amplitude and frequency for elevation.                                                                                    |
| `MAP_ROUGHNESS_FREQ`, `MAP_ROUGHNESS_OCTAVES`, `MAP_ROUGHNESS_THRESHOLDS` | `float` / `int` / `dict` | Roughness field and contextual obstacle settings. |
| `MAP_TERRAIN_THRESHOLDS`                      | `dict[str, float]`  | Elevation and moisture cutoffs for terrain classification.                                                                              |
| `MAP_MIN_MAIN_COMPONENT_RATIO`, `MAP_MAX_GENERATION_ATTEMPTS` | `float` / `int` | Connectivity acceptance and retry limits. |
| `DEFAULT_SOLVER`                              | `str`               | MIP solver backend (`"HIGHS"` or `"GUROBI"`). HiGHS is the default; Gurobi is the backend alternative. SCIP and CBC are not supported. |
| `USE_INCREMENTAL_SOLVER`                      | `bool`              | `True` for iterative cutting-plane, `False` for monolithic MILP.                                                                       |
| `INCREMENTAL_ASTAR_SCOPE`                     | `str`               | A\* search scope (`"GLOBAL"` or `"SUBGRAPH"`).                                                                                         |
| `DEFAULT_REDUCTION_METHOD`                    | `str`               | Active reduction method (`"NONE"`, `"BBOX"`, `"FLOODFILL"`, `"SPARSIFIED"`, `"PATH_ONLY"`).                                            |
| `start`                                       | `[row, col]`        | Origin coordinate pair.                                                                                                                |
| `goal`                                        | `[row, col]`        | Destination coordinate pair.                                                                                                           |
| `MAP_PROFILE_VERSION`                         | `"perlin-v7"` | Required current generation profile identifier. |
| `p_user`                                      | `[[row, col], ...]` | Full alternative trajectory from start to goal.                                                                                        |

Experiment JSON files use a flat object with mandatory current `MAP_PROFILE_VERSION`, `NORMAL_MODEL_VERSION`, `start`, `goal`, and non-empty `p_user` fields. Optional configuration fields may be omitted and use the built-in defaults; the JSON is not a complete snapshot of all code defaults. Terrain defaults, including `MAX_SLOPE_DEG`, `DEFAULT_TERRAIN`, `TERRAINS`, and `TERRAIN_COLORS`, are supplied by the backend and are not accepted in experiment JSON. Nested `config` objects, endpoint aliases `START_COORD`/`GOAL_COORD`, the route alias `user_path`, the reduction alias `PATHONLY`, and unknown parameters are rejected. Files using removed formats must be regenerated; no migration or automatic conversion is provided. The current HTTP solve/export/save requests still use their own `config` and `user_path` fields.

Runtime edits to configurable parameters are held in memory and do not rewrite Python configuration modules. Procedural generation always resolves the current automatic size-based profile. Map and experiment imports accept only `MAP_PROFILE_VERSION=perlin-v7`. Map JSON requires its generation profile, physical parameters (`cell_size`, `max_slope_deg`, `speeds`, connectivity), all three matrices, required `isp_model` and `isp_model_version`, normal and theoretical robot speed limits, and the four intervention record collections, and generation provenance (`base_seed`, `effective_seed`, `generation_attempt`). Missing or unknown map fields, or another profile version, produce an explicit error. No old water aliases or automatic migration are supported. Reloading a current map preserves its stored matrices, traversability and costs.

Each execution writes its base map to `map/map.json` within its reserved directory. A solve without a supplied map reads the current internal execution's map before reserving a new directory. Artifact discovery uses `map/` and `results/` in the effective directory. Artifact URLs retain that directory, and downloads do not search historical layouts.

Starting a direct solve resets the previous result and artifact state. A missing map returns HTTP 404 and marks status as failed, with no previous result or artifacts attached. An idle runner does not discover artifacts from another execution.

Generation and map import API responses include `cell_size`, `max_slope_deg`, `speeds`, `terrain_colors`, and `steep_cells` metadata for Web rendering. Map JSON requires `cell_size`, `max_slope_deg` and `speeds` so reloads retain physical traversability and costs. Colors, steep-cell indicators and appearance remain transient. Preview requests return an empty `map_image_url` because no new image is persisted. The Web client generates and imports previews without disk writes, then sends the displayed grid, endpoints and manual route to the solve endpoint. The API reserves a fresh output directory and persists that exact map before solving. Direct HTTP clients can supply the preview response's `grid` in the solve request's `map` field, or omit it to use the current internal execution's map. ISP requests may specify `start` and `goal`; omitted endpoints come from a supplied route, or are selected automatically without inherited endpoints when no route is supplied. Successful or candidate interventions include the `modified_grid` layers and transient terrain metadata for Web rendering. `/api/run` always generates new maps and automatic routes, resetting inherited endpoints; it does not execute an imported manual route. Terrain legends use the fixed backend terrain registry and colors. Solve responses return the effective experiment directory as `output_dir`. All artifacts include that directory in their download URLs.

ISP incidence and affine coefficient matrices use sparse CSR storage after LIL construction. Normal passage corrections are mandatory binary actions. Their costs are evaluated with the same grid methods as the applied map; optional speed actions add affine differences to `distance / target_speed`. Brandao terrain coefficients retain endpoint-averaged inverse speeds. There are no binary-product linearizations or finite blocking penalties. Full-grid validation remains necessary even when the MILP reports `OPTIMAL`.

## Automatic map profiles (perlin-v7)

New procedural maps use 1 m cells and explicit size-based frequencies in `MAP_PROFILE_FREQUENCIES`. `MAP_SIZE_OPTIONS` follows this table's insertion order, and `MAP_GENERATION_PROFILES` holds the complete derived parameter sets. `GET /api/map-profiles` exposes the resolved presets. `MAP_PROFILE_VERSION` identifies the calibration in saved metadata; profile identifiers are not displayed under the map-size selector. All generation entrypoints resolve the current backend profile; current imported map matrices are preserved. Configurations declaring another profile version are rejected.

| Grid (rows × columns) | Elevation frequency |
| --- | ---: |
| 16×32 | 0.24 |
| 32×64 | 0.12 |
| 64×128 | 0.06 |
| 128×256 | 0.04 |
| 256×512 | 0.02 |
| 512×1024 | 0.01 |
| 1024×2048 | 0.005 |
| 2048×4096 | 0.0025 |
| 4096×8192 | 0.00125 |

For elevation frequency `f`, moisture frequency is `f/2`, roughness frequency is `5*f/6`, and elevation amplitude is `0.24/f` meters. Larger presets therefore use amplitudes of 6, 12, 24, 48, 96 and 192 meters. `MAP_PROFILE_ELEVATION_DETAIL` defines elevation octaves and `MAP_ELEVATION_PERSISTENCE` per preset: 16×32 uses 2 and 0.50; all other presets use 3 and 0.50. Moisture and roughness retain 2 octaves and persistence 0.50. Lacunarity remains 2. Persistence must be finite and within (0, 1]. Perlin-v7 preserves the generation of 16×32, 32×64 and 64×128 exactly, except for the profile version metadata. Larger presets use the approved moderate-mosaic reference, with more varied regions and fewer elevation detail layers than the largest perlin-v6 presets. The amplitude/frequency product is an approximate slope calibration, not a guarantee of identical slope distributions after per-map normalization.

Custom dimensions use the preset with the closest maximum dimension; ties select the smaller preset. If `s = requested_max_dimension / preset_max_dimension`, frequencies are divided by `s` and elevation amplitude is multiplied by `s`. Octaves and persistence are inherited from that preset. Generation uses the profile table independently of runtime copies of the resolved scalar parameters. CLI, API, queued execution and exported configurations resolve and record `MAP_ELEVATION_PERSISTENCE`. The core generator accepts only dimensions, seed, connectivity and slope limit; procedural parameters come exclusively from the resolved profile.

Field seeds for maps with maximum dimension up to 256 remain `(effective_seed + field_offset) % 2**32`. Larger maps derive each field seed from `numpy.random.SeedSequence([effective_seed, field_offset, height, width]).generate_state(1)[0]`. Offsets remain 0 for elevation, 101 for moisture and 202 for roughness. Thus sizes produce different reproducible landscapes without requiring more high-frequency detail. Retry seed derivation and the five-attempt acceptance process are unchanged. New generation can change connectivity, slopes, traversal costs and ISP solutions; historical map files and their metadata are not rewritten.

Negative effective seeds are converted modulo `2**32` before entering `SeedSequence`, preserving support for negative user seeds. Nonnegative effective seeds are passed unchanged.

`DENSE_FOREST` is impassable (0 m/s), colored `#234A32`, and classified at moisture ≥0.82 outside lowlands, before ordinary forest. Roughness cutoffs are FOREST=0.82, ROCKY=0.80 and 0.95 for GRASSLAND, GRASS, DRY_VEGETATION, MUD and SAND. Impassable terrain receives no extra physical obstacles. The main-component threshold remains 0.70 with five deterministic attempts.

Generation and ISP preparation estimate memory against 60% of available host/cgroup memory and reject requests that exceed that budget. This is a conservative estimate, not a guarantee of solver completion. Requests are never silently resized; the largest presets may exceed the resources of the current machine.


Map JSON stores `cell_openings`, `slope_adjustments`, `environmental_speed_edges` and `robot_capability_edges` as required record arrays, including empty arrays. Opening records retain original terrain, obstacle and impassability reasons and their positive opening speed. Slope records retain signed original and effective angles. Speed records retain directed endpoints, frozen reference and target speeds. Result records add `model` and category counts; Brandao retains terrain assignments. Old field sets and missing versions are rejected without migration, aliases or conversion. Reloading an applied map preserves its physical costs.

The Web receives shared `appearance` definitions: terrain-relative obstacle shading (factor 0.58), normalized texture strokes/dots and three coordinate-based variants per terrain. An 8-pixel threshold selects cell detail, with opacity 0.24 and line width 0.045 cells. The required `texture_overview` object defines `target_pixels=16`, `opacity=0.16` and `line_width=0.045`. Below the threshold, textures repeat over power-of-two cell blocks with spacing from 16 to less than 32 screen pixels. A small 2×2 atlas repeats from the grid origin, clipped by terrain class; physical obstacles receive no overview texture. PNG uses the same definitions and masks its raster texture overlay by terrain class. Textures do not affect costs or generation. Web map drawing samples cells below one screen pixel and renders only the viewport when zoomed; pointer coordinates include the viewport offset. Zoom is capped again when the available map area changes; route connections have no fixed step cutoff, including the longest four-neighbor routes in the largest presets. Profile changes define a new experimental series and do not rewrite historical artifacts.

The active generation is `perlin-v7`. It preserves the approved 16×32, 32×64 and 64×128 landscapes and uses the moderate-mosaic calibration for larger maps. Current thresholds, field seed derivation, deterministic retries and the 70% connectivity requirement are fixed by the backend profile. Maps without water remain valid. Existing files are never migrated or rewritten automatically.

The required transient `appearance.relief` object contains `azimuth=315`, `altitude=45`, `vertical_exaggeration=2`, and a size-resolved strength: 0.80 when the maximum grid dimension is at most 128 cells, otherwise 0.45. This also applies to custom dimensions and imported maps. The appearance resolver returns an independent copy without mutating shared definitions. Python and all API map layers use this same resolver; Canvas consumes its parameters without new controls or payload fields. Texture definitions and both texture scales are unchanged. Strength is fixed for each map during zoom and scrolling. Gradients use physical cell spacing, central differences internally and one-sided differences at borders; an axis with one cell has zero gradient. Array rows run southward. The surface normal is proportional to `(-2*dz/dx, 2*dz/drow, 1)` with these defaults. For clamped illumination `I` and resolved strength `k`, the blend intensity is `s=clip(0.5+k*(I-sin(45°)),0,1)` and each normalized base color channel becomes `2*s*C+(1-2*s)*C²`. Water keeps its stable base blue. Relief is applied after terrain-relative obstacle darkening and before textures, routes and interventions. Python and Canvas use the same formula, without per-map or per-viewport contrast normalization. Canvas evaluates only the visible cells and their immediate neighbors. The effect is visual and never changes stored elevations or traversal costs. There is no altitude-based shading fallback; Web and PNG rendering require the current appearance definitions.

## Unified ISP execution

`ISP_MODEL` is `NORMAL` (default) or `BRANDAO`. Brandao is resolved automatically with both
strategies by the execution workflow and requires `DEFAULT_REDUCTION_METHOD=NONE` and global validation.
`ISP_TIME_BUDGET_SEC` defaults to 1800 seconds and covers scenario preparation,
model construction and canonicalization, solver calls and full-grid validation.
The deadline is cooperative; indivisible library calls can finish after it.
There is no iteration or cut limit and no separate per-solve timeout.
`INCREMENTAL_TOLERANCE=1e-4` is an absolute total path-cost tolerance in seconds,
shared by both strategies. It is not accumulated per edge.
Removed configuration fields are rejected; no legacy migration is provided.
The normal model and questionnaire workflow remain the defaults.

The ISP HTTP response envelope uses `completed` or `failed`, matching `execution_status`. These describe execution processing; `result.success` and `validation_status` describe global route validation, and `objective_certified` separately describes minimum-objective certification. Failed or inconclusive candidates remain diagnostic artifacts. Questionnaire scenario payloads must use the current map and intervention contracts; the study protocol and database layout are unchanged.
