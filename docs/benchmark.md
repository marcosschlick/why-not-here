# Computational ISP benchmark

## Models and matched comparisons

The interface configures normal scenarios only. A normal incremental execution
with reduction `NONE` automatically runs three scenarios in order: normal
incremental, Brandao monolithic with `NONE`, and Brandao incremental with `NONE`.
Other individual combinations run their single normal scenario.

The full benchmark schedules twelve executions per map and repetition: ten normal
combinations (monolithic, then incremental; each with `NONE`, `PATH_ONLY`,
`SPARSIFIED`, `BBOX`, `FLOODFILL`), followed by Brandao monolithic and incremental,
both with `NONE`. The individual expansion is not applied again to benchmark
members. Repetitions default to one and reuse the same original map, endpoints
and reviewed desired route; they are not independent maps.

Scenario planning is shared by the Web workflow, background executor and CLI
configuration execution. `POST /api/config/scenarios` receives `config`,
`benchmark` and `purpose` (`run` or `create`) and returns `configurations` without
generating maps, solving or mutating global settings. The internal
`POST /api/isp/solve` remains atomic: one request executes one resolved scenario.
The UI has no manual model selector or additional strategy-comparison button.

Only normal configurations are saved: one individual configuration, or ten per
map/repetition for a full benchmark. Execution/import automatically expands a
normal incremental/`NONE` configuration into the trio. Running the ten saved
normal benchmark configurations produces twelve scenario executions. Brandao
configuration files are not saved or imported as standalone scenarios; internal
Brandao parameters remain in execution records for reproduction. No legacy
format conversion or deduplication is performed. Each imported normal file is
an independent workflow input. The CLI command `python -B src/main.py run
configuration.json` uses the same expansion, generates the source map once and
returns a collection of separately recorded scenario results.

The same original grid, endpoints and desired route feed both Brandao strategies.
Preparation is performed separately, deterministically, and included in each
budget; their `prepared_scenario_id` values must match for a fair comparison.
Outputs are separate and identify model, strategy, reduction and repetition.
Session history retains attempts when routes change, a queue is replaced or a
request is retried, and remains in browser memory until the page is closed.

Brandao and normal executions solve different models. Differences between them
include prepared terrain, cost scale, slope treatment and intervention domain.
Their time differences cannot be attributed exclusively to the solving strategy.
Compare monolithic versus incremental within a matching prepared model first.
The fixed execution order is recorded; cache, allocator, solver startup and
order effects remain possible. No claim of randomized experimental control is made.

## Brandao adaptation: `brandao-grid-v1`

The source map is copied. Fast original terrain types are `COMPACTED_SOIL`,
`GRASSLAND`, `GRASS`, `UNPAVED_TRACK` and `DRY_VEGETATION` (nominal speeds
0.8–1.2 m/s in the normal model). Slow types are `SAND`, `FOREST`, `MUD` and
`ROCKY` (0.3–0.6 m/s). Classification is fixed by type, not by the number or
spatial distribution of cells. Internal labels `GRASS` and `FOREST` represent
fast and slow, respectively; map legends identify their new meanings.

The hypothetical speeds are 1 and 0.125 m/s, giving cost densities of 1 and
8 s/m. This interprets one paper cost unit as one second at the selected scale;
it is not a claim that these are measured physical terrain speeds. Grid edges
use horizontal cell-center distance in meters and the existing endpoint-average
inverse-speed convention:

`w(u,v) = distance(u,v) * (1/speed(u) + 1/speed(v)) / 2`.

Thus homogeneous fast and slow travel has ratio 1:8. Mixed edges average the
two densities. Elevation data remains available visually, but contributes no
traversability restriction or cost penalty. Robot-speed capability interventions
are disabled. Original fixed obstacles outside the desired path remain blocked.

Physical obstacles and impassable terrain on the desired path are changed into
slow, obstacle-free cells before optimization. `converted_blocked_cells` counts
the union once. `conversion_reasons` also counts each cause; its counts can
therefore overlap. Slope alone never causes such a conversion. Previously open
terrain overrides are respected when determining whether a cell was blocked.
These preparation actions are not charged to the ISP objective. The prepared
A* is recomputed, rather than reusing the source map's optimal route.

Both fast-to-slow and slow-to-fast changes are permitted, including changes on
competitors. The objective is one unit per changed cell. A source cell converted
to slow during preparation can subsequently be changed to fast by the ISP; that
later change is charged. Changes and explanations belong to the prepared model,
not to the original normal traversal model.

### Relation to the paper and reference implementation

[Brandao, Coles and Magazzeni (2021)](../refs/correlate_brandao2021_nisp.pdf)
formulate NISP with dual shortest-path constraints and NISP# with accumulated
path inequalities. Their environment is a polygon/portal navigation mesh; each
mesh edge has the terrain cost of its owning polygon. Their main experiment uses
1 and 8 cost units per meter; one illustrated example uses 1 and 50. This project
uses a 2D grid, endpoint-averaged densities, copied procedural terrain and explicit
preparation conversions. It is an adaptation, not a reproduction of their map or
experimental setup.

The paper's one-hot L1 objective changes two entries per relabeled polygon;
counting changed cells directly removes that constant factor. An explicit nonnegative change variable equals one minus the original-label binary for each eligible cell. Its sum keeps the native objective on the cardinality scale, without a cell-count-dependent additive constant affecting native relative-gap stopping. Some functions in
[`navmesh/`](../navmesh/README.md), including `optInvMILP` and
`optPolyLabelsInPath`, additionally multiply label weights outside the interior
of the desired path by ten. The reference also contains soft-constraint variants,
multiple/diverse competitors, geometric convergence criteria, enumeration and
iteration limits. These choices are not copied into this integration. Uniform
cell weights follow the paper's stated assumption. Cost ties are accepted without
requiring the A* result to have the same sequence of vertices as the desired path.

## Cost consistency and tolerance

The normal model retains its existing intervention domain: non-worsening terrain
assignments on eligible desired-path cells, removal of desired-path obstacles,
opening impassable desired terrain at base speed, leveling eligible desired edges,
and directed robot-speed activation under the original eligibility rule. Removing
an obstacle does not change the underlying terrain; opening terrain preserves
its label. Different actions on the same cell remain separate objective units.
`distinct_cells` counts cell-based changes only, separately from edge actions.

Both strategies share the same affine edge expressions and binary-product
linearizations. Permanently blocked edges are excluded. Mandatory desired-path
openings are explicit actions, rather than finite blocking penalties. Incremental
competitors outside an initial reduction add their physical edges to the
formulation, so shared intervention effects are not replaced by original costs.
Sparsification protects semantic decisions and their incident neighborhoods;
validation checks remaining shortcuts against their stored physical paths.
Graph-size metrics describe the actual augmented formulation, not just the
initially extracted region.

`INCREMENTAL_TOLERANCE` remains the shared absolute total-cost tolerance,
`epsilon = 1e-4 seconds`. Despite its historical name it applies to both
strategies. With incidence matrix columns `+1` at an edge source and `-1` at its
target, the monolithic formulation uses:

```
A.T @ pi + lambda = w_prime
lambda >= 0
pi[goal] = 0
w_prime @ x_desired <= pi[start] - pi[goal] + epsilon
```

Dual feasibility gives `pi[start] - pi[goal] <= shortest_path_cost`.
Conversely, an optimal shortest-path dual exists when the desired route is
feasible and costs are nonnegative. The last inequality therefore represents
`desired_cost <= shortest_path_cost + epsilon`. Equivalently, the sum of dual
slacks along the complete desired path is at most epsilon. Tolerance is never
allowed separately on each edge. Incremental cuts use
`desired_cost <= competitor_cost + epsilon` with the same epsilon.

Before acceptance, the candidate is applied to a fresh full grid. All modeled
edge costs are checked against physical costs, including shortcut expansion,
and a full-grid A* validates the desired route. An optional subgraph search only
controls incremental competitor selection; it never replaces global validation.
Its local success can stop with `SUBGRAPH_OPTIMAL_ONLY` if full validation fails.
Diagonal moves between obstacles remain permitted according to the original
endpoint-based traversal rule.

### Cardinality certification

Global route validation, native solver outcome and minimum-cardinality proof are
separate fields. `success` means the candidate route passed full-grid validation;
it does not assert minimum cardinality or completion within budget.

A certificate requires `NONE`, a consistent integral candidate, agreement between
the objective and extracted interventions, physical/model cost agreement, and a
finite native MILP lower bound whose objective offset is known and whose primal
objective agrees with the recovered CVXPY objective. A count `k` is certified
only when the bound is no greater than `k + 1e-6` and greater than
`k - 1 + 1e-6`. This uses integer cardinality, not a rounded relative gap. Zero
interventions on a feasible one-point route also attain the known nonnegative
lower bound. Numerical checks use the recorded solver feasibility and bound
margins; this is a numerical optimization certificate in the declared domain.

For incremental Brandao, omitted cell variables affect none of the accumulated
path inequalities and can retain their original labels with zero change cost.
Its master is therefore equivalent to allowing those variables and leaving them
unused. Every full-problem solution satisfies the master cuts, so a valid native
master bound is also a lower bound for the full declared problem. Global
validation of the recovered labeling supplies the corresponding upper bound.
Different optimal labelings can change different cells with equal cardinality.

No certificate is inferred merely from `OPTIMAL`, a requested gap, successful
validation, or a reduced graph. Reduced executions conservatively report no
full-domain minimum certificate. Missing, inconsistent or inaccessible native
statistics leave cardinality uncertified. Native timeout/interruption candidates
are usable only after integrality and constraint checks; their validation and
proof fields remain independent of their stop reason.

## Timing and optional resource measurements

`ISP_TIME_BUDGET_SEC` defaults to 1800 seconds for either strategy. There is no
iteration/cut limit or independent per-solve cap. `perf_counter_ns()` measures:

| Field | Boundary |
| --- | --- |
| `preparation_sec` | Endpoint/route setup, grid copying/conversion, initial A*, geometry, graph counts/reduction and subgraph preparation |
| `model_build_sec` | Expressions, constraints, objective and CVXPY canonicalization |
| `solver_sec` | Native adapter/model setup, solver invocation, native-statistics recovery and CVXPY unpacking |
| `validation_sec` | Applying candidates, checking physical edge expressions, route costs and validation searches |
| `overhead_sec` | Remaining measured orchestration, including candidate consistency checks and result construction |
| `total_sec` / `runtime_sec` | Complete ISP interval through final solver-result handling |

Original-map deserialization and initial source-map persistence are outside this
interval. Metadata hashing, JSON serialization, HTTP transport and artifact
rendering/writing are also outside it. `map_generation_sec`, when available,
measures generator computation separately. `artifact_sec` measures subsequent
ISP map/PNG persistence; initial source-map artifact overhead is excluded.
Iteration timings omit the one-time initial preparation and sum stage intervals
inside each attempted iteration. Monolithic execution has at most one attempt.

The solver receives the strictly positive remaining budget after canonicalization.
Python-controlled loops check a cooperative deadline. Indivisible copying,
canonicalization and native calls cannot be forcibly interrupted; adapter setup
also consumes time after the native time limit is selected. No hard wall-clock
guarantee is made. Actual elapsed time and overrun are preserved.

`deadline_outcome` distinguishes `WITHIN_BUDGET`, `STOPPED_AT_BUDGET` and
`COMPLETED_AFTER_BUDGET`. `result_within_budget` additionally requires validation.
`validated_after_deadline` uses validation completion time. A candidate from a
limited solver is identified separately. Candidate observation time is measured
when recovered by this program; it is not the unknown first-incumbent time inside
the solver. Infeasibility, repeated competitors, errors and native interruptions
retain their reasons even if processing finishes late.

Optional native information includes objective, offset-adjusted lower bound,
reported native relative gap, native time/status, scalar CVXPY sizes and canonical
sizes where recoverable. The effective gap is computed from recovered bounds as `(upper-lower)/abs(upper)` when upper is nonzero. With zero upper it is zero only when the lower bound is also zero; otherwise it is undefined/null. No zero gap or bound is invented when unavailable.

Linux `/proc/self/status` RSS sampling uses a 0.05-second interval, initial and
final observations, and records bytes and sample count. It includes native
allocations and other process activity, can miss short peaks, and is affected by
retained allocations between runs. It is not an exact per-scenario peak or
exclusive solver memory. `exact_scenario_peak_bytes` is always absent/null.
Unsupported systems return null measurements. No additional dependency is used.

## Records, artifacts and CSV

New execution directories retain the original `map/map.json`, prepared and
candidate grids under `results/`, PNGs, `log.txt` and `scenario.json`.
`scenario.json` contains machine-readable outcomes even without candidate images;
artifact failures are reported independently when the record can still be written.
No historical result directory is migrated or rewritten.

Identity records contain `run_id`, source-map content hash, prepared-scenario
hash, effective scenario/configuration hash, benchmark group, repetition index,
attempt index, UTC timestamps and execution order. `execution_order_scope`
distinguishes caller-session order from a standalone execution. Separate CLI
processes do not establish an overall cross-process order. Saved configurations
carry repetition/group execution metadata; execution still receives a fresh run ID.
Reproduction includes configuration, desired path, endpoints, generation profile,
requested/effective seeds, generation attempt, formulation/conversion versions,
solver tolerances and available package/runtime versions. Hashes include map
provenance and do not depend on output-directory names.

The Web results view exports recorded terminal attempts via local
`POST /api/benchmarks/export` with `{records, kind}`. It formats supplied session
records without scanning stored results. HTTP failures are exported as request
errors with unknown solver/validation state; a failed request does not prove that
the server stopped. Session export also works while later scenarios are running.

- `scenarios.csv`: one row per scenario/repetition execution or additional attempt,
  with stable core columns plus sorted additional available fields.
- `iterations.csv`: one row per attempted iteration, including incomplete attempts,
  with run/repetition identifiers, stages, cuts, paths, sizes and solver diagnostics.

Missing values use `NA`; structured JSON uses null. `cost_states` distinguishes
impassable/unreachable costs from unmeasured costs. Configuration and routes are
retained as JSON-compatible fields. Internal and exported floats keep their
precision; UI rounding does not modify records. Both exporters share the
questionnaire's UTF-8 BOM, standard comma-separated CSV quoting and formula-string
neutralization. Negative numeric values remain numeric. Questionnaire CSV columns
and response-selection behavior are preserved.

### Presentation and queue completion

The main results grid retains total time, incremental iterations, clearly labeled
initial optimal/alternative and final alternative costs, formulation nodes/edges,
route lengths, discrete Hausdorff distance, global validation and intervention
count. Brandao additionally shows preparation conversions excluded from that
count, plus a brief model description. Unavailable values are not displayed as
zero. Detailed timings, per-iteration diagnostics, native statistics, memory and
certification remain in records and CSV rather than an extended on-screen panel.

`execution_status` is `completed` when processing finishes without an execution
error, even if the scientific outcome is infeasible, inconclusive or limited by
time. Request failures and actual solver/internal consistency errors are `failed`;
`execution_error` preserves their reason. Queue completion does not depend on
`success`, which continues to mean full-grid path validation. Groups with every
execution processed without error show `Completed`; this makes no assertion that
all desired routes were validated or all interventions were minimal. Scientific
outcomes are displayed separately, and unsuccessful scientific results do not
stop later scenarios. A no-candidate timeout/inconclusive explanation does not
claim infeasibility.

## Metric rationale and verification boundary

| Reference | Relevant use |
| --- | --- |
| [Brandao 2021 NISP](../refs/correlate_brandao2021_nisp.pdf) | Construction-inclusive timing, changed labels, iterations, competitors, formulation sizes and multiple equally short explanations |
| [Eder 2024](../refs/correlate_eder2024.pdf) | Reduction sizes, directed edges, physical route lengths, Hausdorff distance and limits of reduced explanations |
| [Burton and Toint 1992](../refs/isp_foundation_burton1992.pdf) | Inverse path consistency and distance from original costs; its continuous quadratic objective is not this cell-cardinality objective |
| [Ahuja and Orlin 2001](../refs/isp_foundation_ahuja2001.pdf) | Inverse optimization, complementary slackness and the distinction between cost perturbation and discrete intervention objectives |
| [Hart, Nilsson and Raphael 1968](../refs/a_star_hart1968.pdf) | A* search conditions and expanded-node measurements; the heuristic uses an admissible global speed bound |
| [van Toll et al. 2016](../refs/a_star_vantoll2016.pdf) | Construction/performance measurements and memory caveats; mesh coverage metrics do not transfer directly to this fixed grid |
| [Brandao et al. 2021 motion](../refs/other_brandao2021_motion.pdf) | Distinguishing infeasibility, model costs and computational-budget effects in explanations |
| [Chen et al. 2020](../refs/other_chen2020.pdf) | Contrastive explanation semantics; participant reading time and preferences are outside this computational benchmark |
| [Halilovic et al. 2025 affordance](../refs/other_halilovic2025_affordance.pdf) | Distinguishing capability/environment explanations; satisfaction studies are outside this task |

Hausdorff here is symmetric discrete Euclidean distance between route vertices,
not continuous-curve Hausdorff or a cost-optimality test. Measurements alone do not
establish subjective explanation quality, participant understanding or satisfaction.

Implementation checks are limited to static analysis, compilation, import/schema
inspection, frontend lint/build and CSV checks using synthetic records. No map
generation, optimization, numerical comparison, exhaustive case enumeration or
analysis of existing `exp/`/`results/` data is authorized for this task.

With future authorization, validate matched monolithic/incremental runs on the
same prepared scenarios, check all intervention combinations and reductions,
compare objective counts with trustworthy bounds, inspect stopping behavior under
short budgets, and measure repetition/order effects. Such checks can establish
empirical agreement and expose implementation issues; they cannot require
identical changed cells when multiple optimal solutions exist.
