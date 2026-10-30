from copy import deepcopy
from itertools import pairwise
from pathlib import Path

from src import config
from src.grid.grid import Grid
from src.incremental import ISPValidator, solve_closed_loop, validate_alternative_path
from src.planning.astar import astar

from .artifact_names import MAP_DATA_FILENAME, MAP_DIRECTORY_NAME, RESULTS_DIRECTORY_NAME
from .utils import get_project_path, prepare_endpoints

BENCHMARK_LOG_FILENAME = "brandao_benchmark.log"
FAST_TERRAIN = "GRASS"
SLOW_TERRAIN = "FOREST"
FAST_TERRAIN_SPEED = 1.2
SLOW_TERRAIN_SPEED = FAST_TERRAIN_SPEED / 8.0


def create_two_terrain_profile(grid: Grid) -> Grid:
    profile = deepcopy(grid)
    ranked_cells = []
    for i in range(profile.h):
        for j in range(profile.w):
            point = (i, j)
            cell = profile.get_cell(point)
            if cell.terrain == config.WATER_TERRAIN:
                continue
            speed = grid.speeds.get(cell.terrain, 0.0)
            if speed > 0.0:
                ranked_cells.append((speed, point))

    if not ranked_cells:
        raise ValueError("The map has no positive-speed terrain cells.")

    ranked_cells.sort()
    slow_cell_count = len(ranked_cells) // 2
    slow_cells = {point for _, point in ranked_cells[:slow_cell_count]}
    for _, point in ranked_cells:
        profile.get_cell(point).terrain = (
            SLOW_TERRAIN if point in slow_cells else FAST_TERRAIN
        )

    profile.speeds = {
        FAST_TERRAIN: FAST_TERRAIN_SPEED,
        SLOW_TERRAIN: SLOW_TERRAIN_SPEED,
        config.WATER_TERRAIN: 0.0,
    }
    profile.robot_speed_edges.clear()
    return profile


def create_distinct_traversable_path(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    optimal_path: list[tuple[int, int]],
) -> list[tuple[int, int]] | None:
    if len(optimal_path) < 2:
        return None

    forbidden_edges = set()
    for edge in pairwise(optimal_path):
        forbidden_edges.add(edge)
        forbidden_edges.add((edge[1], edge[0]))

    active_edges = set()
    for i in range(grid.h):
        for j in range(grid.w):
            node = (i, j)
            for neighbor in grid.get_neighbors(node):
                if (node, neighbor) not in forbidden_edges:
                    active_edges.add((node, neighbor))
    detour, _, _ = astar(
        grid,
        start,
        goal,
        active_edges=active_edges,
    )
    if detour is None or detour == optimal_path:
        return None

    is_valid, _, _ = validate_alternative_path(grid, start, goal, detour)
    return detour if is_valid else None


def run_brandao_benchmark(map_path: str | Path | None = None) -> Path:
    resolved_map_path = (
        Path(map_path).expanduser().resolve()
        if map_path is not None
        else get_project_path(config.OUTPUT_DIR)
        / MAP_DIRECTORY_NAME
        / MAP_DATA_FILENAME
    )
    results_dir = get_project_path(config.OUTPUT_DIR) / RESULTS_DIRECTORY_NAME
    results_dir.mkdir(parents=True, exist_ok=True)
    log_path = results_dir / BENCHMARK_LOG_FILENAME
    log_lines = [
        "Brandao-inspired terrain-only benchmark",
        f"Map: {resolved_map_path}",
        "Profile: same grid geometry, elevation and obstacles; two terrain classes; cost ratio 1:8; terrain-only interventions; global validation.",
    ]

    if not resolved_map_path.exists():
        log_lines.append("Benchmark skipped: the configured map file was not found.")
        log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
        print(f"Benchmark skipped. Details saved to '{log_path}'.")
        return log_path

    try:
        grid = Grid.load(resolved_map_path)
        start, goal = prepare_endpoints(grid)
        profile = create_two_terrain_profile(grid)
        optimal_path, optimal_cost, _ = astar(profile, start, goal)
        if not optimal_path:
            log_lines.append("Benchmark skipped: no traversable A* route exists in the two-terrain profile.")
            log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
            print(f"Benchmark skipped. Details saved to '{log_path}'.")
            return log_path

        alternative_path = create_distinct_traversable_path(
            profile,
            start,
            goal,
            optimal_path,
        )
        if alternative_path is None:
            log_lines.append(
                "Benchmark skipped: no feasible traversable route distinct from the profile's A* route was found."
            )
            log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
            print(f"Benchmark skipped. Details saved to '{log_path}'.")
            return log_path

        alternative_cost = ISPValidator.compute_path_cost(profile, alternative_path)
        result = solve_closed_loop(
            profile,
            start,
            goal,
            alternative_path,
            reduction_method="NONE",
            solver_name=config.DEFAULT_SOLVER,
            timeout=config.SOLVER_TIMEOUT_SEC,
            global_timeout=config.CLOSED_LOOP_TIMEOUT_SEC,
            max_iterations=config.MAX_ISP_ITERATIONS,
            tolerance=config.INCREMENTAL_TOLERANCE,
            astar_scope="GLOBAL",
            terrain_only=True,
        )
        terrain_changes = (
            len(result.modifications.terrain_nodes)
            if result.modifications is not None
            else 0
        )
        log_lines.extend(
            [
                f"Grid: {profile.h}x{profile.w}; start={start}; goal={goal}",
                f"Terrain costs per distance: {FAST_TERRAIN}=1/{FAST_TERRAIN_SPEED:g}, {SLOW_TERRAIN}=1/{SLOW_TERRAIN_SPEED:g}; ratio=1:8",
                f"A* route: {len(optimal_path)} nodes, cost={optimal_cost:.6f}",
                f"Alternative route: {len(alternative_path)} nodes, cost={alternative_cost:.6f}, distinct=True, traversable=True",
                f"ISP status: {result.solver_status}; success={result.success}; iterations={result.iterations}; competing_paths={result.competing_paths_count}; runtime={result.runtime_sec:.3f}s",
                f"Candidate available: {result.modifications is not None}; terrain changes={terrain_changes}; final alternative cost={result.final_alternative_cost}",
                f"Explanation: {result.explanation_text}",
            ]
        )
        if result.iteration_metrics:
            attempts = sum(
                bool(metric.get("solver_attempted"))
                for metric in result.iteration_metrics
            )
            completed = sum(
                bool(metric.get("completed"))
                for metric in result.iteration_metrics
            )
            log_lines.append(
                f"Incremental diagnostics: {attempts} solver attempts, {completed} completed iterations"
            )
            for metric in result.iteration_metrics:
                log_lines.append(
                    "Iteration {iteration}: preparation={preparation:.3f}s, model_build={model_build:.3f}s, solver={solver:.3f}s, validation={validation:.3f}s, status={status}, competing_paths={before}->{after}, cut_added={cut}".format(
                        iteration=metric.get("iteration", "-"),
                        preparation=float(metric.get("preparation_sec", 0.0)),
                        model_build=float(metric.get("model_build_sec", 0.0)),
                        solver=float(metric.get("solver_sec", 0.0)),
                        validation=float(metric.get("validation_sec", 0.0)),
                        status=metric.get("solver_status", "UNKNOWN"),
                        before=metric.get("competing_paths_before", 0),
                        after=metric.get("competing_paths_after", 0),
                        cut=metric.get("cut_added", False),
                    )
                )
    except (OSError, RuntimeError, TypeError, ValueError, KeyError) as exc:
        log_lines.append(f"Benchmark skipped: {exc}")

    log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
    print(f"Brandao-inspired benchmark finished. Details saved to '{log_path}'.")
    return log_path
